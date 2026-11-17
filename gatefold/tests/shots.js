/* DEVELOPMENT ONLY. Captures the states that the layout review looks at. */
const path = require('path');
const { ROOT, launch, open, KEY } = require('./lib');
const SEEDED = Object.assign({}, KEY, { seeds: { artists: ['Don Toliver', 'Taylor Swift', 'Katy Perry'], genres: [], done: true, rev: 1, turn: 0, resolved: {} } });
const out = (n) => path.join(ROOT, 'shots', 'state-' + n + '.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const go = async (page, hash, sel) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForSelector(sel); await sleep(250); };

async function run(browser, name, opts) {
  const phone = opts.viewport.width < 720;
  // first run and onboarding
  let a = await open(browser, Object.assign({ api: 'long' }, opts));
  await a.page.screenshot({ path: out(name + '-01-connect') });
  await a.ctx.close();
  a = await open(browser, Object.assign({ api: 'long', storage: KEY }, opts));
  await a.page.screenshot({ path: out(name + '-02-favorites') });
  await go(a.page, '#library', '#view[data-view="library"] .view-title');
  await a.page.screenshot({ path: out(name + '-03-library-empty') });
  await go(a.page, '#search', '#search-input');
  await a.page.screenshot({ path: out(name + '-04-search-idle') });
  await a.page.fill('#search-input', 'zzzzqqq'); await a.page.press('#search-input', 'Enter'); await a.page.waitForSelector('#view .empty'); await sleep(200);
  await a.page.screenshot({ path: out(name + '-05-search-none') });
  await a.page.fill('#search-input', '__fail'); await a.page.press('#search-input', 'Enter'); await a.page.waitForSelector('#view .notice'); await sleep(200);
  await a.page.screenshot({ path: out(name + '-06-search-error') });
  await a.ctx.close();

  // in use
  const { ctx, page } = await open(browser, Object.assign({ api: 'long', storage: SEEDED }, opts));
  await page.waitForSelector('#view .section .row[data-id]', { timeout: 10000 });
  await page.evaluate(async () => {
    const C = window.GF.catalog, PL = window.GF.playlists;
    const a = await C.search('summer', { limit: 12 }), b = await C.search('harbor', { limit: 6 });
    const one = PL.create('Road Trip'); a.forEach((t) => PL.addTrack(one.id, t));
    const two = PL.create('Quiet Sunday'); b.forEach((t) => PL.addTrack(two.id, t));
    PL.create('Empty for now');
    window.__one = one.id; window.__empty = PL.all()[2].id;
    const long = await C.search('edge', { limit: 1 });
    window.__long = long[0];
  });
  await page.locator('#view .row[data-id] .row__main').nth(1).click();
  await page.waitForFunction(() => window.GF.player.state.status === 'playing');
  await page.evaluate(() => window.GF.player.seek(64));
  await sleep(500);
  await page.mouse.move(2, 300);
  await page.screenshot({ path: out(name + '-10-listen') });

  await go(page, '#search', '#search-input');
  await page.fill('#search-input', 'golden'); await page.press('#search-input', 'Enter'); await page.waitForSelector('#view .row[data-id]'); await sleep(300);
  await page.locator('#view .row[data-id]').nth(1).locator('[data-act="add"]').click();
  await page.waitForSelector('.menu'); await sleep(150);
  await page.screenshot({ path: out(name + '-11-search-addmenu') });
  await page.locator('.menu .menu__item', { hasText: 'New playlist' }).click(); await sleep(150);
  await page.screenshot({ path: out(name + '-12-search-newplaylist') });
  await page.keyboard.press('Escape');
  await page.locator('#view .row[data-id]').nth(2).locator('[data-act="add"]').click();
  await page.locator('.menu .menu__item', { hasText: 'Quiet Sunday' }).click(); await sleep(200);
  await page.mouse.move(2, 300);
  await page.screenshot({ path: out(name + '-13-search-toast') });

  await go(page, '#library', '#view .plrow');
  await page.screenshot({ path: out(name + '-14-library') });
  await page.click('#view [data-act="new"]'); await sleep(150);
  await page.screenshot({ path: out(name + '-15-library-new') });
  await page.keyboard.press('Escape');

  await page.evaluate(() => { location.hash = '#playlist/' + window.__one; });
  await page.waitForSelector('#view .plhead'); await sleep(300);
  await page.screenshot({ path: out(name + '-16-playlist') });
  if (phone) { await page.click('#view [data-act="more-actions"]'); await sleep(150); await page.screenshot({ path: out(name + '-17-playlist-more') }); await page.locator('.menu .menu__item', { hasText: 'Rename' }).click(); }
  else await page.click('#view [data-act="rename"]');
  await sleep(200);
  await page.screenshot({ path: out(name + '-18-playlist-rename') });
  await page.keyboard.press('Escape'); await sleep(150);
  if (phone) { await page.click('#view [data-act="more-actions"]'); await page.locator('.menu .menu__item', { hasText: 'Delete' }).click(); }
  else await page.click('#view [data-act="delete"]');
  await page.waitForSelector('dialog[open]'); await sleep(150);
  await page.screenshot({ path: out(name + '-19-playlist-delete') });
  await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#playlist/' + window.__empty; });
  await page.waitForSelector('#view .empty'); await sleep(200);
  await page.screenshot({ path: out(name + '-20-playlist-empty') });

  // long names in the player
  await page.evaluate(() => window.GF.player.playList([window.__long], 0, { type: 'search', name: 'Search: edge' }));
  await page.waitForFunction(() => window.GF.player.state.status === 'playing'); await sleep(300);
  await go(page, '#listen', '#view .section');
  if (phone) { await page.click('#player .mini__open'); await sleep(450); }
  await page.screenshot({ path: out(name + '-21-player-long') });
  if (phone) { await page.click('#sheet [data-act="close"]'); await sleep(300); }

  // settings, with the connection check finished
  await page.click('#open-settings'); await page.waitForSelector('dialog[open]');
  await page.click('dialog[open] [data-act="check"]');
  await page.waitForFunction(() => /Finished/.test(document.querySelector('dialog[open] .checks').textContent), null, { timeout: 30000 });
  await sleep(200);
  await page.screenshot({ path: out(name + '-22-settings') });
  await page.keyboard.press('Escape');
  await page.locator('#view .view-actions .btn', { hasText: 'Favorites' }).click(); await page.waitForSelector('dialog[open]'); await sleep(200);
  await page.screenshot({ path: out(name + '-23-favorites-dialog') });
  await ctx.close();
}

(async () => {
  const browser = await launch();
  await run(browser, 'desktop', { viewport: { width: 1440, height: 900 } });
  await run(browser, 'phone', { viewport: { width: 390, height: 844 }, touch: true, dpr: 2 });
  await browser.close();
  console.log('done');
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
