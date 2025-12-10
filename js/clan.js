// js/clan.js
// Simple frontend for the private clan leaderboard.
// Calls your backend via the Cloudflare Worker at /api/clan/weekly-leaderboard.

const API_BASE = "/api/clan";

function $(id) {
  return document.getElementById(id);
}

async function fetchLeaderboard(weekParam) {
  const statusEl = $("status");
  statusEl.textContent = "Loading...";
  statusEl.classList.remove("error");

  let url = `${API_BASE}/weekly-leaderboard`;
  if (weekParam) {
    // Backend expects YYYY-WW
    url += `?week=${encodeURIComponent(weekParam)}`;
  }

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
    },
  });

  if (!resp.ok) {
    throw new Error(`Backend error (${resp.status})`);
  }

  return resp.json();
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

  summaryTitle.textContent = `Week ${fmt(start)} → ${fmt(end)}`;
  entriesCount.textContent =
    data.count === 1 ? "1 player" : `${data.count} players`;

  if (!data.entries || data.entries.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "muted";
    td.textContent = "No data for this week.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    statusEl.textContent = "Loaded (no data)";
    return;
  }

  data.entries.forEach((entry, index) => {
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
    // Allow either "YYYY-WW" or "YYYY-WWW" or even "YYYY-WW" without the "W"
    let formatted = raw.toUpperCase();
    if (!formatted.includes("W")) {
      formatted = formatted.replace("-", "-W");
    }
    weekParam = formatted;
  }

  try {
    const data = await fetchLeaderboard(weekParam);
    renderLeaderboard(data);
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Error: ${err.message}`;
    statusEl.classList.add("error");

    const tbody = document.querySelector("#leaderboard tbody");
    tbody.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "muted";
    td.textContent = "Failed to load leaderboard.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const loadBtn = $("loadBtn");

  loadBtn.addEventListener("click", () => {
    loadLeaderboard();
  });

  // Auto-load current week on first visit
  loadLeaderboard();
});
