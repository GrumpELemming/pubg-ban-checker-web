/* -------------------------------------------------------
   PUBG Ban Checker - Watchlist System
   v1.9.4 Name Change Alert + Live Colour Update
   ------------------------------------------------------- */
(() => {
  const BASE_URL = "https://pubg-ban-checker-backend.onrender.com";
  const LS_PLATFORM = "selectedPlatform";
  const LS_DARK = "darkMode";
  const LS_WATCHLIST_PREFIX = "watchlist_";

  /* -------------------------------------------------------
     Platform Handling + Visuals
     ------------------------------------------------------- */
  function getPlatform() {
    return localStorage.getItem(LS_PLATFORM) || "steam";
  }

  function setPlatform(p) {
    localStorage.setItem(LS_PLATFORM, p);
    highlightPlatform(p);
    shimmerPlatformRowWatchlist();
    updatePlatformLabelWatchlist(p);
    loadWatchlist();
  }

  function highlightPlatform(p) {
    document
      .querySelectorAll(".platform-btn")
      .forEach(b => b.classList.toggle("active", b.dataset.platform === p));
  }

  function shimmerPlatformRowWatchlist() {
    const row = document.getElementById("platformRowWatchlist");
    if (!row) return;
    row.classList.add("shimmer");
    setTimeout(() => row.classList.remove("shimmer"), 600);
  }

  function updatePlatformLabelWatchlist(p) {
    const label = document.getElementById("activePlatformLabelWatchlist");
    if (!label) return;
    const displayName = {
      steam: "Steam",
      xbox: "Xbox",
      psn: "PlayStation Network",
      kakao: "Kakao",
    }[p] || p;
    label.innerHTML = `Viewing watchlist for: <strong>${displayName}</strong>`;
  }

  /* -------------------------------------------------------
     Dark Mode
     ------------------------------------------------------- */
  function initDarkMode() {
    const dark = localStorage.getItem(LS_DARK) === "true";
    document.body.classList.toggle("dark-mode", dark);
    const toggle = document.getElementById("darkModeToggle");
    if (toggle) {
      toggle.checked = dark;
      toggle.addEventListener("change", () => {
        localStorage.setItem(LS_DARK, toggle.checked ? "true" : "false");
        document.body.classList.toggle("dark-mode", toggle.checked);
      });
    }
  }

  /* -------------------------------------------------------
     Watchlist Data Helpers
     ------------------------------------------------------- */
  function getWatchlistKey(p) {
    return LS_WATCHLIST_PREFIX + p;
  }

  function getWatchlist(p) {
    try {
      return JSON.parse(localStorage.getItem(getWatchlistKey(p)) || "[]");
    } catch {
      return [];
    }
  }

  function saveWatchlist(p, list) {
    localStorage.setItem(getWatchlistKey(p), JSON.stringify(list));
  }

  function escapeHtml(s = "") {
    return s.replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
  }

  /* -------------------------------------------------------
     Build Row (cached vs live + name change alert)
     ------------------------------------------------------- */
  function buildRow(entry, p) {
    const row = document.createElement("div");
    row.className = "player-row";

    // Determine visual state
    if (entry._fresh) {
      const status = entry.lastStatus || "Unknown";
      const lower = status.toLowerCase();
      if (lower.includes("perm")) row.classList.add("perm-banned");
      else if (lower.includes("temp")) row.classList.add("temp-banned");
      else if (lower.includes("not")) row.classList.add("not-banned");
      else row.classList.add("unknown");
    } else {
      row.classList.add("cached");
    }

    const info = document.createElement("div");
    info.innerHTML = `
      <strong>${escapeHtml(entry.lastKnownName)}</strong><br>
      ID: ${escapeHtml(entry.accountId)}<br>
      Clan: ${escapeHtml(entry.clan || "none")}<br>
      ${
        entry._fresh
          ? `Status: <span class="ban-label">${escapeHtml(entry.lastStatus || "Unknown")}</span>`
          : `<span class="ban-label">(Last known status: ${escapeHtml(entry.lastStatus || "Unknown")})</span>`
      }
    `;

    /* -------------------------------------------------------
       Name Change Detection + Alert
       ------------------------------------------------------- */
    const checkBtn = document.createElement("button");
    checkBtn.textContent = "Check";
    checkBtn.onclick = async () => {
      checkBtn.disabled = true;
      checkBtn.textContent = "Checking...";
      try {
        const res = await fetch(
          `${BASE_URL}/resolve?platform=${encodeURIComponent(p)}&id=${encodeURIComponent(entry.accountId)}`
        );
        const data = await res.json();

        // Detect name change
        if (data.currentName && data.currentName !== entry.lastKnownName) {
          const oldName = entry.lastKnownName;
          entry.lastKnownName = data.currentName;

          const notice = document.createElement("div");
          notice.className = "name-change-alert";
          notice.textContent = `⚠️ Name changed: ${oldName} → ${data.currentName}`;
          row.prepend(notice);
          setTimeout(() => notice.remove(), 6000);
        }

        // Fetch clan/status
        const clanRes = await fetch(
          `${BASE_URL}/check-ban-clan?platform=${encodeURIComponent(p)}&player=${encodeURIComponent(entry.lastKnownName)}`
        );
        const clanData = await clanRes.json();
        const result = (clanData.results || [])[0];
        if (result) {
          entry.clan = result.clan || "none";
          entry.lastStatus = result.banStatus || "Unknown";
        }

        // Mark as freshly checked (enables colour)
        entry._fresh = true;

        const list = getWatchlist(p).map(e =>
          e.accountId === entry.accountId ? entry : e
        );
        saveWatchlist(p, list);
        loadWatchlist();
      } catch (err) {
        console.error(err);
      } finally {
        checkBtn.disabled = false;
        checkBtn.textContent = "Check";
      }
    };

    // Remove button
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.onclick = () => {
      const list = getWatchlist(p).filter(x => x.accountId !== entry.accountId);
      saveWatchlist(p, list);
      loadWatchlist();
    };

    const btnBox = document.createElement("div");
    btnBox.className = "button-row";
    btnBox.append(checkBtn, removeBtn);

    row.append(info, btnBox);
    return row;
  }

  /* -------------------------------------------------------
     Load Watchlist
     ------------------------------------------------------- */
  function loadWatchlist() {
    const container = document.getElementById("watchlistContainer");
    const p = getPlatform();
    const list = getWatchlist(p);

    highlightPlatform(p);
    updatePlatformLabelWatchlist(p);

    if (!list.length) {
      container.innerHTML = "<p class='muted'>No players in your watchlist yet.</p>";
      return;
    }

    container.innerHTML = "";
    list.forEach(entry => container.append(buildRow(entry, p)));
  }

  /* -------------------------------------------------------
     Refresh All
     ------------------------------------------------------- */
  async function refreshAll() {
    const container = document.getElementById("watchlistContainer");
    const p = getPlatform();
    const list = getWatchlist(p);

    if (!list.length) {
      container.innerHTML = "<p class='muted'>No players to refresh.</p>";
      return;
    }

    container.innerHTML = "<p class='muted'>Refreshing watchlist...</p>";
    let updatedCount = 0;

    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      try {
        const response = await fetch(
          `${BASE_URL}/resolve?platform=${encodeURIComponent(p)}&id=${encodeURIComponent(entry.accountId)}`
        );
        const data = await response.json();

        if (data.error) continue;

        if (data.currentName && data.currentName !== entry.lastKnownName) {
          list[i].lastKnownName = data.currentName;
          updatedCount++;
        }

        const clanRes = await fetch(
          `${BASE_URL}/check-ban-clan?platform=${encodeURIComponent(p)}&player=${encodeURIComponent(list[i].lastKnownName)}`
        );
        const clanData = await clanRes.json();
        const result = (clanData.results || [])[0];
        if (result) {
          list[i].clan = result.clan || "none";
          list[i].lastStatus = result.banStatus || "Unknown";
        }

        list[i]._fresh = false; // Reset to cached after full refresh
      } catch (err) {
        console.error(`Error resolving ${entry.accountId}:`, err);
      }
    }

    saveWatchlist(p, list);
    loadWatchlist();

    container.insertAdjacentHTML(
      "afterbegin",
      `<p class="muted">✅ Refreshed ${updatedCount} player${updatedCount === 1 ? "" : "s"}.</p>`
    );
  }

  /* -------------------------------------------------------
     Init
     ------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    initDarkMode();

    const p = getPlatform();
    highlightPlatform(p);
    updatePlatformLabelWatchlist(p);

    document.querySelectorAll(".platform-btn").forEach(b =>
      b.addEventListener("click", () => setPlatform(b.dataset.platform))
    );

    loadWatchlist();

    document.getElementById("clearWatchlistBtn").onclick = () => {
      const p = getPlatform();
      localStorage.removeItem(getWatchlistKey(p));
      loadWatchlist();
    };

    document.getElementById("refreshAllBtn").onclick = refreshAll;
  });
})();

