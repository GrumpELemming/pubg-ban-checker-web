const { test, expect } = require('@playwright/test');

for (const authenticated of [false, true]) {
  test(`teammate report access authenticated=${authenticated}`, async ({ page }) => {
    await page.route('**/api/auth/session', route => route.fulfill({ json: { available: true, authenticated, user: authenticated ? { id: '1', username: 'test' } : null } }));
    await page.route('**/api/watchlist', route => route.fulfill({ json: { watchlists: {} } }));
    await page.route('**/api/check-ban-clan?**', route => route.fulfill({ json: { results: [{ player: 'Target', accountId: 'account.target', banStatus: 'Temporarily banned' }] } }));
    await page.route('**/api/teammates?**', route => route.fulfill({ json: { teammates: [{ player: 'Friend', games: 7 }], matchesAnalyzed: 10, matchesAvailable: 11, matchesSkipped: 1, matchLimit: 30 } }));
    await page.goto('/');
    await page.locator('#playerInput').fill('Target');
    await page.locator('#checkBanBtn').click();
    await expect(page.locator('#results .ban-label')).toHaveText('Temporarily Banned');
    const button = page.getByRole('button', { name: 'Generate teammate report' });
    if (!authenticated) {
      await expect(button).toHaveCount(0);
      return;
    }
    await button.click();
    const report = page.locator('.teammate-report');
    await expect(report).toContainText('Friend — 7 games');
    await expect(report).toContainText('Counts are incomplete');
    await expect(report.getByRole('link', { name: 'PUBGLookup' })).toHaveAttribute('href', 'https://pubglookup.com/players/steam/Friend');
    await expect(report.getByRole('link', { name: 'PUBG Meta' })).toHaveAttribute('href', 'https://www.pubg-meta.com/player-stats/steam/Friend/profile');
  });
}
