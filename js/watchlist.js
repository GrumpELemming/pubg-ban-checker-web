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
  const REFRESH_BATCH_DELAY = 800;
  const BAN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const TEMP_CLEAR_CONFIRMATION_MS = 60 * 60 * 1000;
  const PERMANENT_REVERSAL_CONFIRMATION_MS = 24 * 60 * 60 * 1000;
  const STALE_AFTER_MS = 48 * 60 * 60 * 1000;
  const DISPLAY_PREFS_KEY = "pbcWatchlistDisplay";
  let refreshAllInProgress = false;
  let sweepPaused = false;
  let sweepStopped = false;
  let retryFailedOnly = false;

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

  function isStale(entry) {
    return !entry.lastChecked || Date.now() - Number(entry.lastChecked) >= STALE_AFTER_MS;
  }

  function displayPreferences() {
    try { return JSON.parse(localStorage.getItem(DISPLAY_PREFS_KEY)) || {}; } catch { return {}; }
  }

  function saveDisplayPreferences() {
    const filter = document.getElementById("watchlistFilter")?.value || "all";
    const sort = document.getElementById("watchlistSort")?.value || "default";
    try { localStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify({ filter, sort })); } catch {}
  }

  function isSignedIn() {
    return Boolean(window.PBCWatchlistStore?.getSession?.().authenticated);
  }

  function observationStatus(statusText) {
    const value = String(statusText || "").toLowerCase();
    if (value.includes("permanent")) return "permanent";
    if (value.includes("temporary")) return "temporary";
    if (value.includes("not banned") || value === "innocent") return "innocent";
    return "unknown";
  }

  function observationLabel(status) {
    const value = String(status || "").toLowerCase();
    if (value === "permanent") return "Permanent ban observed";
    if (value === "temporary") return "Temporary ban observed";
    if (value === "innocent") return "Appears clear";
    return "Unknown response observed";
  }

  function statusLabelFromObservation(status) {
    if (status === "permanent") return "Permanently banned";
    if (status === "temporary") return "Temporarily banned";
    if (status === "innocent") return "Not banned";
    return "Unknown";
  }

  function recordSignedInObservation(entry, rawStatus, observedAt = Date.now()) {
    if (!isSignedIn()) return false;
    const status = observationStatus(rawStatus);
    if (status === "unknown") return false;

    entry.observations = Array.isArray(entry.observations) ? entry.observations : [];
    const hadObservations = entry.observations.length > 0;
    entry.observations.push({ status, observedAt });
    entry.observations = entry.observations.slice(-100);
    entry.checkCount = Math.max(0, Number(entry.checkCount) || 0) + 1;
    entry.firstWatchedAt = Number(entry.firstWatchedAt) || Number(entry.createdAt) || observedAt;

    const previous = entry.effectiveStatus || observationStatus(entry.statusLabel);
    entry.verificationState = "";

    if (status === "permanent") {
      if (previous !== "permanent") entry.lastStatusChangeAt = observedAt;
      entry.effectiveStatus = "permanent";
      entry.firstPermanentObservedAt = Number(entry.firstPermanentObservedAt) || observedAt;
      entry.consecutiveClearCount = 0;
      entry.clearCandidateSince = 0;
    } else if (status === "temporary") {
      if (previous !== "temporary" || (!hadObservations && !Number(entry.tempBanCount))) {
        entry.tempBanCount = Math.max(0, Number(entry.tempBanCount) || 0) + 1;
        entry.lastStatusChangeAt = observedAt;
      }
      entry.effectiveStatus = "temporary";
      entry.consecutiveClearCount = 0;
      entry.clearCandidateSince = 0;
    } else if (previous === "permanent" || previous === "temporary") {
      entry.consecutiveClearCount = Math.max(0, Number(entry.consecutiveClearCount) || 0) + 1;
      entry.clearCandidateSince = Number(entry.clearCandidateSince) || observedAt;
      const requiredCount = previous === "permanent" ? 3 : 2;
      const requiredTime = previous === "permanent"
        ? PERMANENT_REVERSAL_CONFIRMATION_MS
        : TEMP_CLEAR_CONFIRMATION_MS;
      if (entry.consecutiveClearCount >= requiredCount && observedAt - entry.clearCandidateSince >= requiredTime) {
        entry.effectiveStatus = "innocent";
        entry.lastStatusChangeAt = observedAt;
        entry.verificationState = previous === "permanent" ? "apparently-overturned" : "cleared";
        entry.consecutiveClearCount = 0;
        entry.clearCandidateSince = 0;
      } else {
        entry.effectiveStatus = previous;
        entry.verificationState = "possible-reversal";
      }
    } else {
      entry.effectiveStatus = "innocent";
      entry.consecutiveClearCount = 0;
      entry.clearCandidateSince = 0;
    }

    entry.statusLabel = statusLabelFromObservation(entry.effectiveStatus);
    return true;
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
    const observedStatus = match.banStatus || match.status || match.statusText || entry.statusLabel;
    if (!recordSignedInObservation(entry, observedStatus, entry.lastChecked)) {
      entry.statusLabel = observedStatus;
    }

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
      <span class="wl-meta-item"><small>Current signal</small><strong>${escapeHtml(statusInfo.text)}</strong></span>
      <span class="wl-meta-item"><small>Last scan</small><strong>${escapeHtml(formatDateTime(entry.lastChecked))}</strong></span>
    `;
    if (isStale(entry)) {
      const stale = document.createElement("span");
      stale.className = "wl-stale-badge";
      stale.textContent = "STALE";
      stale.title = "This status has not been checked in at least 48 hours";
      meta.lastElementChild?.appendChild(stale);
    }

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

    // NOTES section
    const notesEl = document.createElement("div");
    notesEl.className = "wl-notes";

    function renderNoteView() {
      notesEl.innerHTML = "";
      if (entry.notes) {
        const noteText = document.createElement("span");
        noteText.className = "wl-note-text";
        noteText.textContent = entry.notes;
        const editBtn = document.createElement("button");
        editBtn.className = "wl-btn wl-btn-mini wl-btn-ghost wl-note-edit-btn";
        editBtn.textContent = "Edit note";
        editBtn.addEventListener("click", renderNoteEditor);
        notesEl.appendChild(noteText);
        notesEl.appendChild(editBtn);
      } else {
        const addBtn = document.createElement("button");
        addBtn.className = "wl-btn wl-btn-mini wl-btn-ghost wl-note-add-btn";
        addBtn.textContent = "+ Add note";
        addBtn.addEventListener("click", renderNoteEditor);
        notesEl.appendChild(addBtn);
      }
    }

    function renderNoteEditor() {
      notesEl.innerHTML = "";
      const textarea = document.createElement("textarea");
      textarea.className = "wl-note-input";
      textarea.placeholder = "Why are you watching this player?";
      textarea.maxLength = 4000;
      textarea.value = entry.notes || "";
      const saveBtn = document.createElement("button");
      saveBtn.className = "wl-btn wl-btn-mini wl-btn-primary";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => {
        const val = textarea.value.trim();
        entry.notes = val || "";
        const platform = getPlatform();
        const list = getWatchlist(platform);
        const current = list.find(item => item.id && item.id === entry.id) || list[index];
        if (current) current.notes = entry.notes;
        saveWatchlist(platform, list);
        renderNoteView();
      });
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "wl-btn wl-btn-mini wl-btn-ghost";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", renderNoteView);
      notesEl.appendChild(textarea);
      notesEl.appendChild(saveBtn);
      notesEl.appendChild(cancelBtn);
      textarea.focus();
    }

    renderNoteView();

    // Buttons
    const btns = document.createElement("div");
    btns.className = "wl-card-buttons";

    const reBtn = document.createElement("button");
    reBtn.className = "wl-btn wl-btn-mini wl-btn-primary";
    reBtn.textContent = "Re-check";
    reBtn.addEventListener("click", () => recheckSingle(entry.player));

    if (statusInfo.code === "perm") {
      const cardBtn = document.createElement("button");
      cardBtn.type = "button";
      cardBtn.className = "wl-btn wl-btn-mini wl-ban-card-btn";
      cardBtn.textContent = "Generate Ban Card";
      cardBtn.addEventListener("click", () => {
        window.BanCard?.open({
          player: entry.player,
          accountId: entry.accountId,
          platform: entry.platform || getPlatform(),
          trigger: cardBtn,
        });
      });
      btns.appendChild(cardBtn);
    }

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
    if (historyEl) left.appendChild(historyEl);
    if (isSignedIn() && Number(entry.checkCount) > 0) {
      const observed = document.createElement("details");
      observed.className = "wl-observed-history";
      const summary = document.createElement("summary");
      const temporaryCount = Math.max(0, Number(entry.tempBanCount) || 0);
      summary.textContent = `${entry.checkCount} checks · ${temporaryCount} temporary ban${temporaryCount === 1 ? "" : "s"} observed`;
      observed.appendChild(summary);

      const copy = document.createElement("p");
      const watchedAt = entry.firstWatchedAt || entry.createdAt;
      copy.textContent = `Observed since ${formatDateTime(watchedAt)}. ` +
        (entry.verificationState === "possible-reversal"
          ? "PUBG has returned conflicting results; the previous confirmed status is retained while verification continues."
          : entry.firstPermanentObservedAt && entry.effectiveStatus === "innocent"
            ? "Later checks indicate that a previously observed permanent ban may have been overturned."
            : "This is this watchlist's observed history, not the player's complete PUBG ban record.");
      observed.appendChild(copy);

      const observations = Array.isArray(entry.observations)
        ? [...entry.observations].sort((a, b) => Number(b.observedAt) - Number(a.observedAt))
        : [];
      const buildTimeline = items => {
        const timeline = document.createElement("ol");
        timeline.className = "wl-observation-timeline";
        items.forEach(item => {
          const event = document.createElement("li");
          const label = document.createElement("span");
          label.textContent = observationLabel(item.status);
          const time = document.createElement("time");
          time.dateTime = new Date(item.observedAt).toISOString();
          time.textContent = formatDateTime(item.observedAt);
          event.append(label, time);
          timeline.appendChild(event);
        });
        return timeline;
      };
      if (observations.length) observed.appendChild(buildTimeline(observations.slice(0, 5)));
      if (observations.length > 5) {
        const fullHistory = document.createElement("details");
        const fullSummary = document.createElement("summary");
        fullSummary.textContent = `Show ${observations.length - 5} earlier observations`;
        fullHistory.append(fullSummary, buildTimeline(observations.slice(5)));
        observed.appendChild(fullHistory);
      }
      left.appendChild(observed);
    }
    left.appendChild(notesEl);

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
    const filter = document.getElementById("watchlistFilter")?.value || "all";
    const sort = document.getElementById("watchlistSort")?.value || "default";
    let list = source.map((entry, originalIndex) => ({ entry, originalIndex }));
    list = list.filter(({ entry }) => {
      const status = mapStatusToInfo(entry.statusLabel).code;
      if (filter === "banned") return status === "perm" || status === "temp";
      if (filter === "temporary") return Number(entry.tempBanCount) > 0;
      if (filter === "stale") return isStale(entry);
      if (filter === "never") return !Number(entry.lastChecked);
      if (filter === "failed") return Boolean(entry.lastCheckFailed);
      return true;
    });
    if (sort === "name") list.sort((a, b) => a.entry.player.localeCompare(b.entry.player));
    if (sort === "recent") list.sort((a, b) => Number(b.entry.lastChecked || 0) - Number(a.entry.lastChecked || 0));
    if (sort === "changed") list.sort((a, b) => Number(b.entry.lastStatusChangeAt || 0) - Number(a.entry.lastStatusChangeAt || 0));
    if (sort === "oldest") list.sort((a, b) => Number(a.entry.lastChecked || 0) - Number(b.entry.lastChecked || 0));
    if (sort === "temporary") list.sort((a, b) => Number(b.entry.tempBanCount || 0) - Number(a.entry.tempBanCount || 0));
    if (!list.length) {
      container.innerHTML = `<p class="wl-empty">No players match this view.</p>`;
      return;
    }

    list.forEach(({ entry, originalIndex }) => {
      const row = buildWatchlistRow(entry, originalIndex);
      if (options.animate === false) row.classList.add("wl-row-static");
      container.appendChild(row);
    });
  }

  function setRefreshControlsLocked(locked) {
    document.querySelectorAll(
      "#refreshAllBtn, #clearWatchlistBtn, #platformRowWatchlist .platform-btn, #watchlistContainer .wl-btn"
    ).forEach(button => {
      button.disabled = locked;
    });
  }

  function markRowChecking(row, position, total) {
    if (!row) return;
    row.classList.add("wl-row-checking");
    row.setAttribute("aria-busy", "true");

    const existing = row.querySelector(".wl-refresh-progress");
    const progress = existing || document.createElement("span");
    progress.className = "wl-refresh-progress";
    progress.setAttribute("role", "status");
    progress.textContent = `Scanning ${position} of ${total}`;
    if (!existing) row.appendChild(progress);
  }

  function replaceRefreshedRow(row, entry, index) {
    if (!row) return;
    const refreshed = buildWatchlistRow(entry, index);
    refreshed.classList.add("wl-row-static");
    refreshed.setAttribute("aria-busy", "false");
    row.replaceWith(refreshed);
    if (refreshAllInProgress) {
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
    const platform = getPlatform();
    const list = getWatchlist(platform);

    const index = list.findIndex(e => e.player.toLowerCase() === playerName.toLowerCase());
    const match = list[index];
    if (!match) return;

    const container = document.getElementById("watchlistContainer");
    const row = Array.from(container?.children || []).find(item =>
      item.querySelector(".wl-name-line strong")?.textContent?.toLowerCase() === playerName.toLowerCase()
    );
    if (row?.getAttribute("aria-busy") === "true") return;
    markRowChecking(row, 1, 1);
    row?.querySelectorAll(".wl-btn").forEach(button => {
      button.disabled = true;
    });

    // Guests may use cached data while the fresh request is running, but the
    // selected row is replaced only once when the check finishes.
    const cached = getCachedBan(platform, playerName);
    if (cached && !isSignedIn()) {
      match.accountId = cached.accountId || match.accountId;
      match.clan = cached.clan || match.clan;
      match.statusLabel = cached.statusText || match.statusLabel;
      match.lastChecked = match.lastChecked || Date.now();
    }

    try {
      const updated = await updateEntryFromBan(match, platform);
      match.lastCheckFailed = false;
      if (updated) saveWatchlist(platform, list);
    } catch (err) {
      console.error("Recheck error", err);
      match.lastCheckFailed = true;
      saveWatchlist(platform, list);
      const summary = document.getElementById("sweepSummary");
      if (summary) {
        summary.hidden = false;
        summary.textContent = `Check failed for ${match.player}. The PUBG API may be unavailable, rate limited, offline, or timed out.`;
      }
    } finally {
      replaceRefreshedRow(row, match, index);
    }
  }

  async function recheckAll() {
    if (refreshAllInProgress) return;

    const platform = getPlatform();
    const list = getWatchlist(platform);
    const targets = retryFailedOnly ? list.filter(entry => entry.lastCheckFailed) : list;
    retryFailedOnly = false;
    if (!targets.length) return;

    const refreshAllBtn = document.getElementById("refreshAllBtn");
    const container = document.getElementById("watchlistContainer");
    refreshAllInProgress = true;
    sweepPaused = false;
    sweepStopped = false;
    const pauseBtn = document.getElementById("pauseSweepBtn");
    const stopBtn = document.getElementById("stopSweepBtn");
    const summary = document.getElementById("sweepSummary");
    const retryBtn = document.getElementById("retryFailedBtn");
    if (pauseBtn) { pauseBtn.hidden = false; pauseBtn.textContent = "Pause"; }
    if (stopBtn) stopBtn.hidden = false;
    if (summary) summary.hidden = true;
    if (retryBtn) retryBtn.hidden = true;
    const totals = { checked: 0, changed: 0, renamed: 0, failed: 0 };
    setRefreshControlsLocked(true);
    container?.setAttribute("aria-busy", "true");

    try {
      for (let index = 0; index < targets.length; index += 1) {
        while (sweepPaused && !sweepStopped) await wait(200);
        if (sweepStopped) break;
        const entry = targets[index];
        const originalName = entry.player;
        const originalStatus = entry.statusLabel;
        const row = Array.from(container?.children || []).find(item => item.querySelector(".wl-name-line strong")?.textContent === originalName);
        markRowChecking(row, index + 1, targets.length);
        if (refreshAllBtn) {
          refreshAllBtn.textContent = `Checking ${index + 1} / ${targets.length}`;
        }

        let updated = false;
        try {
          updated = await updateEntryFromBan(entry, platform);
          entry.lastCheckFailed = false;
          totals.checked += 1;
          if (entry.player !== originalName) totals.renamed += 1;
          if (entry.statusLabel !== originalStatus) totals.changed += 1;
        } catch (err) {
          console.error("Recheck-all error", err);
          entry.lastCheckFailed = true;
          totals.failed += 1;
        }

        if (updated) saveWatchlist(platform, list);
        replaceRefreshedRow(row, entry, list.indexOf(entry));

        if (index < targets.length - 1 && !sweepStopped) await wait(REFRESH_BATCH_DELAY);
      }

      saveWatchlist(platform, list);
    } finally {
      refreshAllInProgress = false;
      sweepPaused = false;
      container?.setAttribute("aria-busy", "false");
      setRefreshControlsLocked(false);
      if (refreshAllBtn) refreshAllBtn.textContent = "Refresh All";
      if (pauseBtn) pauseBtn.hidden = true;
      if (stopBtn) stopBtn.hidden = true;
      if (summary) {
        summary.hidden = false;
        summary.textContent = `${sweepStopped ? "Sweep stopped" : "Sweep complete"}: ${totals.checked} checked · ${totals.changed} status change${totals.changed === 1 ? "" : "s"} · ${totals.renamed} renamed · ${totals.failed} failed`;
      }
      if (retryBtn) retryBtn.hidden = totals.failed === 0;
      renderWatchlist(undefined, { animate: false });
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

  function updateObservationNotice() {
    const notice = document.getElementById("watchlistObservationNotice");
    if (notice) notice.hidden = !isSignedIn();
  }

  window.addEventListener("pbc:watchlist-session", () => {
    updateObservationNotice();
    renderWatchlist();
  });

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

    const pauseBtn = document.getElementById("pauseSweepBtn");
    pauseBtn?.addEventListener("click", () => {
      sweepPaused = !sweepPaused;
      pauseBtn.textContent = sweepPaused ? "Resume" : "Pause";
    });
    document.getElementById("stopSweepBtn")?.addEventListener("click", () => { sweepStopped = true; });
    document.getElementById("retryFailedBtn")?.addEventListener("click", () => {
      retryFailedOnly = true;
      recheckAll();
    });

    const preferences = displayPreferences();
    const filterSelect = document.getElementById("watchlistFilter");
    const sortSelect = document.getElementById("watchlistSort");
    if (filterSelect && preferences.filter) filterSelect.value = preferences.filter;
    if (sortSelect && preferences.sort) sortSelect.value = preferences.sort;
    [filterSelect, sortSelect].forEach(select => select?.addEventListener("change", () => {
      saveDisplayPreferences();
      renderWatchlist(undefined, { animate: false });
    }));

    const clearBtn = document.getElementById("clearWatchlistBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        const p = getPlatform();
        saveWatchlist(p, []);
        renderWatchlist();
      });
    }

    renderWatchlist();
    updateObservationNotice();

    // The local guest list can render immediately. Once optional account
    // detection and cloud hydration finish, render the active user's cache.
    window.PBCWatchlistStore?.ready.then(() => renderWatchlist());
  });

})();
