(() => {
  const BATCH_BASE = "https://your-batch-app-name.fly.dev"; // Fly app (damage-agg)
  const BAN_BASE = "/api"; // Same-origin proxy to ban checker backend
  const PLATFORM = "steam";
  const SCAN_TIMEOUT_MS = 0; // no client-side abort; wait for backend to finish

  const $ = id => document.getElementById(id);

  const escapeHtml = str =>
    String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const formatDate = ts => {
    if (!ts) return "Unknown";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return "Unknown";
    }
  };

  const tierFor = s => {
    const m = s.matchesWithDamage || 0;
    const k = s.killsOnYou || 0;
    if (m >= 4 || (m >= 3 && k >= 1)) return { label: "High risk", cls: "high" };
    if (m === 3) return { label: "Suspicious", cls: "mid" };
    return { label: "Low", cls: "low" };
  };

  const setHelper = msg => {
    const h = $("fetchNote");
    if (h) h.textContent = msg;
  };

  const setProgress = msg => {
    const p = $("scanProgress");
    if (!p) return;
    const active = !!msg && !/failed|error/i.test(msg);
    p.classList.toggle("is-scanning", active);
    if (!msg) {
      p.classList.add("hidden");
      p.textContent = "";
    } else {
      p.classList.remove("hidden");
      p.textContent = msg;
    }
  };

  const renderSummary = (count, scanned) => {
    const c = $("suspectCount");
    const chip = $("summaryChip");
    if (c) c.textContent = `${count} suspect${count === 1 ? "" : "s"}`;
    if (chip) chip.textContent = scanned ? `${scanned} matches scanned` : "No scan yet";
  };

  const renderEmpty = msg => {
    const grid = $("suspectGrid");
    if (!grid) return;
    grid.innerHTML = `<p class="empty">${escapeHtml(msg || "No suspects found.")}</p>`;
  };

  const renderBanStatus = (slot, payload) => {
    if (!slot) return;
    const txt = payload?.banStatus || payload?.status || "Unknown";
    const code = (txt || "").toLowerCase();
    let cls = "unknown";
    if (code.includes("perm")) cls = "perm";
    else if (code.includes("temp")) cls = "temp";
    else if (code.includes("not")) cls = "ok";

    slot.innerHTML = `
      <span class="ban-chip ban-${cls}">${escapeHtml(txt)}</span>
      <span class="ban-meta">Clan: ${escapeHtml(payload?.clan || "n/a")}</span>
    `;
  };

  // --- Watchlist (localStorage) ---
  const watchlistKey = () => `watchlist_${PLATFORM}`;
  const readWatchlist = () => {
    try {
      const raw = localStorage.getItem(watchlistKey());
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const saveWatchlist = arr => {
    try {
      localStorage.setItem(watchlistKey(), JSON.stringify(arr || []));
    } catch {
      /* ignore */
    }
  };
  const isInWatchlist = name =>
    readWatchlist().some(entry => (entry.player || "").toLowerCase() === (name || "").toLowerCase());
  const addToWatchlist = (name, meta = {}) => {
    if (!name) return false;
    const list = readWatchlist();
    if (isInWatchlist(name)) return false;
    list.push({
      player: name,
      platform: PLATFORM,
      addedAt: Date.now(),
      ...meta
    });
    saveWatchlist(list);
    return true;
  };

  const buildCard = suspect => {
    const card = document.createElement("div");
    card.className = "suspect-card";

    const tier = tierFor(suspect);
    const avg = suspect.avgDist ? `${suspect.avgDist.toFixed(1)}m` : "n/a";
    const min = suspect.minDist != null ? `${suspect.minDist.toFixed(1)}m` : "n/a";
    const max = suspect.maxDist != null ? `${suspect.maxDist.toFixed(1)}m` : "n/a";

    card.innerHTML = `
      <div class="suspect-top">
        <div>
          <p class="suspect-name">${escapeHtml(suspect.name)}</p>
          <p class="suspect-sub">Last seen: ${escapeHtml(formatDate(suspect.lastSeen))}</p>
        </div>
        <span class="threat-chip threat-${tier.cls}">${escapeHtml(tier.label)}</span>
      </div>
      <div class="suspect-stats">
        <div><strong>${escapeHtml(String(suspect.matchesWithDamage || 0))}</strong><small>matches with damage</small></div>
        <div><strong>${escapeHtml(String(suspect.hits || 0))}</strong><small>hits on you</small></div>
        <div><strong>${escapeHtml(String(suspect.killsOnYou || 0))}</strong><small>kills on you</small></div>
        <div><strong>${escapeHtml(String(suspect.yourKills || 0))}</strong><small>your kills</small></div>
      </div>
      <div class="suspect-dist">
        <span>Avg: ${escapeHtml(avg)}</span>
        <span>Min: ${escapeHtml(min)}</span>
        <span>Max: ${escapeHtml(max)}</span>
      </div>
      <div class="suspect-actions">
        <button class="action primary">Check ban</button>
        <button class="action ghost watch-btn">${isInWatchlist(suspect.name) ? "In watchlist" : "Add to watchlist"}</button>
        <div class="ban-slot muted">No ban check yet.</div>
      </div>
    `;

    const btn = card.querySelector(".action.primary");
    const addBtn = card.querySelector(".watch-btn");
    const slot = card.querySelector(".ban-slot");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Checking...";
      try {
        const resp = await fetch(
          `${BAN_BASE}/check-ban-clan?platform=${encodeURIComponent(PLATFORM)}&player=${encodeURIComponent(
            suspect.name
          )}`
        );
        const data = await resp.json();
        const result = (data?.results || [])[0] || {};
        renderBanStatus(slot, result);
        btn.textContent = "Checked";
      } catch (e) {
        slot.textContent = "Ban check failed";
        btn.textContent = "Retry";
        btn.disabled = false;
        console.error(e);
      }
    });

    if (addBtn) {
      if (isInWatchlist(suspect.name)) {
        addBtn.disabled = true;
      }
      addBtn.addEventListener("click", () => {
        const added = addToWatchlist(suspect.name, { matchesWithDamage: suspect.matchesWithDamage });
        addBtn.textContent = added ? "Added" : "In watchlist";
        addBtn.disabled = true;
      });
    }

    return card;
  };

  const renderSuspects = (suspects, summary) => {
    const grid = $("suspectGrid");
    if (!grid) return;
    grid.innerHTML = "";

    if (!suspects.length) {
      renderEmpty("No damage-based repeats found (3+ matches).");
      renderSummary(0, summary?.matchesScanned || 0);
      return;
    }

    suspects.forEach(s => grid.appendChild(buildCard(s)));
    renderSummary(suspects.length, summary?.matchesScanned || 0);
  };

  const runScan = async () => {
    const input = $("playerNameInput");
    const btn = $("fetchEncountersBtn");
    const username = (input?.value || "").trim();
    if (!username) {
      setHelper("Enter a PUBG username to start.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Scanning...";
    setHelper("");
    setProgress("Deep scan in progress (14 days, damage only). This may take longer than 3 minutes.");
    renderEmpty("Scanning...");

    const fetchScan = async attempt => {
      const url = `${BATCH_BASE}/damage-agg?player=${encodeURIComponent(username)}&platform=${encodeURIComponent(
        PLATFORM
      )}&limit=120&batch=30&sleep_ms=200`;

      try {
        const resp = await fetch(url);
        const data = await resp.json();

        if (!resp.ok) {
          if (resp.status === 404 || (data?.error || "").includes("No Players Found")) {
            throw Object.assign(new Error("Player not found on PUBG API."), { notFound: true });
          }
          throw new Error(data?.error || `Request failed (${resp.status})`);
        }

        return data;
      } catch (err) {
        if (err?.name === "AbortError" && attempt === 1 && SCAN_TIMEOUT_MS > 0) {
          setProgress("Scan timed out, retrying once...");
          return fetchScan(2);
        }
        throw err;
      }
    };

    try {
      const data = await fetchScan(1);

      const suspects = Array.isArray(data?.suspects) ? data.suspects : [];
      renderSuspects(suspects, data?.summary || {});
      setHelper(
        suspects.length
          ? `Showing opponents who damaged ${username} in 3+ matches over the last 14 days.`
          : `No repeat damage found for ${username} in the last 14 days.`
      );
      setProgress("");
    } catch (err) {
      console.error(err);
      renderEmpty("Scan failed. Please try again.");
      renderSummary(0, 0);

      if (err?.notFound) {
        setHelper("Player not found. Check spelling and try again.");
        setProgress("");
      } else {
        const msg =
          err?.name === "AbortError"
            ? "Scan timed out. Server did not respond in time (after retry)."
            : err?.message || "Unknown error.";
        setHelper(`Could not fetch matches: ${msg}`);
        setProgress("Scan failed.");
      }
    } finally {
      btn.disabled = false;
      btn.textContent = "Scan 14 Days";
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    const btn = $("fetchEncountersBtn");
    if (btn) btn.addEventListener("click", runScan);
  });
})();
