/* -------------------------------------------------------
   PUBG Ban Checker - main.js (v1.6 Final)
   ------------------------------------------------------- */

/* ======================
   Ban Checker (Index)
   ====================== */
/* ===== Prevent duplicate script execution ===== */
if (window.__BAN_CHECKER_LOADED__) {
  console.warn("main.js already loaded — skipping duplicate.");
} else {
  window.__BAN_CHECKER_LOADED__ = true;

/* ===== Everything below is your main.js code ===== */

async function checkBan(playerString) {
  const inputElement = document.getElementById("playerInput");
  const players = playerString || (inputElement ? inputElement.value.trim() : "");
  if (!players) return alert("Enter at least one player name.");

  const names = players.split(/[\r\n,]+/).map(n => n.trim()).filter(Boolean);
  if (!names.length) return alert("No valid player names entered.");

  const platform = getActivePlatform();
  const resultsDiv = document.getElementById("results");
  if (resultsDiv) resultsDiv.innerHTML = "<p class='loading'>Checking… please wait</p>";

  try {
    const response = await fetch(
      `https://pubg-ban-checker-backend.onrender.com/check-ban?player=${encodeURIComponent(
        names.join(",")
      )}&platform=${platform}`
    );
    const data = await response.json();
    if (!resultsDiv) return;
    resultsDiv.innerHTML = "";

    if (data.results) {
      data.results.forEach((item, i) => {
        const status = item.banStatus || "Unknown";
        const row = document.createElement("div");
        row.className =
          "player-row " +
          (status === "Not banned" ? "not-banned" :
           status === "Temporarily banned" ? "temp-banned" :
           status === "Permanently banned" ? "perm-banned" : "unknown");
        row.style.animationDelay = `${i * 0.06}s`;
        row.innerHTML = `<strong>${item.player}</strong>${
          item.clan ? ` <span class="clan">[${item.clan}]</span>` : ""
        }<span class="status">${status}</span>`;

        // ✅ Add to Watchlist button
        const wlBtn = document.createElement("button");
        const existing = getWatchlist(platform).some(
          x => (typeof x === "string" ? x : x.name) === item.player
        );

        if (existing) {
          wlBtn.textContent = "Added";
          wlBtn.disabled = true;
          wlBtn.classList.add("added-btn");
        } else {
          wlBtn.textContent = "Add to Watchlist";
          wlBtn.onclick = () => {
            addToWatchlist(item.player, item.clan || null, platform);
            wlBtn.textContent = "Added";
            wlBtn.disabled = true;
            wlBtn.classList.add("added-btn");
          };
        }

        row.appendChild(wlBtn);
        resultsDiv.appendChild(row);
      });
    } else {
      resultsDiv.innerHTML = "No results found.";
    }
  } catch (err) {
    if (resultsDiv) resultsDiv.innerHTML = `<p class='unknown'>Error: ${err}</p>`;
  }
}
function clearResults() {
  const resultsDiv = document.getElementById("results");
  if (resultsDiv) resultsDiv.innerHTML = "<p class='muted'>No results yet.</p>";
}

/* ======================
   Clan Checker (Index)
   ====================== */
async function checkClan() {
  const clanInput = document.getElementById("clanInput");
  const input = clanInput ? clanInput.value.trim() : "";
  if (!input) return alert("Enter at least one player name.");

  const names = input.split(/[\r\n,]+/).map(n => n.trim()).filter(Boolean);
  if (names.length > 2) return alert("Clan checker is limited to 2 names.");

  const resultsDiv = document.getElementById("clanResults");
  if (resultsDiv) resultsDiv.innerHTML = "<p class='loading'>Checking… please wait</p>";

  const platform = getActivePlatform();
  try {
    const response = await fetch(
      `https://pubg-ban-checker-backend.onrender.com/check-ban-clan?player=${encodeURIComponent(
        names.join(",")
      )}&platform=${platform}`
    );
    const data = await response.json();
    if (!resultsDiv) return;
    resultsDiv.innerHTML = "";

    if (data.results) {
      data.results.forEach((item, i) => {
        const status = item.banStatus || "Unknown";
        const row = document.createElement("div");
        row.className =
          "player-row " +
          (status === "Not banned" ? "not-banned" :
           status === "Temporarily banned" ? "temp-banned" :
           status === "Permanently banned" ? "perm-banned" : "unknown");
        row.style.animationDelay = `${i * 0.06}s`;
        row.innerHTML = `<strong>${item.player}</strong>${
          item.clan ? ` <span class="clan">[${item.clan}]</span>` : ""
        }<span class="status">${status}</span><span class="clan-badge shimmer">Clan Mode</span>`;
        resultsDiv.appendChild(row);
      });
    } else {
      resultsDiv.innerHTML = "No results found.";
    }
  } catch (err) {
    if (resultsDiv) resultsDiv.innerHTML = `<p class='unknown'>Error: ${err}</p>`;
  }
}
function clearClanResults() {
  const resultsDiv = document.getElementById("clanResults");
  if (resultsDiv) resultsDiv.innerHTML = "<p class='muted'>No results yet.</p>";
}

/* ======================
   Watchlist (Unified Rows)
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
      rowElement.className =
        "watchlist-player " +
        (status === "Not banned" ? "not-banned" :
         status === "Temporarily banned" ? "temp-banned" :
         status === "Permanently banned" ? "perm-banned" : "unknown");
      rowElement.innerHTML = `
        <strong>${result.player}</strong>
        <span class="status">${status}</span>
        <div class="actions">
          <button class="secondary-btn clear-btn">Clear</button>
          <button class="secondary-btn remove-btn">Remove</button>
        </div>
      `;
      rowElement.querySelector(".clear-btn").onclick = () => renderWatchlist();
      rowElement.querySelector(".remove-btn").onclick = () =>
        removeFromWatchlist(result.player, platform);

      // 🔑 Apply fadeUpRow animation for smooth re-entry
      rowElement.style.opacity = "0";
      rowElement.style.animation = "fadeUpRow 0.5s forwards";
    }
  } catch (err) {
    rowElement.className = "watchlist-player unknown";
    rowElement.innerHTML = `
      <strong>${playerName}</strong>
      <span class="status">Error</span>
      <div class="actions">
        <button class="secondary-btn clear-btn">Clear</button>
        <button class="secondary-btn remove-btn">Remove</button>
      </div>
    `;
    rowElement.querySelector(".clear-btn").onclick = () => renderWatchlist();
    rowElement.querySelector(".remove-btn").onclick = () =>
      removeFromWatchlist(playerName, platform);

    // 🔑 Ensure error rows also fade back in
    rowElement.style.opacity = "0";
    rowElement.style.animation = "fadeUpRow 0.5s forwards";
  }
}

window.renderWatchlist = () => {
  const container = document.getElementById("watchlistPlayersContainer");
  if (!container) return;
  const platform = getActivePlatform();
  const list = getWatchlist(platform);

  container.innerHTML = "";
  if (!list.length) {
    container.innerHTML = '<p class="muted">No players in this platform watchlist yet.</p>';
    return;
  }

  list.forEach(entry => {
    const playerName = typeof entry === "string" ? entry : entry.name;
    const row = document.createElement("div");
    row.className = "watchlist-player neutral";
    row.innerHTML = `
      <strong>${playerName}</strong>
      <div class="actions">
        <button class="check-btn">Check</button>
        <button class="secondary-btn remove-btn">Remove</button>
      </div>
    `;
    row.querySelector(".check-btn").onclick = () =>
      checkSinglePlayer(playerName, row, platform);
    row.querySelector(".remove-btn").onclick = () =>
      removeFromWatchlist(playerName, platform);
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

  // ✅ Fade clear results, clan, and watchlist properly
  const results = document.getElementById("results");
  if (results) {
    results.classList.add("fade-out");
    setTimeout(() => {
      results.innerHTML = "<p class='muted'>No results yet.</p>";
      results.classList.remove("fade-out");
    }, 300);
  }

  const clanResults = document.getElementById("clanResults");
  if (clanResults) {
    clanResults.classList.add("fade-out");
    setTimeout(() => {
      clanResults.innerHTML = "<p class='muted'>No results yet.</p>";
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

  // ✅ Clear input fields on index
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

  // 🧹 Removed direct checkBan binding to avoid double trigger
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
// ===== Secure Request Limiter =====

// Universal limiter helper
async function withLimiter(button, callback) {
  if (!button || button.disabled) return; // prevent spam
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Checking...";
  button.classList.add("disabled");

  try {
    await callback(); // run the real check logic here
  } catch (err) {
    console.error("Check failed:", err);
  } finally {
    // Add a short cooldown to avoid re-click spam
    setTimeout(() => {
      button.disabled = false;
      button.textContent = original;
      button.classList.remove("disabled");
    }, 800);
  }
}

// Wrap main check buttons
const banBtn = document.getElementById("checkBanBtn");
const clanBtn = document.getElementById("checkClanBtn");
const watchAllBtn = document.getElementById("checkAllWatchlistBtn");

// Wrap individual player check buttons (watchlist items)
function attachPlayerCheckLimiters() {
  const playerButtons = document.querySelectorAll(".watchlist-check-btn");
  playerButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      withLimiter(btn, async () => {
        if (typeof window.checkPlayer === "function") {
          await window.checkPlayer(btn.dataset.player);
        } else {
          await new Promise(r => setTimeout(r, 1200)); // demo delay
        }
      });
    });
  });
}

if (banBtn) {
  banBtn.addEventListener("click", () =>
    withLimiter(banBtn, async () => {
      if (typeof window.checkBan === "function") {
        await window.checkBan();
      } else {
        await new Promise(r => setTimeout(r, 1200));
      }
    })
  );
}

if (clanBtn) {
  clanBtn.addEventListener("click", () =>
    withLimiter(clanBtn, async () => {
      if (typeof window.checkClan === "function") {
        await window.checkClan();
      } else {
        await new Promise(r => setTimeout(r, 1200));
      }
    })
  );
}

if (watchAllBtn) {
  watchAllBtn.addEventListener("click", () =>
    withLimiter(watchAllBtn, async () => {
      if (typeof window.checkAllWatchlist === "function") {
        await window.checkAllWatchlist();
      } else {
        await new Promise(r => setTimeout(r, 2000));
      }
    })
  );
}

// Reattach limiters whenever the watchlist updates dynamically
document.addEventListener("watchlistUpdated", attachPlayerCheckLimiters);
} // end duplicate protection block
   


