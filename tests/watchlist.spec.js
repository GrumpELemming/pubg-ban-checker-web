const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const now = Date.now();

function entry(player, overrides = {}) {
  return {
    id: `test-${player}`,
    player,
    platform: "steam",
    statusLabel: "Not Banned",
    lastChecked: now,
    createdAt: now - 60_000,
    updatedAt: now,
    ...overrides
  };
}

async function openGuestWatchlist(page, entries = []) {
  await page.route("**/api/auth/session", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: true, authenticated: false })
  }));
  await page.addInitScript(value => {
    localStorage.setItem("selectedPlatform", "steam");
    localStorage.setItem("watchlist_steam", JSON.stringify(value));
  }, entries);
  await page.goto("/watchlist.html");
  await expect(page.locator("#watchlistAccountSummary")).toHaveAttribute("data-auth-state", "signed-out");
}

async function mockBanChecks(page, handler) {
  await page.route("**/api/check-ban-clan?**", handler);
}

async function openSignedInWatchlist(page, watchlists = {}) {
  await page.route("**/api/auth/session", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      available: true,
      authenticated: true,
      csrfToken: "test-csrf",
      user: { id: "123", username: "tester", displayName: "Test User" }
    })
  }));
  await page.route("**/api/watchlist", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ watchlists })
  }));
  await page.route("**/api/watchlist/**", async route => {
    const request = route.request();
    const platform = new URL(request.url()).pathname.split("/").pop();
    const body = request.postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ watchlist: { platform, entries: body.entries, revision: Number(body.expectedRevision || 0) + 1 } })
    });
  });
  await page.goto("/watchlist.html");
  await expect(page.locator("#watchlistAccountSummary")).toHaveAttribute("data-auth-state", "signed-in");
}

test("a single re-check updates only its selected card", async ({ page }) => {
  await openGuestWatchlist(page, [entry("Alpha"), entry("Bravo")]);
  let requests = 0;
  await mockBanChecks(page, async route => {
    requests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ player: "Alpha", banStatus: "Temporarily banned", clan: "QA" }] })
    });
  });

  const alpha = page.locator(".watchlist-player", { hasText: "Alpha" });
  const bravo = page.locator(".watchlist-player", { hasText: "Bravo" });
  await alpha.getByRole("button", { name: "Re-check" }).click();

  await expect(alpha.locator(".wl-status-pill")).toHaveText("TEMP");
  await expect(bravo.locator(".wl-status-pill")).toHaveText("OK");
  expect(requests).toBe(1);
});

test("only one account can be checked at a time", async ({ page }) => {
  await openGuestWatchlist(page, [entry("Alpha"), entry("Bravo")]);
  const requests = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await mockBanChecks(page, async route => {
    const player = new URL(route.request().url()).searchParams.get("player");
    requests.push(player);
    if (player === "Alpha") await pending;
    await route.fulfill({ json: { results: [{ player, banStatus: "Temporarily banned" }] } });
  });
  const alpha = page.locator(".watchlist-player", { hasText: "Alpha" });
  const bravo = page.locator(".watchlist-player", { hasText: "Bravo" });
  await alpha.getByRole("button", { name: "Re-check" }).click();
  await expect.poll(() => requests).toEqual(["Alpha"]);
  await expect(bravo.getByRole("button", { name: "Re-check" })).toBeDisabled();
  await bravo.getByRole("button", { name: "Re-check" }).evaluate(button => button.dispatchEvent(new MouseEvent("click")));
  expect(requests).toEqual(["Alpha"]);
  release();
  await expect(alpha.locator(".wl-status-pill")).toHaveText("TEMP");
  await expect(bravo.getByRole("button", { name: "Re-check" })).toBeEnabled();
  await bravo.getByRole("button", { name: "Re-check" }).click();
  await expect(bravo.locator(".wl-status-pill")).toHaveText("TEMP");
  expect(requests).toEqual(["Alpha", "Bravo"]);
});

test("failed checks release the lock and preserve the saved status", async ({ page }) => {
  await openGuestWatchlist(page, [entry("Alpha")]);
  await mockBanChecks(page, route => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  const row = page.locator(".watchlist-player");
  await row.getByRole("button", { name: "Re-check" }).click();
  await expect(page.locator("#watchlistCheckStatus")).toContainText("Could not check Alpha");
  await expect(row.getByRole("button", { name: "Re-check" })).toBeEnabled();
  await expect(row.locator(".wl-status-pill")).toHaveText("OK");
});

test("Discord accounts save individual checks and removals", async ({ page }) => {
  const writes = [];
  await openSignedInWatchlist(page, { steam: { platform: "steam", revision: 1, entries: [entry("Alpha")] } });
  await page.route("**/api/watchlist/steam", route => {
    expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
    const body = route.request().postDataJSON();
    writes.push(body.entries);
    return route.fulfill({ json: { watchlist: { platform: "steam", entries: body.entries, revision: body.expectedRevision + 1 } } });
  });
  await mockBanChecks(page, route => route.fulfill({ json: { results: [{ player: "Alpha", banStatus: "Permanently banned" }] } }));
  await page.getByRole("button", { name: "Re-check" }).click();
  await expect.poll(() => writes.some(items => items[0]?.statusLabel === "Permanently banned")).toBe(true);
  await expect(page.locator(".wl-observed-history, .wl-notes, .wl-stale-badge")).toHaveCount(0);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(() => writes.at(-1)).toEqual([]);
  await expect(page.locator("#watchlistSignOutBtn")).toBeVisible();
});

test("primary pages have no serious or critical automated accessibility violations", async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ available: true, authenticated: false })
  }));
  for (const path of ["/", "/watchlist.html"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const highImpact = results.violations.filter(violation => ["serious", "critical"].includes(violation.impact));
    expect(highImpact, `${path}: ${highImpact.map(item => `${item.id} (${item.nodes.length})`).join(", ")}`).toEqual([]);
  }
});
