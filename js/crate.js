(() => {
  const PACK_SIZE = 10;
  const PACK_COST = 1800;

  const tierMeta = {
    mythic: { label: "Mythic", className: "mythic" },
    legendary: { label: "Legendary", className: "legendary" },
    rare: { label: "Rare", className: "rare" },
    uncommon: { label: "Uncommon", className: "uncommon" },
    material: { label: "Polymers", className: "material" }
  };

  const drops = [
    // Mythic / low-rate
    { name: "Chroma Winter Eclipse MP5K (Red Purple)", chance: 0.4, tier: "mythic", group: "chroma" },
    { name: "Winter Eclipse MP5K", chance: 0.9, tier: "mythic", group: "progressive" },
    { name: "Tiger Hunter SLR Battlestat", chance: 0.8, tier: "mythic", group: "battlestat" },
    { name: "Zodiac Killer M416 Battlestat", chance: 0.8, tier: "mythic", group: "battlestat" },
    { name: "Zodiac Killer SKS Battlestat", chance: 0.8, tier: "mythic", group: "battlestat" },
    { name: "Winter Reign AKM Battlestat", chance: 1.5, tier: "mythic", group: "battlestat" },
    { name: "Schematic", chance: 0.9, tier: "mythic", group: "materials" },

    // Legendary
    { name: "Psycho Killer SCAR-L", chance: 1.4, tier: "legendary" },
    { name: "Giftwrapped Kar98", chance: 1.4, tier: "legendary" },
    { name: "Psycho Killer MP5K", chance: 1.4, tier: "legendary" },
    { name: "Barracuda Vector", chance: 1.4, tier: "legendary" },
    { name: "Giftwrapped Beryl M762", chance: 1.4, tier: "legendary" },
    { name: "Gilded Depths K2", chance: 1.4, tier: "legendary" },
    { name: "Feral Flower Crossbow", chance: 1.4, tier: "legendary" },
    { name: "Feral Flower Groza", chance: 1.4, tier: "legendary" },
    { name: "Feral Flower Beryl M762", chance: 1.4, tier: "legendary" },
    { name: "Flower Power AKM", chance: 1.4, tier: "legendary" },
    { name: "Flower Power AWM", chance: 1.4, tier: "legendary" },
    { name: "Flower Power Vector", chance: 1.4, tier: "legendary" },
    { name: "Desert Digital M416", chance: 1.4, tier: "legendary" },
    { name: "Lucky Knight SKS", chance: 1.4, tier: "legendary" },
    { name: "Lucky Knight M24", chance: 1.4, tier: "legendary" },
    { name: "Winter Reign Kar98", chance: 3, tier: "legendary" },
    { name: "Winter Reign S686", chance: 3, tier: "legendary" },

    // Rare
    { name: "Plaid To The Bone M249", chance: 1.89, tier: "rare" },
    { name: "Plaid To The Bone Beryl M762", chance: 1.89, tier: "rare" },
    { name: "Plaid To The Bone VSS", chance: 1.89, tier: "rare" },
    { name: "Slithershot M249", chance: 1.89, tier: "rare" },
    { name: "Snow Flake K2", chance: 1.89, tier: "rare" },
    { name: "Slithershot VSS", chance: 1.89, tier: "rare" },
    { name: "Desert Digital P92", chance: 1.89, tier: "rare" },
    { name: "Desert Digital Mini14", chance: 1.89, tier: "rare" },
    { name: "Desert Digital Kar98", chance: 1.89, tier: "rare" },

    // Uncommon
    { name: "Urban Hunter Crossbow", chance: 2.28, tier: "uncommon" },
    { name: "Urban Hunter Sawed Off", chance: 2.28, tier: "uncommon" },
    { name: "Urban Hunter P92", chance: 2.28, tier: "uncommon" },
    { name: "Pastel Power S1897", chance: 2.28, tier: "uncommon" },
    { name: "Chain Gang S12K", chance: 2.28, tier: "uncommon" },
    { name: "Chain Gang M16A4", chance: 2.28, tier: "uncommon" },
    { name: "Chain Gang Micro UZI", chance: 2.28, tier: "uncommon" },
    { name: "Jungle Prowler G36C", chance: 2.28, tier: "uncommon" },
    { name: "Jungle Prowler P92", chance: 2.28, tier: "uncommon" },
    { name: "Jungle Prowler Sawed Off", chance: 2.28, tier: "uncommon" },
    { name: "Pastel Power R1895", chance: 2.28, tier: "uncommon" },
    { name: "Safari Stripe S12K", chance: 2.28, tier: "uncommon" },
    { name: "Safari Stripe M16A4", chance: 2.28, tier: "uncommon" },
    { name: "Safari Stripe UMP", chance: 2.28, tier: "uncommon" },
    { name: "Desert Digital Win94", chance: 2.28, tier: "uncommon" },
    { name: "Desert Digital Sawed Off", chance: 2.28, tier: "uncommon" },
    { name: "Jungle Digital P18C", chance: 2.28, tier: "uncommon" },

    // Materials
    { name: "200 Polymers", chance: 1, tier: "material", group: "materials" },
    { name: "100 Polymers", chance: 2.5, tier: "material", group: "materials" },
    { name: "50 Polymers", chance: 7.63, tier: "material", group: "materials" }
  ];

  const totalChance = drops.reduce((sum, d) => sum + d.chance, 0);
  const tierRank = { material: 0, uncommon: 1, rare: 2, legendary: 3, mythic: 4 };
  const groupOrder = [
    { key: "chroma", label: "Chroma" },
    { key: "battlestat", label: "Battlestats" },
    { key: "materials", label: "Schematics / Polymers" },
    { key: "other", label: "Everything Else" }
  ];

  const goldHits = new Set([
    "Chroma Winter Eclipse MP5K (Red Purple)",
    "Winter Eclipse MP5K",
    "Tiger Hunter SLR Battlestat",
    "Zodiac Killer M416 Battlestat",
    "Zodiac Killer SKS Battlestat",
    "Winter Reign AKM Battlestat",
    "Schematic"
  ]);

  function getColorCategory(item) {
    if (goldHits.has(item.name)) return "gold";
    // Higher probability get silver, lower get dark
    if (item.chance >= 2) return "silver";
    return "dark";
  }

  const state = {
    spent: 0,
    packs: 0,
    crates: 0,
    currentPack: [],
    collection: new Map(),
    revealed: new Set()
  };

  const elements = {};

  function qs(id) {
    return (elements[id] ||= document.getElementById(id));
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function rollItem() {
    const roll = Math.random() * totalChance;
    let sum = 0;
    for (const item of drops) {
      sum += item.chance;
      if (roll <= sum) {
        return { ...item };
      }
    }
    return { ...drops[drops.length - 1] };
  }

  function updateStats() {
    qs("gcSpent").textContent = state.spent.toLocaleString();
    qs("packsOpened").textContent = state.packs.toString();
    qs("cratesOpened").textContent = state.crates.toString();
  }

  function renderCards(cards) {
    const grid = qs("cardsGrid");
    if (!grid) return;

    grid.innerHTML = "";
    state.revealed.clear();

    const fragment = document.createDocumentFragment();

    cards.forEach((item, idx) => {
      const card = document.createElement("button");
      card.type = "button";
      const gold = goldHits.has(item.name);
      const colorCat = getColorCategory(item);
      const colorClass =
        colorCat === "gold" ? "gold-card" : colorCat === "silver" ? "silver-card" : "dark-card";
      card.className = `crate-card ${tierMeta[item.tier]?.className || ""} ${gold ? "gold-card" : ""} ${colorClass} fade-in`;
      card.setAttribute("aria-label", `Crate ${idx + 1}: ${item.name}`);
      card.setAttribute("data-idx", String(idx));

      card.innerHTML = `
        <div class="card-inner">
          <div class="card-face card-cover">
            <span class="card-index">Crate ${idx + 1}</span>
            <span class="flip-hint">Flip</span>
          </div>
          <div class="card-face card-reveal">
            <p class="item-tier">${escapeHtml(tierMeta[item.tier]?.label || "Drop")}</p>
            <p class="item-name">${escapeHtml(item.name)}</p>
            <p class="item-chance">${item.chance}% chance</p>
          </div>
        </div>
      `;

      card.addEventListener("click", () => revealCard(idx));

      fragment.appendChild(card);
    });

    grid.appendChild(fragment);
  }

  function renderCollection() {
    const grid = qs("collectionGrid");
    if (!grid) return;

    if (!state.collection.size) {
      grid.innerHTML = "<p class=\"muted\">No drops yet. Open a pack to build your collection.</p>";
      return;
    }

    const bucket = new Map();
    state.collection.forEach(entry => {
      const key = entry.item.group || "other";
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key).push(entry);
    });

    const fragment = document.createDocumentFragment();
    groupOrder.forEach(group => {
      const entries = bucket.get(group.key);
      if (!entries || !entries.length) return;

      entries.sort((a, b) => {
        const countDiff = b.count - a.count;
        if (countDiff !== 0) return countDiff;
        const tierDiff = (tierRank[b.item.tier] || 0) - (tierRank[a.item.tier] || 0);
        if (tierDiff !== 0) return tierDiff;
        return a.item.chance - b.item.chance;
      });

      const wrap = document.createElement("div");
      wrap.className = "collection-group fade-in";
      const title = document.createElement("h3");
      title.textContent = group.label;
      wrap.appendChild(title);

      entries.forEach(({ item, count }) => {
        const row = document.createElement("div");
        row.className = "drop-row";
        row.innerHTML = `
          <div>
            <div class="label">${escapeHtml(tierMeta[item.tier]?.label || "Drop")}</div>
            <div>${escapeHtml(item.name)}</div>
          </div>
          <div class="chance">${count}x</div>
        `;
        wrap.appendChild(row);
      });

      fragment.appendChild(wrap);
    });

    grid.innerHTML = "";
    grid.appendChild(fragment);
  }

  function renderProgressive() {
    const grid = qs("progressiveGrid");
    if (!grid) return;

    const items = ["Chroma Winter Eclipse MP5K (Red Purple)", "Winter Eclipse MP5K"];
    const fragment = document.createDocumentFragment();

    items.forEach(name => {
      const entry = state.collection.get(name);
      const item = drops.find(d => d.name === name);
      const count = entry ? entry.count : 0;

      const row = document.createElement("div");
      row.className = "drop-row";
      row.innerHTML = `
        <div>
          <div class="label">Progressive</div>
          <div>${escapeHtml(name)}</div>
        </div>
        <div class="chance">${count}x</div>
      `;
      fragment.appendChild(row);
    });

    grid.innerHTML = "";
    grid.appendChild(fragment);
  }

  function bestHit(cards) {
    if (!cards.length) return "--";
    const best = cards.reduce((top, item) => {
      if (!top) return item;
      const rankDiff = (tierRank[item.tier] || 0) - (tierRank[top.tier] || 0);
      if (rankDiff > 0) return item;
      if (rankDiff === 0 && item.chance < top.chance) return item;
      return top;
    }, null);
    return best ? `${best.name} (${tierMeta[best.tier]?.label || "Drop"})` : "--";
  }

  function setBestHit(cards) {
    const target = qs("bestHit");
    if (!target) return;
    target.textContent = bestHit(cards);
  }

  function revealedCards() {
    return state.currentPack.filter((_, idx) => state.revealed.has(idx));
  }

  function revealCard(idx) {
    if (!state.currentPack[idx]) return;
    if (state.revealed.has(idx)) return;
    state.revealed.add(idx);

    const card = document.querySelector(`.crate-card[data-idx="${idx}"]`);
    if (card) card.classList.add("flipped");

    const item = state.currentPack[idx];
    const existing = state.collection.get(item.name);
    if (existing) {
      existing.count += 1;
    } else {
      state.collection.set(item.name, { item, count: 1 });
    }

    const revealed = revealedCards();
    renderCollection();
    renderProgressive();
    setBestHit(revealed);

    if (state.revealed.size >= PACK_SIZE) {
      const openBtn = qs("openPackBtn");
      if (openBtn) openBtn.disabled = false;
    }
  }

  function openPack() {
    const results = Array.from({ length: PACK_SIZE }, () => rollItem());
    state.currentPack = results;
    state.revealed.clear();
    state.packs += 1;
    state.spent += PACK_COST;
    state.crates += PACK_SIZE;

    renderCards(results);
    setBestHit([]);
    renderCollection();
    renderProgressive();
    updateStats();

    const revealBtn = qs("revealAllBtn");
    if (revealBtn) revealBtn.disabled = false;

    const openBtn = qs("openPackBtn");
    if (openBtn) openBtn.disabled = true;
  }

  function revealAll() {
    state.currentPack.forEach((_, idx) => revealCard(idx));
    const revealBtn = qs("revealAllBtn");
    if (revealBtn) revealBtn.disabled = true;
  }

  function resetSim() {
    state.spent = 0;
    state.packs = 0;
    state.crates = 0;
    state.currentPack = [];
    state.collection.clear();
    state.revealed.clear();

    qs("cardsGrid").innerHTML = `<p class="muted">Open a 10-pack to start flipping.</p>`;
    qs("bestHit").textContent = "--";
    renderCollection();
    renderProgressive();
    updateStats();

    const revealBtn = qs("revealAllBtn");
    if (revealBtn) revealBtn.disabled = true;

    const openBtn = qs("openPackBtn");
    if (openBtn) openBtn.disabled = false;
  }

  document.addEventListener("DOMContentLoaded", () => {
    updateStats();
    renderCollection();
    renderProgressive();

    const openBtn = qs("openPackBtn");
    if (openBtn) openBtn.addEventListener("click", openPack);

    const revealBtn = qs("revealAllBtn");
    if (revealBtn) revealBtn.addEventListener("click", revealAll);

    const resetBtn = qs("resetBtn");
    if (resetBtn) resetBtn.addEventListener("click", resetSim);
  });
})();
