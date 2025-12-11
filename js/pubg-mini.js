(() => {
  const canvas = document.getElementById("arena");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const BULLET_SPEED = 0.6; // px per ms

  const state = {
    running: false,
    time: 0,
    score: 0,
    best: 0,
    kills: 0,
    gasRadius: Math.max(W, H) * 0.75,
    gasSpeed: 0.02,
    player: null,
    enemies: [],
    bullets: [],
    heals: [],
    grenades: [],
    grenadePickups: [],
    crates: [],
    keys: {},
    firing: false,
    aim: { x: W / 2, y: H / 2 },
    lastAimMove: 0
  };

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function reset() {
    state.running = true;
    state.time = 0;
    state.score = 0;
    state.kills = 0;
    state.gasRadius = Math.max(W, H) * 0.75;
    state.player = {
      x: W / 2,
      y: H / 2,
      r: 14,
      hp: 100,
      vx: 0,
      vy: 0,
      fireCd: 0,
      dmg: 20,
      ammoBoost: 0,
      fireRateMult: 1,
      nades: 1
    };
    state.enemies = [];
    state.bullets = [];
    state.heals = [];
    state.crates = [];
    state.grenades = [];
    state.grenadePickups = [];
    state.firing = false;
    state.aim = { x: W / 2, y: H / 2 };
    state.lastAimMove = 0;
  }

  function saveBest(score) {
    try {
      const prev = parseInt(localStorage.getItem("pubg_mini_best") || "0", 10);
      if (score > prev) localStorage.setItem("pubg_mini_best", String(score));
      state.best = Math.max(score, prev);
    } catch {
      state.best = score;
    }
  }

  function loadBest() {
    try {
      state.best = parseInt(localStorage.getItem("pubg_mini_best") || "0", 10) || 0;
    } catch {
      state.best = 0;
    }
  }

  function spawnEnemy() {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    switch (side) {
      case 0: x = -40; y = rand(20, H - 20); break;
      case 1: x = W + 40; y = rand(20, H - 20); break;
      case 2: x = rand(20, W - 20); y = -40; break;
      default: x = rand(20, W - 20); y = H + 40; break;
    }
    state.enemies.push({
      x,
      y,
      r: 12,
      hp: 35 + Math.random() * 20,
      speed: 0.055 + 0.035 * Math.random() // slower shuffle for zombies
    });
  }

  function spawnHeal(x, y) {
    state.heals.push({ x, y, r: 10, vy: -0.15, ttl: 9000 });
  }

  function spawnCrate() {
    state.crates.push({
      x: rand(30, W - 30),
      y: rand(30, H - 30),
      r: 12,
      ttl: 8000
    });
  }

  function spawnGrenadePickup() {
    state.grenadePickups.push({
      x: rand(30, W - 30),
      y: rand(30, H - 30),
      r: 10,
      ttl: 9000
    });
  }

  function update(dt) {
    if (!state.running) return;
    const p = state.player;
    const speed = 0.2 * (p.hp < 40 ? 0.8 : 1);

    const moveX = (state.keys["a"] || state.keys["arrowleft"] ? -1 : 0) +
      (state.keys["d"] || state.keys["arrowright"] ? 1 : 0);
    const moveY = (state.keys["w"] || state.keys["arrowup"] ? -1 : 0) +
      (state.keys["s"] || state.keys["arrowdown"] ? 1 : 0);
    p.vx = moveX * speed * dt;
    p.vy = moveY * speed * dt;
    p.x = clamp(p.x + p.vx, p.r, W - p.r);
    p.y = clamp(p.y + p.vy, p.r, H - p.r);

    state.time += dt;
    state.score = state.kills;

    state.gasRadius = Math.max(120, state.gasRadius - state.gasSpeed * dt);
    const dx = p.x - W / 2;
    const dy = p.y - H / 2;
    const dGas = Math.hypot(dx, dy);
    if (dGas > state.gasRadius) {
      p.hp -= 0.02 * dt;
    }

    // Spawn enemies scaling over time
    const spawnRate = 0.001 + state.time * 0.0000004;
    if (Math.random() < spawnRate * dt) spawnEnemy();
    if (Math.random() < 0.0004 * dt) spawnCrate();
    if (Math.random() < 0.00012 * dt) spawnGrenadePickup();

    // Shooting cooldown
    p.fireCd = Math.max(0, p.fireCd - dt);
    if (state.firing && p.fireCd === 0) {
      let aimX = state.aim.x;
      let aimY = state.aim.y;
      const nowTs = performance.now();
      if (nowTs - state.lastAimMove > 1200) {
        let best = null;
        let bestD = Infinity;
        for (const e of state.enemies) {
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        if (best) {
          aimX = best.x;
          aimY = best.y;
        }
      }

      const dxAim = aimX - p.x;
      const dyAim = aimY - p.y;
      const dist = Math.hypot(dxAim, dyAim) || 1;
      state.bullets.push({
        x: p.x,
        y: p.y,
        vx: (dxAim / dist) * BULLET_SPEED,
        vy: (dyAim / dist) * BULLET_SPEED,
        r: 4,
        ttl: 1600,
        from: "player",
        dmg: p.dmg
      });
      p.fireCd = 160 / (p.fireRateMult || 1);
      if (p.ammoBoost > 0) {
        p.ammoBoost -= 1;
        if (p.ammoBoost <= 0) {
          p.fireRateMult = 1;
          p.dmg = 20;
        }
      }
    }

    // Enemies move toward player
    for (const e of state.enemies) {
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.x += Math.cos(a) * e.speed * dt;
      e.y += Math.sin(a) * e.speed * dt;
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) {
        p.hp -= 0.05 * dt;
      }
    }

    // Bullets vs enemies
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.ttl -= dt;
      if (b.from === "player") {
        for (const e of state.enemies) {
          if (Math.hypot(b.x - e.x, b.y - e.y) < b.r + e.r) {
            e.hp -= (b.dmg || 20);
            b.ttl = 0;
            if (e.hp <= 0) {
              e.dead = true;
              state.kills += 1;
              if (Math.random() < 0.35) spawnHeal(e.x, e.y);
            }
            break;
          }
        }
    }
  }
  state.bullets = state.bullets.filter(
    b => b.ttl > 0 && b.x > -40 && b.x < W + 40 && b.y > -40 && b.y < H + 40
  );
    state.enemies = state.enemies.filter(e => !e.dead);

    if (Math.random() < 0.0009 * dt) spawnHeal(rand(30, W - 30), rand(30, H - 30));
    for (const h of state.heals) {
      h.ttl -= dt;
      h.y += h.vy * dt;
      h.vy += 0.0004 * dt;
      if (Math.hypot(h.x - p.x, h.y - p.y) < h.r + p.r) {
        p.hp = clamp(p.hp + 25, 0, 100);
        h.ttl = 0;
      }
    }
    state.heals = state.heals.filter(h => h.ttl > 0);

    // Crates for weapon boosts
    for (const c of state.crates) {
      c.ttl -= dt;
      if (Math.hypot(c.x - p.x, c.y - p.y) < c.r + p.r) {
        p.ammoBoost = 100;
        p.fireRateMult = 2;
        p.dmg = 35;
        c.ttl = 0;
      }
    }
    state.crates = state.crates.filter(c => c.ttl > 0);

    // Grenade pickups
    for (const g of state.grenadePickups) {
      g.ttl -= dt;
      if (Math.hypot(g.x - p.x, g.y - p.y) < g.r + p.r) {
        p.nades = Math.min(p.nades + 1, 3);
        g.ttl = 0;
      }
    }
    state.grenadePickups = state.grenadePickups.filter(g => g.ttl > 0);

    // Active grenades
    for (const g of state.grenades) {
      g.ttl -= dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.vx *= 0.992;
      g.vy *= 0.992;
      if (g.ttl <= 0 && !g.exploded) {
        g.exploded = true;
        // damage enemies in radius
        for (const e of state.enemies) {
          if (Math.hypot(e.x - g.x, e.y - g.y) <= g.radius + e.r) {
            e.hp -= 120;
          }
        }
        // self damage if too close
        if (Math.hypot(p.x - g.x, p.y - g.y) <= g.radius + p.r) {
          p.hp -= 35;
        }
        g.ttl = 200; // allow brief blast draw
      }
    }
    state.enemies = state.enemies.filter(e => e.hp > 0);
    state.grenades = state.grenades.filter(g => g.ttl > 0);

    if (p.hp <= 0) {
      state.running = false;
      state.score = state.kills;
      saveBest(state.score);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Gas circle
    ctx.save();
    ctx.strokeStyle = "rgba(154,123,255,0.55)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, state.gasRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Heals
    state.heals.forEach(h => {
      ctx.save();
      ctx.fillStyle = "#66e048";
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Crates
    state.crates.forEach(c => {
      ctx.save();
      ctx.fillStyle = "#ffc107";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    // Grenade pickups
    state.grenadePickups.forEach(g => {
      ctx.save();
      ctx.fillStyle = "#9a7bff";
      ctx.strokeStyle = "#2a0f8a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    // Bullets / blast shards
    state.bullets.forEach(b => {
      ctx.save();
      ctx.fillStyle = b.from === "player" ? "#7cfff2" : "#ff5252";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Enemies
    state.enemies.forEach(e => {
      ctx.save();
      ctx.fillStyle = "#ff7b43";
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2a1202";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    });

    // Grenade explosions
    state.grenades.forEach(g => {
      if (g.exploded) {
        ctx.save();
        ctx.fillStyle = "rgba(255,120,40,0.25)";
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = "#ffb347";
        ctx.strokeStyle = "#8a4700";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    });

    // Player
    const p = state.player;
    ctx.save();
    ctx.fillStyle = "#7cfff2";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#032c35";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Crosshair / aim
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.5;
    const ax = state.aim.x;
    const ay = state.aim.y;
    ctx.beginPath();
    ctx.moveTo(ax - 8, ay);
    ctx.lineTo(ax + 8, ay);
    ctx.moveTo(ax, ay - 8);
    ctx.lineTo(ax, ay + 8);
    ctx.stroke();
    ctx.restore();

    // HUD text
    const hud = document.getElementById("hud");
    hud.querySelector('[data-id="score"]').textContent = state.score;
    hud.querySelector('[data-id="hp"]').textContent = Math.max(0, state.player.hp | 0);
    hud.querySelector('[data-id="gas"]').textContent = Math.round(state.gasRadius);
    hud.querySelector('[data-id="best"]').textContent = state.best;
    hud.querySelector('[data-id="kills"]').textContent = state.kills;
    hud.querySelector('[data-id="alive"]').textContent = state.enemies.length;
    const nadeEl = hud.querySelector('[data-id="nades"]');
    if (nadeEl) nadeEl.textContent = state.player.nades;

    // Death overlay
    if (!state.running) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffc107";
      ctx.font = "24px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("You were knocked!", W / 2, H / 2 - 10);
      ctx.fillStyle = "#f4f6f9";
      ctx.font = "16px 'Segoe UI', sans-serif";
      ctx.fillText("Press R to redeploy", W / 2, H / 2 + 20);
      ctx.restore();
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(40, now - last);
    last = now;
    if (state.running) {
      update(dt);
    }
    draw();
    requestAnimationFrame(loop);
  }

  function onKey(e, down) {
    state.keys[e.key.toLowerCase()] = down;
    if (e.code === "Space") state.firing = down;
    if (down && e.key.toLowerCase() === "g" && state.player.nades > 0 && state.running) {
      const p = state.player;
      const dxAim = state.aim.x - p.x;
      const dyAim = state.aim.y - p.y;
      const dist = Math.hypot(dxAim, dyAim) || 1;
      const throwSpeed = 0.35;
      state.grenades.push({
        x: p.x,
        y: p.y,
        vx: (dxAim / dist) * throwSpeed,
        vy: (dyAim / dist) * throwSpeed,
        ttl: 1100,
        radius: 85,
        exploded: false
      });
      state.player.nades -= 1;
    }
    if (!state.running && down && e.key.toLowerCase() === "r") reset();
  }

  function init() {
    loadBest();
    reset();
    requestAnimationFrame(loop);
    window.addEventListener("keydown", e => onKey(e, true));
    window.addEventListener("keyup", e => onKey(e, false));
    window.addEventListener("mousemove", e => {
      const rect = canvas.getBoundingClientRect();
      state.aim.x = ((e.clientX - rect.left) / rect.width) * W;
      state.aim.y = ((e.clientY - rect.top) / rect.height) * H;
      state.lastAimMove = performance.now();
    });
    window.addEventListener("mousedown", () => { state.firing = true; });
    window.addEventListener("mouseup", () => { state.firing = false; });
    document.getElementById("startBtn").onclick = reset;
  }

  document.addEventListener("DOMContentLoaded", init);
})();
