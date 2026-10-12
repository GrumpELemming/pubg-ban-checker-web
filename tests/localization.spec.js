const { test, expect } = require('@playwright/test');
const pages = ['/', '/watchlist.html', '/links.html', '/updates.html', '/games.html', '/privacy.html', '/clan.html', '/clan-top.html', '/crate.html', '/hangman.html', '/pubg-mini.html', '/bluemem/bluemem.html', '/shne/shne.html', '/red13/index.html'];
const languages = ['ko', 'zh', 'de', 'fi', 'pl', 'ru', 'tr', 'hy', 'ar'];

test('Korean Watchlist localizes missing values and sign-out while preserving the Discord name', async ({ page }) => {
  const entry = { id:'review-player', player:'About', platform:'steam', statusLabel:'Not Banned', accountId:'', clan:'', createdAt:Date.now(), updatedAt:Date.now() };
  await page.addInitScript(() => { localStorage.setItem('siteLang','ko'); localStorage.setItem('selectedPlatform','steam'); });
  await page.route('**/api/auth/session', route => route.fulfill({ contentType:'application/json', body:JSON.stringify({available:true,authenticated:true,user:{id:'123',username:'Games'},csrfToken:'test'}) }));
  await page.route('**/api/watchlist', route => route.fulfill({ contentType:'application/json', body:JSON.stringify({watchlists:{steam:{platform:'steam',revision:1,entries:[entry]}}}) }));
  let finishLogout;
  await page.route('**/api/auth/logout', async route => {
    await new Promise(resolve => { finishLogout = resolve; });
    await route.fulfill({contentType:'application/json',body:'{}'});
  });
  await page.goto('/watchlist.html');
  await expect(page.locator('#watchlistAccountName')).toHaveText('Games');
  const row = page.locator('.watchlist-player');
  await expect(row.locator('.wl-name-line strong')).toHaveText('About');
  await expect(row.locator('.wl-meta-account strong')).toHaveText('알 수 없음');
  await expect(row).toHaveAttribute('data-track-label','추적');
  await page.locator('#watchlistSignOutBtn').click();
  await expect(page.locator('#watchlistAccountName')).toHaveText('로그아웃 중…');
  await expect.poll(() => Boolean(finishLogout)).toBe(true);
  finishLogout();
  await expect(page.locator('#watchlistAccountName')).toHaveText('비회원 관심 목록');
});

for (const lang of languages) {
  test(`${lang}: every page has persistent language selection and translated authored text`, async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(lang => localStorage.setItem('siteLang', lang), lang);
    await page.route('**/api/**', route => route.fulfill({ status:503, contentType:'application/json', body:'{}' }));
    for (const path of pages) {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang',lang);
      await expect(page.locator('.lang-switch select')).toHaveValue(lang);
      await expect(page.locator('html')).toHaveAttribute('dir',lang==='ar'?'rtl':'ltr');
      const untranslated = await page.evaluate(() => {
        const missing = [];
        const walker = document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (node.parentElement.closest('script,style,code,pre,select,[translate="no"],[data-i18n-ignore],noscript')) continue;
          const source = node.nodeValue.replace(/\s+/g,' ').trim();
          if (source && window.pbcTranslate(source) !== source) missing.push(source);
        }
        return missing;
      });
      expect(untranslated, `${path}: untranslated authored text`).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth);
      expect(overflow, `${path}: horizontal overflow`).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });
}

test('Korean search, teammate report, errors, and switching back to English preserve identifiers', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('siteLang','ko'); localStorage.setItem('selectedPlatform','steam'); });
  await page.route('**/api/auth/session', route => route.fulfill({ contentType:'application/json', body:JSON.stringify({available:true, authenticated:true, user:{id:'123',username:'Games'},csrfToken:'test'}) }));
  await page.route('**/api/check-ban-clan?**', route => route.fulfill({ contentType:'application/json', body:JSON.stringify({results:[{player:'Games',accountId:'account.games',clan:'Unknown',banStatus:'Temporarily Banned'}]}) }));
  await page.route('**/api/teammates?**', route => route.fulfill({ contentType:'application/json', body:JSON.stringify({matchesAnalyzed:3,matchesAvailable:4,matchLimit:10,teammates:[{player:'About',games:2}]}) }));
  await page.goto('/');
  await page.locator('#checkBanBtn').click();
  await expect(page.locator('#results')).toContainText('플레이어 이름을 입력하세요.');
  await page.locator('#playerInput').fill('Games');
  await page.locator('#checkBanBtn').click();
  const result = page.locator('#results .player-row');
  await expect(result.locator('.ban-label')).toHaveText('일시 이용 정지 (임시 제재)');
  await expect(result.locator('strong').first()).toHaveText('Games');
  await expect(result.locator('[translate="no"]', {hasText:'Unknown'})).toHaveText('Unknown');
  await expect(result).toContainText('PUBG(배틀그라운드) 에서 보고됨');
  await result.locator('.teammate-btn').click();
  await expect(result.locator('.teammate-report h3')).toHaveText('가장 자주 함께한 팀원');
  await expect(result.locator('.teammate-report strong')).toHaveText('About');
  await page.locator('#langSelect').selectOption('en');
  await expect(result.locator('.ban-label')).toHaveText('Temporarily Banned');
  await expect(result.locator('.teammate-report h3')).toHaveText('Most frequent teammates');
  await expect(result.locator('strong').first()).toHaveText('Games');
});

test('Korean crate controls and dynamically revealed rewards are localized', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('siteLang','ko'));
  await page.goto('/crate.html');
  await page.locator('#openPackBtn').click();
  await page.locator('#revealAllBtn').click();
  await expect(page.locator('.crate-card')).toHaveCount(10);
  await expect(page.locator('.flip-hint').first()).toHaveText('뒤집기');
  const untranslated = await page.locator('#cardsGrid').evaluate(root => {
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT); const missing=[];
    while(walker.nextNode()) { const text=walker.currentNode.nodeValue.trim(); if(text && window.pbcTranslate(text)!==text) missing.push(text); }
    return missing;
  });
  expect(untranslated).toEqual([]);
});
