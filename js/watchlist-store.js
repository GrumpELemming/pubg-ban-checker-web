/* -------------------------------------------------------
   PUBG Ban Checker - local-first Watchlist store

   Guest lists continue to use watchlist_<platform>. When a
   server session is available, lists are cached per user and
   synchronised through the same-origin /api endpoints.
------------------------------------------------------- */

(() => {
  "use strict";

  const PLATFORMS = Object.freeze(["steam", "xbox", "psn", "kakao"]);
  const GUEST_PREFIX = "watchlist_";
  const USER_PREFIX = "pbc_watchlist:";
  const REVISION_PREFIX = "pbc_watchlist_revision:";
  const PENDING_PREFIX = "pbc_watchlist_pending:";
  const TOMBSTONE_PREFIX = "pbc_watchlist_tombstones:";
  const IMPORT_PREFIX = "pbc_watchlist_imported:";
  const SCHEMA_VERSION = 1;
  const REQUEST_TIMEOUT_MS = 10000;

  let session = {
    available: false,
    authenticated: false,
    user: null,
    csrfToken: ""
  };

  const syncQueues = new Map();
  const generations = new Map();
  const importPending = new Set();
  const preAuthMutations = new Map();
  let initializing = true;

  function isPlatform(platform) {
    return PLATFORMS.includes(platform);
  }

  function safeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function safeRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {}
  }

  function readJson(key, fallback) {
    const raw = safeGet(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function dispatch(name, detail) {
    if (typeof window.dispatchEvent !== "function") return;
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch {}
  }

  function sessionSnapshot() {
    return {
      available: Boolean(session.available),
      authenticated: Boolean(session.authenticated),
      user: session.user ? { ...session.user } : null,
      csrfToken: session.csrfToken || ""
    };
  }

  function emitSession() {
    dispatch("pbc:watchlist-session", sessionSnapshot());
  }

  function emitChange(platform, source) {
    dispatch("pbc:watchlist-change", { platform: platform || null, source });
  }

  function emitSync(platform, status, extra = {}) {
    dispatch("pbc:watchlist-sync", { platform, status, ...extra });
  }

  function userKeyPart(userId = session.user?.id) {
    return encodeURIComponent(String(userId || ""));
  }

  function scopedKey(prefix, platform, userId = session.user?.id) {
    return `${prefix}${userKeyPart(userId)}:${platform}`;
  }

  function guestKey(platform) {
    return `${GUEST_PREFIX}${platform}`;
  }

  function userListKey(platform, userId) {
    return scopedKey(USER_PREFIX, platform, userId);
  }

  function revisionKey(platform, userId) {
    return scopedKey(REVISION_PREFIX, platform, userId);
  }

  function pendingKey(platform, userId) {
    return scopedKey(PENDING_PREFIX, platform, userId);
  }

  function tombstoneKey(platform, userId) {
    return scopedKey(TOMBSTONE_PREFIX, platform, userId);
  }

  function importKey(platform, userId) {
    return scopedKey(IMPORT_PREFIX, platform, userId);
  }

  function makeId() {
    try {
      if (typeof window.crypto?.randomUUID === "function") {
        return `wl_${window.crypto.randomUUID()}`;
      }
      if (typeof window.crypto?.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return `wl_${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")}`;
      }
    } catch {}
    return `wl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }

  function cleanString(value) {
    return typeof value === "string" ? value.trim() : String(value ?? "").trim();
  }

  function timestamp(value, fallback = 0) {
    if (value === null || value === undefined || value === "") return fallback;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeLastChecked(value) {
    if (value === null || value === undefined || value === "") return 0;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
    // The backend accepts short legacy display timestamps as well as the
    // current millisecond value. Keep an unparseable legacy value intact.
    return typeof value === "string" ? value.trim() : 0;
  }

  function normalizeHistory(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const history = [];
    value.forEach(item => {
      const name = cleanString(item);
      const identity = name.toLowerCase();
      if (!name || seen.has(identity)) return;
      seen.add(identity);
      history.push(name);
    });
    return history;
  }

  function normalizeEntry(raw, platform, now = Date.now()) {
    if (!raw || typeof raw !== "object") return null;
    const player = cleanString(raw.player || raw.name);
    if (!player) return null;

    const createdAt = timestamp(raw.createdAt, timestamp(raw.lastChecked, now));
    return {
      id: cleanString(raw.id).slice(0, 128) || makeId(),
      schemaVersion: SCHEMA_VERSION,
      player,
      accountId: cleanString(raw.accountId || raw.account_id),
      clan: cleanString(raw.clan || raw.clanName),
      platform,
      statusLabel: cleanString(raw.statusLabel || raw.statusText || raw.banStatus || raw.status),
      lastChecked: normalizeLastChecked(raw.lastChecked),
      history: normalizeHistory(raw.history),
      notes: cleanString(raw.notes),
      createdAt,
      updatedAt: timestamp(raw.updatedAt, timestamp(raw.lastChecked, createdAt))
    };
  }

  function normalizedName(entry) {
    return cleanString(entry?.player).toLowerCase();
  }

  function normalizedAccount(entry) {
    return cleanString(entry?.accountId).toLowerCase();
  }

  function entriesMatch(left, right) {
    if (!left || !right) return false;
    if (left.id && right.id && left.id === right.id) return true;

    const leftAccount = normalizedAccount(left);
    const rightAccount = normalizedAccount(right);
    if (leftAccount && rightAccount) return leftAccount === rightAccount;

    const leftName = normalizedName(left);
    const rightName = normalizedName(right);
    return Boolean(leftName && rightName && leftName === rightName);
  }

  function mergeHistory(left, right, currentPlayer) {
    const values = [
      ...(Array.isArray(left?.history) ? left.history : []),
      ...(Array.isArray(right?.history) ? right.history : [])
    ];
    if (left?.player && normalizedName(left) !== normalizedName({ player: currentPlayer })) {
      values.push(left.player);
    }
    if (right?.player && normalizedName(right) !== normalizedName({ player: currentPlayer })) {
      values.push(right.player);
    }
    return normalizeHistory(values).filter(
      name => name.toLowerCase() !== cleanString(currentPlayer).toLowerCase()
    );
  }

  function mergeNotes(left, right) {
    const first = cleanString(left);
    const second = cleanString(right);
    if (!first) return second;
    if (!second || first === second) return first;
    if (first.includes(second)) return first;
    if (second.includes(first)) return second;
    return `${first}\n\n${second}`;
  }

  function mergeEntry(left, right, platform) {
    const leftTime = Math.max(timestamp(left?.updatedAt), timestamp(left?.lastChecked));
    const rightTime = Math.max(timestamp(right?.updatedAt), timestamp(right?.lastChecked));
    const preferred = rightTime >= leftTime ? right : left;
    const other = preferred === right ? left : right;
    const currentPlayer = cleanString(preferred?.player || other?.player);

    return normalizeEntry(
      {
        id: left?.id || right?.id,
        player: currentPlayer,
        accountId: preferred?.accountId || other?.accountId,
        clan: preferred?.clan || other?.clan,
        statusLabel: preferred?.statusLabel || other?.statusLabel,
        lastChecked: Math.max(timestamp(left?.lastChecked), timestamp(right?.lastChecked)),
        history: mergeHistory(left, right, currentPlayer),
        notes: mergeNotes(left?.notes, right?.notes),
        createdAt: Math.min(
          timestamp(left?.createdAt, Number.MAX_SAFE_INTEGER),
          timestamp(right?.createdAt, Number.MAX_SAFE_INTEGER)
        ),
        updatedAt: Math.max(leftTime, rightTime)
      },
      platform
    );
  }

  function mergeEntries(...args) {
    let platform = "steam";
    if (typeof args[args.length - 1] === "string") platform = args.pop();
    const merged = [];

    args.forEach(entries => {
      if (!Array.isArray(entries)) return;
      entries.forEach(raw => {
        const entry = normalizeEntry(raw, platform);
        if (!entry) return;
        const index = merged.findIndex(existing => entriesMatch(existing, entry));
        if (index === -1) merged.push(entry);
        else merged[index] = mergeEntry(merged[index], entry, platform);
      });
    });

    return merged;
  }

  function normalizeEntries(entries, platform) {
    return mergeEntries(Array.isArray(entries) ? entries : [], platform);
  }

  function storedEntryShape(entry) {
    if (!entry || typeof entry !== "object") return entry;
    return {
      id: entry.id,
      schemaVersion: entry.schemaVersion,
      player: entry.player,
      accountId: entry.accountId,
      clan: entry.clan,
      platform: entry.platform,
      statusLabel: entry.statusLabel,
      lastChecked: entry.lastChecked,
      history: entry.history,
      notes: entry.notes,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    };
  }

  function storedEntriesEqual(rawEntries, normalizedEntries) {
    if (!Array.isArray(rawEntries) || rawEntries.length !== normalizedEntries.length) return false;
    return JSON.stringify(rawEntries.map(storedEntryShape)) === JSON.stringify(normalizedEntries);
  }

  function entryContent(entry) {
    return JSON.stringify({
      player: entry.player,
      accountId: entry.accountId,
      clan: entry.clan,
      platform: entry.platform,
      statusLabel: entry.statusLabel,
      lastChecked: entry.lastChecked,
      history: entry.history,
      notes: entry.notes
    });
  }

  function prepareSavedEntries(entries, previous, platform) {
    const now = Date.now();
    return normalizeEntries(entries, platform).map(entry => {
      const oldEntry = previous.find(candidate => entriesMatch(candidate, entry));
      if (!oldEntry) return { ...entry, createdAt: now, updatedAt: now };
      if (entryContent(oldEntry) === entryContent(entry)) {
        return {
          ...entry,
          id: oldEntry.id || entry.id,
          createdAt: oldEntry.createdAt,
          updatedAt: oldEntry.updatedAt
        };
      }
      return {
        ...entry,
        id: oldEntry.id || entry.id,
        createdAt: oldEntry.createdAt,
        updatedAt: now
      };
    });
  }

  function readList(key, platform) {
    const raw = readJson(key, []);
    const entries = normalizeEntries(raw, platform);
    if (!Array.isArray(raw) || JSON.stringify(raw) !== JSON.stringify(entries)) {
      safeSet(key, JSON.stringify(entries));
    }
    return entries;
  }

  function readGuest(platform) {
    return readList(guestKey(platform), platform);
  }

  function readUserList(platform, userId = session.user?.id) {
    if (!userId) return [];
    return readList(userListKey(platform, userId), platform);
  }

  function writeUserList(platform, entries, userId = session.user?.id) {
    if (!userId) return false;
    return safeSet(userListKey(platform, userId), JSON.stringify(entries));
  }

  function readRevision(platform, userId = session.user?.id) {
    const value = Number(safeGet(revisionKey(platform, userId)) || 0);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  function writeRevision(platform, revision, userId = session.user?.id) {
    const value = Number(revision);
    if (!Number.isSafeInteger(value) || value < 0 || !userId) return;
    safeSet(revisionKey(platform, userId), String(value));
  }

  function readTombstones(platform, userId = session.user?.id) {
    const raw = readJson(tombstoneKey(platform, userId), []);
    if (!Array.isArray(raw)) return [];
    return raw.filter(item => item && typeof item === "object").slice(-500);
  }

  function makeTombstone(entry) {
    return {
      id: cleanString(entry?.id),
      accountId: cleanString(entry?.accountId),
      player: cleanString(entry?.player),
      deletedAt: Date.now()
    };
  }

  function tombstoneMatches(tombstone, entry) {
    if (tombstone.id && entry.id && tombstone.id === entry.id) return true;
    const tombstoneAccount = normalizedAccount(tombstone);
    const entryAccount = normalizedAccount(entry);
    if (tombstoneAccount && entryAccount) return tombstoneAccount === entryAccount;
    return normalizedName(tombstone) === normalizedName(entry);
  }

  function applyTombstones(entries, tombstones) {
    if (!tombstones.length) return entries;
    return entries.filter(entry => !tombstones.some(item => tombstoneMatches(item, entry)));
  }

  function updateTombstones(platform, previous, next, userId) {
    let tombstones = readTombstones(platform, userId);
    previous.forEach(entry => {
      if (!next.some(candidate => entriesMatch(entry, candidate))) {
        const tombstone = makeTombstone(entry);
        if (!tombstones.some(item => tombstoneMatches(item, entry))) tombstones.push(tombstone);
      }
    });
    tombstones = tombstones.filter(
      item => !next.some(entry => tombstoneMatches(item, entry))
    ).slice(-500);
    safeSet(tombstoneKey(platform, userId), JSON.stringify(tombstones));
  }

  function isPending(platform, userId = session.user?.id) {
    return safeGet(pendingKey(platform, userId)) === "1";
  }

  function setPending(platform, pending, userId = session.user?.id) {
    if (!userId) return;
    if (pending) safeSet(pendingKey(platform, userId), "1");
    else safeRemove(pendingKey(platform, userId));
  }

  function generationKey(platform, userId = session.user?.id) {
    return `${userKeyPart(userId)}:${platform}`;
  }

  function generation(platform, userId = session.user?.id) {
    return generations.get(generationKey(platform, userId)) || 0;
  }

  function bumpGeneration(platform, userId = session.user?.id) {
    const key = generationKey(platform, userId);
    generations.set(key, (generations.get(key) || 0) + 1);
  }

  function get(platform) {
    if (!isPlatform(platform)) return [];
    if (session.authenticated && session.user?.id) return readUserList(platform);
    return readGuest(platform);
  }

  function save(platform, entries) {
    if (!isPlatform(platform)) return [];

    if (!session.authenticated || !session.user?.id) {
      const previous = readGuest(platform);
      const normalized = prepareSavedEntries(entries, previous, platform);
      safeSet(guestKey(platform), JSON.stringify(normalized));
      if (initializing) {
        const changedEntries = normalized.filter(entry => {
          const oldEntry = previous.find(candidate => entriesMatch(candidate, entry));
          return !oldEntry || entryContent(oldEntry) !== entryContent(entry);
        });
        const previousChanges = (preAuthMutations.get(platform) || []).filter(
          entry => normalized.some(candidate => entriesMatch(candidate, entry))
        );
        const unchangedPrevious = previousChanges.filter(
          entry => !changedEntries.some(candidate => entriesMatch(candidate, entry))
        );
        preAuthMutations.set(
          platform,
          [...unchangedPrevious, ...changedEntries]
        );
      }
      emitChange(platform, "local");
      return normalized;
    }

    const userId = session.user.id;
    const previous = readUserList(platform, userId);
    const normalized = prepareSavedEntries(entries, previous, platform);
    updateTombstones(platform, previous, normalized, userId);
    writeUserList(platform, normalized, userId);
    setPending(platform, true, userId);
    bumpGeneration(platform, userId);
    emitChange(platform, "local");
    queueSync(platform);
    return normalized;
  }

  async function fetchJson(url, options = {}) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      : null;
    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        ...options,
        ...(controller ? { signal: controller.signal } : {})
      });
      let data = null;
      try {
        data = await response.json();
      } catch {}
      return { response, data };
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }
  }

  function errorMessage(data, fallback) {
    return cleanString(data?.error?.message || data?.message || fallback);
  }

  function expireSession() {
    session = {
      available: true,
      authenticated: false,
      user: null,
      csrfToken: ""
    };
    emitSession();
    emitChange(null, "session");
  }

  async function putWatchlist(platform, entries, expectedRevision) {
    return fetchJson(`/api/watchlist/${encodeURIComponent(platform)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.csrfToken || ""
      },
      body: JSON.stringify({ entries, expectedRevision })
    });
  }

  async function syncPlatform(platform) {
    if (!isPlatform(platform) || !session.authenticated || !session.user?.id) return false;
    const userId = session.user.id;
    if (!isPending(platform, userId)) return true;

    if (window.navigator && window.navigator.onLine === false) {
      emitSync(platform, "offline", { message: "Changes are saved on this device and will retry online." });
      return false;
    }

    let localEntries = readUserList(platform, userId);
    let expectedRevision = readRevision(platform, userId);
    let startedGeneration = generation(platform, userId);
    emitSync(platform, "syncing");

    try {
      let { response, data } = await putWatchlist(platform, localEntries, expectedRevision);

      if (response.status === 401) {
        expireSession();
        emitSync(platform, "error", { message: "Your sign-in expired. Sign in again to resume syncing." });
        return false;
      }

      if (response.status === 409 && data?.watchlist) {
        const serverDocument = data.watchlist;
        const serverEntries = normalizeEntries(serverDocument.entries, platform);
        writeRevision(platform, serverDocument.revision, userId);

        localEntries = readUserList(platform, userId);
        const stillImporting = safeGet(importKey(platform, userId)) !== "1";
        const changedDuringRequest = generation(platform, userId) !== startedGeneration;
        localEntries = applyTombstones(
          mergeEntries(serverEntries, localEntries, platform),
          stillImporting && !changedDuringRequest ? [] : readTombstones(platform, userId)
        );
        writeUserList(platform, localEntries, userId);
        expectedRevision = readRevision(platform, userId);
        startedGeneration = generation(platform, userId);
        emitChange(platform, "conflict");
        emitSync(platform, "conflict-resolved", { revision: expectedRevision });

        ({ response, data } = await putWatchlist(platform, localEntries, expectedRevision));
      }

      if (!response.ok) {
        emitSync(platform, "error", {
          message: errorMessage(data, `Sync failed with status ${response.status}.`)
        });
        return false;
      }

      const document = data?.watchlist;
      if (!document || !Array.isArray(document.entries)) {
        emitSync(platform, "error", { message: "The sync response was incomplete." });
        return false;
      }

      if (!session.authenticated || String(session.user?.id) !== String(userId)) return false;

      writeRevision(platform, document.revision, userId);
      if (generation(platform, userId) === startedGeneration) {
        writeUserList(platform, normalizeEntries(document.entries, platform), userId);
        setPending(platform, false, userId);
        safeRemove(tombstoneKey(platform, userId));
        emitChange(platform, "remote");
      }

      const importMarker = importKey(platform, userId);
      if (importPending.has(importMarker)) {
        safeSet(importMarker, "1");
        importPending.delete(importMarker);
      }

      emitSync(platform, "synced", { revision: Number(document.revision) || 0 });
      return true;
    } catch (error) {
      const offline = window.navigator?.onLine === false || error?.name === "AbortError" || error instanceof TypeError;
      emitSync(platform, offline ? "offline" : "error", {
        message: offline
          ? "Changes are saved on this device and will retry online."
          : cleanString(error?.message || "Unable to sync right now.")
      });
      return false;
    }
  }

  function queueSync(platform) {
    if (!isPlatform(platform)) return Promise.resolve(false);
    const queueKey = generationKey(platform);
    const previous = syncQueues.get(queueKey) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => syncPlatform(platform));
    syncQueues.set(queueKey, next);
    next.finally(() => {
      if (syncQueues.get(queueKey) === next) syncQueues.delete(queueKey);
    });
    return next;
  }

  function normalizeRemoteDocument(raw, platform) {
    const source = raw && typeof raw === "object" ? raw : {};
    const rawEntries = Array.isArray(source.entries) ? source.entries : [];
    return {
      platform,
      rawEntries,
      entries: normalizeEntries(rawEntries, platform),
      revision: Number.isSafeInteger(Number(source.revision)) && Number(source.revision) >= 0
        ? Number(source.revision)
        : 0
    };
  }

  async function hydrateAuthenticatedWatchlists() {
    const userId = session.user?.id;
    if (!userId) return;

    let response;
    let data;
    try {
      ({ response, data } = await fetchJson("/api/watchlist"));
    } catch (error) {
      PLATFORMS.forEach(platform => {
        emitSync(platform, "offline", {
          message: "Cloud Watchlist is temporarily unavailable; this device's signed-in cache is unchanged."
        });
      });
      return;
    }

    if (response.status === 401) {
      expireSession();
      return;
    }
    if (!response.ok || !data?.watchlists) {
      PLATFORMS.forEach(platform => {
        emitSync(platform, "error", { message: errorMessage(data, "Unable to load Cloud Watchlist.") });
      });
      return;
    }

    const platformsToSync = [];
    PLATFORMS.forEach(platform => {
      const remote = normalizeRemoteDocument(data.watchlists[platform], platform);
      const cached = readUserList(platform, userId);
      const guest = readGuest(platform);
      const preAuthChanges = preAuthMutations.get(platform) || [];
      const imported = safeGet(importKey(platform, userId)) === "1";
      const pending = isPending(platform, userId);
      const remoteWasNormalized = !storedEntriesEqual(remote.rawEntries, remote.entries);
      let desired;
      let shouldSync = false;

      writeRevision(platform, remote.revision, userId);

      if (!imported) {
        // A device's existing guest list is imported once. It is merged into,
        // never substituted for, the server document.
        desired = mergeEntries(remote.entries, cached, guest, platform);
        shouldSync = remoteWasNormalized || JSON.stringify(desired) !== JSON.stringify(remote.entries);
        if (shouldSync) {
          setPending(platform, true, userId);
          importPending.add(importKey(platform, userId));
        } else {
          safeSet(importKey(platform, userId), "1");
        }
      } else if (pending) {
        const tombstones = readTombstones(platform, userId).filter(
          item => !preAuthChanges.some(entry => tombstoneMatches(item, entry))
        );
        safeSet(tombstoneKey(platform, userId), JSON.stringify(tombstones));
        desired = applyTombstones(
          mergeEntries(remote.entries, cached, preAuthChanges, platform),
          tombstones
        );
        shouldSync = true;
      } else if (preAuthChanges.length) {
        // A user can interact with the page while the session request is in
        // flight. Carry only those additions/edits into the verified account;
        // never treat a pre-auth guest deletion as a cloud deletion.
        desired = mergeEntries(remote.entries, preAuthChanges, platform);
        shouldSync = remoteWasNormalized || JSON.stringify(desired) !== JSON.stringify(remote.entries);
        if (shouldSync) setPending(platform, true, userId);
      } else {
        desired = remote.entries;
        shouldSync = remoteWasNormalized;
        if (shouldSync) setPending(platform, true, userId);
      }

      writeUserList(platform, desired, userId);
      if (shouldSync) platformsToSync.push(platform);
    });

    emitChange(null, "remote");
    platformsToSync.forEach(queueSync);
  }

  function normalizeSession(data) {
    const authenticated = Boolean(data?.available && data?.authenticated && data?.user?.id);
    return {
      available: Boolean(data?.available),
      authenticated,
      user: authenticated
        ? {
            ...data.user,
            id: String(data.user.id),
            displayName: cleanString(data.user.displayName || data.user.display_name || data.user.globalName),
            username: cleanString(data.user.username)
          }
        : null,
      csrfToken: authenticated ? cleanString(data.csrfToken) : ""
    };
  }

  async function initialize() {
    if (typeof fetch !== "function") {
      emitSession();
      initializing = false;
      return sessionSnapshot();
    }

    try {
      const { response, data } = await fetchJson("/api/auth/session");
      if (!response.ok || !data || typeof data.available !== "boolean") {
        session = { available: false, authenticated: false, user: null, csrfToken: "" };
      } else {
        session = normalizeSession(data);
        if (session.authenticated) await hydrateAuthenticatedWatchlists();
      }
    } catch {
      session = { available: false, authenticated: false, user: null, csrfToken: "" };
    }

    initializing = false;
    preAuthMutations.clear();
    emitSession();
    return sessionSnapshot();
  }

  async function signOut() {
    if (!session.authenticated) return sessionSnapshot();
    const { response, data } = await fetchJson("/api/auth/logout", {
      method: "POST",
      headers: { "X-CSRF-Token": session.csrfToken || "" }
    });
    if (!response.ok) {
      throw new Error(errorMessage(data, `Sign out failed with status ${response.status}.`));
    }

    session = {
      available: true,
      authenticated: false,
      user: null,
      csrfToken: ""
    };
    emitSession();
    emitChange(null, "session");
    return sessionSnapshot();
  }

  function retryPending() {
    if (!session.authenticated || !session.user?.id) return;
    PLATFORMS.forEach(platform => {
      if (isPending(platform)) queueSync(platform);
    });
  }

  window.addEventListener("online", retryPending);
  window.addEventListener("storage", event => {
    const currentUserId = session.user?.id;
    PLATFORMS.forEach(platform => {
      const activeKey = session.authenticated && currentUserId
        ? userListKey(platform, currentUserId)
        : guestKey(platform);
      if (event.key !== activeKey) return;
      emitChange(platform, "storage");
      if (session.authenticated && isPending(platform, currentUserId)) queueSync(platform);
    });
  });

  const ready = initialize();

  window.PBCWatchlistStore = Object.freeze({
    platforms: PLATFORMS,
    ready,
    get,
    save,
    sync: queueSync,
    getSession: sessionSnapshot,
    signOut,
    mergeEntries
  });
})();
