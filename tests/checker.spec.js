const { test, expect } = require("@playwright/test");

for (const query of ["XNEMESISX-_-", "XNEMESISX-\\_-", "GRIIMlREAPERR", "account.3da63b18cb7b4e369f9d7dc5136f93bd"]) {
  test(`custom card account search resolves ${query}`, async ({ page }) => {
    const accountId = "account.3da63b18cb7b4e369f9d7dc5136f93bd";
    let artworkRequested = false;
    page.on("request", request => {
      if (request.url().includes("/img/ban-cards/xnemesisx-pubgtogether.png")) artworkRequested = true;
    });
    await page.route("**/api/ban-card-data?**", route => {
      expect(new URL(route.request().url()).searchParams.get("accountId")).toBe(accountId);
      return route.fulfill({ json: {
        accountId, player: "XNEMESISX-_-", banStatus: "permanently_banned",
        mastery: { level: 100, tier: "Diamond" }, lifetime: {}
      } });
    });
    await page.route("**/api/resolve?**", route => {
      expect(new URL(route.request().url()).searchParams.get("id")).toBe(accountId);
      return route.fulfill({ json: { accountId, currentName: "XNEMESISX-_-" } });
    });
    await page.route("**/api/check-ban-clan?**", route => {
      expect(new URL(route.request().url()).searchParams.get("player")).toBe("XNEMESISX-_-");
      return route.fulfill({ json: { results: [{ player: "XNEMESISX-_-", accountId, banStatus: "Permanently banned" }] } });
    });
    await openChecker(page);
    await page.locator("#playerInput").fill(query);
    await page.locator("#checkBanBtn").click();
    const row = page.locator("#results .player-row");
    await expect(row).toContainText(accountId);
    await expect(row.locator(".ban-label")).toHaveText("Permanently Banned");
    await row.getByRole("button", { name: "Generate Ban Card" }).click();
    await expect(page.locator("#banCardCanvas")).toBeVisible();
    await expect(page.locator("#downloadBanCardBtn")).toBeEnabled();
    expect(artworkRequested).toBe(true);
  });
}

async function openChecker(page) {
  await page.route("**/api/auth/session", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: true, authenticated: false })
  }));
  await page.addInitScript(() => localStorage.setItem("selectedPlatform", "steam"));
  await page.goto("/");
}

test("a player search renders the PUBG response and adds it to the Watchlist", async ({ page }) => {
  await page.route("**/api/check-ban-clan?**", route => {
    const player = new URL(route.request().url()).searchParams.get("player");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [{
          player,
          accountId: "account.test-alpha",
          clan: "TEST",
          banStatus: "Temporarily banned"
        }]
      })
    });
  });
  await openChecker(page);

  await page.locator("#playerInput").fill("Alpha");
  await page.locator("#checkBanBtn").click();
  const result = page.locator("#results .player-row", { hasText: "Alpha" });
  await expect(result.locator(".ban-label")).toHaveText("Temporarily Banned");
  await expect(result).toContainText("Reported by PUBG now");
  await expect(result).toContainText("account.test-alpha");
  await expect(result).toContainText("TEST");

  await result.getByRole("button", { name: "Add to Watchlist" }).click();
  await expect(result.getByRole("button", { name: "Added" })).toBeDisabled();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("watchlist_steam")));
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({
    player: "Alpha",
    accountId: "account.test-alpha",
    clan: "TEST",
    statusLabel: "Temporarily Banned"
  });

  await page.goto("/watchlist.html");
  const card = page.locator(".watchlist-player", { hasText: "Alpha" });
  await expect(card).toBeVisible();
  await expect(card.locator(".wl-status-pill")).toHaveText("TEMP");
});

test("multi-player search limits concurrent PUBG requests to two", async ({ page }) => {
  let active = 0;
  let maximumActive = 0;
  const requested = [];
  await page.route("**/api/check-ban-clan?**", async route => {
    const player = new URL(route.request().url()).searchParams.get("player");
    requested.push(player);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, 120));
    active -= 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ player, banStatus: "Permanently banned" }] })
    });
  });
  await openChecker(page);

  await page.locator("#playerInput").fill("Alpha, Bravo, Charlie, Delta");
  await page.locator("#checkBanBtn").click();
  await expect(page.locator("#results .player-row .ban-label")).toHaveText([
    "Permanently Banned",
    "Permanently Banned",
    "Permanently Banned",
    "Permanently Banned"
  ]);
  expect(requested.sort()).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
  expect(maximumActive).toBe(2);
});

test("account ID lookup resolves a name before checking its status", async ({ page }) => {
  const calls = [];
  await page.route("**/api/resolve?**", route => {
    const url = new URL(route.request().url());
    calls.push(`resolve:${url.searchParams.get("id")}`);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ currentName: "ResolvedPlayer" })
    });
  });
  await page.route("**/api/check-ban-clan?**", route => {
    const player = new URL(route.request().url()).searchParams.get("player");
    calls.push(`check:${player}`);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ player, banStatus: "Permanently banned" }] })
    });
  });
  await openChecker(page);

  await page.locator("#accountIdInput").fill("account.lookup-test");
  await page.locator("#lookupIdBtn").click();
  const result = page.locator("#idLookupResults .player-row");
  await expect(result).toContainText("ResolvedPlayer");
  await expect(result.locator(".ban-label")).toHaveText("Permanently Banned");
  await expect(result.getByRole("button", { name: "Generate Ban Card" })).toBeVisible();
  expect(calls).toEqual(["resolve:account.lookup-test", "check:ResolvedPlayer"]);
});

test("abualixx uses the custom artwork with live ban-card stats", async ({ page }) => {
  const accountId = "account.6d96eb34e42046af9e9befba6e81df8b";
  let customArtworkRequested = false;
  page.on("request", request => {
    if (request.url().includes("/img/ban-cards/abualixx-ban-hammer.png")) customArtworkRequested = true;
  });
  await page.route("**/api/ban-card-data?**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      player: "abualixx",
      accountId,
      banStatus: "permanently_banned",
      checkedAt: "2026-09-06T12:00:00Z",
      mastery: { level: 214, tier: "Silver", tierNumber: 2 },
      lifetime: { matches: 1234, kills: 2468, wins: 57, losses: 1177, kd: 2.097, timeSurvived: 720000 },
      clan: "SZVXY",
      ranked: { highest: { label: "Diamond 3" } }
    })
  }));
  await openChecker(page);

  await page.evaluate(options => window.BanCard.open(options), {
    player: "abualixx",
    accountId,
    platform: "steam"
  });

  await expect(page.locator("#banCardCanvas")).toBeVisible();
  await expect(page.locator("#downloadBanCardBtn")).toBeEnabled();
  expect(customArtworkRequested).toBe(true);
  const overlayPixel = await page.locator("#banCardCanvas").evaluate(canvas =>
    Array.from(canvas.getContext("2d").getImageData(1, 480, 1, 1).data)
  );
  expect(overlayPixel[0]).toBeGreaterThan(100);
  expect(overlayPixel[1]).toBeLessThan(130);
});

test("sibarsaakiiya uses the GrindisReaaal custom ban card", async ({ page }) => {
  const accountId = "account.bb1ee7c376114fd6badf69eda4b016b0";
  let customArtworkRequested = false;
  page.on("request", request => {
    if (request.url().includes("/img/ban-cards/grindisreaaal-naruto.webp")) customArtworkRequested = true;
  });
  await page.route("**/api/ban-card-data?**", route => route.fulfill({ json: {
    player: "sibarsaakiiya",
    accountId,
    banStatus: "permanently_banned",
    checkedAt: "2026-09-12T12:00:00Z",
    mastery: { level: 100, tier: "Gold", tierNumber: 2 },
    lifetime: { matches: 20, kills: 40, wins: 1, losses: 19, kd: 2.1, timeSurvived: 72000 }
  } }));
  await openChecker(page);
  await page.evaluate(options => window.BanCard.open(options), {
    player: "sibarsaakiiya", accountId, platform: "steam"
  });

  await expect(page.locator("#banCardCanvas")).toBeVisible();
  await expect(page.locator("#downloadBanCardBtn")).toBeEnabled();
  expect(customArtworkRequested).toBe(true);
});
