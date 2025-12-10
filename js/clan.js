// js/clan.js
// Simple frontend for the private clan leaderboard.
// Calls your backend via the Cloudflare Worker at /api/clan/weekly-leaderboard.

const API_BASE = "/api/clan";

function $(id) {
  return document.getElementById(id);
}

let currentData = null;
let currentSort = "matches";

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
    copy.sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (b.matches !== a.matches) return b.matches - a.matches;
      return b.damage - a.damage;
    });
  } else if (mode === "time") {
    copy.sort((a, b) => {
      if (b.time_played_hours !== a.time_played_hours) {
        return b.time_played_hours - a.time_played_hours;
      }
      if (b.kills !== a.kills) return b.kills - a.kills;
      return b.matches - a.matches;
    });
  } else {
    // default: matches then kills (same as backend)
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

  // Week summary
  const start = new Date(data.week_start);
  const end = new Date(data.week_end);
  const fmt = (d) =>
    d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  summaryTitle.textContent = `Week ${fmt(start)} \u2192 ${fmt(end)}`;
  entriesCount.textContent =
    data.count === 1 ? "1 player" : `${data.count} players`;

  if (!data.entries || data.entries.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 9;
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

    const platformTd = document.createElement("td");
    platformTd.textContent = entry.platform || "steam";
    tr.appendChild(platformTd);

    const matchesTd = document.createElement("td");
    matchesTd.textContent = entry.matches ?? 0;
    tr.appendChild(matchesTd);

    const killsTd = document.createElement("td");
    killsTd.textContent = entry.kills ?? 0;
    tr.appendChild(killsTd);

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
  const weekInput = $("weekInput");
  const raw = weekInput.value.trim();
  const statusEl = $("status");

  let weekParam = null;
  if (raw.length > 0) {
    const upper = raw.toUpperCase();
    if (upper.includes("W")) {
      // legacy ISO week "YYYY-WW"
      weekParam = upper;
    } else {
      // prefer YYYY-MM-DD for "clan week" (Wed→Wed)
      weekParam = raw;
    }
  }

  try:
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

  loadBtn.addEventListener("click", () => {
    loadLeaderboard();
  });

  setupSortButtons();

  // Auto-load current week on first visit
  loadLeaderboard();
});
