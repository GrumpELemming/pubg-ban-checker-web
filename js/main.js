/* -------------------------------------------------------
   PUBG Ban Checker
   main.js
   v2.0 - Rebuilt main page checker + ID lookup + platform + dark mode
   ------------------------------------------------------- */
(() => {
  const BASE_URL = "https://pubg-ban-checker-backend.onrender.com";

  // LocalStorage keys
  const LS_PLATFORM = "selectedPlatform";
  const LS_DARK = "darkMode";
  const LS_WATCHLIST_PREFIX = "watchlist_";

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

  // ---------- Backend calls ----------
  async function getBanStatus(platform, playerName) {
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
            statusText:
              message || `Request failed with status ${res.status}`
          };
        }

        const data = await res.json();

        let accountId = "";
        let clan = "";
        let statusText = "Unknown";

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
        }

        return {
          player: playerName,
          accountId,
          clan,
          statusText
        };
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

    return {
      player: playerName,
      accountId: "",
      clan: "",
      statusText: "Unknown"
    };
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
      // ignore quota errors
    }
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
      statusLabel: platformLabel || ""
    });

    saveWatchlist(platform, list);
  }

  // ---------- UI builders ----------
  function buildRow({ player, accountId, clan, statusText }) {
    const row = document.createElement("div");
    row.className = "player-row";

    const t = (statusText || "").toLowerCase();
    let label = "Unknown";

    if (t.includes("perm")) {
      row.classList.add("perm-banned");
      label = "Permanently Banned";
    } else if (t.includes("temp")) {
      row.classList.add("temp-banned");
      label = "Temporarily Banned";
    } else if (t.includes("not")) {
      row.classList.add("not-banned");
      label = "Not Banned";
    } else if (t.includes("unknown")) {
      row.classList.add("unknown");
      label = "Unknown";
    } else if (t.includes("error")) {
      row.classList.add("unknown");
      label = "Error";
    } else {
      row.classList.add("unknown");
    }

    const hasDetail =
      statusText &&
      statusText.toLowerCase() !== label.toLowerCase() &&
      label !== "Unknown";

    const info = document.createElement("div");
    info.innerHTML = `
      <strong>${escapeHtml(player)}</strong><br>
      ID: ${escapeHtml(accountId || "unknown")}<br>
      Clan: ${escapeHtml(clan || "none")}<br>
      Status: <span class="ban-label">${escapeHtml(label)}</span>
      ${
        hasDetail
          ? `<div class="status-detail">${escapeHtml(statusText)}</div>`
          : ""
      }
    `;

    const add = document.createElement("button");
    add.textContent = "Add to Watchlist";
    add.addEventListener("click", () => {
      addWatchlist(player, accountId, clan, label);
      add.textContent = "Added";
      add.disabled = true;
      add.classList.add("added-btn");
    });

    row.append(info, add);
    return row;
  }

  // ---------- Ban checker flow ----------
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

    for (const n of names) {
      const loadingRow = buildRow({
        player: n,
        accountId: "...",
        clan: "...",
        statusText: "Checking..."
      });
      results.append(loadingRow);

      const data = await getBanStatus(platform, n);
      const finalRow = buildRow(data);
      results.replaceChild(finalRow, loadingRow);
    }
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
        out.innerHTML = `<p class='muted'>${escapeHtml(
          resolved.error
        )}</p>`;
        return;
      }

      const name =
        resolved.name ||
        resolved.player ||
        resolved.nickname ||
        "";

      if (!name) {
        out.innerHTML =
          "<p class='muted'>Could not resolve that ID on this platform.</p>";
        return;
      }

      const banData = await getBanStatus(platform, name);
      // Prefer the ID the user entered over backend one if present
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
    // Platform row on index page
    applyPlatformToButtons("platformRowIndex", "activePlatformLabel");

    // Ensure hidden platform input matches stored platform
    const hidden = document.getElementById("platformSelect");
    if (hidden) {
      hidden.value = getPlatform();
    }

    applyInitialDarkMode();

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
        if (out) {
          out.innerHTML = "<p class='muted'>No results yet.</p>";
        }
        if (input) {
          input.value = "";
        }
      });
    }

    const checkBanBtn = document.getElementById("checkBanBtn");
    if (checkBanBtn) {
      checkBanBtn.addEventListener("click", () =>
        handleLimitedClick(checkBanBtn, () => checkBan())
      );
    }

    const lookupIdBtn = document.getElementById("lookupIdBtn");
    if (lookupIdBtn) {
      lookupIdBtn.addEventListener("click", () =>
        handleLimitedClick(lookupIdBtn, () => lookupById())
      );
    }
  });
})();
