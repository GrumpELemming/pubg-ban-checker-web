(function () {
  "use strict";

  const AUTH_START_URL = "/api/auth/discord/start?next=%2Fwatchlist.html";
  const AUTH_LOGOUT_URL = "/api/auth/logout";

  function consumeOAuthNotice() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("auth") !== "error") return null;
      params.delete("auth");
      const query = params.toString();
      const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", cleanUrl);
      return {
        message: "Discord sign-in was cancelled or could not be completed. Your guest watchlist is unchanged.",
        tone: "error",
        sticky: true
      };
    } catch {
      return null;
    }
  }

  function initAccountPanel() {
    const panel = document.getElementById("watchlistAccountPanel");
    const summary = document.getElementById("watchlistAccountSummary");
    const accountName = document.getElementById("watchlistAccountName");
    const description = document.getElementById("watchlistAccountDescription");
    const status = document.getElementById("watchlistAccountStatus");
    const signInButton = document.getElementById("watchlistSignInBtn");
    const signOutButton = document.getElementById("watchlistSignOutBtn");
    const exportButton = document.getElementById("exportWatchlistBtn");
    const diagnostics = document.getElementById("watchlistSyncDiagnostics");
    const revokeSessionsButton = document.getElementById("revokeSessionsBtn");
    const deleteWatchlistsButton = document.getElementById("deleteSyncedWatchlistsBtn");
    const deleteAccountButton = document.getElementById("deleteAccountDataBtn");

    if (!panel || !summary || !accountName || !description || !status || !signInButton || !signOutButton) {
      return;
    }

    let session = {
      available: false,
      authenticated: false,
      user: null,
      csrfToken: ""
    };
    let actionPending = false;
    let latestSync = null;
    let notice = consumeOAuthNotice();
    let sessionCheckFailed = false;
    const syncStates = new Map();
    let lastSyncedAt = 0;

    function renderDiagnostics(authenticated) {
      if (!diagnostics) return;
      diagnostics.hidden = !authenticated;
      if (!authenticated) return;
      const synced = Array.from(syncStates.values()).filter(item => item.status === "synced" || item.status === "conflict-resolved").length;
      const pending = Array.from(syncStates.values()).filter(item => ["syncing", "offline", "error"].includes(item.status)).length;
      diagnostics.querySelector("[data-sync-last]").textContent = lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "Not yet";
      diagnostics.querySelector("[data-sync-platforms]").textContent = `${synced} synchronized`;
      diagnostics.querySelector("[data-sync-pending]").textContent = navigator.onLine === false
        ? `${pending || 1} waiting for connection`
        : pending ? `${pending} pending` : "No pending changes";
    }

    function userDisplayName(user) {
      if (!user || typeof user !== "object") return "Discord user";
      return user.displayName || user.display_name || user.globalName || user.username || "Discord user";
    }

    function setStatus(message, tone) {
      status.textContent = message || "";
      status.dataset.tone = tone || "neutral";
    }

    function setDefaultStatus(message, tone) {
      if (notice) {
        setStatus(notice.message, notice.tone);
        return;
      }
      setStatus(message, tone);
    }

    function render() {
      const online = navigator.onLine !== false;
      const authenticated = Boolean(session && session.authenticated);
      const available = Boolean(session && session.available);

      summary.setAttribute("aria-busy", actionPending ? "true" : "false");
      signInButton.hidden = authenticated;
      signOutButton.hidden = !authenticated;
      if (exportButton) exportButton.hidden = !authenticated;
      [revokeSessionsButton, deleteWatchlistsButton, deleteAccountButton].forEach(button => {
        if (button) button.hidden = !authenticated;
      });
      renderDiagnostics(authenticated);

      if (actionPending) {
        summary.dataset.authState = "loading";
        signInButton.disabled = true;
        signOutButton.disabled = true;
        return;
      }

      signOutButton.disabled = false;

      if (sessionCheckFailed) {
        accountName.textContent = "Guest watchlist";
        description.textContent = "Sign-in could not be checked. Your watchlist is still saved in this browser.";
        summary.dataset.authState = "error";
        signInButton.disabled = true;
        setDefaultStatus("Could not reach sign-in. Try again after checking your connection.", "error");
        return;
      }

      if (authenticated) {
        accountName.textContent = userDisplayName(session.user);
        description.textContent = online
          ? "Signed in with Discord. This watchlist syncs across your devices."
          : "You are offline. Changes stay available here and sync after reconnecting.";
        summary.dataset.authState = online ? "signed-in" : "offline";
        setStatusFromSync(online);
        return;
      }

      signInButton.disabled = !available || !online;

      if (!online) {
        accountName.textContent = "Guest watchlist";
        description.textContent = "You are offline. Your watchlist remains saved in this browser.";
        summary.dataset.authState = "offline";
        setDefaultStatus("Offline — sign-in is temporarily unavailable", "warning");
        return;
      }

      if (!available) {
        accountName.textContent = "Guest watchlist";
        description.textContent = "Sign-in is unavailable here. Your watchlist is still saved in this browser.";
        summary.dataset.authState = "unavailable";
        setDefaultStatus("Browser-only mode", "neutral");
        return;
      }

      accountName.textContent = "Guest watchlist";
      description.textContent = "Saved in this browser. Sign in to sync it across your devices.";
      summary.dataset.authState = "signed-out";
      setDefaultStatus("Signing in is optional", "neutral");
    }

    function setStatusFromSync(online) {
      if (notice) {
        setStatus(notice.message, notice.tone);
        return;
      }

      if (!online) {
        setStatus("Offline — waiting to sync", "warning");
        return;
      }

      if (!latestSync || !latestSync.status) {
        setStatus("Sync ready", "success");
        return;
      }

      const syncMessages = {
        syncing: ["Syncing changes…", "neutral"],
        synced: ["Watchlist synced", "success"],
        offline: ["Offline — waiting to sync", "warning"],
        error: [latestSync.message || "Sync could not finish. Your local changes are safe.", "error"],
        "conflict-resolved": ["Watchlist changes merged and synced", "success"]
      };
      const nextStatus = syncMessages[latestSync.status] || [latestSync.message || "Sync ready", "neutral"];
      setStatus(nextStatus[0], nextStatus[1]);
    }

    function normaliseSession(detail) {
      const candidate = detail && detail.session ? detail.session : detail;
      if (!candidate || typeof candidate !== "object") return null;
      return {
        available: Boolean(candidate.available),
        authenticated: Boolean(candidate.authenticated),
        user: candidate.user || null,
        csrfToken: candidate.csrfToken || candidate.csrf_token || ""
      };
    }

    function onSession(event) {
      const nextSession = normaliseSession(event.detail);
      if (!nextSession) return;
      session = nextSession;
      sessionCheckFailed = false;
      if (nextSession.authenticated || (!actionPending && !notice?.sticky)) {
        notice = null;
      }
      actionPending = false;
      render();
    }

    function onSync(event) {
      if (!notice?.sticky) notice = null;
      latestSync = event.detail && typeof event.detail === "object" ? event.detail : null;
      if (latestSync?.platform) syncStates.set(latestSync.platform, latestSync);
      if (latestSync?.status === "synced" || latestSync?.status === "conflict-resolved") lastSyncedAt = Date.now();
      if (session.authenticated && !actionPending) render();
    }

    async function initialiseStore() {
      const store = window.PBCWatchlistStore;
      if (!store) {
        session = { available: false, authenticated: false, user: null, csrfToken: "" };
        actionPending = false;
        render();
        return;
      }

      try {
        await Promise.resolve(store.ready);
        if (typeof store.getSession === "function") {
          const nextSession = normaliseSession(await store.getSession());
          if (nextSession) session = nextSession;
        }
      } catch (error) {
        session = { available: false, authenticated: false, user: null, csrfToken: "" };
        sessionCheckFailed = true;
        notice = {
          message: "Could not check sign-in. Your browser-saved watchlist is still available.",
          tone: "error"
        };
      } finally {
        actionPending = false;
        render();
      }
    }

    async function signOut() {
      const store = window.PBCWatchlistStore;
      actionPending = true;
      notice = null;
      accountName.textContent = "Signing out…";
      description.textContent = "Your browser-saved guest watchlist will remain available.";
      setStatus("Ending this session…", "neutral");
      render();

      try {
        if (store && typeof store.signOut === "function") {
          await store.signOut();
        } else {
          const headers = { "Accept": "application/json" };
          if (session.csrfToken) headers["X-CSRF-Token"] = session.csrfToken;
          const response = await fetch(AUTH_LOGOUT_URL, {
            method: "POST",
            credentials: "same-origin",
            headers
          });
          if (!response.ok) throw new Error("Logout failed");
        }

        session = store && typeof store.getSession === "function"
          ? normaliseSession(await store.getSession()) || { available: true, authenticated: false, user: null, csrfToken: "" }
          : { available: true, authenticated: false, user: null, csrfToken: "" };
        latestSync = null;
        notice = {
          message: "Signed out. Your guest watchlist is available on this device.",
          tone: "success"
        };
      } catch (error) {
        notice = {
          message: "Could not sign out. Please check your connection and try again.",
          tone: "error"
        };
      } finally {
        actionPending = false;
        render();
      }
    }

    function exportWatchlistData() {
      const store = window.PBCWatchlistStore;
      if (!session.authenticated || !store?.get) return;
      const platforms = store.platforms || ["steam", "xbox", "psn", "kakao"];
      const payload = {
        exportedAt: new Date().toISOString(),
        account: { id: session.user?.id || "", username: session.user?.username || "", displayName: userDisplayName(session.user) },
        watchlists: Object.fromEntries(platforms.map(platform => [platform, store.get(platform)]))
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pubg-ban-checker-watchlist-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Watchlist data exported", "success");
    }

    async function accountRequest(url, options = {}) {
      const response = await fetch(url, {
        method: options.method || "POST",
        credentials: "same-origin",
        headers: { "Accept": "application/json", "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message || "The account request could not be completed");
      return body;
    }

    async function revokeOtherSessions() {
      if (!window.confirm("Sign out every other browser and device? This device will stay signed in.")) return;
      try {
        const result = await accountRequest("/api/auth/logout-others");
        setStatus(`${result.sessionsRevoked || 0} other session${result.sessionsRevoked === 1 ? "" : "s"} signed out`, "success");
      } catch (error) { setStatus(error.message, "error"); }
    }

    async function deleteSyncedWatchlists() {
      if (!window.confirm("Permanently delete every synchronized Watchlist? This cannot be undone.")) return;
      try {
        await accountRequest("/api/account/watchlists", { method: "DELETE" });
        const store = window.PBCWatchlistStore;
        for (const platform of store?.platforms || []) await Promise.resolve(store.save(platform, []));
        setStatus("Synchronized Watchlists deleted", "success");
      } catch (error) { setStatus(error.message, "error"); }
    }

    async function deleteAccountData() {
      const confirmation = window.prompt("This permanently deletes your synchronized Watchlists, account record, and sessions. Type DELETE to continue.");
      if (confirmation !== "DELETE") return;
      try {
        await accountRequest("/api/account", { method: "DELETE", body: { confirmation } });
        window.location.reload();
      } catch (error) { setStatus(error.message, "error"); }
    }

    signInButton.addEventListener("click", function () {
      if (signInButton.disabled) return;
      actionPending = true;
      notice = null;
      accountName.textContent = "Opening Discord…";
      description.textContent = "You will return here after authorising sign-in.";
      setStatus("Redirecting securely…", "neutral");
      render();
      window.location.assign(AUTH_START_URL);
    });

    signOutButton.addEventListener("click", signOut);
    exportButton?.addEventListener("click", exportWatchlistData);
    revokeSessionsButton?.addEventListener("click", revokeOtherSessions);
    deleteWatchlistsButton?.addEventListener("click", deleteSyncedWatchlists);
    deleteAccountButton?.addEventListener("click", deleteAccountData);
    window.addEventListener("pbc:watchlist-session", onSession);
    window.addEventListener("pbc:watchlist-sync", onSync);
    window.addEventListener("online", render);
    window.addEventListener("offline", render);

    initialiseStore();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAccountPanel, { once: true });
  } else {
    initAccountPanel();
  }
})();
