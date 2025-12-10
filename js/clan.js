// Frontend for the private clan leaderboard.
// Calls backend via Cloudflare Worker: /api/clan/weekly-leaderboard

const API_BASE = "/api/clan";

function $(id) { return document.getElementById(id); }

let currentData = null;
let currentSort = "matches";

// -------------------------
// Clan week helpers (Wed→Wed)
// -------------------------

function getClanWeekStart(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = d.getDay(); // 0=Sun ... 3=Wed
  const WED = 3;
  const daysSinceWed = (weekday + 7 - WED) % 7;
  d.setDate(d.getDate() - daysSinceWed);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateRange(start, end) {
  const opts = { year: "numeric", month: "short", day: "numeric" };
  return `${start.toLocaleDateString(undefined, opts)} → ${end.toLocaleDateString(undefined, opts)}`;
}

function buildWeekOptions(count = 8) {
  const select = $("weekSelect");
  if (!select) return;

  select.innerHTML = "";
  const now = new Date();
  const currentStart = getClanWeekStart(now);

  for (let i = 0; i < count; i++) {
    const start = new Date(currentStart);
    start.setDate(start.getDate() - 7 * i);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const value = start.toISOString().slice(0, 10);
    const label = `${value} - Week ${formatDateRange(start, end)}`;

    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (i === 0) opt.selected = true;

    select.appendChild(opt);
  }
}

// -------------------------
// API + rendering
// -------------------------

async function fetchLeaderboard(weekParam) {
  const statusEl = $("status");
  statusEl.textContent = "Loading...";
  statusEl.classList.remove("error");

  let url = `${API_BASE}/weekly-leaderboard`;
  if (weekParam) url += `?week=${encodeURIComponent(weekParam)}`;

  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`Backend error (${resp.status})`);
  return resp.json();
}

function sortEntries(entries, mode) {
  const copy = [...entries];

  if (mode === "kills") {
    copy.sort((a, b) =>
      b.kills - a.kills || b.matches - a.matches || b.damage - a.damage
    );
  } else if (mode === "time") {
    copy.sort((a, b) =>
      (b.time_played_hours ?? 0) - (a.time_played_hours ?? 0) ||
      b.kills - a.kills ||
      b.matches - a.matches
    );
  } else {
    copy.sort((a, b) =>
      b.matches - a.matches || b.kills - a.kills
    );
  }

  return copy;
}

// -------------------------
// INACTIVE MEMBERS PANEL
// -------------------------

function renderInactive(data) {
  const inactiveTitle = $("inactiveTitle");
  const inactiveList = $("inactiveList");

  const members = data.inactive_members || [];
  const count = members.length;

  inactiveTitle.textContent =
    count === 1 ? "Inactive member this week (1)" : `Inactive members this week (${count})`;

  inactiveList.innerHTML = "";

  if (!count) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No inactive members this week.";
    inactiveList.appendChild(li);
    return;
  }

  members.forEach(m => {
    const li = document.createElement("li");
    li.textContent = `${m.name || m.player_id} (${m.platform || "steam"})`;
    inactiveList.appendChild(li);
  });
}

// -------------------------
// MAIN LEADERBOARD
// -------------------------

function renderLeaderboard(data) {
  const tbody = document.querySelector("#leaderboard tbody");
  const summaryTitle = $("summaryTitle");
  const entriesCount = $("entriesCount");

  tbody.innerHTML = "";

  const start = new Date(data.week_start);
  const end = new Date(data.week_end);
  summaryTitle.textContent = `Week ${formatDateRange(start, end)}`;

  entriesCount.textContent =
    data.count === 1 ? "1 player" : `${data.count} players`;

  renderInactive(data);

  if (!data.entries.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "muted";
    td.textContent = "No data for this week.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    $("status").textContent = "Loaded (no data)";
    return;
  }

  const sorted = sortEntries(data.entries, currentSort);

  sorted.forEach((entry, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${entry.name || entry.player_id}</td>
      <td>${entry.matches}</td>
      <td>${entry.kills}</td>
      <td>${(entry.kdr ?? 0).toFixed(2)}</td>
      <td>${Math.round(entry.damage).toLocaleString()}</td>
      <td>${(entry.time_played_hours ?? 0).toFixed(2)}</td>
      <td>${entry.wins}</td>
    `;
    tbody.appendChild(tr);
  });

  $("status").textContent = "Loaded";
}

// -------------------------
// INIT
// -------------------------

async function loadLeaderboard() {
  try {
    const week = $("weekSelect")?.value || null;
    const data = await fetchLeaderboard(week);
    currentData = data;
    renderLeaderboard(data);
  } catch (err) {
    console.error(err);
    $("status").textContent = `Error: ${err.message}`;
    $("status").classList.add("error");
  }
}

function setupSortButtons() {
  const buttons = document.querySelectorAll(".sort-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      currentSort = btn.dataset.sort;
      buttons.forEach(b => b.classList.remove("sort-active"));
      btn.classList.add("sort-active");
      if (currentData) renderLeaderboard(currentData);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  buildWeekOptions(8);
  setupSortButtons();

  $("loadBtn").addEventListener("click", loadLeaderboard);
  $("weekSelect").addEventListener("change", loadLeaderboard);

  // Collapsible inactive panel
  $("inactiveToggle").addEventListener("click", () => {
    $("inactiveBody").classList.toggle("expanded");
  });

  // Load current week automatically
  loadLeaderboard();
});
