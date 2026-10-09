/* -------------------------------------------------------
   PUBG Ban Checker - Watchlist (Final Theme Build)
   Includes:
   - Discord watchlist saving
   - Name-change modal
   - Clean list updates (no flashing)
   - One account check at a time
------------------------------------------------------- */

(() => {

  // Route all API calls through a same-origin proxy (e.g., /api -> Render backend)
  const BASE_URL = "/api";

  const LS_PLATFORM = "selectedPlatform";
  const BAN_CACHE_TTL_MS = 5 * 60 * 1000;
  let checkInProgress = false;
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

  function getWatchlist(platform) {
    if (window.PBCWatchlistStore) {
      return window.PBCWatchlistStore.get(platform);
    }

    // Defensive fallback for an old cached HTML document that has not yet
    // loaded the shared store script.
    try {
      const raw = localStorage.getItem(`watchlist_${platform}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveWatchlist(platform, arr) {
    if (window.PBCWatchlistStore) {
      return window.PBCWatchlistStore.save(platform, arr || []);
    }
    try {
      localStorage.setItem(`watchlist_${platform}`, JSON.stringify(arr || []));
    } catch {}
    return arr || [];
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

  function isNotBanned(statusText) {
    return (statusText || "").toLowerCase().trim() === "not banned";
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

  function invalidateCachedBan(platform, playerName) {
    try {
      sessionStorage.removeItem(makeCacheKey(platform, playerName));
    } catch {}
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

    const currentName = entry.player || "";
    const currentLower = currentName.toLowerCase();
    if (latest.toLowerCase() === currentLower) {
      return false;
    }

    const oldName = entry.player;
    entry.history = entry.history || [];
    if (!entry.history.some(h => h.toLowerCase() === currentLower)) {
      entry.history.push(oldName);
    }
    invalidateCachedBan(platform, oldName);
    entry.player = latest;
    showNameChangeModal(oldName, latest);
    return true;
  }

  async function fetchBanData(platform, lookupName) {
    const resp = await fetch(
      `${BASE_URL}/check-ban-clan?platform=${encodeURIComponent(platform)}&player=${encodeURIComponent(lookupName)}`
    );

    let data = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }
    return { resp, data };
  }

  async function updateEntryFromBan(entry, platform, hasRetried = false) {
    if (!entry) return false;
    await syncEntryNameFromAccount(entry, platform);

    const lookupName = entry.player;
    const firstAttempt = await fetchBanData(platform, lookupName);
    let { resp, data } = firstAttempt;

    const hasResults = data && Array.isArray(data.results) && data.results.length;
    if (!resp.ok || !hasResults) {
      if (entry.accountId && !hasRetried) {
        const renamed = await syncEntryNameFromAccount(entry, platform);
        if (renamed) {
          return updateEntryFromBan(entry, platform, true);
        }
      }
      const message = data?.error || data?.message || `Watchlist check failed (${resp.status || "no response"})`;
      throw new Error(message);
    }

    const normalized = lookupName.toLowerCase();
    let match =
      data.results.find(r => (r.player || r.name || "").toLowerCase() === normalized) || data.results[0];

    let banStatusText = (match?.banStatus || match?.status || match?.statusText || "").toLowerCase();

    // Confirm "Not banned" with a second quick lookup to avoid stale OKs
    if (isNotBanned(banStatusText)) {
      await wait(700);
      const second = await fetchBanData(platform, lookupName);
      const secondHasResults = second.data && Array.isArray(second.data.results) && second.data.results.length;
      if (secondHasResults) {
        const secondMatch =
          second.data.results.find(r => (r.player || r.name || "").toLowerCase() === normalized) ||
          second.data.results[0];
        const secondStatus = (secondMatch?.banStatus || secondMatch?.status || secondMatch?.statusText || "").toLowerCase();
        if (!isNotBanned(secondStatus)) {
          match = secondMatch;
          banStatusText = secondStatus;
          data = second.data;
        }
      }
    }

    if (!hasRetried && entry.accountId && banStatusText.includes("not found")) {
      const renamed = await syncEntryNameFromAccount(entry, platform);
      if (renamed) {
        return updateEntryFromBan(entry, platform, true);
      }
    }

    const oldName = entry.player;
    const newName = match.player || match.name || oldName;
    if (newName && newName !== oldName) {
      entry.history = entry.history || [];
      const lowerOld = oldName.toLowerCase();
      if (!entry.history.some(h => h.toLowerCase() === lowerOld)) {
        entry.history.push(oldName);
      }
      invalidateCachedBan(platform, oldName);
      entry.player = newName;
      showNameChangeModal(oldName, newName);
    }

    entry.accountId = match.accountId || match.id || entry.accountId;
    entry.clan = match.clan || match.clanName || entry.clan;
    entry.lastChecked = Date.now();
    entry.statusLabel = match.banStatus || match.status || match.statusText || entry.statusLabel;

    setCachedBan(platform, entry.player, {
      accountId: entry.accountId,
      clan: entry.clan,
      statusText: entry.statusLabel
    });

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
    row.className = `watchlist-player wl-player-status-${statusInfo.code}`;
    row.dataset.slot = String(index + 1).padStart(2, "0");

    // NAME LINE
    const nameLine = document.createElement("div");
    nameLine.className = "wl-name-line";

    const playerStrong = document.createElement("strong");
    playerStrong.textContent = entry.player;
    nameLine.appendChild(playerStrong);

    const badge = document.createElement("span");
    badge.className = "wl-platform-badge";
    badge.textContent = (entry.platform || getPlatform()).toUpperCase();
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
      <span class="wl-meta-item"><small>Clan</small><strong>${escapeHtml(entry.clan || "none")}</strong></span>
      <span class="wl-meta-item wl-meta-account" title="${escapeHtml(entry.accountId || "unknown")}"><small>Account ID</small><strong>${escapeHtml(entry.accountId || "unknown")}</strong></span>
      <span class="wl-meta-item"><small>Status</small><strong>${escapeHtml(statusInfo.text)}</strong></span>
      <span class="wl-meta-item"><small>Last checked</small><strong>${escapeHtml(formatDateTime(entry.lastChecked))}</strong></span>
    `;

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
    left.className = "wl-player-content";
    left.appendChild(nameLine);
    left.appendChild(meta);
    row.appendChild(left);
    row.appendChild(btns);

    return row;
  }

  // --------------------------------------------------------------------
  // Watchlist Rendering
  // --------------------------------------------------------------------

  function renderWatchlist(baseList, options = {}) {
    const container = document.getElementById("watchlistContainer");
    if (!container) return;

    container.innerHTML = "";

    const source = baseList || getWatchlist(getPlatform());
    const list = source.map((entry, originalIndex) => ({ entry, originalIndex }));
    if (!list.length) {
      container.innerHTML = `<p class="wl-empty">No players in your watchlist yet.</p>`;
      return;
    }

    list.forEach(({ entry, originalIndex }) => {
      const row = buildWatchlistRow(entry, originalIndex);
      if (options.animate === false) row.classList.add("wl-row-static");
      row.querySelectorAll(".wl-btn").forEach(button => { button.disabled = checkInProgress; });
      container.appendChild(row);
    });
  }

  function setRefreshControlsLocked(locked) {
    document.querySelectorAll(
      "#platformRowWatchlist .platform-btn, #watchlistContainer .wl-btn"
    ).forEach(button => {
      button.disabled = locked;
    });
  }

  function markRowChecking(row) {
    if (!row) return;
    row.classList.add("wl-row-checking");
    row.setAttribute("aria-busy", "true");

    const existing = row.querySelector(".wl-refresh-progress");
    const progress = existing || document.createElement("span");
    progress.className = "wl-refresh-progress";
    progress.setAttribute("role", "status");
    progress.textContent = "Checking account…";
    if (!existing) row.appendChild(progress);
  }

  function replaceRefreshedRow(row, entry, index) {
    if (!row) return;
    const refreshed = buildWatchlistRow(entry, index);
    refreshed.classList.add("wl-row-static");
    refreshed.setAttribute("aria-busy", "false");
    row.replaceWith(refreshed);
    if (checkInProgress) {
      refreshed.querySelectorAll(".wl-btn").forEach(button => {
        button.disabled = true;
      });
    }
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

  async function recheckSingle(playerName) {
    if (checkInProgress) return;
    const platform = getPlatform();
    const list = getWatchlist(platform);
    const index = list.findIndex(entry => entry.player.toLowerCase() === playerName.toLowerCase());
    const entry = list[index];
    if (!entry) return;
    checkInProgress = true;
    setRefreshControlsLocked(true);
    const container = document.getElementById("watchlistContainer");
    const row = Array.from(container?.children || []).find(item =>
      item.querySelector(".wl-name-line strong")?.textContent?.toLowerCase() === playerName.toLowerCase()
    );
    markRowChecking(row);
    const status = document.getElementById("watchlistCheckStatus");
    status.textContent = `Checking ${entry.player}…`;
    try {
      const updated = await updateEntryFromBan(entry, platform);
      if (!updated) throw new Error("Account check failed");
      const current = getWatchlist(platform);
      const currentIndex = current.findIndex(item => entry.id ? item.id === entry.id : item.player.toLowerCase() === playerName.toLowerCase());
      if (currentIndex >= 0) {
        current[currentIndex] = entry;
        saveWatchlist(platform, current);
      }
      status.textContent = `Checked ${entry.player}: ${mapStatusToInfo(entry.statusLabel).text}.`;
    } catch (error) {
      status.textContent = `Could not check ${entry.player}. Please try again.`;
    } finally {
      checkInProgress = false;
      replaceRefreshedRow(row, entry, index);
      setRefreshControlsLocked(false);
    }
  }
  // --------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------

  window.addEventListener("pbc:watchlist-change", event => {
    const detail = event.detail || {};
    if (detail.source === "local") return;
    if (detail.platform && detail.platform !== getPlatform()) return;
    renderWatchlist(undefined, { animate: false });
  });

  document.addEventListener("DOMContentLoaded", () => {

    clearLegacyDarkMode();

    applyPlatformToButtons(
      "platformRowWatchlist",
      "activePlatformLabelWatchlist"
    );

    renderWatchlist();


    // The local guest list can render immediately. Once optional account
    // detection and cloud hydration finish, render the active user's cache.
    window.PBCWatchlistStore?.ready.then(() => renderWatchlist());
  });

})();
