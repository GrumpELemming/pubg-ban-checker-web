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

test("Refresh All checks players sequentially", async ({ page }) => {
  await openGuestWatchlist(page, [entry("Alpha"), entry("Bravo"), entry("Charlie")]);
  const order = [];
  let active = 0;
  let maximumActive = 0;
  await mockBanChecks(page, async route => {
    const player = new URL(route.request().url()).searchParams.get("player");
    order.push(player);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, 80));
    active -= 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ player, banStatus: "Temporarily banned" }] })
    });
  });

  await page.getByRole("button", { name: "Refresh All" }).click();
  await expect(page.locator("#sweepSummary")).toContainText("Sweep complete: 3 checked");
  expect(order).toEqual(["Alpha", "Bravo", "Charlie"]);
  expect(maximumActive).toBe(1);
});

test("a sweep can be paused, resumed, and stopped", async ({ page }) => {
  await openGuestWatchlist(page, [entry("Alpha"), entry("Bravo"), entry("Charlie")]);
  let requests = 0;
  await mockBanChecks(page, async route => {
    requests += 1;
    const player = new URL(route.request().url()).searchParams.get("player");
    await new Promise(resolve => setTimeout(resolve, 120));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ player, banStatus: "Temporarily banned" }] })
    });
  });

  await page.getByRole("button", { name: "Refresh All" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.waitForTimeout(1100);
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Resume" }).click();
  await expect.poll(() => requests).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.locator("#sweepSummary")).toContainText("Sweep stopped");
  expect(requests).toBeLessThan(3);
});

test("failed checks are retained and can be retried", async ({ page }) => {
  await openGuestWatchlist(page, [entry("Alpha")]);
  let requests = 0;
  await mockBanChecks(page, route => {
    requests += 1;
    if (requests === 1) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Unavailable" }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ player: "Alpha", banStatus: "Temporarily banned" }] })
    });
  });

  await page.getByRole("button", { name: "Refresh All" }).click();
  await expect(page.locator("#sweepSummary")).toContainText("1 failed");
  await expect(page.getByRole("button", { name: "Retry failed checks" })).toBeVisible();
  await page.getByRole("button", { name: "Retry failed checks" }).click();
  await expect(page.locator("#sweepSummary")).toContainText("1 checked");
  await expect(page.locator(".wl-status-pill")).toHaveText("TEMP");
  expect(requests).toBe(2);
});

test("filters, sorting, removing, and clearing keep storage and cards aligned", async ({ page }) => {
  await openGuestWatchlist(page, [
    entry("Zulu", { statusLabel: "Permanently banned", lastChecked: now - 3 * 24 * 60 * 60 * 1000, lastStatusChangeAt: now - 20_000 }),
    entry("Alpha", { tempBanCount: 2 }),
    entry("Mike", { statusLabel: "Temporarily banned", lastChecked: now - 1000, lastStatusChangeAt: now - 10_000 }),
    entry("Never", { lastChecked: 0 })
  ]);

  await expect(page.locator(".wl-stale-badge")).toHaveCount(2);
  await page.locator("#watchlistFilter").selectOption("never");
  await expect(page.locator(".watchlist-player")).toHaveCount(1);
  await expect(page.locator(".wl-name-line strong")).toHaveText("Never");
  await page.locator("#watchlistFilter").selectOption("banned");
  await expect(page.locator(".watchlist-player")).toHaveCount(2);
  await page.locator("#watchlistFilter").selectOption("all");
  await page.locator("#watchlistSort").selectOption("changed");
  await expect(page.locator(".wl-name-line strong").first()).toHaveText("Mike");
  await page.locator("#watchlistSort").selectOption("name");
  await expect(page.locator(".wl-name-line strong")).toHaveText(["Alpha", "Mike", "Never", "Zulu"]);

  await page.locator(".watchlist-player", { hasText: "Mike" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.locator(".watchlist-player")).toHaveCount(3);
  await page.getByRole("button", { name: "Clear All" }).click();
  await expect(page.locator("#watchlistContainer")).toContainText("No players match this view");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("watchlist_steam")));
  expect(stored).toEqual([]);
});

test("signed-in history shows recent observations and expands older ones", async ({ page }) => {
  const observations = Array.from({ length: 7 }, (_, index) => ({
    status: index % 2 ? "temporary" : "innocent",
    observedAt: now - index * 60_000
  }));
  const signedInEntry = entry("Historian", {
    checkCount: 7,
    tempBanCount: 3,
    effectiveStatus: "temporary",
    firstWatchedAt: now - 7 * 60_000,
    observations
  });
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
    body: JSON.stringify({ watchlists: { steam: { entries: [signedInEntry], revision: 1 } } })
  }));
  await page.route("**/api/watchlist/**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ entries: [], revision: 2 })
  }));
  await page.goto("/watchlist.html");

  await expect(page.locator("#watchlistObservationNotice")).toBeVisible();
  await expect(page.locator(".wl-observed-history > summary")).toContainText("7 checks");
  await page.locator(".wl-observed-history > summary").click();
  await expect(page.locator(".wl-observed-history > .wl-observation-timeline > li")).toHaveCount(5);
  await expect(page.locator(".wl-observed-history details > summary")).toContainText("Show 2 earlier observations");
  await page.locator(".wl-observed-history details > summary").click();
  await expect(page.locator(".wl-observed-history details li")).toHaveCount(2);
});

test("signed-in users can export and restore a merged Watchlist backup", async ({ page }) => {
  await openSignedInWatchlist(page, {
    steam: { entries: [entry("Alpha", { notes: "Existing note" })], revision: 1 }
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export my data" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^pubg-ban-checker-watchlist-\d{4}-\d{2}-\d{2}\.json$/);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(exported.account).toMatchObject({ id: "123", username: "tester" });
  expect(exported.watchlists.steam).toHaveLength(1);

  page.once("dialog", dialog => dialog.accept());
  await page.locator("#importWatchlistFile").setInputFiles({
    name: "watchlist-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      exportedAt: new Date().toISOString(),
      watchlists: {
        steam: [entry("Alpha", { notes: "Imported note" }), entry("Bravo", { statusLabel: "Temporarily banned" })],
        xbox: [entry("ConsolePlayer", { platform: "xbox" })],
        psn: [],
        kakao: []
      }
    }))
  });

  await expect(page.locator("#watchlistAccountStatus")).toContainText("Backup imported successfully");
  const restored = await page.evaluate(() => ({
    steam: window.PBCWatchlistStore.get("steam"),
    xbox: window.PBCWatchlistStore.get("xbox")
  }));
  expect(restored.steam).toHaveLength(2);
  expect(restored.steam.map(item => item.player).sort()).toEqual(["Alpha", "Bravo"]);
  expect(restored.xbox).toHaveLength(1);
  expect(restored.xbox[0].player).toBe("ConsolePlayer");
});

test("invalid backup files are rejected without changing Watchlist data", async ({ page }) => {
  await openSignedInWatchlist(page, {
    steam: { entries: [entry("Alpha")], revision: 1 }
  });
  await page.locator("#importWatchlistFile").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ unrelated: true }))
  });

  await expect(page.locator("#watchlistAccountStatus")).toContainText("does not contain Watchlist backup data");
  const players = await page.evaluate(() => window.PBCWatchlistStore.get("steam").map(item => item.player));
  expect(players).toEqual(["Alpha"]);
});

test("signing out other sessions requires confirmation and sends CSRF protection", async ({ page }) => {
  let requestDetails = null;
  await page.route("**/api/auth/logout-others", route => {
    requestDetails = {
      method: route.request().method(),
      csrf: route.request().headers()["x-csrf-token"]
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessionsRevoked: 2 })
    });
  });
  await openSignedInWatchlist(page);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Sign out other sessions" }).click();

  await expect(page.locator("#watchlistAccountStatus")).toContainText("2 other sessions signed out");
  expect(requestDetails).toEqual({ method: "POST", csrf: "test-csrf" });
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
