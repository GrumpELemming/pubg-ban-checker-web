const { test, expect } = require("@playwright/test");

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
        collectLoot() {
          const loot = state.items.find(item => item.type === "G" && item.amount === 5);
          if (loot) { state.px = loot.x; state.py = loot.y; pickupNearby(); }
        },
        snapshot() { return { character: state.character, active: tryHardActive,
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
