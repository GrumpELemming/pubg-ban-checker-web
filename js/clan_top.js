// LULZ CLAN RECORDS frontend
// Uses /api/clan/alltime-stats (through Cloudflare Worker)

const API_BASE = "/api/clan";

const BOARDS = [
  {
    key: "top_longest_kill",
    title: "Longest Kills",
    subtitle: "Top 10 longest shots (meters)",
    columns: [
      { label: "#", render: (_, idx) => idx + 1 },
      { label: "Name", render: row => row.name || row.player_id || "Unknown" },
      { label: "Distance (m)", render: row => formatNumber(row.longest_kill, 1) },
    ],
  },
  {
    key: "top_kills",
    title: "Total Kills",
    subtitle: "Most kills across all BR matches",
    columns: [
      { label: "#", render: (_, idx) => idx + 1 },
      { label: "Name", render: row => row.name || row.player_id || "Unknown" },
      { label: "Kills", render: row => formatInt(row.kills) },
    ],
  },
  {
    key: "top_wins",
    title: "Total Wins",
    subtitle: "Most chicken dinners",
    columns: [
      { label: "#", render: (_, idx) => idx + 1 },
      { label: "Name", render: row => row.name || row.player_id || "Unknown" },
      { label: "Wins", render: row => formatInt(row.wins) },
    ],
  },
  {
    key: "top_damage",
    title: "Total Damage",
    subtitle: "Most damage dealt",
    columns: [
      { label: "#", render: (_, idx) => idx + 1 },
      { label: "Name", render: row => row.name || row.player_id || "Unknown" },
      { label: "Damage", render: row => formatInt(row.damage) },
    ],
  },
  {
    key: "top_time",
    title: "Time Played",
    subtitle: "Most time survived (hours)",
    columns: [
      { label: "#", render: (_, idx) => idx + 1 },
      { label: "Name", render: row => row.name || row.player_id || "Unknown" },
      { label: "Hours", render: row => formatHours(row.time_survived) },
    ],
  },
  {
    key: "top_headshots",
    title: "Headshots",
    subtitle: "Most headshot kills",
    columns: [
      { label: "#", render: (_, idx) => idx + 1 },
      { label: "Name", render: row => row.name || row.player_id || "Unknown" },
      { label: "Headshots", render: row => formatInt(row.headshots) },
    ],
  },
  {
    key: "top_assists",
    title: "Assists",
    subtitle: "Most assists",
    columns: [
      { label: "#", render: (_, idx) => idx + 1 },
      { label: "Name", render: row => row.name || row.player_id || "Unknown" },
      { label: "Assists", render: row => formatInt(row.assists) },
    ],
  },
  {
    key: "top_kdr",
    title: "KDR (min 5 matches)",
    subtitle: "Kills / (matches - wins)",
    columns: [
      { label: "#", render: (_, idx) => idx + 1 },
      { label: "Name", render: row => row.name || row.player_id || "Unknown" },
      { label: "KDR", render: row => formatNumber(row.kdr, 2) },
      { label: "Matches", render: row => formatInt(row.matches) },
    ],
  },
];

function formatInt(val) {
  const n = Number(val || 0);
  return n.toLocaleString();
}

function formatNumber(val, decimals = 1) {
  const n = Number(val || 0);
  return n.toFixed(decimals);
}

function formatHours(seconds) {
  const n = Number(seconds || 0);
  return (n / 3600).toFixed(1);
}

async function fetchRecords() {
  const statusEl = document.getElementById("recordsStatus");
  if (statusEl) {
    statusEl.textContent = "Loading...";
    statusEl.classList.remove("error");
  }

  const resp = await fetch(`${API_BASE}/alltime-stats`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`Backend error (${resp.status})`);
  return resp.json();
}

function renderBoard(container, boardKey, title, subtitle, rows) {
  const card = document.createElement("div");
  card.className = "clan-card record-card";

  const header = document.createElement("div");
  header.className = "card-header";
  const heading = document.createElement("div");
  heading.innerHTML = `<h3>${title}</h3><p class="muted" style="margin:4px 0 0;">${subtitle}</p>`;
  header.appendChild(heading);
  card.appendChild(header);

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  const boardDef = BOARDS.find(b => b.key === boardKey);
  (boardDef?.columns || []).forEach(col => {
    const th = document.createElement("th");
    th.textContent = col.label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  if (!rows || !rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = (boardDef?.columns?.length || 1);
    td.className = "muted";
    td.textContent = "No data yet.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    rows.forEach((row, idx) => {
      const tr = document.createElement("tr");
      (boardDef?.columns || []).forEach(col => {
        const td = document.createElement("td");
        td.textContent = col.render(row, idx);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  table.appendChild(tbody);
  card.appendChild(table);
  container.appendChild(card);
}

async function loadRecords() {
  const grid = document.getElementById("recordsGrid");
  const statusEl = document.getElementById("recordsStatus");
  if (!grid) return;

  grid.innerHTML = "";

  try {
    const data = await fetchRecords();
    BOARDS.forEach(board => {
      renderBoard(grid, board.key, board.title, board.subtitle, data[board.key] || []);
    });
    if (statusEl) statusEl.textContent = "Loaded";
  } catch (err) {
    console.error(err);
    if (statusEl) {
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.classList.add("error");
    }
    const fallback = document.createElement("div");
    fallback.className = "muted";
    fallback.style.padding = "12px";
    fallback.textContent = "Failed to load records.";
    grid.appendChild(fallback);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const refreshBtn = document.getElementById("refreshRecords");
  if (refreshBtn) refreshBtn.addEventListener("click", loadRecords);
  loadRecords();
});
