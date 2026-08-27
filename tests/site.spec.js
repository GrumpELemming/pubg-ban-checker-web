const { test, expect } = require("@playwright/test");

const pages = ["/", "/watchlist.html", "/links.html", "/updates.html", "/games.html", "/privacy.html"];

for (const path of pages) {
  test(`${path} opens without errors or horizontal overflow`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(path);
    await expect(page.locator("h1")).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test("navigation uses valid links and identifies the current page", async ({ page }) => {
  await page.goto("/watchlist.html");
  await expect(page.locator(".nav-panel-buttons a[aria-current='page']")).toHaveText("Watchlist");
  await expect(page.locator(".nav-panel-buttons a button")).toHaveCount(0);
  await page.locator(".nav-panel-buttons a", { hasText: "Games" }).click();
  await expect(page).toHaveURL(/games\.html$/);
});

test("theme choice persists", async ({ page }) => {
  await page.goto("/");
  await page.locator(".theme-swatch[data-theme='gold']").click();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/theme-gold/);
  await expect(page.locator(".theme-swatch[data-theme='gold']")).toHaveAttribute("aria-pressed", "true");
});

test("email address is hidden until requested", async ({ page }) => {
  await page.goto("/privacy.html");
  await expect(page.locator("a[href^='mailto:']")).toHaveCount(0);
  await page.locator("[data-reveal-email]").first().click();
  await expect(page.locator("a[href^='mailto:']").first()).toBeVisible();
});

test("watchlist exposes display and sweep controls", async ({ page }) => {
  await page.goto("/watchlist.html");
  await expect(page.locator("#watchlistFilter")).toBeVisible();
  await expect(page.locator("#watchlistSort")).toBeVisible();
  await expect(page.locator("#pauseSweepBtn")).toBeHidden();
  await expect(page.locator("#stopSweepBtn")).toBeHidden();
  await expect(page.locator("#watchlistSyncDiagnostics")).toBeHidden();
  await expect(page.locator("#exportWatchlistBtn")).toBeHidden();
  await expect(page.locator("#revokeSessionsBtn")).toBeHidden();
  await expect(page.locator("#deleteSyncedWatchlistsBtn")).toBeHidden();
  await expect(page.locator("#deleteAccountDataBtn")).toBeHidden();
});

test("incomplete translations visibly identify English fallbacks", async ({ page }) => {
  await page.goto("/watchlist.html");
  await page.evaluate(() => localStorage.setItem("siteLang", "de"));
  await page.reload();
  await expect(page.locator(".i18n-fallback-note")).toContainText("shown in English");
});

for (const path of ["/hangman.html", "/pubg-mini.html", "/bluemem/bluemem.html", "/shne/shne.html"]) {
  test(`${path} has a consistent return link and fan notice`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(path);
    await expect(page.locator("a", { hasText: "Back to Games" })).toBeVisible();
    await expect(page.getByText(/not affiliated with PUBG or Krafton/i)).toBeVisible();
    await expect(page.locator("link[rel='icon']")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
