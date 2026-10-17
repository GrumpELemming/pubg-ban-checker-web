const { test, expect } = require('@playwright/test');

const pages = ['/', '/watchlist.html', '/links.html', '/updates.html', '/games.html', '/privacy.html', '/clan.html', '/clan-top.html', '/crate.html'];
const themes = ['phantom', 'cyber', 'red', 'green', 'gold', 'void', 'ember', 'synthwave', 'arctic', 'orange'];

for (const path of pages) {
  test(`${path} uses Phantom by default and shares saved theme colours`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('html')).toHaveClass('theme-phantom');
    const swatches = page.locator('.theme-swatch');
    if (await swatches.count()) {
      await expect(swatches.first()).toHaveAttribute('data-theme', 'phantom');
      await expect(swatches.first()).toHaveAttribute('aria-pressed', 'true');
    }
    const backgrounds = new Set();
    for (const theme of themes) {
      if (await swatches.count()) {
        await page.locator(`[data-theme="${theme}"]`).click();
        await expect(page.locator(`[data-theme="${theme}"]`)).toHaveAttribute('aria-pressed', 'true');
      } else {
        await page.evaluate(value => localStorage.setItem('pubgTheme', value), theme);
        await page.reload();
      }
      await expect(page.locator('html')).toHaveClass(`theme-${theme}`);
      backgrounds.add(await page.locator('body').evaluate(body => getComputedStyle(body).background));
      const title = page.locator('.nav-title');
      if (await title.count()) {
        const matches = await title.evaluate(element => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--accent)';
          document.body.append(probe);
          const expected = getComputedStyle(probe).color;
          probe.remove();
          return getComputedStyle(element).color === expected;
        });
        expect(matches).toBe(true);
      }
    }
    expect(backgrounds.size).toBe(themes.length);
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass('theme-orange');
  });
}

test('invalid saved theme falls back to Phantom', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('pubgTheme', 'invalid'));
  await page.reload();
  await expect(page.locator('html')).toHaveClass('theme-phantom');
});
