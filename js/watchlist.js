/* -------------------------------------------------------
   PUBG Ban Checker - Watchlist
   watchlist.js
   Design B: compact neutral cards + status pills
   ------------------------------------------------------- */
(() => {
  const BASE_URL = "https://pubg-ban-checker-backend.onrender.com";

  const LS_PLATFORM = "selectedPlatform";
  const LS_DARK = "darkMode";
  const LS_WATCHLIST_PREFIX = "watchlist_";

  // ---------- Helpers ----------
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
    const hidden = document.getElementById("platformSelect");
    if (hidden) hidden.value = platform;
    localStorage.setItem(LS_PLATFORM, platform);
  }

  function applyPlatformToButtons(rowId, labelId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const buttons = Array.from(row.querySelectorAll(".platform-btn"));
    const labelEl = labelId ? document.getElementById(labelId) : null;

    const current = getPlatform();
    buttons.forEach(btn => {
      const p = btn.getAttribute("data-platform");
      if (p === current) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }

      btn.addEventListener("click", () => {
        const platform = btn.getAttribute("data-platform");
        if (!platform) return;

        row.classList.add("shimmer");
        setTimeout(() => row.classList.remove("shimmer"), 450);

        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        setPlatform(platform);

        if (labelEl) {
          const pretty =
            platform === "psn"
              ? "PSN"
              : platform.charAt(0).toUpperCase() + platform.slice(1);
          labelEl.innerHTML = `Viewing watchlist for: <strong>${escapeHtml(
            pretty
          )}</strong>`;
        }

        // Re-render list for the newly selected platform
        renderWatchlist();
      });
    });

    if (labelEl) {
      const cp = getPlatform();
      const pretty =
        cp === "psn" ? "PSN" : cp.charAt(0).toUpperCase() + cp.slice(1);
      labelEl.innerHTML = `Viewing watchlist for: <strong>${escapeHtml(
        pretty
      )}</strong>`;
    }
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
      localStorage.setItem(
        getWatchlistKey(platform),
        JSON.stringify(arr || [])
      );
    } catch {
      // ignore quota
    }
  }

  function mapStatusToInfo(statusLabel) {
    const t = (statusLabel || "").toLowerCase();

    if (t.includes("perm")) {
      return { code: "perm", text: "Permanently Banned" };
    } else if (t.includes("temp")) {
      return { code: "temp", text: "Temporarily Banned" };
    } else if (t.includes("not")) {
      return { code: "ok", text: "Not Banned" };
    } else if (t.includes("error")) {
      return { code: "unknown", text: "Error / Unknown" };
    } else if (t.includes("player not found")) {
      return { code: "unknown", text: "Player Not Found" };
    }
    return { code: "unknown", text: statusLabel || "Unknown" };
  }

  function formatDateTime(ts) {
    if (!ts) return "Never";
    try {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return "Never";
      return d.toLocaleString();
    } catch {
      return "Never";
    }
  }

  function applyInitialDarkMode() {
    const body = document.body;
    const toggle = document.getElementById("darkModeToggle");
    const stored = localStorage.getItem(LS_DARK);

    const enabled = stored === "true";
    if (enabled) {
      body.classList.add("dark-mode");
      if (toggle) toggle.checked = true;
    }

    if (toggle) {
      toggle.addEventListener("change", () => {
        const on = !!toggle.checked;
        if (on) {
          body.classList.add("dark-mode");
        } else {
          body.classList.remove("dark-mode");
        }
        localStorage.setItem(LS_DARK, String(on));
      });
    }
  }

  // ---------- DOM builders ----------
  function buildWatchlistRow(entry, index) {
    const platform = entry.platform || getPlatform();
    const statusInfo = mapStatusToInfo(entry.statusLabel);
    const row = document.createElement("div");
    row.className = "watchlist-player";

    const statusPill = document.createElement("span");
    statusPill.className = `wl-status-pill wl-status-${statusInfo.code}`;
    statusPill.textContent =
      statusInfo.code === "perm"
        ? "PERMA"
        : statusInfo.code === "temp"
        ? "TEMP"
        : statusInfo.code === "ok"
        ? "OK"
        : "UNK";

    const nameLine = document.createElement("div");
    nameLine.className = "wl-name-line";
    nameLine.innerHTML = `
      <strong>${escapeHtml(entry.player || "unknown")}</strong>
      <span class="wl-platform-badge">${escapeHtml(
        platform === "psn"
          ? "PSN"
          : platform.charAt(0).toUpperCase() + platform.slice(1)
      )}</span>
    `;
    nameLine.appendChild(statusPill);

    const meta = document.createElement("div");
    meta.className = "wl-meta";
    meta.innerHTML = `
      <span>Clan: <strong>${escapeHtml(entry.clan || "none")}</strong></span>
      <span>Account ID: <strong>${escapeHtml(
        entry.accountId || "unknown"
      )}</strong></span>
      <span>Status: ${escapeHtml(statusInfo.text)}</span>
      <span>Last checked: ${escapeHtml(
        formatDateTime(entry.lastChecked)
      )}</span>
    `;

    const left = document.createElement("div");
    left.className = "wl-left";
    left.append(nameLine, meta);

    const actions = document.createElement("div");
    actions.className = "watchlist-buttons";

    const recheckBtn = document.createElement("button");
    recheckBtn.textContent = "Re-check";
    recheckBtn.addEventListener("click", () => {
      recheckSingle(entry.player);
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "secondary-btn";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      removeFromWatchlist(index);
    });

    actions.append(recheckBtn, removeBtn);
    row.append(left, actions);
    return row;
  }

  // ---------- Watchlist logic ----------
  function getFilteredWatchlist() {
    const platform = getPlatform();
    const all = getWatchlist(platform);
    const filterSelect = document.getElementById("statusFilter");
    const filter = filterSelect ? filterSelect.value : "all";

    if (filter === "all") return all;

    return all.filter(entry => {
      const code = mapStatusToInfo(entry.statusLabel).code;
      return code === filter;
    });
  }

  function renderWatchlist() {
    const container = document.getElementById("watchlistContainer");
    if (!container) return;

    const list = getFilteredWatchlist();

    container.innerHTML = "";
    if (!list.length) {
      container.innerHTML =
        "<p class='muted'>No players in your watchlist yet.</p>";
      return;
    }

    list.forEach((entry, idx) => {
      const row = buildWatchlistRow(entry, idx);
      container.appendChild(row);
    });
  }

  function removeFromWatchlist(index) {
    const platform = getPlatform();
    const list = getWatchlist(platform);
    if (index < 0 || index >= list.length) return;
    list.splice(index, 1);
    saveWatchlist(platform, list);
    renderWatchlist();
  }

  async function recheckAll() {
    const platform = getPlatform();
    const list = getWatchlist(platform);
    const container = document.getElementById("watchlistContainer");

    if (!list.length) return;

    if (container) {
      container.innerHTML =
        "<p class='muted'>Re-checking all players...</p>";
    }

    const names = list.map(e => e.player).filter(Boolean);
    const uniqueNames = [...new Set(names)];

    try {
      const resp = await fetch(
        `${BASE_URL}/check-ban-clan?platform=${encodeURIComponent(
          platform
        )}&player=${encodeURIComponent(uniqueNames.join(","))}`
      );
      const data = await resp.json();

      if (!resp.ok || !Array.isArray(data.results)) {
        if (container) {
          container.innerHTML = `<p class='muted'>Refresh failed: ${escapeHtml(
            data.error || `HTTP ${resp.status}`
          )}</p>`;
        }
        return;
      }

      const resultMap = new Map();
      for (const r of data.results) {
        if (!r || !r.player) continue;
        resultMap.set(r.player.toLowerCase(), r);
      }

      const now = Date.now();

      // Update each watchlist entry
      for (const entry of list) {
        const r = resultMap.get((entry.player || "").toLowerCase());
        if (!r) continue;

        entry.accountId = r.accountId || r.id || entry.accountId || "";
        entry.clan = r.clan || entry.clan || "";
        entry.statusLabel =
          r.banStatus || r.status || r.statusText || entry.statusLabel || "";
        entry.lastChecked = now;
      }

      saveWatchlist(platform, list);
      renderWatchlist();
    } catch (err) {
      if (container) {
        container.innerHTML = `<p class='muted'>Refresh failed: ${escapeHtml(
          String(err)
        )}</p>`;
      }
    }
  }

  async function recheckSingle(playerName) {
    if (!playerName) return;
    const platform = getPlatform();
    const platformList = getWatchlist(platform);

    const container = document.getElementById("watchlistContainer");
    if (container) {
      // very quick feedback; list will re-render after
      container.classList.add("fade-out");
      setTimeout(() => container.classList.remove("fade-out"), 250);
    }

    try {
      const resp = await fetch(
        `${BASE_URL}/check-ban-clan?platform=${encodeURIComponent(
          platform
        )}&player=${encodeURIComponent(playerName)}`
      );
      const data = await resp.json();
      if (!resp.ok || !Array.isArray(data.results)) {
        // just ignore on error
        return;
      }

      const r = data.results[0];
      if (!r) return;

      const now = Date.now();
      const match = platformList.find(
        e => (e.player || "").toLowerCase() === playerName.toLowerCase()
      );
      if (match) {
        match.accountId = r.accountId || r.id || match.accountId || "";
        match.clan = r.clan || match.clan || "";
        match.statusLabel =
          r.banStatus || r.status || r.statusText || match.statusLabel || "";
        match.lastChecked = now;
        saveWatchlist(platform, platformList);
        renderWatchlist();
      }
    } catch (err) {
      // swallow; the global refresh is still available
      console.error("Re-check error:", err);
    }
  }

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", () => {
    applyPlatformToButtons(
      "platformRowWatchlist",
      "activePlatformLabelWatchlist"
    );
    applyInitialDarkMode();

    const filterSelect = document.getElementById("statusFilter");
    if (filterSelect) {
      filterSelect.addEventListener("change", () => {
        renderWatchlist();
      });
    }

    const refreshAllBtn = document.getElementById("refreshAllBtn");
    if (refreshAllBtn) {
      refreshAllBtn.addEventListener("click", () => {
        refreshAll();
      });
    }

    const clearWatchlistBtn = document.getElementById("clearWatchlistBtn");
    if (clearWatchlistBtn) {
      clearWatchlistBtn.addEventListener("click", () => {
        const platform = getPlatform();
        saveWatchlist(platform, []);
        renderWatchlist();
      });
    }

    renderWatchlist();
  });
})();
