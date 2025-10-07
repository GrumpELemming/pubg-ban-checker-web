window.addEventListener('DOMContentLoaded', () => {
/*******************************************************
 * Red13 – Crate System (v0.99 Stable)
 * Perfect crate screen — full working drop + quip + label
 *******************************************************/
(() => {
  const cratesScreen = document.getElementById("crates");
  const crateImg     = document.getElementById("crateImg");
  const rewardCard   = document.getElementById("rewardCard");
  const rewardName   = document.getElementById("rewardName");

  // === Economy ===
  const LS_BP = "red13_bp";
  const LS_GC = "red13_gc";
  const getBP = () => parseInt(localStorage.getItem(LS_BP) || "0", 10);
  const getGC = () => parseInt(localStorage.getItem(LS_GC) || "0", 10);
  const setBP = (v) => localStorage.setItem(LS_BP, String(Math.max(0, v | 0)));
  const setGC = (v) => localStorage.setItem(LS_GC, String(Math.max(0, v | 0)));

  // === Costs ===
  const COST_BP_OUTFIT = 5000;
  const COST_GC_WEAPON = 20;

  // === CRATE DATA (Weapons / Clothes) ===
  const CRATE_DATA = {
    weapons: [
      { name: "P1911 - Water Pistol", quip: "Are you serious? It's not even summer." },
      { name: "Beryl M762 - Polish Flag", quip: "Great. Just what I need—a reminder that Poland created the weapon I hate." },
      { name: "Beryl M762 - Nerf Gun", quip: "WHYYYYYYYY I HATE IT HERE!" },
      { name: "P18-C - Confetti Effect", quip: "OMG WHAT IS THIS?! You planning a party or a firefight?" },
      { name: "MP5K - Technicolour Rabbit", quip: "More cotton candy bullshit. I'd give this to Schnee if he didn't hate SMGs." },
      { name: "Beryl M762 - Candy Floss", quip: "Just what we need, more cotton candy bullshit." },
      { name: "Beryl M762 - Rainbow Pillar", quip: "Finally, a Pillar skin... ARE YOU KIDDING ME? NOOOOOOOOOOO I HATE IT HERE!" },
      { name: "Beryl M762 - Flower Power", quip: "If I see another Beryl, I'm going to play Tarkov PVE." },
      { name: "Beryl M762 - BlackPink", quip: "K-Pop and Beryl. It couldn't get any worse." },
      { name: "Beryl M762 - Aespa", quip: "All I want is my Pillar DBS and Pillar Set—instead I get K-Pop cotton candy." },
      { name: "M416 - Pizza", quip: "I like pizza. I like the M416. I HATE THIS SKIN." },
      { name: "Beryl M762 - The Devil Made Me Do It", quip: "And Jesus made me uninstall this game." },
      { name: "Beryl M762 - Bubblegum Fury", quip: "Nothing says professional like a gun that looks like a toddler's lunchbox." },
      { name: "Beryl M762 - Unicorn Vomit Edition", quip: "They taste the rainbow... I choke on the recoil." },
      { name: "DBS - Glitter Boom", quip: "Congratulations, you've weaponized a craft store." },
      { name: "DBS - Cotton Candy Carnage", quip: "Sweet on the outside, trauma on the inside." },
      { name: "Beryl M762 - Rapture's Knockers", quip: "Why did it have to be the Beryl... WHYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY!" },
      { name: "Beryl M762 - Skibidi Toilet", quip: "Where’s Tarkov? Oh well, at least the sweats can use a skin that matches their appearance." }
    ],
    clothes: [
      { name: "Ice Lolly Hoodie", quip: "Seriously, another cotton candy skin?" },
      { name: "Glow-Up In The Dark TGLTN Set", quip: "Did you mistake me for Schneefuchs?" },
      { name: "Proper Pink Vest Level 1", quip: "They finally added a Level 1 vest and it's for Bianca and QWQ." },
      { name: "Pikachu Set With Mask", quip: "Gotta collect them all... then throw them in the trash where they belong." },
      { name: "Hippy Tie-Dye Military Camo Set", quip: "Can't they just be serious for once?" },
      { name: "Panda Set With Mask", quip: "Great, more furry skins. Get that shit out of my face." },
      { name: "Sheep Set With Mask", quip: "Bahhhhhhhhhhhhhhhhhhh no. Bah-bullshit." },
      { name: "Cat Ears", quip: "If I'm going to die, I want to look cool doing it. I DON'T WANT TO LOOK LIKE A FUCKING CAT!" },
      { name: "Donut Mask", quip: "About time we got something nice. Nope—a creepy donut-ass mask." },
      { name: "Jammer Pack - Technicolour", quip: "I'd rather die in the blue a thousand more times than pick that up." },
      { name: "Banana Suit", quip: "Yeah, nothing screams stealth like being bright yellow." },
      { name: "Chicken Mask", quip: "Perfect. Now you can cluck while you die." },
      { name: "Coca-Cola Tracksuit", quip: "Because nothing hydrates better than 42 grams of sugar." },
      { name: "Inflatable Lifeguard Vest Level 1", quip: "Ideal for drowning in the blue zone and self-pity." },
      { name: "TV Head", quip: "I'm going to Tarkov PVE till this brainrot blows over." },
      { name: "Skibidi Toilet Mask", quip: "As if bunnies and cotton candy weren't enough, enter brain rot." },
      { name: "Emil Mask", quip: "I refuse to look like Lem in this game." }
    ]
  };

  // === HUD ===
  window.refreshCrateHUD = function refreshCrateHUD() {
    const g = document.getElementById("crHudGC");
    const b = document.getElementById("crHudBP");
    if (!g || !b) return;
    g.textContent = getGC().toLocaleString();
    b.textContent = getBP().toLocaleString();
  };

  // === Crate Buttons ===
  const wrap = document.createElement("div");
  wrap.className = "crate-options";

  const makeBtn = (id, img, label, cost, type) => {
    const el = document.createElement("div");
    el.className = "crate-card";
    el.id = id;
    el.innerHTML = `
      <div class="crate-row">
        <div class="crate-thumb"><img src="assets/${img}" alt="${label}"></div>
        <div><div class="crate-name">${label}</div>
        <div class="crate-cost"><span class="cost-good">${cost}</span></div></div>
      </div>`;
    el.addEventListener("click", () => buyCrate(type));
    return el;
  };

  const outfitBtn = makeBtn("buyOutfit", "clothescrate.png", "Buy Outfit Crate",
    `${COST_BP_OUTFIT.toLocaleString()} BP`, "outfit");
  const weaponBtn = makeBtn("buyWeapon", "weaponcrate.png", "Buy Weapons Crate",
    `${COST_GC_WEAPON} GCoin`, "weapon");

  wrap.appendChild(outfitBtn);
  wrap.appendChild(weaponBtn);
  cratesScreen.appendChild(wrap);

  // === Item name label ===
  const nameLabel = document.createElement("div");
  nameLabel.id = "crateItemLabel";
  cratesScreen.appendChild(nameLabel);

  // === Random item ===
  function getRandomItem(cat) {
    const pool = CRATE_DATA[cat];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // === Reward display ===
  function showReward(quip) {
    rewardName.textContent = `Red: ${quip}`;
    rewardCard.classList.add("show");
  }

  // === Purchase logic ===
  function buyCrate(type) {
    let bp = getBP(), gc = getGC();
    const cat = type === "outfit" ? "clothes" : "weapons";

    if (type === "outfit") {
      if (bp < COST_BP_OUTFIT) return alert("Not enough BP!");
      setBP(bp - COST_BP_OUTFIT);
      crateImg.src = "assets/clothescrate.png";
    } else {
      if (gc < COST_GC_WEAPON) return alert("Not enough GCoin!");
      setGC(gc - COST_GC_WEAPON);
      crateImg.src = "assets/weaponcrate.png";
    }

    const drop = getRandomItem(cat);
    refreshCrateHUD();

    // reset displays
    rewardCard.classList.remove("show");
    nameLabel.classList.remove("show");

    // full crate fall reset (ensures every drop animates)
    crateImg.style.transition = "none";
    crateImg.style.opacity = "0";
    crateImg.style.transform = "translate(-50%, -120vh)";
    void crateImg.offsetHeight;
    crateImg.style.transition =
      "transform 0.9s cubic-bezier(.22,1,.36,1), opacity 0.6s ease";
    crateImg.style.opacity = "1";
    crateImg.style.transform = "translate(-50%, 0)";

    // after fall finishes
    setTimeout(() => {
      const crateRect = crateImg.getBoundingClientRect();
      const labelY = crateRect.top - 170; // position above crate
      const labelX = crateRect.left + crateRect.width / 2;

      nameLabel.textContent = drop.name;
      Object.assign(nameLabel.style, {
        position: "fixed",
        left: labelX + "px",
        top: labelY + "px",
        transform: "translate(-50%, -100%)"
      });

      nameLabel.classList.add("show");
      showReward(drop.quip);
    }, 950);
  }

  // === Init ===
  crateImg.style.display = "block";
  rewardCard.classList.remove("show");
  refreshCrateHUD();
})();
});
