// js/clan.js
// Frontend for the private clan leaderboard.
// Calls your backend via the Cloudflare Worker at /api/clan/weekly-leaderboard.

const API_BASE = "/api/clan";

function $(id) {
  return document.getElementById(id);
}

let currentData = null;
let currentSort = "matches";

// -------------------------
// Clan week helpers (Wed→Wed)
// -------------------------

function getClanWeekStart(date) {
  // Work with a copy (local time)
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // JS getDay(): Sunday = 0, Monday = 1, ..., Wednesday = 3
  const weekday = d.getDay();
  const WED = 3;
  const daysSinceWed = (weekday + 7 - WED) % 7;
  d.setDate(d.getDate() - daysSinceWed);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateRange(start, end) {
  const opts = { year: "numeric", month: "short", day: "numeric" };
  const s = start.toLocaleDateString(undefined, opts);
  const e = end.toLocaleDateString(undefined, opts);
  return `${s} \u2192 ${e}`;
}

function buildWeekOptions(count = 8) {
  const select = $("weekSelect");
  select.innerHTML = "";

  const now = new Date();
  const currentStart = getClanWeekStart(now);

  for (let i = 0; i < count; i++) {
    const start = new Date(currentStart);
    start.setDate(start.getDate() - 7 * i);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    // Use calendar start date (Wed) as the value: YYYY-MM-DD
    const startIso = start.toISOString().slice(0, 10); // YYYY-MM-DD
    const label = `${startIso} - Week ${formatDateRange(start, end)}`;

    const opt = document.createElement("option");
    opt.value = startIso;
    opt.textContent = label;

    if (i === 0) {
      opt.selected = true;
    }

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

  if (weekParam) {
    url += `?week=${encodeURIComponent(weekParam)}`;
  }

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    throw new Error(`Backend error (${resp.status})`);
  }

  return resp.json();
}

function sortEntries(entries, mode) {
  const copy = [...entries];

  if (mode === "kills") {
    // Sort by BR kills
    copy.sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (b.matches !== a.matches) return b.matches - a.matches;
      return b.damage - a.damage;
    });
  } else if (mode === "time") {
    copy.sort((a, b) => {
      const ta = Number(a.time_played_hours ?? 0);
      const tb = Number(b.time_played_hours ?? 0);
      if (tb !== ta) return tb - ta;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return b.matches - a.matches;
    });
  } else {
    // default: matches then kills (all BR-only now)
    copy.sort((a, b) => {
      if (b.matches !== a.matches) return b.matches - a.matches;
      return b.kills - a.kills;
    });
  }

  return copy;
}

function renderLeaderboard(data) {
  const tbody = document.querySelector("#leaderboard tbody");
  const summaryTitle = $("summaryTitle");
  const entriesCount = $("entriesCount");
  const statusEl = $("status");

  tbody.innerHTML = "";

  // Week summary from backend
  const start = new Date(data.week_start);
  const end = new Date(data.week_end);
  summaryTitle.textContent = `Week ${formatDateRange(start, end)}`;

  entriesCount.textContent =
    data.count === 1 ? "1 player" : `${data.count} players`;

  if (!data.entries || data.entries.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 9; // 9 columns now (including TDM Kills)
    td.className = "muted";
    td.textContent = "No data for this week.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    statusEl.textContent = "Loaded (no data)";
    return;
  }

  const sorted = sortEntries(data.entries, currentSort);

  sorted.forEach((entry, index) => {
    const tr = document.createElement("tr");

    const rankTd = document.createElement("td");
    rankTd.textContent = String(index + 1);
    tr.appendChild(rankTd);

    const nameTd = document.createElement("td");
    nameTd.textContent = entry.name || entry.player_id || "Unknown";
    tr.appendChild(nameTd);

    const matchesTd = document.createElement("td");
    // BR matches
    matchesTd.textContent = entry.matches ?? 0;
    tr.appendChild(matchesTd);

    const killsTd = document.createElement("td");
    // BR kills
    killsTd.textContent = entry.kills ?? 0;
    tr.appendChild(killsTd);

    const tdmKillsTd = document.createElement("td");
    const tdmKills = Number(entry.kills_tdm ?? 0);
    tdmKillsTd.textContent = tdmKills;
    tr.appendChild(tdmKillsTd);

    const kdrTd = document.createElement("td");
    const kdr = Number(entry.kdr ?? 0);
    kdrTd.textContent = kdr.toFixed(2);
    tr.appendChild(kdrTd);

    const dmgTd = document.createElement("td");
    const dmg = Number(entry.damage ?? 0);
    dmgTd.textContent = Math.round(dmg).toLocaleString();
    tr.appendChild(dmgTd);

    const timeTd = document.createElement("td");
    const hours = Number(entry.time_played_hours ?? 0);
    timeTd.textContent = hours.toFixed(2);
    tr.appendChild(timeTd);

    const winsTd = document.createElement("td");
    winsTd.textContent = entry.wins ?? 0;
    tr.appendChild(winsTd);

    tbody.appendChild(tr);
  });

  statusEl.textContent = "Loaded";
}

async function loadLeaderboard() {
  const statusEl = $("status");
  const select = $("weekSelect");
  const weekParam = select.value || null;

  try {
    const data = await fetchLeaderboard(weekParam);
    currentData = data;
    renderLeaderboard(data);
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Error: ${err.message}`;
    statusEl.classList.add("error");

    const tbody = document.querySelector("#leaderboard tbody");
    tbody.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 9;
    td.className = "muted";
    td.textContent = "Failed to load leaderboard.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

function setupSortButtons() {
  const buttons = document.querySelectorAll(".sort-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-sort");
      currentSort = mode || "matches";

      buttons.forEach((b) => b.classList.remove("sort-active"));
      btn.classList.add("sort-active");

      if (currentData) {
        renderLeaderboard(currentData);
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const loadBtn = $("loadBtn");

  buildWeekOptions(8); // last 8 clan weeks, including current

  loadBtn.addEventListener("click", () => {
    loadLeaderboard();
  });

  const select = $("weekSelect");
  select.addEventListener("change", () => {
    loadLeaderboard();
  });

  setupSortButtons();

  // Auto-load the currently selected (current) week on first visit
  loadLeaderboard();
});
