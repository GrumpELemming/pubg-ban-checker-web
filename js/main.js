/* -------------------------------------------------------
   PUBG Ban Checker
   main.js
   v2.2 - Strict Status Matching
   ------------------------------------------------------- */
(() => {
  // Proxy all API traffic through the same origin (e.g., /api -> Render backend)
  const BASE_URL = "/api";

  // LocalStorage keys
  const LS_PLATFORM = "selectedPlatform";
  const LS_WATCHLIST_PREFIX = "watchlist_";
  const BAN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  const MAX_RATE_LIMIT_ATTEMPTS = 3;
  const INITIAL_RETRY_DELAY = 700;

  // ---------- Helpers ----------
  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

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

        // shimmer row
        row.classList.add("shimmer");
        setTimeout(() => row.classList.remove("shimmer"), 450);

        // set active
        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        // persist + hidden input
        setPlatform(platform);

        // label update
        if (labelEl) {
          const pretty =
            platform === "psn"
              ? "PSN"
              : platform.charAt(0).toUpperCase() + platform.slice(1);
          labelEl.innerHTML = `Currently searching: <strong>${escapeHtml(pretty)}</strong>`;
        }
      });
    });

    // initial label text
    if (labelEl) {
      const cp = getPlatform();
      const pretty =
        cp === "psn" ? "PSN" : cp.charAt(0).toUpperCase() + cp.slice(1);
      labelEl.innerHTML = `Currently searching: <strong>${escapeHtml(pretty)}</strong>`;
    }
  }

  // ---------- Cache helpers ----------
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

  // ---------- Backend calls ----------
  async function getBanStatus(platform, playerName) {
    const cached = getCachedBan(platform, playerName);
    if (cached) return cached;

    const url = `${BASE_URL}/check-ban-clan?platform=${encodeURIComponent(
      platform
    )}&player=${encodeURIComponent(playerName)}`;

    let attempt = 0;
    let delayMs = INITIAL_RETRY_DELAY;

    while (attempt < MAX_RATE_LIMIT_ATTEMPTS) {
      try {
        const res = await fetch(url);

        if (res.status === 429) {
          attempt += 1;
          if (attempt >= MAX_RATE_LIMIT_ATTEMPTS) {
            return {
              player: playerName,
              accountId: "",
              clan: "",
              statusText:
                "Rate limited by backend. Please wait a moment and try again."
            };
          }
          await wait(delayMs);
          delayMs *= 1.6;
          continue;
        }

        if (!res.ok) {
          const message = await res.text();
          return {
            player: playerName,
            accountId: "",
            clan: "",
            statusText: message || `Request failed with status ${res.status}`
          };
        }

        const data = await res.json();

        let accountId = "";
        let clan = "";
        let statusText = "Unknown";

        let shouldCache = false;

        if (data && Array.isArray(data.results) && data.results.length) {
          const match =
            data.results.find(
              e =>
                typeof e.player === "string" &&
                e.player.toLowerCase() === playerName.toLowerCase()
            ) || data.results[0];

          accountId =
            match.accountId || match.id || match.account_id || "";
          clan = match.clan || match.clanName || "";
          statusText =
            match.statusText ||
            match.status ||
            match.banStatus ||
            "Unknown";
          shouldCache = true;
        }

        const result = {
          player: playerName,
          accountId,
          clan,
          statusText
        };

        if (shouldCache) {
          setCachedBan(platform, playerName, result);
        }
        return result;
      } catch (err) {
        attempt += 1;
        if (attempt >= MAX_RATE_LIMIT_ATTEMPTS) {
          return {
            player: playerName,
            accountId: "",
            clan: "",
            statusText:
              "Error contacting backend. Please try again later."
          };
        }
        await wait(delayMs);
        delayMs *= 1.6;
      }
    }

    const result = {
      player: playerName,
      accountId: "",
      clan: "",
      statusText: "Unknown"
    };

    return result;
  }

  async function resolveById(id, platform) {
    try {
      const res = await fetch(
        `${BASE_URL}/resolve?platform=${encodeURIComponent(
          platform
        )}&id=${encodeURIComponent(id)}`
      );
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
  }

  // ---------- Watchlist helpers ----------
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
      localStorage.setItem(
        getWatchlistKey(platform),
        JSON.stringify(arr || [])
      );
    } catch {}
  }

  function addWatchlist(player, accountId, clan, platformLabel) {
    const platform = getPlatform();
    const list = getWatchlist(platform);

    const existing = list.find(
      x =>
        x.player.toLowerCase() === player.toLowerCase() &&
        (x.accountId || "") === (accountId || "")
    );
    if (existing) return;

    list.push({
      player,
      accountId: accountId || "",
      clan: clan || "",
      platform,
      statusLabel: platformLabel || "",
      lastChecked: Date.now()
    });

    saveWatchlist(platform, list);
  }

  // ---------- STRICT BAN STATUS MATCHING ----------
  function classifyStatus(statusText) {
    const raw = (statusText || "").trim().toLowerCase();

    if (raw === "not banned") return "not";
    if (raw === "temporarily banned") return "temp";
    if (raw === "permanently banned") return "perm";
    if (raw === "player not found") return "unknown";
    if (raw.includes("rate limit")) return "unknown";
    if (raw.includes("error")) return "unknown";

    return "unknown";
  }

  // ---------- UI builders ----------
  function buildRow({ player, accountId, clan, statusText }) {
    const row = document.createElement("div");
    row.className = "player-row";

    const status = classifyStatus(statusText);

    // apply classes
    if (status === "perm") row.classList.add("perm-banned");
    else if (status === "temp") row.classList.add("temp-banned");
    else if (status === "not") row.classList.add("not-banned");
    else row.classList.add("unknown");

    const label =
      status === "perm"
        ? "Permanently Banned"
        : status === "temp"
        ? "Temporarily Banned"
        : status === "not"
        ? "Not Banned"
        : "Unknown";

    const showDetail =
      statusText &&
      statusText.trim().toLowerCase() !== label.toLowerCase() &&
      status !== "unknown";

    const info = document.createElement("div");
    info.innerHTML = `
      <strong>${escapeHtml(player)}</strong><br>
      ID: ${escapeHtml(accountId || "unknown")}<br>
      Clan: ${escapeHtml(clan || "none")}<br>
      Status: <span class="ban-label">${escapeHtml(label)}</span>
      ${
        showDetail
          ? `<div class="status-detail">${escapeHtml(statusText)}</div>`
          : ""
      }
    `;

    const addBtn = document.createElement("button");
    addBtn.textContent = "Add to Watchlist";
    addBtn.addEventListener("click", () => {
      addWatchlist(player, accountId, clan, label);
      addBtn.textContent = "Added";
      addBtn.disabled = true;
      addBtn.classList.add("added-btn");
    });

    row.append(info, addBtn);
    return row;
  }

  async function runWithConcurrency(items, limit, worker) {
    const queue = [...items];
    const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        await wait(100 + Math.random() * 200); // jitter to avoid burst
        await worker(item);
      }
    });
    await Promise.all(runners);
  }

  // ---------- Main Checker Flow ----------
  async function checkBan() {
    const results = document.getElementById("results");
    if (!results) return;

    const inputEl = document.getElementById("playerInput");
    const names = (inputEl?.value || "")
      .split(/[\n,]+/)
      .map(x => x.trim())
      .filter(Boolean)
      .slice(0, 10);

    if (!names.length) {
      results.innerHTML = "<p class='muted'>Please enter names.</p>";
      return;
    }

    const platform = getPlatform();
    results.innerHTML = "";

    const fragment = document.createDocumentFragment();
    const rowMap = new Map();

    names.forEach(n => {
      const loadingRow = buildRow({
        player: n,
        accountId: "...",
        clan: "...",
        statusText: "Checking..."
      });
      rowMap.set(n, loadingRow);
      fragment.appendChild(loadingRow);
    });

    results.appendChild(fragment);

    await runWithConcurrency(names, 2, async n => {
      const data = await getBanStatus(platform, n);

      const finalRow = buildRow(data);
      const currentRow = rowMap.get(n);
      if (currentRow && currentRow.isConnected) {
        results.replaceChild(finalRow, currentRow);
      } else {
        results.appendChild(finalRow);
      }
    });
  }

  // ---------- ID lookup ----------
  async function lookupById() {
    const input = document.getElementById("accountIdInput");
    const out = document.getElementById("idLookupResults");
    if (!input || !out) return;

    const id = input.value.trim();
    const platform = getPlatform();

    if (!id) {
      out.innerHTML = "<p class='muted'>Enter an ID.</p>";
      return;
    }

    out.innerHTML = "<p class='muted'>Looking up...</p>";

    try {
      const resolved = await resolveById(id, platform);

      if (resolved.error) {
        out.innerHTML = `<p class='muted'>${escapeHtml(resolved.error)}</p>`;
        return;
      }

      const name = resolved.currentName || resolved.name;
      if (!name) {
        out.innerHTML =
          "<p class='muted'>Could not resolve that ID on this platform.</p>";
        return;
      }

      const banData = await getBanStatus(platform, name);

      const row = buildRow({
        ...banData,
        accountId: banData.accountId || id
      });

      out.innerHTML = "";
      out.append(row);
    } catch (err) {
      out.innerHTML = `<p class='muted'>${escapeHtml(
        "Lookup failed: " + err
      )}</p>`;
    }
  }

  // ---------- Dark mode ----------
  // Dark mode removed; ensure any legacy state is cleared
  function clearLegacyDarkMode() {
    document.body.classList.remove("dark-mode");
    try {
      localStorage.removeItem("darkMode");
    } catch {}
  }

  // ---------- Click limiting ----------
  function handleLimitedClick(btn, fn) {
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    btn.classList.add("fade-out");
    Promise.resolve()
      .then(fn)
      .finally(() => {
        btn.disabled = false;
        btn.classList.remove("fade-out");
      });
  }

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", () => {
    applyPlatformToButtons("platformRowIndex", "activePlatformLabel");

    // Ensure hidden platform input matches stored platform
    const hidden = document.getElementById("platformSelect");
    if (hidden) hidden.value = getPlatform();

    clearLegacyDarkMode();

    const clearResultsBtn = document.getElementById("clearResultsBtn");
    if (clearResultsBtn) {
      clearResultsBtn.addEventListener("click", () => {
        const results = document.getElementById("results");
        if (results) {
          results.innerHTML = "<p class='muted'>No results yet.</p>";
        }
      });
    }

    const clearIdBtn = document.getElementById("clearIdBtn");
    if (clearIdBtn) {
      clearIdBtn.addEventListener("click", () => {
        const out = document.getElementById("idLookupResults");
        const input = document.getElementById("accountIdInput");
        if (out) out.innerHTML = "<p class='muted'>No results yet.</p>";
        if (input) input.value = "";
      });
    }

    const checkBanBtn = document.getElementById("checkBanBtn");
    if (checkBanBtn) {
      checkBanBtn.addEventListener("click", () =>
        handleLimitedClick(checkBanBtn, () => checkBan())
      );
    }

    const lookupBtn = document.getElementById("lookupIdBtn");
    if (lookupBtn) {
      lookupBtn.addEventListener("click", () =>
        handleLimitedClick(lookupBtn, () => lookupById())
      );
    }
  });
})();
