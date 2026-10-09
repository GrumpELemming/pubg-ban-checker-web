const { test, expect } = require("@playwright/test");

test("Rapture renders when the game is opened directly from a local HTML file", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.raptureDrawn = false;
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
      if (this.canvas.id === "game" && source instanceof HTMLCanvasElement &&
          source.width === 744 && source.height === 1339) window.raptureDrawn = true;
      return drawImage.call(this, source, ...args);
    };
  });
  const { pathToFileURL } = require("url");
  const path = require("path");
  await page.goto(pathToFileURL(path.resolve(__dirname, "../red13/index.html")).href);
  await page.locator(".press-enter").click();
  await page.locator("input[value='rapture']").check();
  await page.locator("#btnStart").click();
  await expect.poll(() => page.evaluate(() => window.raptureDrawn)).toBe(true);
  expect(errors).toEqual([]);
});

async function openGame(page) {
  // Expose deterministic controls in the intercepted test copy only.
  await page.route("**/red13/js/game.js?**", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const hooks = `
      let testNow = performance.now();
      window.gameTest = {
        freeze() { cancelAnimationFrame(frameId); },
        draw() { drawBackground(testNow); drawHUD(testNow); drawTryHard(testNow); drawPlayer(testNow); drawPlayerShots(); },
        enemy(x = 700) {
          Math.random = () => 0.99;
          state.px = 27; state.py = 17;
          state.nextDmgAt = state.nextPhaseAt = state._nextItemAt = Infinity;
          RED.nextSpawnAt = Infinity; RED.zones = [];
          spawnTryHard(testNow);
          tryHard.x = x; tryHard.y = HUD_H + state.py * CELL + CELL;
          tryHardPhaseTriggered = state.phase;
        },
        advance(dt) { testNow += dt; update(dt, testNow); },
        moveEnemy(dt) { testNow += dt; updateTryHard(testNow, dt); },
        phase(value) { state.phase = value; },
        finishCrossing(direction = -1) {
          tryHard.dir = direction; tryHard.vx = 100 * direction;
          tryHard.x = direction === 1 ? CANVAS_W + CELL*3 : -CELL*3;
          updateTryHard(testNow + 1, 1);
        },
        hp(value) { state.hp = value; },
        spawnLoot() { spawnItemNow(testNow); return state.items.map(item => ({ ...item })); },
        clearLoot() { state.items = []; },
        collectJammer() {
          state.items = [{ type: "J", x: state.px, y: state.py, falling: false }];
          pickupNearby(testNow);
          return state.jammerUntil - testNow;
        },
        blueDamage() {
          state.phase = 2; state.nextDmgAt = testNow;
          state.nextPhaseAt = state._nextItemAt = RED.nextSpawnAt = Infinity;
          RED.zones = []; update(0, testNow); return state.hp;
        },
        redDamage() {
          RED.lastDamageAt = testNow - RED.damageEvery;
          RED.zones = [{ type: "solid", cx: state.px * CELL + CELL,
            cy: HUD_H + state.py * CELL + CELL, r: 100, pulse: false }];
          damageFromRedZones(testNow); RED.zones = []; return state.hp;
        },
        collectHealing(type) {
          state.items = [{ type, x: state.px, y: state.py, falling: false }];
          pickupNearby();
          pickupNearby();
          return { bp: state.bp, hp: state.hp, items: state.items.length };
        },
        collectLoot() {
          const loot = state.items.find(item => item.type === "G" && item.amount === 5);
          if (loot) { state.px = loot.x; state.py = loot.y; pickupNearby(); }
        },
        snapshot() { return { character: state.character, active: tryHardActive,
          facingAngle: state.facingAngle, movementSpriteLoaded: !!raptureMovementSprite,
          enemySpriteLoaded: tryHardSprite.complete && tryHardSprite.naturalWidth > 0,
          gcoin: state.gcoin, loot: state.items.filter(item => item.type === "G" && item.amount === 5),
          enemy: tryHard && { x: tryHard.x, hp: tryHard.hp, slowedUntil: tryHard.slowedUntil },
          shots: playerShots.length, phaseTriggered: tryHardPhaseTriggered }; }
      };
    `;
    await route.fulfill({ response, body: source.replace("window.gameUpdate=update;", "window.gameUpdate=update;" + hooks) });
  });
  await page.goto("/red13/index.html");
  await page.locator(".press-enter").click();
}

async function start(page, character) {
  await page.locator(`input[value='${character}']`).check();
  await page.locator("#btnStart").click();
  await page.evaluate(() => window.gameTest.freeze());
}

test("Rapture can be selected, rendered and remembered; Red13 stays playable", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await openGame(page);
  await expect(page.locator("input[value='red13']")).toBeChecked();
  await start(page, "rapture");
  await expect(page.locator("#shootBtn")).toBeVisible();
  await expect(page.locator("#game")).toHaveAttribute("aria-label", /Rapture/);
  expect(await page.locator(".character-choice:has(input[value='rapture']) img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.evaluate(() => window.gameTest.draw());
  await page.screenshot({ path: testInfo.outputPath("rapture-gameplay.png") });
  await page.reload();
  await page.locator(".press-enter").click();
  await expect(page.locator("input[value='rapture']")).toBeChecked();
  await start(page, "red13");
  await expect(page.locator("#shootBtn")).toBeHidden();
  await expect(page.locator("#game")).toHaveAttribute("aria-label", /Red13/);
  expect(await page.locator(".character-choice:has(input[value='red13']) img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.evaluate(() => window.gameTest.draw());
  await page.screenshot({ path: testInfo.outputPath("red13-gameplay.png") });
  await page.keyboard.down("Space");
  await page.evaluate(() => window.gameTest.advance(400));
  await page.keyboard.up("Space");
  expect((await page.evaluate(() => window.gameTest.snapshot())).shots).toBe(0);
  expect(errors).toEqual([]);
});

test("eligible loot rolls independently replace normal loot with one Jammer and avoid occupied points", async ({ page }) => {
  await openGame(page);
  await start(page, "red13");
  await page.evaluate(() => {
    window.gameTest.clearLoot();
    window.lootRollCount = 0;
    // Nearest 32-bit values below/above 5%, then another success. Test copy only.
    const values = [214748364, 214748365, 0];
    window.crypto.getRandomValues = array => {
      array[0] = values[window.lootRollCount++] ?? 0; return array;
    };
    Math.random = () => 0;
  });
  const logs = [];
  page.on("console", message => { if (message.type() === "debug") logs.push(message.text()); });
  let items = await page.evaluate(() => window.gameTest.spawnLoot());
  expect(items.map(item => item.type)).toEqual(["J"]);
  items = await page.evaluate(() => window.gameTest.spawnLoot());
  expect(items.map(item => item.type)).toEqual(["J", "B"]);
  items = await page.evaluate(() => window.gameTest.spawnLoot());
  expect(items.map(item => item.type)).toEqual(["J", "B", "J"]);
  expect(new Set(items.map(item => `${item.x},${item.y}`)).size).toBe(3);
  expect(items.every(item => item.x >= 1 && item.x <= 52 && item.y >= 1 && item.y <= 32)).toBe(true);
  expect(logs.some(log => log.includes("success"))).toBe(true);
  expect(logs.some(log => log.includes("failure"))).toBe(true);
  await page.evaluate(() => { for (let i = 0; i < 8; i++) window.gameTest.spawnLoot(); });
  expect(await page.evaluate(() => window.lootRollCount)).toBe(7);
  expect((await page.evaluate(() => window.gameTest.spawnLoot())).length).toBe(7);
});

test("Jammer rolls have no pity guarantee, support configured probabilities and survive reloads", async ({ page }) => {
  await openGame(page);
  await start(page, "rapture");
  const results = await page.evaluate(() => {
    window.crypto.getRandomValues = array => { array[0] = 0xffffffff; return array; };
    window.BZR.lootConfig.debugLootRolls = false;
    const failures = [];
    for (let i = 0; i < 100; i++) {
      window.gameTest.clearLoot();
      failures.push(window.gameTest.spawnLoot()[0].type);
    }
    window.BZR.lootConfig.jammerSpawnChance = 1;
    window.gameTest.clearLoot();
    const certain = window.gameTest.spawnLoot()[0].type;
    window.BZR.lootConfig.jammerSpawnChance = 0;
    window.crypto.getRandomValues = array => { array[0] = 0; return array; };
    window.gameTest.clearLoot();
    const disabled = window.gameTest.spawnLoot()[0].type;
    window.BZR.lootConfig.jammerSpawnChance = -0.1;
    let invalidRejected = false;
    try { window.BZR.loot.rollJammer({ x: 1, y: 1 }); } catch (error) { invalidRejected = error instanceof RangeError; }
    return { failures, certain, disabled, invalidRejected };
  });
  expect(results.failures).not.toContain("J");
  expect(results.certain).toBe("J");
  expect(results.disabled).not.toBe("J");
  expect(results.invalidRejected).toBe(true);
  await page.reload();
  expect(await page.evaluate(() => window.BZR.lootConfig.jammerSpawnChance)).toBe(0.05);
});

for (const character of ["red13", "rapture"]) {
  test(`${character} gets temporary blue-zone protection without red-zone immunity or stacked durations`, async ({ page }) => {
    await openGame(page);
    await start(page, character);
    await page.evaluate(() => window.gameTest.hp(100));
    expect(await page.evaluate(() => window.gameTest.collectJammer())).toBe(20_000);
    expect(await page.evaluate(() => window.gameTest.blueDamage())).toBe(100);
    expect(await page.evaluate(() => window.gameTest.redDamage())).toBeLessThan(100);
    await page.evaluate(() => { window.gameTest.hp(100); window.gameTest.advance(10_000); });
    expect(await page.evaluate(() => window.gameTest.collectJammer())).toBe(20_000);
    await page.evaluate(() => window.gameTest.advance(19_999));
    expect(await page.evaluate(() => window.gameTest.blueDamage())).toBe(100);
    await page.evaluate(() => window.gameTest.advance(1));
    expect(await page.evaluate(() => window.gameTest.blueDamage())).toBe(99);
    await page.evaluate(() => { window.startGameFixed(); window.gameTest.freeze(); window.gameTest.hp(100); });
    expect(await page.evaluate(() => window.gameTest.blueDamage())).toBe(99);
  });
}

test("separate browser players have independent Jammer rolls and protection", async ({ page, browser }) => {
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  try {
    await openGame(page);
    await openGame(otherPage);
    await start(page, "red13");
    await start(otherPage, "rapture");
    await page.evaluate(() => {
      window.crypto.getRandomValues = array => { array[0] = 0; return array; };
      window.gameTest.clearLoot(); window.gameTest.hp(100);
    });
    await otherPage.evaluate(() => {
      window.crypto.getRandomValues = array => { array[0] = 0xffffffff; return array; };
      window.gameTest.clearLoot(); window.gameTest.hp(100);
    });
    expect((await page.evaluate(() => window.gameTest.spawnLoot()))[0].type).toBe("J");
    expect((await otherPage.evaluate(() => window.gameTest.spawnLoot()))[0].type).not.toBe("J");
    await page.evaluate(() => window.gameTest.collectJammer());
    expect(await page.evaluate(() => window.gameTest.blueDamage())).toBe(100);
    expect(await otherPage.evaluate(() => window.gameTest.blueDamage())).toBe(99);
  } finally {
    await otherContext.close();
  }
});

test("Rapture's reference sprite faces all eight movement directions and keeps its idle facing", async ({ page }) => {
  await openGame(page);
  await start(page, "rapture");
  await expect.poll(async () => (await page.evaluate(() => window.gameTest.snapshot())).movementSpriteLoaded).toBe(true);
  const directions = [
    ["w", 0], ["wd", Math.PI / 4], ["d", Math.PI / 2],
    ["sd", 3 * Math.PI / 4], ["s", Math.PI],
    ["sa", 5 * Math.PI / 4], ["a", 3 * Math.PI / 2], ["wa", -Math.PI / 4]
  ];
  for (const [keys, angle] of directions) {
    for (const key of keys) await page.keyboard.down(key);
    await page.evaluate(() => window.gameTest.advance(120));
    expect((await page.evaluate(() => window.gameTest.snapshot())).facingAngle).toBeCloseTo(angle);
    await page.evaluate(() => window.gameTest.draw());
    for (const key of keys) await page.keyboard.up(key);
    await page.evaluate(() => window.gameTest.advance(120));
    expect((await page.evaluate(() => window.gameTest.snapshot())).facingAngle).toBeCloseTo(angle);
  }
});

test("Rapture shots slow the enemy and defeat it after three hits", async ({ page }, testInfo) => {
  await openGame(page);
  await start(page, "rapture");
  await page.evaluate(() => window.gameTest.enemy());
  await expect(page.locator("#tryHardAlert")).toHaveText("SWEATY TRY HARD IN THE BLUE ZONE");
  await expect.poll(() => page.evaluate(() => window.gameTest.snapshot().enemySpriteLoaded)).toBe(true);
  await page.evaluate(() => window.gameTest.draw());
  await page.screenshot({ path: testInfo.outputPath("sweaty-try-hard-gameplay.png") });
  await page.keyboard.down("Space");
  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.gameTest.advance(50); });
  const hit = await page.evaluate(() => window.gameTest.snapshot());
  expect(hit.enemy.hp).toBe(2);
  expect(hit.enemy.slowedUntil).toBeGreaterThan(0);
  await page.evaluate(() => window.gameTest.moveEnemy(1000));
  const slowed = await page.evaluate(() => window.gameTest.snapshot());
  expect(slowed.enemy.x - hit.enemy.x).toBeCloseTo(-40, 5);
  await page.evaluate(() => { for (let i = 0; i < 30; i++) window.gameTest.advance(50); });
  await page.keyboard.up("Space");
  const defeated = await page.evaluate(() => window.gameTest.snapshot());
  expect(defeated.active).toBe(false);
  expect(defeated.loot).toHaveLength(1);
  expect(defeated.gcoin).toBe(0);
  await page.evaluate(() => window.gameTest.collectLoot());
  expect((await page.evaluate(() => window.gameTest.snapshot())).gcoin).toBe(5);
  expect(await page.evaluate(() => localStorage.getItem("red13_gc"))).toBe("5");
  await page.evaluate(() => window.gameTest.collectLoot());
  expect((await page.evaluate(() => window.gameTest.snapshot())).gcoin).toBe(5);
  await expect(page.locator("#game")).toHaveAttribute("aria-label", /defeated by Rapture/);
  await expect(page.locator("#tryHardAlert")).toHaveCount(0);
});

test("enemy speed follows elapsed time and restart restores its phase trigger", async ({ page }) => {
  await openGame(page);
  await start(page, "red13");
  await page.evaluate(() => { window.gameTest.enemy(); window.gameTest.moveEnemy(1000); });
  expect((await page.evaluate(() => window.gameTest.snapshot())).enemy.x).toBeCloseTo(600, 5);
  await page.keyboard.press("r");
  await page.evaluate(() => {
    window.gameTest.freeze();
    window.gameTest.enemy();
    for (let i = 0; i < 100; i++) window.gameTest.moveEnemy(10);
  });
  expect((await page.evaluate(() => window.gameTest.snapshot())).enemy.x).toBeCloseTo(600, 5);
  await page.keyboard.press("r");
  await page.evaluate(() => { window.gameTest.freeze(); window.gameTest.phase(10); window.gameTest.advance(1); });
  expect((await page.evaluate(() => window.gameTest.snapshot())).active).toBe(true);
  await expect(page.locator("#shootBtn")).toBeHidden();
});

test("the Shoot button fires for Rapture and stops when released", async ({ page }) => {
  await openGame(page);
  await start(page, "rapture");
  await page.locator("#shootBtn").hover();
  await page.mouse.down();
  await page.evaluate(() => window.gameTest.advance(1));
  expect((await page.evaluate(() => window.gameTest.snapshot())).shots).toBe(1);
  await page.mouse.up();
  await page.evaluate(() => window.gameTest.advance(400));
  expect((await page.evaluate(() => window.gameTest.snapshot())).shots).toBe(1);
});

test("Rapture meets the enemy in phase 5 and again from phase 10", async ({ page }) => {
  await openGame(page);
  await start(page, "rapture");
  await page.evaluate(() => { window.gameTest.phase(4); window.gameTest.advance(1); });
  expect((await page.evaluate(() => window.gameTest.snapshot())).active).toBe(false);
  await page.evaluate(() => { window.gameTest.phase(5); window.gameTest.advance(1); });
  expect((await page.evaluate(() => window.gameTest.snapshot())).active).toBe(true);
  await page.evaluate(() => { window.gameTest.enemy(); window.gameTest.finishCrossing(); window.gameTest.advance(1); });
  expect((await page.evaluate(() => window.gameTest.snapshot())).active).toBe(false);
  expect((await page.evaluate(() => window.gameTest.snapshot())).gcoin).toBe(0);
  for (const phase of [6, 9]) {
    await page.evaluate(value => { window.gameTest.phase(value); window.gameTest.advance(1); }, phase);
    expect((await page.evaluate(() => window.gameTest.snapshot())).active).toBe(false);
  }
  await page.evaluate(() => { window.gameTest.phase(10); window.gameTest.advance(1); });
  expect((await page.evaluate(() => window.gameTest.snapshot())).active).toBe(true);
});

test("Red13 earns 3 saved GCoin once for each crossing he survives", async ({ page }) => {
  await openGame(page);
  await start(page, "red13");
  await page.evaluate(() => { window.gameTest.phase(4); window.gameTest.advance(1); });
  expect((await page.evaluate(() => window.gameTest.snapshot())).active).toBe(false);
  await page.evaluate(() => { window.gameTest.phase(5); window.gameTest.advance(1); });
  expect((await page.evaluate(() => window.gameTest.snapshot())).active).toBe(true);
  for (const direction of [1, -1]) {
    await page.evaluate(value => { window.gameTest.enemy(); window.gameTest.finishCrossing(value); }, direction);
    const expected = direction === 1 ? 3 : 6;
    expect((await page.evaluate(() => window.gameTest.snapshot())).gcoin).toBe(expected);
    expect(await page.evaluate(() => Number(localStorage.getItem("red13_gc")))).toBe(expected);
    await page.evaluate(() => window.gameTest.moveEnemy(1000));
    expect((await page.evaluate(() => window.gameTest.snapshot())).gcoin).toBe(expected);
    if (direction === 1) {
      for (const phase of [6, 9]) {
        await page.evaluate(value => { window.gameTest.phase(value); window.gameTest.advance(1); }, phase);
        expect((await page.evaluate(() => window.gameTest.snapshot())).active).toBe(false);
      }
      await page.evaluate(() => { window.gameTest.phase(10); window.gameTest.advance(1); });
      expect((await page.evaluate(() => window.gameTest.snapshot())).active).toBe(true);
    }
  }
  await page.evaluate(() => { window.gameTest.enemy(); window.gameTest.hp(0); window.gameTest.finishCrossing(); });
  expect((await page.evaluate(() => window.gameTest.snapshot())).gcoin).toBe(6);
});

for (const character of ["red13", "rapture"]) {
  test(`${character} earns saved BP once per healing pickup, even at full health`, async ({ page }) => {
    await openGame(page);
    await start(page, character);
    const initial = await page.evaluate(() => Number(localStorage.getItem("red13_bp") || 0));
    let earned = 0;
    for (const [type, value] of [["B", 100], ["F", 200], ["M", 400]]) {
      await page.evaluate(() => window.gameTest.hp(100));
      const result = await page.evaluate(type => window.gameTest.collectHealing(type), type);
      earned += value;
      expect(result.bp).toBe(initial + earned);
      expect(result.hp).toBe(100);
      expect(result.items).toBe(0);
      expect(await page.evaluate(() => Number(localStorage.getItem("red13_bp")))).toBe(initial + earned);
    }
  });
}
