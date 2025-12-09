(() => {
  const statusEl = document.getElementById("status");
  const weekInput = document.getElementById("weekInput");
  const loadBtn = document.getElementById("loadBtn");
  const tableBody = document.querySelector("#leaderboard tbody");
  const summaryTitle = document.getElementById("summaryTitle");
  const entriesCount = document.getElementById("entriesCount");

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
  }

  function renderRows(entries) {
    tableBody.innerHTML = "";
    if (!entries.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.className = "muted";
      td.textContent = "No data for this week.";
      tr.appendChild(td);
      tableBody.appendChild(tr);
      return;
    }

    entries.forEach((e, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${e.name || e.player_id}</td>
        <td>${e.matches}</td>
        <td>${e.kills}</td>
        <td>${e.kdr}</td>
        <td>${Math.round(e.damage)}</td>
        <td>${e.time_played_hours}</td>
        <td>${e.wins}</td>
      `;
      tableBody.appendChild(tr);
    });
  }

  async function loadLeaderboard() {
    setStatus("Loading...");
    const weekParam = weekInput?.value?.trim();
    const url = weekParam
      ? `/api/clan/weekly-leaderboard?week=${encodeURIComponent(weekParam)}`
      : `/api/clan/weekly-leaderboard`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderRows(data.entries || []);
      if (summaryTitle) {
        summaryTitle.textContent = weekParam ? `Week ${weekParam}` : "Current week";
      }
      if (entriesCount) {
        entriesCount.textContent = `${(data.entries || []).length} players`;
      }
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus("Failed to load leaderboard.");
    }
  }

  if (loadBtn) {
    loadBtn.addEventListener("click", loadLeaderboard);
  }

  document.addEventListener("DOMContentLoaded", loadLeaderboard);
})();
