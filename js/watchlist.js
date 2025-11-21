/* -------------------------------------------------------
   PUBG Ban Checker - Watchlist (Final Theme Build)
   Includes:
   - Name history tracking
   - Name-change modal
   - Clean list updates (no flashing)
   - New theme class structure
------------------------------------------------------- */

(() => {

  const BASE_URL = "https://pubg-ban-checker-backend.onrender.com";

  const LS_PLATFORM = "selectedPlatform";
  const LS_DARK = "darkMode";
  const LS_WATCHLIST_PREFIX = "watchlist_";

  // --------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getPlatform() {
    const hidden = document.getElementById("platformSelect");
    if (hidden && hidden.value) return hidden.value;

    const saved = localStorage.getItem(LS_PLATFORM);
    return saved || "steam";
  }

  function setPlatform(platform) {
    localStorage.setItem(LS_PLATFORM, platform);
    const hidden = document.getElementById("platformSelect");
    if (hidden) hidden.value = platform;
  }

  function getWatchlistKey(platform) {
    return `${LS_WATCHLIST_PREFIX}${platform}`;
  }

  function getWatchlist(platform) {
    try {
      const raw = localStorage.getItem(getWatchlistKey(platform));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveWatchlist(platform, arr) {
    try {
      localStorage.setItem(getWatchlistKey(platform), JSON.stringify(arr));
    } catch {}
  }

  function formatDateTime(ts) {
    if (!ts) return "Never";
    try {
      const d = new Date(ts);
      return d.toLocaleString();
    } catch {
      return "Never";
    }
  }

  function mapStatusToInfo(statusLabel) {
    const t = (statusLabel || "").toLowerCase();

    if (t.includes("perm")) return { code: "perm", text: "Permanently Banned" };
    if (t.includes("temp")) return { code: "temp", text: "Temporarily Banned" };
    if (t.includes("not")) return { code: "ok", text: "Not Banned" };
    if (t.includes("player not found")) return { code: "unknown", text: "Player Not Found" };
    if (t.includes("error")) return { code: "unknown", text: "Error / Unknown" };
    return { code: "unknown", text: statusLabel || "Unknown" };
  }

  // --------------------------------------------------------------------
  // Dark mode
  // --------------------------------------------------------------------

  function applyInitialDarkMode() {
    const body = document.body;
    const toggle = document.getElementById("darkModeToggle");
    const stored = localStorage.getItem(LS_DARK);

    const on = stored === "true";
    if (on) {
      body.classList.add("dark-mode");
      if (toggle) toggle.checked = true;
    }

    if (toggle) {
      toggle.addEventListener("change", () => {
        const enabled = toggle.checked;
        body.classList.toggle("dark-mode", enabled);
        localStorage.setItem(LS_DARK, String(enabled));
      });
    }
  }

  // --------------------------------------------------------------------
  // Platform selection
  // --------------------------------------------------------------------

  function applyPlatformToButtons(rowId, labelId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const labelEl = document.getElementById(labelId);

    const buttons = [...row.querySelectorAll(".platform-btn")];
    const current = getPlatform();

    buttons.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.platform === current);

      btn.addEventListener("click", () => {
        const p = btn.dataset.platform;
        if (!p) return;

        setPlatform(p);
        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        if (labelEl) {
          const pretty = p === "psn" ? "PSN" : p.charAt(0).toUpperCase() + p.slice(1);
          labelEl.innerHTML = `Viewing watchlist for: <strong>${escapeHtml(pretty)}</strong>`;
        }

        // Replace only this row to avoid full flash
      const container = document.getElementById("watchlistContainer");
      if (container) {
        const rows = Array.from(container.getElementsByClassName("watchlist-player"));
        const idx = list.findIndex(e => e.player.toLowerCase() === match.player.toLowerCase());
        if (rows[idx]) {
          const newRow = buildWatchlistRow(match, idx);
          rows[idx].replaceWith(newRow);
        }
      }

      });
    });

    if (labelEl) {
      const pretty = current === "psn" ? "PSN" : current.charAt(0).toUpperCase() + current.slice(1);
      labelEl.innerHTML = `Viewing watchlist for: <strong>${escapeHtml(pretty)}</strong>`;
    }
  }

  // --------------------------------------------------------------------
  // Row Builder
  // --------------------------------------------------------------------

  function buildWatchlistRow(entry, index) {
    const statusInfo = mapStatusToInfo(entry.statusLabel);

    const row = document.createElement("div");
    row.className = "watchlist-player";

    // NAME LINE
    const nameLine = document.createElement("div");
    nameLine.className = "wl-name-line";

    const playerStrong = document.createElement("strong");
    playerStrong.textContent = entry.player;
    nameLine.appendChild(playerStrong);

    const badge = document.createElement("span");
    badge.className = "wl-platform-badge";
    badge.textContent = entry.platform.toUpperCase();
    nameLine.appendChild(badge);

    const pill = document.createElement("span");
    pill.className = `wl-status-pill wl-status-pill-${statusInfo.code}`;
    pill.textContent =
      statusInfo.code === "perm" ? "PERMA" :
      statusInfo.code === "temp" ? "TEMP" :
      statusInfo.code === "ok" ? "OK" : "UNK";

    nameLine.appendChild(pill);

    // META
    const meta = document.createElement("div");
    meta.className = "wl-meta";
    meta.innerHTML = `
      <span>Clan: <strong>${escapeHtml(entry.clan || "none")}</strong></span>
      <span>Account ID: <strong>${escapeHtml(entry.accountId || "unknown")}</strong></span>
      <span>Status: ${escapeHtml(statusInfo.text)}</span>
      <span>Last checked: ${escapeHtml(formatDateTime(entry.lastChecked))}</span>
    `;

    // NAME HISTORY section (optional)
    let historyEl = null;
    if (Array.isArray(entry.history) && entry.history.length > 0) {
      historyEl = document.createElement("div");
      historyEl.className = "wl-history";
      historyEl.innerHTML = `<span class="wl-history-label">Previously known as:</span> `;
      entry.history.forEach(h => {
        const span = document.createElement("span");
        span.className = "wl-history-name";
        span.textContent = " " + h;
        historyEl.appendChild(span);
      });
    }

    // Buttons
    const btns = document.createElement("div");
    btns.className = "wl-card-buttons";

    const reBtn = document.createElement("button");
    reBtn.className = "wl-btn wl-btn-mini wl-btn-primary";
    reBtn.textContent = "Re-check";
    reBtn.addEventListener("click", () => recheckSingle(entry.player));

    const rmBtn = document.createElement("button");
    rmBtn.className = "wl-btn wl-btn-mini wl-btn-ghost";
    rmBtn.textContent = "Remove";
    rmBtn.addEventListener("click", () => removeFromWatchlist(index));

    btns.appendChild(reBtn);
    btns.appendChild(rmBtn);

    // Assemble row
    const left = document.createElement("div");
    left.appendChild(nameLine);
    left.appendChild(meta);
    if (historyEl) left.appendChild(historyEl);

    row.appendChild(left);
    row.appendChild(btns);

    return row;
  }

  // --------------------------------------------------------------------
  // Watchlist Rendering
  // --------------------------------------------------------------------

  function getFilteredWatchlist() {
    const platform = getPlatform();
    const all = getWatchlist(platform);

    const filter = document.getElementById("statusFilter")?.value || "all";
    if (filter === "all") return all;

    return all.filter(entry => {
      const code = mapStatusToInfo(entry.statusLabel).code;
      return code === filter;
    });
  }

  function renderWatchlist() {
    const container = document.getElementById("watchlistContainer");
    if (!container) return;

    container.innerHTML = "";

    const list = getFilteredWatchlist();
    if (!list.length) {
      container.innerHTML = `<p class="wl-empty">No players in your watchlist yet.</p>`;
      return;
    }

    list.forEach((entry, idx) => {
      container.appendChild(buildWatchlistRow(entry, idx));
    });
  }

  function removeFromWatchlist(index) {
    const platform = getPlatform();
    const list = getWatchlist(platform);
    list.splice(index, 1);
    saveWatchlist(platform, list);
    // Replace only this row to avoid full flash
      const container = document.getElementById("watchlistContainer");
      if (container) {
        const rows = Array.from(container.getElementsByClassName("watchlist-player"));
        const idx = list.findIndex(e => e.player.toLowerCase() === match.player.toLowerCase());
        if (rows[idx]) {
          const newRow = buildWatchlistRow(match, idx);
          rows[idx].replaceWith(newRow);
        }
      }

  }

  // --------------------------------------------------------------------
  // Name Change Modal
  // --------------------------------------------------------------------

  const modal = () => document.getElementById("nameChangeModal");
  const modalText = () => document.getElementById("nameChangeText");
  const closeBtn = () => document.getElementById("nameChangeCloseBtn");

  function showNameChangeModal(oldName, newName) {
    modalText().textContent = `${oldName} → ${newName}`;
    modal().classList.remove("hidden");
  }

  if (closeBtn()) {
    closeBtn().addEventListener("click", () => {
      modal().classList.add("hidden");
    });
  }

  // --------------------------------------------------------------------
  // Re-check logic
  // --------------------------------------------------------------------

  async function recheckSingle(playerName) {
    const platform = getPlatform();
    const list = getWatchlist(platform);

    const match = list.find(e => e.player.toLowerCase() === playerName.toLowerCase());
    if (!match) return;

    try {
      const resp = await fetch(
        `${BASE_URL}/check-ban-clan?platform=${encodeURIComponent(platform)}&player=${encodeURIComponent(playerName)}`
      );

      const data = await resp.json();
      if (!resp.ok || !Array.isArray(data.results)) return;

      const r = data.results[0];
      if (!r) return;

      const oldName = match.player;
      const newName = r.player || r.name || oldName;

      // NAME CHANGE DETECTED
      if (newName !== oldName) {
        match.history = match.history || [];

        // Avoid duplicates
        if (!match.history.includes(oldName)) {
          match.history.push(oldName);
        }

        match.player = newName;

        showNameChangeModal(oldName, newName);
      }

      match.accountId = r.accountId || r.id || match.accountId;
      match.clan = r.clan || match.clan;
      match.statusLabel = r.banStatus || r.status || r.statusText || match.statusLabel;
      match.lastChecked = Date.now();

      saveWatchlist(platform, list);
      // Replace only this row to avoid full flash
      const container = document.getElementById("watchlistContainer");
      if (container) {
        const rows = Array.from(container.getElementsByClassName("watchlist-player"));
        const idx = list.findIndex(e => e.player.toLowerCase() === match.player.toLowerCase());
        if (rows[idx]) {
          const newRow = buildWatchlistRow(match, idx);
          rows[idx].replaceWith(newRow);
        }
      }


    } catch (err) {
      console.error("Recheck error", err);
    }
  }

  // --------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", () => {

    applyInitialDarkMode();

    applyPlatformToButtons(
      "platformRowWatchlist",
      "activePlatformLabelWatchlist"
    );

    const filter = document.getElementById("statusFilter");
    if (filter) {
      filter.addEventListener("change", renderWatchlist);
    }

    const refreshAllBtn = document.getElementById("refreshAllBtn");
    if (refreshAllBtn) {
      refreshAllBtn.addEventListener("click", () => {
        const container = document.querySelector(".wl-list-card");
        if (container) {
          container.classList.add("wl-container-scan");
          setTimeout(() => container.classList.remove("wl-container-scan"), 450);
        }

        // For now, per your request: no automatic refresh-all API calls
      });
    }

    const clearBtn = document.getElementById("clearWatchlistBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        const p = getPlatform();
        saveWatchlist(p, []);
        // Replace only this row to avoid full flash
      const container = document.getElementById("watchlistContainer");
      if (container) {
        const rows = Array.from(container.getElementsByClassName("watchlist-player"));
        const idx = list.findIndex(e => e.player.toLowerCase() === match.player.toLowerCase());
        if (rows[idx]) {
          const newRow = buildWatchlistRow(match, idx);
          rows[idx].replaceWith(newRow);
        }
      }

      });
    }

    // Replace only this row to avoid full flash
      const container = document.getElementById("watchlistContainer");
      if (container) {
        const rows = Array.from(container.getElementsByClassName("watchlist-player"));
        const idx = list.findIndex(e => e.player.toLowerCase() === match.player.toLowerCase());
        if (rows[idx]) {
          const newRow = buildWatchlistRow(match, idx);
          rows[idx].replaceWith(newRow);
        }
      }

  });

})();
