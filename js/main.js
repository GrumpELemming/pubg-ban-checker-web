/* -------------------------------------------------------
   PUBG Ban Checker - main.js (v1.6 Secure)
   ------------------------------------------------------- */

function createElem(tag, text, cls) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

/* ======================
   Ban Checker (Index)
   ====================== */
async function checkBan(playerString) {
  const inputElement = document.getElementById("playerInput");
  const players = playerString || (inputElement ? inputElement.value.trim() : "");
  if (!players) return alert("Enter at least one player name.");

  const names = players.split(/[\r\n,]+/).map(n => n.trim()).filter(Boolean);
  if (!names.length) return alert("No valid player names entered.");

  const platform = getActivePlatform();
  const resultsDiv = document.getElementById("results");
  if (resultsDiv) {
    resultsDiv.replaceChildren(createElem("p", "Checking… please wait", "loading"));
  }

  try {
    const response = await fetch(
      `https://pubg-ban-checker-backend.onrender.com/check-ban?player=${encodeURIComponent(
        names.join(",")
      )}&platform=${platform}`
    );
    const data = await response.json();
    if (!resultsDiv) return;
    resultsDiv.replaceChildren();

    if (data.results) {
      data.results.forEach((item, i) => {
        const status = item.banStatus || "Unknown";
        const row = createElem("div", null, "player-row");
        const statusClass =
          status === "Not banned" ? "not-banned" :
          status === "Temporarily banned" ? "temp-banned" :
          status === "Permanently banned" ? "perm-banned" : "unknown";
        row.classList.add(statusClass);
        row.style.animationDelay = `${i * 0.06}s`;

        const strong = createElem("strong", item.player);
        row.appendChild(strong);

        if (item.clan) {
          const clan = createElem("span", `[${item.clan}]`, "clan");
          row.appendChild(document.createTextNode(" "));
          row.appendChild(clan);
        }

        const spanStatus = createElem("span", status, "status");
        row.appendChild(spanStatus);

        const wlBtn = createElem("button", "Add to Watchlist");
        const existing = getWatchlist(platform).some(
          x => (typeof x === "string" ? x : x.name) === item.player
        );

        if (existing) {
          wlBtn.textContent = "Added";
          wlBtn.disabled = true;
          wlBtn.classList.add("added-btn");
        } else {
          wlBtn.addEventListener("click", () => {
            addToWatchlist(item.player, item.clan || null, platform);
            wlBtn.textContent = "Added";
            wlBtn.disabled = true;
            wlBtn.classList.add("added-btn");
          });
        }

        row.appendChild(wlBtn);
        resultsDiv.appendChild(row);
      });
    } else {
      resultsDiv.replaceChildren(createElem("p", "No results found.", "muted"));
    }
  } catch (err) {
    if (resultsDiv) {
      const p = createElem("p", `Error: ${err}`, "unknown");
      resultsDiv.replaceChildren(p);
    }
  }
}

function clearResults() {
  const resultsDiv = document.getElementById("results");
  if (resultsDiv)
    resultsDiv.replaceChildren(createElem("p", "No results yet.", "muted"));
}

/* ======================
   Clan Checker
   ====================== */
async function checkClan() {
  const clanInput = document.getElementById("clanInput");
  const input = clanInput ? clanInput.value.trim() : "";
  if (!input) return alert("Enter at least one player name.");

  const names = input.split(/[\r\n,]+/).map(n => n.trim()).filter(Boolean);
  if (names.length > 2) return alert("Clan checker is limited to 2 names.");

  const resultsDiv = document.getElementById("clanResults");
  if (resultsDiv)
    resultsDiv.replaceChildren(createElem("p", "Checking… please wait", "loading"));

  const platform = getActivePlatform();
  try {
    const response = await fetch(
      `https://pubg-ban-checker-backend.onrender.com/check-ban-clan?player=${encodeURIComponent(
        names.join(",")
      )}&platform=${platform}`
    );
    const data = await response.json();
    if (!resultsDiv) return;
    resultsDiv.replaceChildren();

    if (data.results) {
      data.results.forEach((item, i) => {
        const status = item.banStatus || "Unknown";
        const row = createElem("div", null, "player-row");
        const statusClass =
          status === "Not banned" ? "not-banned" :
          status === "Temporarily banned" ? "temp-banned" :
          status === "Permanently banned" ? "perm-banned" : "unknown";
        row.classList.add(statusClass);
        row.style.animationDelay = `${i * 0.06}s`;

        const strong = createElem("strong", item.player);
        row.appendChild(strong);

        if (item.clan) {
          const clan = createElem("span", `[${item.clan}]`, "clan");
          row.appendChild(document.createTextNode(" "));
          row.appendChild(clan);
        }

        const spanStatus = createElem("span", status, "status");
        const clanBadge = createElem("span", "Clan Mode", "clan-badge shimmer");
        row.appendChild(spanStatus);
        row.appendChild(clanBadge);
        resultsDiv.appendChild(row);
      });
    } else {
      resultsDiv.replaceChildren(createElem("p", "No results found.", "muted"));
    }
  } catch (err) {
    if (resultsDiv)
      resultsDiv.replaceChildren(createElem("p", `Error: ${err}`, "unknown"));
  }
}

function clearClanResults() {
  const resultsDiv = document.getElementById("clanResults");
  if (resultsDiv)
    resultsDiv.replaceChildren(createElem("p", "No results yet.", "muted"));
}

/* ======================
   Watchlist
   ====================== */
async function checkSinglePlayer(playerName, rowElement, platform) {
  if (!playerName) return;
  try {
    const response = await fetch(
      `https://pubg-ban-checker-backend.onrender.com/check-ban?player=${encodeURIComponent(
        playerName
      )}&platform=${platform}`
    );
    const data = await response.json();
    const result = data.results && data.results[0];
    if (result) {
      const status = result.banStatus || "Unknown";
      const cls =
        status === "Not banned" ? "not-banned" :
        status === "Temporarily banned" ? "temp-banned" :
        status === "Permanently banned" ? "perm-banned" : "unknown";
      rowElement.className = `watchlist-player ${cls}`;

      rowElement.replaceChildren(
        createElem("strong", result.player),
        createElem("span", status, "status")
      );

      const actions = createElem("div", null, "actions");
      const clearBtn = createElem("button", "Clear", "secondary-btn clear-btn");
      const removeBtn = createElem("button", "Remove", "secondary-btn remove-btn");
      clearBtn.addEventListener("click", () => renderWatchlist());
      removeBtn.addEventListener("click", () =>
        removeFromWatchlist(result.player, platform)
      );
      actions.append(clearBtn, removeBtn);
      rowElement.appendChild(actions);

      rowElement.style.opacity = "0";
      rowElement.style.animation = "fadeUpRow 0.5s forwards";
    }
  } catch (err) {
    rowElement.className = "watchlist-player unknown";
    rowElement.replaceChildren(
      createElem("strong", playerName),
      createElem("span", "Error", "status")
    );
    const actions = createElem("div", null, "actions");
    const clearBtn = createElem("button", "Clear", "secondary-btn clear-btn");
    const removeBtn = createElem("button", "Remove", "secondary-btn remove-btn");
    clearBtn.addEventListener("click", () => renderWatchlist());
    removeBtn.addEventListener("click", () =>
      removeFromWatchlist(playerName, platform)
    );
    actions.append(clearBtn, removeBtn);
    rowElement.appendChild(actions);
    rowElement.style.opacity = "0";
    rowElement.style.animation = "fadeUpRow 0.5s forwards";
  }
}

window.renderWatchlist = () => {
  const container = document.getElementById("watchlistPlayersContainer");
  if (!container) return;
  const platform = getActivePlatform();
  const list = getWatchlist(platform);

  container.replaceChildren();
  if (!list.length) {
    container.replaceChildren(
      createElem("p", "No players in this platform watchlist yet.", "muted")
    );
    return;
  }

  list.forEach(entry => {
    const playerName = typeof entry === "string" ? entry : entry.name;
    const row = createElem("div", null, "watchlist-player neutral");

    const strong = createElem("strong", playerName);
    const actions = createElem("div", null, "actions");
    const checkBtn = createElem("button", "Check", "check-btn");
    const removeBtn = createElem("button", "Remove", "secondary-btn remove-btn");
    checkBtn.addEventListener("click", () => checkSinglePlayer(playerName, row, platform));
    removeBtn.addEventListener("click", () => removeFromWatchlist(playerName, platform));
    actions.append(checkBtn, removeBtn);
    row.append(strong, actions);
    container.appendChild(row);
  });
};

/* Watchlist storage helpers */
const KEY = p => `watchlist_${p}`;
(function () {
  const old = localStorage.getItem("watchlist");
  if (old && !localStorage.getItem(KEY("steam"))) {
    localStorage.setItem(KEY("steam"), old);
    localStorage.removeItem("watchlist");
  }
})();
window.getWatchlist = (p = getActivePlatform()) =>
  JSON.parse(localStorage.getItem(KEY(p)) || "[]");
window.storeWatchlist = (n, p = getActivePlatform()) =>
  localStorage.setItem(KEY(p), JSON.stringify(n));
window.addToWatchlist = (n, c = null, p = getActivePlatform()) => {
  if (!n) return;
  const e = getWatchlist(p);
  const b = x => (typeof x === "string" ? x : x.name);
  const merged = [c ? { name: n, clan: c } : n, ...e].reduce(
    (a, i) => (a.some(x => b(x) === b(i)) ? a : [...a, i]),
    []
  );
  storeWatchlist(merged.slice(0, 50), p);
  renderWatchlist();
};
window.removeFromWatchlist = (n, p = getActivePlatform()) => {
  const b = x => (typeof x === "string" ? x : x.name);
  storeWatchlist(getWatchlist(p).filter(x => b(x) !== n), p);
  renderWatchlist();
};
window.clearWatchlist = () => {
  storeWatchlist([], getActivePlatform());
  renderWatchlist();
};
window.checkAllWatchlist = () => {
  const platform = getActivePlatform();
  const container = document.getElementById("watchlistPlayersContainer");
  if (!container) return;
  const rows = container.querySelectorAll(".watchlist-player.neutral");

  rows.forEach((row, i) => {
    const name = row.querySelector("strong").textContent;
    setTimeout(() => {
      checkSinglePlayer(name, row, platform);
    }, i * 300);
  });
};

/* ======================
   Platform Selector
   ====================== */
function getActivePlatform() {
  const h = document.getElementById("platformSelect");
  return (h && h.value) || localStorage.getItem("activePlatform") || "steam";
}
function setActivePlatform(p) {
  const h = document.getElementById("platformSelect");
  if (h) h.value = p;
  localStorage.setItem("activePlatform", p);

  document.querySelectorAll(".platform-row").forEach(r => {
    r.querySelectorAll(".platform-btn").forEach(b => {
      const isActive = b.dataset.platform === p;
      b.classList.toggle("active", isActive);
      b.classList.remove("steam", "xbox", "psn", "kakao");
      if (isActive) b.classList.add(p);
      b.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  });

  const results = document.getElementById("results");
  if (results) {
    results.classList.add("fade-out");
    setTimeout(() => {
      results.replaceChildren(createElem("p", "No results yet.", "muted"));
      results.classList.remove("fade-out");
    }, 300);
  }

  const clanResults = document.getElementById("clanResults");
  if (clanResults) {
    clanResults.classList.add("fade-out");
    setTimeout(() => {
      clanResults.replaceChildren(createElem("p", "No results yet.", "muted"));
      clanResults.classList.remove("fade-out");
    }, 300);
  }

  const wlContainer = document.getElementById("watchlistPlayersContainer");
  if (wlContainer) {
    wlContainer.classList.add("fade-out");
    setTimeout(() => {
      renderWatchlist();
      wlContainer.classList.remove("fade-out");
    }, 300);
  }

  const playerInput = document.getElementById("playerInput");
  if (playerInput) playerInput.value = "";
  const clanInput = document.getElementById("clanInput");
  if (clanInput) clanInput.value = "";
}
function setupPlatformRow(rid, hid) {
  const r = document.getElementById(rid);
  const h = document.getElementById(hid);
  if (!r || !h) return;
  const last = localStorage.getItem("activePlatform") || "steam";
  h.value = h.value || last;
  r.querySelectorAll(".platform-btn").forEach(b => {
    const p = b.dataset.platform;
    b.classList.toggle("active", p === h.value);
    b.setAttribute("aria-selected", p === h.value ? "true" : "false");
    b.addEventListener("click", () => setActivePlatform(p));
  });
}

/* ======================
   Init
   ====================== */
window.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("platformRowIndex"))
    setupPlatformRow("platformRowIndex", "platformSelect");
  if (document.getElementById("platformRowWatchlist"))
    setupPlatformRow("platformRowWatchlist", "platformSelect");
  if (document.getElementById("watchlistPlayersContainer")) renderWatchlist();

  document.getElementById("checkBanBtn")?.addEventListener("click", () => checkBan());
  document.getElementById("clearResultsBtn")?.addEventListener("click", () => clearResults());
  document.getElementById("checkClanBtn")?.addEventListener("click", () => checkClan());
  document.getElementById("clearClanBtn")?.addEventListener("click", () => clearClanResults());
  document.getElementById("checkAllWatchlistBtn")?.addEventListener("click", () => checkAllWatchlist());
  document.getElementById("clearWatchlistBtn")?.addEventListener("click", () => clearWatchlist());
});

/* ======================
   Dark Mode
   ====================== */
const darkToggle = document.getElementById("darkModeToggle");
if (darkToggle) {
  darkToggle.addEventListener("change", () => {
    document.body.classList.toggle("dark-mode", darkToggle.checked);
    localStorage.setItem("darkMode", darkToggle.checked);
  });
  darkToggle.checked = localStorage.getItem("darkMode") === "true";
  document.body.classList.toggle("dark-mode", darkToggle.checked);
}

/* ======================
   Secure Request Limiter
   ====================== */
async function withLimiter(button, callback) {
  if (!button || button.disabled) return;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Checking...";
  button.classList.add("disabled");
  try { await callback(); }
  catch (err) { console.error("Check failed:", err); }
  finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = original;
      button.classList.remove("disabled");
    }, 800);
  }
}
