/* -------------------------------------------------------
   PUBG Ban Checker - Watchlist (Final Theme Build)
   Includes:
   - Name history tracking
   - Name-change modal
   - Clean list updates (no flashing)
   - New theme class structure
------------------------------------------------------- */

(() => {

  // Route all API calls through a same-origin proxy (e.g., /api -> Render backend)
  const BASE_URL = "/api";

  const LS_PLATFORM = "selectedPlatform";
  const LS_WATCHLIST_PREFIX = "watchlist_";
  const REFRESH_BATCH_DELAY = 500;
  const BAN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

    try {
      const saved = localStorage.getItem(LS_PLATFORM);
      if (saved) {
        if (hidden && hidden.value !== saved) hidden.value = saved;
        return saved;
      }
    } catch {}

    if (hidden && hidden.value) return hidden.value;
    return "steam";
  }

  function setPlatform(platform) {
    const hidden = document.getElementById("platformSelect");
    if (hidden) hidden.value = platform;
    try {
      localStorage.setItem(LS_PLATFORM, platform);
    } catch {}
  }

  function getWatchlistKey(platform) {
    return `${LS_WATCHLIST_PREFIX}${platform}`;
  }

  function getWatchlist(platform) {
    try {
      const raw = localStorage.getItem(getWatchlistKey(platform));
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];

      let needsSave = false;
      const cleaned = parsed
        .map(item => {
          if (!item || typeof item !== "object") {
            needsSave = true;
            return null;
          }
          if (!item.platform) {
            item.platform = platform;
            needsSave = true;
          }
          if (typeof item.statusLabel !== "string") {
            item.statusLabel = "";
            needsSave = true;
          }
          return item;
        })
        .filter(Boolean);

      if (needsSave) {
        saveWatchlist(platform, cleaned);
      }

      return cleaned;
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

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cache helpers scoped per platform/player to avoid refetching hot data
  function makeCacheKey(platform, playerName) {
    return `banCache_${platform}_${playerName || ""}`;
  }

  function getCachedBan(platform, playerName) {
    try {
      const raw = sessionStorage.getItem(makeCacheKey(platform, playerName));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (Date.now() - (parsed.ts || 0) > BAN_CACHE_TTL_MS) return null;
      return parsed.data || null;
    } catch {
      return null;
    }
  }

  function setCachedBan(platform, playerName, data) {
    try {
      sessionStorage.setItem(
        makeCacheKey(platform, playerName),
        JSON.stringify({ ts: Date.now(), data })
      );
    } catch {}
  }

  async function resolveCurrentName(accountId, platform) {
    if (!accountId) return null;
    try {
      const resp = await fetch(
        `${BASE_URL}/resolve?platform=${encodeURIComponent(platform)}&id=${encodeURIComponent(accountId)}`
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.currentName || data.name || null;
    } catch (err) {
      console.warn("Name resolve failed", err);
      return null;
    }
  }

  async function syncEntryNameFromAccount(entry, platform) {
    if (!entry || !entry.accountId) return false;
    const latest = await resolveCurrentName(entry.accountId, platform);
    if (!latest) return false;

    const currentLower = (entry.player || "").toLowerCase();
    if (latest.toLowerCase() === currentLower) {
      return false;
    }

    const oldName = entry.player;
    entry.history = entry.history || [];
    if (!entry.history.some(h => h.toLowerCase() === currentLower)) {
      entry.history.push(oldName);
    }
    entry.player = latest;
    showNameChangeModal(oldName, latest);
    return true;
  }

  // Dark mode removed; clear any legacy state
  function clearLegacyDarkMode() {
    document.body.classList.remove("dark-mode");
    try {
      localStorage.removeItem("darkMode");
    } catch {}
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

        renderWatchlist();
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

  function renderWatchlist(baseList) {
    const container = document.getElementById("watchlistContainer");
    if (!container) return;

    container.innerHTML = "";

    const list = baseList || getWatchlist(getPlatform());
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
    renderWatchlist(list);
  }

  // --------------------------------------------------------------------
  // Name Change Modal
  // --------------------------------------------------------------------

  const modal = () => document.getElementById("nameChangeModal");
  const modalText = () => document.getElementById("nameChangeText");
  const closeBtn = () => document.getElementById("nameChangeCloseBtn");
  const nameChangeQueue = [];

  function showNameChangeModal(oldName, newName) {
    nameChangeQueue.push({ oldName, newName });
    const modalEl = modal();
    if (!modalEl) return;

    if (!modalEl.classList.contains("active")) {
      renderNameChangeModal();
    }
  }

  function renderNameChangeModal() {
    const modalEl = modal();
    if (!modalEl) return;
    if (!nameChangeQueue.length) {
      modalEl.classList.add("hidden");
      modalEl.classList.remove("active");
      return;
    }

    const { oldName, newName } = nameChangeQueue[0];
    modalText().textContent = `${oldName} -> ${newName}`;
    modalEl.classList.remove("hidden");
    modalEl.classList.add("active");
  }

  if (closeBtn()) {
    closeBtn().addEventListener("click", () => {
      nameChangeQueue.shift();
      renderNameChangeModal();
    });
  }

  // --------------------------------------------------------------------
  // Re-check logic
  // --------------------------------------------------------------------

  async function runWithConcurrency(items, limit, worker) {
    const queue = [...items];
    const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        await wait(100 + Math.random() * 200); // jitter to smooth bursts
        await worker(item);
      }
    });
    await Promise.all(runners);
  }

  function applyCachedState(platform, list) {
    let changed = false;
    list.forEach(entry => {
      const cached = getCachedBan(platform, entry.player);
      if (!cached) return;
      entry.accountId = cached.accountId || entry.accountId;
      entry.clan = cached.clan || entry.clan;
      entry.statusLabel = cached.statusText || entry.statusLabel;
      entry.lastChecked = entry.lastChecked || Date.now();
      changed = true;
    });
    if (changed) renderWatchlist(list);
  }

  async function recheckSingle(playerName) {
    const platform = getPlatform();
    const list = getWatchlist(platform);

    const match = list.find(e => e.player.toLowerCase() === playerName.toLowerCase());
    if (!match) return;

    // Apply any cached status instantly for responsiveness
    const cached = getCachedBan(platform, playerName);
    if (cached) {
      match.accountId = cached.accountId || match.accountId;
      match.clan = cached.clan || match.clan;
      match.statusLabel = cached.statusText || match.statusLabel;
      match.lastChecked = match.lastChecked || Date.now();
      renderWatchlist(list);
    }

    try {
      await syncEntryNameFromAccount(match, platform);
      const lookupName = match.player;
      const resp = await fetch(
        `${BASE_URL}/check-ban-clan?platform=${encodeURIComponent(platform)}&player=${encodeURIComponent(lookupName)}`
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

      setCachedBan(platform, match.player, {
        accountId: match.accountId,
        clan: match.clan,
        statusText: match.statusLabel
      });

      saveWatchlist(platform, list);
      renderWatchlist(list);

    } catch (err) {
      console.error("Recheck error", err);
    }
  }

  async function recheckAll() {
    const platform = getPlatform();
    const list = getWatchlist(platform);
    if (!list.length) return;

    applyCachedState(platform, list);

    const container = document.querySelector(".wl-list-card");
    if (container) {
      container.classList.add("wl-container-scan");
      setTimeout(() => container.classList.remove("wl-container-scan"), 450);
    }

    const refreshAllBtn = document.getElementById("refreshAllBtn");
    if (refreshAllBtn) {
      refreshAllBtn.disabled = true;
      refreshAllBtn.classList.add("fade-out");
      refreshAllBtn.textContent = "Refreshing...";
    }

    await runWithConcurrency(list, 2, async entry => {
      try {
        await syncEntryNameFromAccount(entry, platform);
        const lookupName = entry.player;
        const resp = await fetch(
          `${BASE_URL}/check-ban-clan?platform=${encodeURIComponent(platform)}&player=${encodeURIComponent(lookupName)}`
        );
        const data = await resp.json();
        if (!resp.ok || !Array.isArray(data.results) || !data.results.length) {
          return;
        }

        const match =
          data.results.find(r => (r.player || r.name || "").toLowerCase() === entry.player.toLowerCase()) ||
          data.results[0];

        const oldName = entry.player;
        const newName = match.player || match.name || oldName;

        if (newName !== oldName) {
          entry.history = entry.history || [];
          if (!entry.history.includes(oldName)) {
            entry.history.push(oldName);
          }
          entry.player = newName;
          showNameChangeModal(oldName, newName);
        }

        entry.accountId = match.accountId || match.id || entry.accountId;
        entry.clan = match.clan || match.clanName || entry.clan;
        entry.statusLabel = match.banStatus || match.status || match.statusText || entry.statusLabel;
        entry.lastChecked = Date.now();

        setCachedBan(platform, entry.player, {
          accountId: entry.accountId,
          clan: entry.clan,
          statusText: entry.statusLabel
        });
      } catch (err) {
        console.error("Recheck-all error", err);
      }

      await wait(REFRESH_BATCH_DELAY);
    });

    saveWatchlist(platform, list);
    renderWatchlist(list);

    if (refreshAllBtn) {
      refreshAllBtn.disabled = false;
      refreshAllBtn.classList.remove("fade-out");
      refreshAllBtn.textContent = "Refresh All";
    }
  }

  // --------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", () => {

    clearLegacyDarkMode();

    applyPlatformToButtons(
      "platformRowWatchlist",
      "activePlatformLabelWatchlist"
    );

    const refreshAllBtn = document.getElementById("refreshAllBtn");
    if (refreshAllBtn) {
      refreshAllBtn.addEventListener("click", () => {
        recheckAll();
      });
    }

    const clearBtn = document.getElementById("clearWatchlistBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        const p = getPlatform();
        saveWatchlist(p, []);
        renderWatchlist();
      });
    }

    renderWatchlist();
  });

})();


