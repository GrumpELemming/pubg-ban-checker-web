/* -------------------------------------------------------
   PUBG Ban Checker
   main.js
   v1.9 Final - Clan + ID + Ban Label + New Resolver
   ------------------------------------------------------- */
(() => {
  const BASE_URL = "https://pubg-ban-checker-backend.onrender.com";

  // Helpers / constants
  const LS_PLATFORM = "selectedPlatform";
  const LS_DARK = "darkMode";
  const LS_WATCHLIST_PREFIX = "watchlist_";

  const MAX_RATE_LIMIT_ATTEMPTS = 3;
  const INITIAL_RETRY_DELAY = 700;

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

/* -------------------------------------------------------
   Platform setup (with shimmer + auto-clear + input reset)
   ------------------------------------------------------- */
function getPlatform() {
  return localStorage.getItem(LS_PLATFORM) || "steam";
}

function setPlatform(p) {
  localStorage.setItem(LS_PLATFORM, p);
  document.getElementById("platformSelect").value = p;
  highlightPlatform(p);
  shimmerPlatformRow();

  // Clear results & ID lookup on switch
  const results = document.getElementById("results");
  if (results) {
    results.innerHTML = "<p class='muted'>No results yet.</p>";
  }
  const idResults = document.getElementById("idLookupResults");
  if (idResults) {
    idResults.innerHTML = "<p class='muted'>No results yet.</p>";
  }

  // Clear player input box
  const input = document.getElementById("playerInput");
  if (input) {
    input.value = "";
  }
}

function highlightPlatform(p) {
  document.querySelectorAll(".platform-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.platform === p)
  );
}

function shimmerPlatformRow() {
  const row = document.getElementById("platformRowIndex");
  if (!row) return;
  row.classList.add("shimmer");
  setTimeout(() => row.classList.remove("shimmer"), 600);
}

function setupPlatforms() {
  const p = getPlatform();
  highlightPlatform(p);

  // click on Steam / Xbox / PSN / Kakao buttons
  document.querySelectorAll(".platform-btn").forEach(b =>
    b.addEventListener("click", () => setPlatform(b.dataset.platform))
  );

  // Wait until DOM + checkBan are ready before wiring Enter key
  window.addEventListener("load", () => {
    const input = document.getElementById("playerInput");
    if (!input) return;

    input.addEventListener("keydown", async e => {
      // allow Shift+Enter for new line, Enter alone to submit
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (typeof window.checkBan === "function") {
          await window.checkBan();
          input.value = ""; // clear AFTER results are shown
        } else {
          console.warn("checkBan not ready yet");
        }
      }
    });
  });
}



  // ---------- Dark mode ----------
  function initDark() {
    const dark = localStorage.getItem(LS_DARK) === "true";
    document.body.classList.toggle("dark-mode", dark);
    const toggle = document.getElementById("darkModeToggle");
    if (toggle) {
      toggle.checked = dark;
      toggle.addEventListener("change", () => {
        localStorage.setItem(LS_DARK, toggle.checked ? "true" : "false");
        document.body.classList.toggle("dark-mode", toggle.checked);
      });
    }
  }

  // ---------- Watchlist ----------
  function getWatchlistKey(p) {
    return LS_WATCHLIST_PREFIX + p;
  }
  function getWatchlist(p) {
    try {
      return JSON.parse(localStorage.getItem(getWatchlistKey(p)) || "[]");
    } catch {
      return [];
    }
  }
  function saveWatchlist(p, arr) {
    localStorage.setItem(getWatchlistKey(p), JSON.stringify(arr));
  }
  function addWatchlist(name, id, clan, p, status) {
    if (!id) return;
    const list = getWatchlist(p);
    if (!list.some(e => e.accountId === id)) {
      list.push({
        accountId: id,
        lastKnownName: name,
        clan: clan || "None",
        lastStatus: status || "Unknown"
      });
      saveWatchlist(p, list);
    }
  }

  // ---------- Backend calls ----------
  async function getBanStatus(platform, playerName) {
    const url = `${BASE_URL}/check-ban-clan?platform=${encodeURIComponent(platform)}&player=${encodeURIComponent(
      playerName
    )}`;
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
              statusText: "Rate limited by backend. Please wait a moment and try again."
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
        if (data.error)
          return { player: playerName, accountId: "", clan: "", statusText: data.error };

        const result = (data.results || []).find(
          r => r.player.toLowerCase() === playerName.toLowerCase()
        );
        if (!result)
          return { player: playerName, accountId: "", clan: "", statusText: "Unknown" };

        return {
          player: result.player,
          accountId: result.accountId || "",
          clan: result.clan || "",
          statusText: result.banStatus || "Unknown"
        };
      } catch (err) {
        attempt += 1;
        if (attempt >= MAX_RATE_LIMIT_ATTEMPTS) {
          return { player: playerName, accountId: "", clan: "", statusText: String(err) };
        }
        await wait(delayMs);
        delayMs *= 1.6;
      }
    }

    return { player: playerName, accountId: "", clan: "", statusText: "Unknown" };
  }

  async function resolveById(id, platform) {
    try {
      const res = await fetch(
        `${BASE_URL}/resolve?platform=${encodeURIComponent(platform)}&id=${encodeURIComponent(id)}`
      );
      return await res.json();
    } catch (err) {
      return { error: String(err) };
    }
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
    } else {
      row.classList.add("unknown");
    }

    const hasDetail =
      statusText && statusText.toLowerCase() !== label.toLowerCase() && label === "Unknown";

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
      addWatchlist(player, accountId, clan, getPlatform(), label);
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
    const names = document
      .getElementById("playerInput")
      .value.split(/[\n,]+/)
      .map(x => x.trim())
      .filter(Boolean)
      .slice(0, 10);
    if (!names.length) {
      results.innerHTML = "<p class='muted'>Please enter names.</p>";
      return;
    }

    const p = getPlatform();
    results.innerHTML = "";

    for (const n of names) {
      const loading = buildRow({
        player: n,
        accountId: "...",
        clan: "...",
        statusText: "Checking..."
      });
      results.append(loading);

      const data = await getBanStatus(p, n);

      const final = buildRow(data);
      results.replaceChild(final, loading);
    }
  }
  window.checkBan = checkBan;

/* -------------------------------------------------------
   ID Lookup (fully working + clan + ban + error handling)
   ------------------------------------------------------- */
async function lookupById() {
  const input = document.getElementById("accountIdInput");
  const out = document.getElementById("idLookupResults");
  const id = input.value.trim();
  const platform = getPlatform();

  if (!id) {
    out.innerHTML = "<p class='muted'>Enter an ID.</p>";
    return;
  }

  out.innerHTML = "<p class='muted'>Looking up...</p>";

  try {
    // Step 1: Resolve ID → current name
    const res = await fetch(
      `${BASE_URL}/resolve?platform=${encodeURIComponent(platform)}&id=${encodeURIComponent(id)}`
    );
    const resolved = await res.json();

    if (resolved.error || !resolved.currentName) {
      out.innerHTML = `<p class='muted'>Unable to resolve ID. ${escapeHtml(resolved.error || "")}</p>`;
      return;
    }

    const playerName = resolved.currentName;
    const accountId = resolved.accountId || id;

    // Step 2: Get ban + clan info
    const banRes = await fetch(
      `${BASE_URL}/check-ban-clan?platform=${encodeURIComponent(platform)}&player=${encodeURIComponent(playerName)}`
    );
    const banData = await banRes.json();

    let clan = "Unknown";
    let statusText = "Unknown";

    if (banData.results && banData.results.length > 0) {
      const r = banData.results.find(
        e => e.player.toLowerCase() === playerName.toLowerCase()
      ) || banData.results[0];
      clan = r.clan || "None";
      statusText = r.banStatus || "Unknown";
    }

    // Step 3: Build result row
    const final = {
      player: playerName,
      accountId,
      clan,
      statusText,
    };

    const row = buildRow(final, platform, false);
    out.innerHTML = "";
    out.append(row);

  } catch (err) {
    console.error("lookupById error:", err);
    out.innerHTML = `<p class='muted'>Error fetching data: ${escapeHtml(String(err))}</p>`;
  }
}
window.lookupById = lookupById;



  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", () => {
    setupPlatforms();
    initDark();

    document.getElementById("clearResultsBtn").onclick = () => {
      document.getElementById("results").innerHTML = "<p class='muted'>No results yet.</p>";
    };

    document.getElementById("clearIdBtn").onclick = () => {
      document.getElementById("accountIdInput").value = "";
      document.getElementById("idLookupResults").innerHTML =
        "<p class='muted'>No results yet.</p>";
    };
  });
})();

