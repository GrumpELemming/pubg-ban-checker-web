const { test, expect } = require("@playwright/test");

test("search results switch languages and preserve canonical Watchlist status", async ({ page }) => {
  await page.route("**/api/check-ban-clan?**", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ results: [{ player: "Alpha", accountId: "account.alpha", banStatus: "Temporarily Banned" }] })
  }));
  await openChecker(page);
  await page.locator("#langSelect").selectOption("ko");
  await page.locator("#playerInput").fill("Alpha");
  await page.locator("#checkBanBtn").click();
  const result = page.locator("#results .player-row");
  await expect(result.locator(".ban-label")).toHaveText("일시 이용 정지 (임시 제재)");
  await expect(result).toContainText("클랜: 없음");
  await expect(result).toContainText("PUBG(배틀그라운드) 에서 보고됨");
  await result.getByRole("button", { name: "관심 목록에 추가", exact: true }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("watchlist_steam")));
  expect(stored[0].statusLabel).toBe("Temporarily Banned");
  for (const lang of ["zh", "de", "fi", "pl", "ru", "tr", "hy", "ar"]) {
    await page.locator("#langSelect").selectOption(lang);
    await expect(result.locator(".ban-label")).not.toHaveText("Temporarily Banned");
    await expect(result).not.toContainText("Reported by PUBG now");
    await expect(result.locator('[data-i18n="results.added"]')).toBeDisabled();
    await expect(result).not.toContainText("results.");
  }
});

async function openChecker(page) {
  await page.route("**/api/auth/session", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: true, authenticated: false })
  }));
  await page.addInitScript(() => localStorage.setItem("selectedPlatform", "steam"));
  await page.goto("/");
}

for (const status of ["Temporarily Banned", "Permanently Banned"]) {
  test(`a ${status} player renders the PUBG response and adds it to the Watchlist without ban cards`, async ({ page }) => {
    const cardRequests = [];
    page.on("request", request => {
      if (/ban-card|ban-cards/.test(request.url())) cardRequests.push(request.url());
    });
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
            banStatus: status
          }]
        })
      });
    });
    await openChecker(page);

    await page.locator("#playerInput").fill("Alpha");
    await page.locator("#checkBanBtn").click();
    const result = page.locator("#results .player-row", { hasText: "Alpha" });
    await expect(result.locator(".ban-label")).toHaveText(status);
    await expect(result).toContainText("Reported by PUBG now");
    await expect(result).toContainText("account.test-alpha");
    await expect(result).toContainText("TEST");

    await expect(result.getByRole("button", { name: "Generate Ban Card" })).toHaveCount(0);
    await expect(page.locator("#banCardModal")).toHaveCount(0);
    await result.getByRole("button", { name: "Add to Watchlist" }).click();
    await expect(result.getByRole("button", { name: "Added" })).toBeDisabled();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("watchlist_steam")));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      player: "Alpha",
      accountId: "account.test-alpha",
      clan: "TEST",
      statusLabel: status
    });

    await page.goto("/watchlist.html");
    const card = page.locator(".watchlist-player", { hasText: "Alpha" });
    await expect(card).toBeVisible();
    await expect(card.locator(".wl-status-pill")).toHaveText(status.startsWith("Permanently") ? "PERMA" : "TEMP");
    await expect(card.getByRole("button", { name: "Generate Ban Card" })).toHaveCount(0);
    await expect(page.locator("#banCardModal")).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Re-check", exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    expect(cardRequests).toEqual([]);
});
}

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
  await expect(result.getByRole("button", { name: "Generate Ban Card" })).toHaveCount(0);
  expect(calls).toEqual(["resolve:account.lookup-test", "check:ResolvedPlayer"]);
});
