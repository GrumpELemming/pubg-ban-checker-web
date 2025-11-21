(() => {
  const BASE_URL = "https://pubg-ban-checker-backend.onrender.com";

  const LS_PLATFORM = "selectedPlatform";
  const LS_DARK = "darkMode";
  const LS_WATCHLIST_PREFIX = "watchlist_";

  /* ------------------------------
     Escape HTML
  ------------------------------ */
  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ------------------------------
     Platform Helpers
  ------------------------------ */
  function getPlatform() {
    return document.getElementById("platformSelect").value || "steam";
  }

  function setPlatform(p) {
    document.getElementById("platformSelect").value = p;
    localStorage.setItem(LS_PLATFORM, p);
  }

  /* ------------------------------
     Watchlist Storage Helpers
  ------------------------------ */
  function keyFor(p) {
    return `${LS_WATCHLIST_PREFIX}${p}`;
  }

  function getList(p) {
    try {
      return JSON.parse(localStorage.getItem(keyFor(p))) || [];
    } catch {
      return [];
    }
  }

  function saveList(p, arr) {
    try {
      localStorage.setItem(keyFor(p), JSON.stringify(arr));
    } catch {}
  }

  /* ------------------------------
     Status Mapping
  ------------------------------ */
  function mapStatus(label) {
    const t = (label || "").toLowerCase();

    if (t.includes("perm")) return { code: "perm", text: "Permanently Banned" };
    if (t.includes("temp")) return { code: "temp", text: "Temporarily Banned" };
    if (t.includes("not")) return { code: "ok", text: "Not Banned" };
    if (t.includes("player not found")) return { code: "unknown", text: "Player Not Found" };
    if (t.includes("error")) return { code: "unknown", text: "Error / Unknown" };

    return { code: "unknown", text: label || "Unknown" };
  }

  function formatDT(ts) {
    if (!ts) return "Never";
    const d = new Date(ts);
    return isNaN(d) ? "Never" : d.toLocaleString();
  }

  /* ------------------------------
     Rename Modal
  ------------------------------ */
  const modal = document.getElementById("nameChangeModal");
  const modalText = document.getElementById("nameChangeText");
  const modalBtn = document.getElementById("closeNameChangeBtn");

  modalBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  function showNameChange(oldName, newName) {
    modalText.innerHTML = `
      Player <strong>${escapeHtml(oldName)}</strong> has changed their name to 
      <strong>${escapeHtml(newName)}</strong>.
    `;
    modal.classList.remove("hidden");
  }

  /* ------------------------------
     Build Watchlist Row
  ------------------------------ */
  function buildRow(entry) {
    const status = mapStatus(entry.statusLabel);

    const row = document.createElement("div");
    row.className = "watchlist-player";

    const left = document.createElement("div");
    left.className = "wl-left";

    const nameLine = document.createElement("div");
    nameLine.className = "wl-name-line";

    nameLine.innerHTML = `
      <strong>${escapeHtml(entry.player)}</strong>
      <span class="wl-platform-badge">${
        entry.platform === "psn"
          ? "PSN"
          : entry.platform.charAt(0).toUpperCase() + entry.platform.slice(1)
      }</span>
      <span class="wl-status-pill wl-status-pill-${status.code}">
        ${status.code.toUpperCase()}
      </span>
    `;

    const meta = document.createElement("div");
    meta.className = "wl-meta";
    meta.innerHTML = `
      <span>Clan: <strong>${escapeHtml(entry.clan || "none")}</strong></span>
      <span>ID: <strong>${escapeHtml(entry.accountId)}</strong></span>
      <span>Status: ${escapeHtml(status.text)}</span>
      <span>Last checked: ${escapeHtml(formatDT(entry.lastChecked))}</span>
    `;

    left.append(nameLine, meta);

    /* ------------------------------
       Name History (NEW)
    ------------------------------ */
    if (Array.isArray(entry.previousNames) && entry.previousNames.length > 0) {
      const hist = document.createElement("div");
      hist.className = "wl-history";
      hist.innerHTML =
        `<span class="wl-history-label">Previously known as:</span> ` +
        entry.previousNames
          .map(n => `<span class="wl-history-name">${escapeHtml(n)}</span>`)
          .join(", ");
      left.append(hist);
    }

    const actions = document.createElement("div");
    actions.className = "watchlist-buttons";

    const b1 = document.createElement("button");
    b1.className = "wl-btn wl-btn-primary wl-btn-mini";
    b1.textContent = "Re-check";
    b1.onclick = () => recheckSingle(entry.player);

    const b2 = document.createElement("button");
    b2.className = "wl-btn wl-btn-ghost wl-btn-mini";
    b2.textContent = "Remove";
    b2.onclick = () => {
      const p = getPlatform();
      saveList(p, getList(p).filter(e => e.player !== entry.player));
      renderList();
    };

    actions.append(b1, b2);

    row.append(left, actions);
    return row;
  }

  /* ------------------------------
     Render Watchlist
  ------------------------------ */
  function renderList() {
    const container = document.getElementById("watchlistContainer");
    const platform = getPlatform();
    const filter = document.getElementById("statusFilter").value;

    const all = getList(platform);
    let list = all;

    if (filter !== "all") {
      list = all.filter(e => mapStatus(e.statusLabel).code === filter);
    }

    document.getElementById("wlCount").textContent = `${all.length} players`;

    container.innerHTML = "";
    if (!list.length) {
      container.innerHTML = `<p class="wl-empty">No players in your watchlist yet.</p>`;
      return;
    }

    list.forEach(e => container.appendChild(buildRow(e)));
  }

  /* ------------------------------
     Apply API Results (Name History + Rename Modal)
  ------------------------------ */
  function applyResultsToWatchlist(list, results) {
    const now = Date.now();

    // Create lookup: accountId → result
    const mapR = new Map();
    results.forEach(r => {
      if (r.accountId) mapR.set(String(r.accountId), r);
    });

    for (const entry of list) {
      const result = mapR.get(String(entry.accountId));
      if (!result) continue;

      /* -------- NAME CHANGE DETECTED ------- */
      if (result.player && result.player !== entry.player) {

        // init history if missing
        if (!Array.isArray(entry.previousNames)) {
          entry.previousNames = [];
        }

        // add old name
        if (!entry.previousNames.includes(entry.player)) {
          entry.previousNames.push(entry.player);
        }

        // popup modal
        showNameChange(entry.player, result.player);

        // update actual player name
        entry.player = result.player;
      }

      // Update other fields
      entry.statusLabel =
        result.banStatus || result.status || entry.statusLabel;
      entry.clan = result.clan || entry.clan;
      entry.lastChecked = now;
    }
  }

  /* ------------------------------
     Recheck All
  ------------------------------ */
  async function recheckAll() {
    const platform = getPlatform();
    const list = getList(platform);

    if (!list.length) return;

    const names = [...new Set(list.map(e => e.player))];

    const container = document.querySelector(".wl-list-card");
    container.classList.add("wl-container-scan");
    setTimeout(() => container.classList.remove("wl-container-scan"), 650);

    try {
      const resp = await fetch(
        `${BASE_URL}/check-ban-clan?platform=${platform}&player=${names.join(",")}`
      );
      const data = await resp.json();

      if (!resp.ok || !Array.isArray(data.results)) return;

      applyResultsToWatchlist(list, data.results);
      saveList(platform, list);
      renderList();
    } catch {}
  }

  /* ------------------------------
     Recheck Single
  ------------------------------ */
  async function recheckSingle(name) {
    const p = getPlatform();
    const list = getList(p);

    try {
      const resp = await fetch(
        `${BASE_URL}/check-ban-clan?platform=${p}&player=${name}`
      );
      const data = await resp.json();

      if (!resp.ok || !Array.isArray(data.results)) return;

      applyResultsToWatchlist(list, data.results);
      saveList(p, list);
      renderList();
    } catch {}
  }

  /* ------------------------------
     Platform UI Buttons
  ------------------------------ */
  function setupPlatformButtons() {
    const row = document.getElementById("platformRowWatchlist");
    const label = document.getElementById("activePlatformLabelWatchlist");
    const buttons = [...row.querySelectorAll(".platform-btn")];

    function updateUI() {
      const p = getPlatform();
      buttons.forEach(b => b.classList.toggle("active", b.dataset.platform === p));

      const pretty = p === "psn" ? "PSN" : p.charAt(0).toUpperCase() + p.slice(1);
      label.innerHTML = `Viewing watchlist for: <strong>${pretty}</strong>`;
    }

    updateUI();

    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        setPlatform(btn.dataset.platform);
        updateUI();
        renderList();
      });
    });
  }

  /* ------------------------------
     Init
  ------------------------------ */
  document.addEventListener("DOMContentLoaded", () => {
    setupPlatformButtons();

    document.getElementById("statusFilter").addEventListener("change", renderList);
    document.getElementById("refreshAllBtn").addEventListener("click", recheckAll);

    document.getElementById("clearWatchlistBtn").addEventListener("click", () => {
      saveList(getPlatform(), []);
      renderList();
    });

    // Dark Mode
    const toggle = document.getElementById("darkModeToggle");
    const stored = localStorage.getItem(LS_DARK) === "true";

    if (stored) {
      document.body.classList.add("dark-mode");
      toggle.checked = true;
    }

    toggle.addEventListener("change", () => {
      const on = toggle.checked;
      document.body.classList.toggle("dark-mode", on);
      localStorage.setItem(LS_DARK, on);
    });

    renderList();
  });

})();
