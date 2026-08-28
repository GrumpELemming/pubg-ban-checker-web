const { test, expect } = require("@playwright/test");

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
