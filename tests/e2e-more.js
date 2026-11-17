/* DEVELOPMENT ONLY. Second half of the browser checks: recommendations,
   failures, keyboard access, layout at five screen sizes, the phone player,
   resuming, reduced motion, outside requests, the single-file build and
   backups. Loaded by tests/e2e.js. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, API, appUrl, open, KEY, state, newProfile } = require('./lib');

const groups = {};
let T = null;                       // helpers from e2e.js, bound lazily to avoid a circular load
const t = () => (T = T || require('./e2e'));
const check = (...a) => t().check(...a);

const SEEDS = { artists: ['Taylor Swift'], genres: ['pop'], done: true, rev: 1, turn: 0, resolved: {} };
const SEEDED = Object.assign({}, KEY, { seeds: SEEDS });
const SHOTS = path.join(ROOT, 'shots');

/* Listen to the current song for real: past the halfway mark, then let it end. */
async function hearOut(page) {
  const { waitStatus } = t();
  await waitStatus(page, 'playing');
  const id = (await state(page)).id;
  await page.waitForFunction(() => {
    const s = window.GF.player.state;
    return s.duration > 0 && s.time >= s.duration * 0.58;
  }, null, { timeout: 30000 });
  await page.evaluate(() => { const P = window.GF.player; P.seek(P.state.duration - 0.8); });
  await page.waitForFunction((was) => {
    const c = window.GF.player.current();
    return !c || c.id !== was || window.GF.player.state.status === 'paused';
  }, id, { timeout: 8000 });
  return id;
}

groups.recs = async (browser) => {
  const { search, ids, stored, sleep, addToPlaylist, waitStatus } = t();
  const { ctx, page, problems } = await open(browser, { storage: SEEDED });
  await page.waitForSelector('#view .section .row[data-id]', { timeout: 10000 });
  const reasonsA = await page.$$eval('#view .section__title', (els) => els.map((e) => e.textContent));
  const idsA = await ids(page);
  check('starting state: a selection built from favorites', reasonsA.length >= 1 && idsA.length >= 5, reasonsA.join(' | '));

  // skipping through songs is not listening
  await search(page, 'Brass Meridian');
  const brass = await ids(page);
  await page.locator('#view .row[data-id] .row__main').first().click();
  await waitStatus(page, 'playing');
  await page.evaluate(() => { const P = window.GF.player; P.seek(P.state.duration - 0.6); });
  await page.waitForFunction((id) => window.GF.player.current().id !== id, brass[0], { timeout: 8000 });
  check('jumping to the end of a song is not counted as listening', ((await stored(page, 'signals')) || []).length === 0);

  // two songs heard properly, one saved
  const heard = [];
  check('the artist has enough songs for this scenario', brass.length >= 4, String(brass.length));
  const saveAt = 0;                 // the song that was jumped through, so it was never "heard"
  await page.locator('#view .row[data-id] .row__main').nth(2).click();
  heard.push(await hearOut(page));
  heard.push(await hearOut(page));
  await page.evaluate(() => window.GF.player.pause());
  let signals = await stored(page, 'signals');
  check('songs played past halfway are noted as listened and finished',
    heard.every((id) => signals.some((s) => s.id === id && s.k === 'listen') && signals.some((s) => s.id === id && s.k === 'finish')),
    signals.map((s) => s.k).join(','));
  await addToPlaylist(page, saveAt, 'Brass', true);
  signals = await stored(page, 'signals');
  check('saving a song to a playlist is noted', signals.some((s) => s.k === 'add' && s.id === brass[saveAt]));

  // the selection responds
  await page.click('.nav a[data-nav="listen"]');
  await page.waitForFunction(() => {
    const titles = Array.from(document.querySelectorAll('#view .section__title')).map((e) => e.textContent);
    return titles.some((x) => /Brass Meridian|jazz|funk/.test(x));
  }, null, { timeout: 10000 });
  const reasonsB = await page.$$eval('#view .section__title', (els) => els.map((e) => e.textContent));
  const idsB = await ids(page);
  check('Listen rebuilds itself after meaningful listening', reasonsB.join('|') !== reasonsA.join('|'), reasonsB.join(' | '));
  check('the new reasons name what was actually played', reasonsB.some((r) => /^(Because you play|More from) Brass Meridian$/.test(r)) && reasonsB.some((r) => /^Because you (play|save) .*(jazz|funk)/.test(r)), reasonsB.join(' | '));
  check('songs just heard are not suggested again', heard.every((id) => !idsB.includes(id)));
  check('songs already saved are not suggested', !idsB.includes(brass[saveAt]));
  check('the heading says it is based on listening', /what you play and save/.test(await page.textContent('#view .view-sub')));

  // refresh gives a different selection
  await page.click('#view [data-act="refresh"]');
  await page.waitForSelector('#view .row--ghost');
  await page.waitForSelector('#view .section .row[data-id]', { timeout: 10000 });
  const idsC = await ids(page);
  check('Refresh brings different songs', idsC.join() !== idsB.join() && idsC.some((id) => !idsB.includes(id)), `${idsC.filter((id) => !idsB.includes(id)).length} new of ${idsC.length}`);

  // an early skip keeps that song away
  const victim = idsC[0];
  await page.locator('#view .row[data-id] .row__main').first().click();
  await waitStatus(page, 'playing');
  await sleep(2600);
  await page.click('#player [data-act="next"]');
  await sleep(300);
  check('skipping a song in its first seconds is noted', (await stored(page, 'signals')).some((s) => s.k === 'skip' && s.id === victim));
  await page.evaluate(() => window.GF.player.pause());
  await page.click('#view [data-act="refresh"]');
  await page.waitForSelector('#view .row--ghost');
  await page.waitForSelector('#view .section .row[data-id]', { timeout: 10000 });
  check('a skipped song is not suggested again', !(await ids(page)).includes(victim));

  // favorites can be edited later
  await page.locator('#view .view-actions .btn', { hasText: 'Favorites' }).click();
  await page.waitForSelector('dialog[open]');
  await page.click('dialog[open] .chip:text-is("Ambient")');
  await page.locator('dialog[open] .btn', { hasText: 'Save favorites' }).click();
  await page.waitForSelector('#view .section .row[data-id]', { timeout: 10000 });
  check('favorites can be changed later', (await stored(page, 'seeds')).genres.includes('ambient'));

  // clearing history starts over
  await page.click('#open-settings');
  await page.locator('dialog[open] .btn', { hasText: 'Clear history and favorites' }).click();
  await page.locator('dialog[open] .btn', { hasText: 'Clear history' }).last().click();
  await sleep(300);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#view .panel', { timeout: 5000 });
  check('clearing history returns Listen to its starting state', (await stored(page, 'signals')).length === 0 && await page.locator('#view .panel', { hasText: 'Start with a few favorites' }).count() === 1);
  check('playlists survive clearing history', (await stored(page, 'playlists')).length === 1);
  check('no script errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
};

groups.failures = async (browser) => {
  const { search, titles, ids, stored, sleep, waitStatus, toastText } = t();
  const { ctx, page, problems } = await open(browser, { storage: SEEDED });

  await search(page, 'zzzzqqq');
  check('a search with no matches says so', /No songs match “zzzzqqq”/.test(await page.textContent('#view .empty')));

  await search(page, '__fail');
  check('a failed search shows a notice with a retry', /Jamendo reported a problem/.test(await page.textContent('#view .notice')) && await page.locator('#view .notice .btn', { hasText: 'Try again' }).count() === 1, await page.textContent('#view .notice'));
  await page.fill('#search-input', 'golden');
  await page.press('#search-input', 'Enter');
  await page.waitForSelector('#view .row[data-id]');
  check('search recovers after a failure', (await titles(page)).length > 0);

  await search(page, '__rate');
  check('rate limiting is explained', /Jamendo is busy/.test(await page.textContent('#view .notice')));
  await search(page, '__html');
  check('an unreadable reply is handled', /could not read/.test(await page.textContent('#view .notice')));

  // a slow reply must not overwrite a newer search
  await page.fill('#search-input', '__slow');
  await page.press('#search-input', 'Enter');
  await page.waitForSelector('#view .row--ghost');
  check('loading shows placeholder rows', (await page.$$('#view .row--ghost')).length === 8);
  await page.fill('#search-input', 'paper');
  await page.press('#search-input', 'Enter');
  await page.waitForSelector('#view .row[data-id]');
  await sleep(2800);
  const shown = await page.$$eval('#view .row[data-id]', (rows) => rows.map((r) => (r.dataset.title + ' ' + r.dataset.artist + ' ' + r.querySelector('.row__album').textContent).toLowerCase()));
  check('a slow earlier reply does not replace newer results', shown.length > 0 && shown.every((x) => x.includes('paper')) && (await page.textContent('#view .section__head')).includes('paper'), shown.length + ' rows');

  // awkward catalog entries
  await search(page, 'edge');
  const names = await titles(page);
  const idList = await ids(page);
  const at = (frag) => names.findIndex((n) => n.includes(frag));
  check('HTML entities in names are shown as plain text', names.includes("Edge: Rock & Roll 'Til Dawn") && (await page.$$eval('#view .row', (r) => r.map((x) => x.dataset.artist))).includes('Smith & Sons'));
  check('a missing cover gets a letter tile', await page.locator('#view .row[data-id]').nth(at('No Artwork')).locator('.art__letter').count() === 1);
  await page.waitForFunction((i) => !!document.querySelectorAll('#view .row[data-id]')[i].querySelector('.art__letter'), at('Artwork Address Is Broken'), { timeout: 5000 });
  check('a cover that fails to load falls back to a letter tile', true);
  check('a single with no album shows only the artist', (await page.locator('#view .row[data-id]').nth(at('Single With No Album')).locator('.row__meta').innerText()) === 'Edge Case Ensemble');
  const gone = page.locator('#view .row[data-id]').nth(at('Not Available'));
  check('a song with no stream is marked unavailable', (await gone.getAttribute('class')).includes('is-unavailable') && (await gone.locator('.row__dur').textContent()) === 'Unavailable');

  // unavailable, then two dead links: stop after three failures
  await gone.locator('.row__main').click();
  await page.waitForFunction(() => /Skipping to the next song/.test(document.getElementById('toast').textContent), null, { timeout: 4000 });
  check('an unplayable song is announced and skipped', true, await toastText(page));
  await page.waitForFunction(() => window.GF.player.state.status === 'error', null, { timeout: 15000 });
  let s = await state(page);
  check('after three failures in a row playback stops with an explanation', /Three songs in a row/.test(s.error) && s.id === idList[at('Another Broken Stream')], s.error);
  check('the bar says what happened', /Couldn't play this song/.test(await page.textContent('#player .now__flag')));
  check('the failed rows are marked', await page.$$eval('#view .row.is-unavailable', (r) => r.length) >= 3);
  check('the play button is not stuck on "pause"', (await page.getAttribute('#player .playbtn', 'aria-label')) === 'Play');

  // a stream that is shorter than the listed length
  await page.locator('#view .row[data-id]').nth(at('Stream Shorter')).locator('.row__main').click();
  await waitStatus(page, 'playing');
  await sleep(300);
  check('a stream shorter than the listed length is flagged', /^Short stream: 0:0\d of 4:00$/.test(await page.textContent('#player .now__flag')), await page.textContent('#player .now__flag'));
  await page.evaluate(() => window.GF.player.pause());

  // offline
  await ctx.setOffline(true);
  await page.fill('#search-input', 'harbor');
  await page.press('#search-input', 'Enter');
  await page.waitForSelector('#view .notice');
  check('searching offline says you are offline', /You're offline/.test(await page.textContent('#view .notice')));
  await page.click('.nav a[data-nav="library"]');
  await page.waitForSelector('#view[data-view="library"] .view-title');
  check('Library still opens offline', true);
  await ctx.setOffline(false);
  await page.click('.nav a[data-nav="search"]');
  await page.locator('#view .notice .btn', { hasText: 'Try again' }).click();
  await page.waitForSelector('#view .row[data-id]');
  check('search works again once back online', (await titles(page)).length > 0);

  // key withdrawn after it was saved
  await page.evaluate(() => window.localStorage.setItem('gatefold.v1.settings', JSON.stringify({ clientId: 'withdrawn1' })));
  await page.reload();
  await page.waitForSelector('#view .view-title');
  await search(page, 'golden');
  check('a key that stops working is explained', /didn't accept the key/.test(await page.textContent('#view .notice')));
  await page.locator('#view .notice .btn', { hasText: 'Open Settings' }).click();
  await page.waitForSelector('dialog[open]');
  check('and the notice leads to Settings', true);
  check('no script errors', problems.filter((p) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::ERR/.test(p)).length === 0, problems.join(' | '));
  await ctx.close();

  // browsers that refuse a normal cross-site request: the documented JSONP route
  const b = await open(browser, { storage: SEEDED, api: 'nocors' });
  await search(b.page, 'golden');
  check('falls back to JSONP when a normal request is refused', (await titles(b.page)).length > 0);
  await b.page.locator('#view .row[data-id] .row__main').first().click();
  await waitStatus(b.page, 'playing');
  check('and playback works on that route', true);
  await b.ctx.close();
};

groups.keyboard = async (browser) => {
  const { search, sleep } = t();
  const { ctx, page, problems } = await open(browser, { storage: SEEDED });
  await page.waitForSelector('#view .section .row[data-id]', { timeout: 10000 });

  await page.keyboard.press('Tab');
  const skip = await page.evaluate(() => ({ id: document.activeElement.id, top: document.activeElement.getBoundingClientRect().top }));
  check('first Tab reaches a visible "Skip to content" link', skip.id === 'skip' && skip.top >= 0, JSON.stringify(skip));
  await page.keyboard.press('Enter');
  check('it moves focus to the content without changing area', await page.evaluate(() => document.activeElement.id === 'main' && (location.hash === '' || location.hash === '#listen')));

  const unnamed = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, a[href], input').forEach((el) => {
      if (el.closest('[hidden]') || el.type === 'file') return;
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim();
      if (!name) out.push(el.outerHTML.slice(0, 80));
    });
    return out;
  });
  check('every control has a name for screen readers', unnamed.length === 0, unnamed.join(' || '));

  // focus ring
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement);
    return { tag: document.activeElement.tagName, style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor };
  });
  check('keyboard focus shows a 2px olive ring', ring.style === 'solid' && ring.width === '2px' && ring.color === 'rgb(86, 98, 51)', JSON.stringify(ring));

  // rows by keyboard
  const firstRow = page.locator('#view .row[data-id] .row__main').first();
  await firstRow.focus();
  await page.keyboard.press('Enter');
  await t().waitStatus(page, 'playing');
  check('Enter on a row plays it', true);
  await page.keyboard.press('Tab');
  check('Tab moves from the row to its + button', await page.evaluate(() => document.activeElement.dataset.act === 'add'));
  await page.keyboard.press('Enter');
  await page.waitForSelector('.menu');
  check('Enter opens the menu with focus inside it', await page.evaluate(() => !!document.activeElement.closest('.menu')));
  await page.keyboard.type('Keys');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.menu', { state: 'detached' });
  check('a playlist can be created and filled entirely from the keyboard', (await t().stored(page, 'playlists'))[0].name === 'Keys');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.menu');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  check('arrow keys move through menu items', await page.evaluate(() => document.activeElement.classList.contains('menu__item')));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.menu', { state: 'detached' });

  // Refresh by keyboard keeps focus
  await page.evaluate(() => { location.hash = '#listen'; });
  await page.waitForSelector('#view[data-view="listen"] [data-act="refresh"]:not([disabled])');
  await page.focus('#view [data-act="refresh"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#view .row--ghost');
  await page.waitForSelector('#view .section .row[data-id]', { timeout: 10000 });
  check('after Refresh, keyboard focus is back on the Refresh button', await page.evaluate(() => document.activeElement.dataset.act === 'refresh'));

  // a menu never drifts away from its button
  await page.setViewportSize({ width: 1440, height: 520 });
  await page.locator('#view .row[data-id]').nth(0).locator('[data-act="more"]').click();
  await page.waitForSelector('.menu');
  await page.mouse.wheel(0, 300);
  await page.waitForSelector('.menu', { state: 'detached', timeout: 3000 });
  check('an open menu closes when the page scrolls', true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));

  // dialog keeps focus inside
  await page.click('#open-settings');
  await page.waitForSelector('dialog[open]');
  let inside = true;
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    inside = inside && await page.evaluate(() => !!document.activeElement.closest('dialog') || document.activeElement === document.body);
  }
  check('Tab stays inside an open dialog', inside);
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  check('focus returns to the Settings button', await page.evaluate(() => document.activeElement.id === 'open-settings'));

  // contrast of the text styles actually on screen
  await page.evaluate(() => { location.hash = '#library'; });
  await page.waitForSelector('#view[data-view="library"] [data-act="new"]');
  await page.click('#view [data-act="new"]');
  const primary = await page.evaluate(() => {
    const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const cs = getComputedStyle(document.querySelector('#view .btn--primary'));
    const a = lum(rgb(cs.color)), b = lum(rgb(cs.backgroundColor));
    return Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 100) / 100;
  });
  check('primary button text meets 4.5:1 on olive', primary >= 4.5, String(primary));
  await page.keyboard.press('Escape');
  await search(page, 'golden');
  await page.locator('#view .row[data-id] .row__main').first().click();
  await t().waitStatus(page, 'playing');
  const contrast = await page.evaluate(() => {
    const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const bg = (el) => { for (let n = el; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0.99)) return c; } return [246, 241, 231]; };
    const out = {};
    const probe = { title: '.row__title', artist: '.row__meta', album: '.row__album', length: '.row__dur', label: '#view .label', nav: '.nav a:not([aria-current])', heading: '.view-title', credit: '.credit', primaryButton: '.btn--primary', idle: '#player .now__title', time: '#player .seek__time', playingTitle: '.row.is-current .row__title' };
    Object.keys(probe).forEach((k) => {
      const el = document.querySelector(probe[k]);
      if (!el) return;
      const a = lum(rgb(getComputedStyle(el).color)), b = lum(bg(el));
      out[k] = Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 100) / 100;
    });
    return out;
  });
  const low = Object.keys(contrast).filter((k) => contrast[k] < 4.5);
  check('all text meets 4.5:1 contrast, including the olive title of the playing song', low.length === 0 && contrast.playingTitle >= 4.5 && Object.keys(contrast).length >= 11, JSON.stringify(contrast));
  check('one main landmark and labelled navigation', await page.evaluate(() => document.querySelectorAll('main').length === 1 && Array.from(document.querySelectorAll('nav')).every((n) => n.getAttribute('aria-label'))));
  check('no script errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
};

/* A library with one long playlist, used for layout and phone checks */
async function seedLibrary(page) {
  await page.evaluate(async () => {
    const C = window.GF.catalog, PL = window.GF.playlists;
    const edge = await C.search('edge', { limit: 30 });
    const more = await C.search('summer', { limit: 12 });
    const pl = PL.create('Late Night Drives & Quiet Mornings, the Complete and Unabridged Collection');
    edge.slice(0, 3).concat(more).forEach((t) => PL.addTrack(pl.id, t));
    const two = PL.create('Sunday');
    more.slice(0, 2).forEach((t) => PL.addTrack(two.id, t));
    PL.create('Empty for now');
    window.__pl = pl.id;
  });
  return page.evaluate(() => window.__pl);
}

const SIZES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'laptop', viewport: { width: 1024, height: 700 } },
  { name: 'tablet', viewport: { width: 768, height: 1024 }, touch: true },
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true, dpr: 2 },
  { name: 'small-phone', viewport: { width: 360, height: 640 }, touch: true, dpr: 2 }
];

async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const de = document.documentElement;
    const spill = [];
    document.querySelectorAll('#view *, .masthead *, #player *, #tabs *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (el.classList.contains('sr-only') || (el.parentElement && el.parentElement.closest('.clip'))) return;   // cut off by its own ellipsis box
      if (r.right > vw + 0.5 || r.left < -0.5) spill.push(el.className || el.tagName);
    });
    const rows = Array.from(document.querySelectorAll('#view .row[data-id]')).map((r) => Math.round(r.getBoundingClientRect().height));
    const small = [];
    document.querySelectorAll('#view .iconbtn, #view .btn, #view .chip, #view .row__grip, #view .row__main, #view .plrow, #view .back, #tabs a, #player .player__mini button, .masthead .iconbtn, #view .field').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.height < 43.5 || r.width < 43.5) small.push((el.className || el.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    const clipped = Array.from(document.querySelectorAll('#view .clip')).filter((el) => el.scrollWidth > el.clientWidth + 1).length;
    return { overflowX: de.scrollWidth > de.clientWidth, spill: Array.from(new Set(spill)).slice(0, 6), rows: Array.from(new Set(rows)), small: Array.from(new Set(small)).slice(0, 8), clipped };
  });
}

async function chrome(page) {
  // scroll to the very end and check nothing hides behind the player
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(80);
  return page.evaluate(() => {
    const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return r.height ? { top: Math.round(r.top), bottom: Math.round(r.bottom) } : null; };
    const last = document.querySelector('#view .credit') || document.querySelector('#view').lastElementChild;
    return { player: box('#player'), tabs: box('#tabs'), last: Math.round(last.getBoundingClientRect().bottom), vh: window.innerHeight };
  });
}

groups.layout = async (browser) => {
  const { search, sleep, waitStatus } = t();
  for (const size of SIZES) {
    const phone = size.viewport.width < 720;
    const { ctx, page, problems } = await open(browser, Object.assign({ storage: SEEDED, api: 'long' }, size));
    await page.waitForSelector('#view .section .row[data-id]', { timeout: 10000 });
    const plId = await seedLibrary(page);
    const tag = `${size.name} ${size.viewport.width}x${size.viewport.height}`;

    // Listen, with something playing so the player is populated
    await page.locator('#view .row[data-id] .row__main').nth(1).click();
    await waitStatus(page, 'playing');
    await page.evaluate(() => window.GF.player.seek(47));
    await sleep(500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(SHOTS, `${size.name}-1-listen.png`) });
    let m = await measure(page);
    check(`${tag}: Listen has no sideways scroll or spill`, !m.overflowX && m.spill.length === 0, m.spill.join(', '));
    check(`${tag}: song rows are 56px`, m.rows.length === 1 && m.rows[0] === 56, m.rows.join(','));
    const visibleRows = await page.evaluate(() => {
      const limit = document.querySelector('#player').getBoundingClientRect().top;
      return Array.from(document.querySelectorAll('#view .row[data-id]')).filter((r) => r.getBoundingClientRect().bottom <= limit).length;
    });
    check(`${tag}: several recommended songs are visible without scrolling`, visibleRows >= (size.viewport.height >= 800 ? 6 : 4), `${visibleRows} rows`);
    let c = await chrome(page);
    check(`${tag}: the end of Listen is not hidden behind the player`, c.last <= c.player.top, `${c.last} vs ${c.player.top}`);
    if (phone) {
      check(`${tag}: mini player sits directly on the tab bar, which sits on the screen edge`, c.player.bottom === c.tabs.top && c.tabs.bottom === c.vh, JSON.stringify(c));
      check(`${tag}: touch targets are at least 44px`, m.small.length === 0, m.small.join(' | '));
    }

    // Search with awkward names
    await search(page, 'edge');
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(250);
    await page.screenshot({ path: path.join(SHOTS, `${size.name}-2-search.png`) });
    m = await measure(page);
    check(`${tag}: Search with very long names does not spill`, !m.overflowX && m.spill.length === 0 && m.rows.length === 1 && m.rows[0] === 56, m.spill.join(', ') + ' rows ' + m.rows.join(','));
    check(`${tag}: long names are cut with an ellipsis`, m.clipped >= 2, `${m.clipped} clipped`);
    if (phone) check(`${tag}: Search touch targets are at least 44px`, m.small.length === 0, m.small.join(' | '));

    // Library
    await page.evaluate(() => { location.hash = '#library'; });
    await page.waitForSelector('#view[data-view="library"] .plrow');
    await sleep(200);
    await page.screenshot({ path: path.join(SHOTS, `${size.name}-3-library.png`) });
    m = await measure(page);
    check(`${tag}: Library does not spill`, !m.overflowX && m.spill.length === 0, m.spill.join(', '));
    await page.click('#view [data-act="new"]');
    await sleep(120);
    m = await measure(page);
    await page.screenshot({ path: path.join(SHOTS, `${size.name}-3b-library-new.png`) });
    check(`${tag}: the new-playlist row fits`, !m.overflowX && m.spill.length === 0 && (!phone || m.small.length === 0), m.spill.join(', ') + ' ' + m.small.join(' | '));
    await page.keyboard.press('Escape');
    await sleep(100);
    if (phone) check(`${tag}: Library touch targets are at least 44px`, m.small.length === 0, m.small.join(' | '));

    // Playlist with a very long name
    await page.evaluate((id) => { location.hash = '#playlist/' + id; }, plId);
    await page.waitForSelector('#view .plhead');
    await sleep(250);
    await page.screenshot({ path: path.join(SHOTS, `${size.name}-4-playlist.png`) });
    m = await measure(page);
    check(`${tag}: playlist with a long name does not spill`, !m.overflowX && m.spill.length === 0 && m.rows.length === 1 && m.rows[0] === 56, m.spill.join(', '));
    const head = await page.evaluate(() => {
      const art = document.querySelector('.plhead > .art').getBoundingClientRect();
      const acts = Array.from(document.querySelectorAll('.plhead__actions > *')).map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0);
      const names = Array.from(document.querySelectorAll('.plhead__actions > *')).filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.dataset.act);
      const title = document.querySelector('.plhead .view-title').getBoundingClientRect();
      return {
        art: Math.round(art.width), square: Math.abs(art.width - art.height) < 1, names: names.join(','),
        actsVisible: acts.every((r) => r.right <= window.innerWidth && r.left >= 0), oneRow: new Set(acts.map((r) => Math.round(r.top))).size === 1,
        actsTop: Math.round(acts[0].top), titleLines: Math.round(title.height / parseFloat(getComputedStyle(document.querySelector('.plhead .view-title')).lineHeight))
      };
    });
    const reach = /play-all,shuffle-all/.test(head.names) && (/rename,delete/.test(head.names) || /more-actions/.test(head.names));
    check(`${tag}: playlist artwork is ${phone ? 104 : 160}px square; Play, Shuffle, Rename and Delete are reachable on one row`, head.art === (phone ? 104 : 160) && head.square && head.actsVisible && head.oneRow && reach, JSON.stringify(head));
    check(`${tag}: a very long playlist name takes at most three lines`, head.titleLines <= 3, String(head.titleLines));
    check(`${tag}: playlist actions are reachable without scrolling`, head.actsTop < size.viewport.height - (phone ? 180 : 140), String(head.actsTop));
    if (phone) check(`${tag}: playlist touch targets are at least 44px`, m.small.length === 0, m.small.join(' | '));
    c = await chrome(page);
    check(`${tag}: the end of the playlist is not hidden behind the player`, c.last <= c.player.top, `${c.last} vs ${c.player.top}`);

    // renaming must not widen the page
    await page.evaluate(() => window.scrollTo(0, 0));
    if (await page.locator('#view [data-act="rename"]').isVisible()) await page.click('#view [data-act="rename"]');
    else { await page.click('#view [data-act="more-actions"]'); await page.locator('.menu .menu__item', { hasText: 'Rename' }).click(); }
    await page.waitForSelector('#view .plhead__rename input');
    await sleep(150);
    m = await measure(page);
    const scrolledX = await page.evaluate(() => window.scrollX);
    await page.screenshot({ path: path.join(SHOTS, `${size.name}-4b-rename.png`) });
    check(`${tag}: the rename field fits without sideways scroll`, !m.overflowX && m.spill.length === 0 && scrolledX === 0, m.spill.join(', ') + ' scrollX ' + scrolledX);
    if (phone) check(`${tag}: rename touch targets are at least 44px`, m.small.length === 0, m.small.join(' | '));
    await page.keyboard.press('Escape');
    await sleep(100);

    // menus
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#view .row[data-id]').nth(1).locator('[data-act="more"]').click();
    await page.waitForSelector('.menu');
    const menu = await page.evaluate(() => { const r = document.querySelector('.menu').getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: window.innerWidth, vh: window.innerHeight }; });
    await page.screenshot({ path: path.join(SHOTS, `${size.name}-5-menu.png`) });
    if (phone) check(`${tag}: the menu is a full-width sheet at the bottom`, menu.left === 0 && menu.right === menu.vw && menu.bottom === menu.vh, JSON.stringify(menu));
    else check(`${tag}: the menu stays inside the window`, menu.left >= 0 && menu.right <= menu.vw && menu.top >= 0 && menu.bottom <= menu.vh, JSON.stringify(menu));
    await page.keyboard.press('Escape');

    const real = problems.filter((x) => !/Failed to load resource/.test(x));   // the stand-in catalog's deliberately broken cover and streams
    check(`${tag}: no script errors`, real.length === 0, real.join(' | '));
    await ctx.close();
  }
};

groups.phone = async (browser) => {
  const { search, sleep, waitStatus, stored, ids } = t();
  const { ctx, page, problems } = await open(browser, { storage: SEEDED, api: 'long', viewport: { width: 390, height: 844 }, touch: true, dpr: 2 });
  await page.waitForSelector('#view .section .row[data-id]', { timeout: 10000 });
  const plId = await seedLibrary(page);

  check('before anything plays the mini player says so and cannot be opened', await page.locator('#player .mini__open').isDisabled() && /Choose a song/.test(await page.textContent('#player .player__mini')));
  await page.locator('#view .row[data-id] .row__main').nth(2).tap();
  await waitStatus(page, 'playing');
  await page.evaluate(() => window.GF.player.seek(72));
  await sleep(400);

  await page.locator('#player .mini__open').tap();
  await sleep(450);
  const open1 = await page.evaluate(() => {
    const sh = document.getElementById('sheet');
    const r = (sel) => { const b = sh.querySelector(sel).getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
    return {
      open: sh.classList.contains('is-open'), hidden: sh.getAttribute('aria-hidden'), inert: document.getElementById('main').inert,
      focus: document.activeElement.dataset.act, art: r('.sheet__art .art'), title: r('.sheet__title'), seek: r('.seek'), btns: r('.sheet__btns'),
      play: r('.sheet__btns .playbtn'), vh: window.innerHeight, vw: window.innerWidth
    };
  });
  await page.screenshot({ path: path.join(SHOTS, 'phone-6-player-open.png') });
  check('tapping the mini player opens the full player', open1.open && open1.hidden === 'false' && open1.inert === true && open1.focus === 'close');
  check('the full player fits the screen in order: art, title, slider, buttons',
    open1.art.w === open1.art.h && open1.art.w >= 240 && open1.art.bottom <= open1.title.top && open1.title.bottom <= open1.seek.top && open1.seek.bottom <= open1.btns.top && open1.btns.bottom <= open1.vh && open1.art.left >= 0 && open1.art.right <= open1.vw,
    JSON.stringify({ art: open1.art.w, artBottom: open1.art.bottom, title: open1.title.top, btnsBottom: open1.btns.bottom, vh: open1.vh }));
  check('the large play button is 64px', open1.play.w === 64 && open1.play.h === 64);
  check('it says where the music comes from', (await page.textContent('#sheet .sheet__from')) === 'Playing from Listen');

  await page.locator('#sheet .playbtn').tap();
  await waitStatus(page, 'paused');
  await page.locator('#sheet .playbtn').tap();
  await waitStatus(page, 'playing');
  const before = (await state(page)).id;
  await page.locator('#sheet [data-act="next"]').tap();
  await page.waitForFunction((id) => window.GF.player.current().id !== id, before);
  check('full player controls work by touch', (await page.textContent('#sheet .sheet__title')) === (await state(page)).title);

  await page.locator('#sheet [data-act="add"]').tap();
  await page.waitForSelector('.menu');
  const z = await page.evaluate(() => { const m = document.querySelector('.menu').getBoundingClientRect(); const el = document.elementFromPoint(m.left + 40, m.top + 30); return !!el.closest('.menu'); });
  check('the save menu opens above the full player', z);
  await page.screenshot({ path: path.join(SHOTS, 'phone-7-player-menu.png') });
  await page.locator('.menu .menu__item', { hasText: 'Sunday' }).tap();
  await page.waitForSelector('.menu', { state: 'detached' });
  check('a song can be saved from the full player', (await stored(page, 'playlists')).find((p) => p.name === 'Sunday').tracks.length === 3);

  await page.locator('#sheet [data-act="close"]').tap();
  await sleep(350);
  check('closing returns to the mini player', await page.evaluate(() => !document.getElementById('sheet').classList.contains('is-open') && document.getElementById('main').inert === false && document.activeElement.dataset.act === 'open'));
  const line = await page.evaluate(() => parseFloat(document.querySelector('#player .player__progress span').style.width));
  check('the mini player shows progress', line > 0 && line < 100, line.toFixed(1) + '%');

  // tabs
  await page.locator('#tabs a[data-nav="library"]').tap();
  await page.waitForSelector('#view[data-view="library"] .plrow');
  check('bottom tabs switch areas and mark the current one', (await page.getAttribute('#tabs a[data-nav="library"]', 'aria-current')) === 'page');
  check('playback continues across tabs on a phone', (await state(page)).status === 'playing');

  // reorder by touch
  await page.evaluate((id) => { location.hash = '#playlist/' + id; }, plId);
  await page.waitForSelector('#view .plhead');
  const beforeOrder = await ids(page);
  const cdp = await ctx.newCDPSession(page);
  const grip = await page.locator('#view .row[data-id]').nth(4).locator('.row__grip').boundingBox();
  const x = grip.x + grip.width / 2, y0 = grip.y + grip.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - i * 9.5 }] });
    await sleep(16);
  }
  await sleep(120);
  await page.screenshot({ path: path.join(SHOTS, 'phone-8-dragging.png') });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(350);
  const afterOrder = (await stored(page, 'playlists')).find((p) => p.id === plId).tracks.map((x) => x.id);
  const expected = beforeOrder.slice();
  expected.splice(2, 0, expected.splice(4, 1)[0]);
  check('a song can be dragged by its handle with a finger', afterOrder.join() === expected.join(), `${beforeOrder.slice(0, 5).join()} -> ${afterOrder.slice(0, 5).join()}`);
  check('the page did not scroll sideways or select text while dragging', await page.evaluate(() => window.scrollX === 0 && String(window.getSelection()) === ''));

  // an unavailable song on a phone: the word goes in the artist line and the title keeps its width
  await search(page, 'edge');
  const gone = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#view .row[data-id]'));
    const bad = rows.find((r) => r.classList.contains('is-unavailable'));
    const good = rows.find((r) => !r.classList.contains('is-unavailable'));
    return { meta: bad.querySelector('.row__meta').innerText, titleW: Math.round(bad.querySelector('.row__title').getBoundingClientRect().width), normalW: Math.round(good.querySelector('.row__title').getBoundingClientRect().width) };
  });
  check('on a phone "Unavailable" sits in the artist line and the title keeps its full width', /^Unavailable · /.test(gone.meta) && gone.titleW === gone.normalW, JSON.stringify(gone));
  await page.evaluate((id) => { location.hash = '#playlist/' + id; }, plId);
  await page.waitForSelector('#view .plhead');

  // remove on a phone, with Undo in reach
  await page.locator('#view .row[data-id]').nth(0).locator('[data-act="more"]').tap();
  await page.locator('.menu .menu__item', { hasText: 'Remove from playlist' }).tap();
  await sleep(300);
  const toast = await page.evaluate(() => { const a = document.querySelector('#toast .toast__action').getBoundingClientRect(); const p = document.querySelector('#player').getBoundingClientRect(); return { h: Math.round(a.height), above: a.bottom <= p.top }; });
  check('Undo appears above the mini player with a 44px target', toast.h >= 44 && toast.above, JSON.stringify(toast));
  const real = problems.filter((x) => !/Failed to load resource/.test(x));   // the stand-in catalog's deliberately broken cover
  check('no script errors', real.length === 0, real.join(' | '));
  await ctx.close();
};

groups.resume = async (browser) => {
  const { search, sleep, waitStatus } = t();
  const { ctx, page, problems } = await open(browser, { storage: SEEDED, api: 'long', profile: newProfile() });
  await search(page, 'harbor');
  await page.locator('#view .row[data-id] .row__main').nth(1).click();
  await waitStatus(page, 'playing');
  await page.evaluate(() => window.GF.player.seek(95));
  await sleep(1200);
  await page.click('#player .playbtn');
  const was = await state(page);
  await page.reload();
  await page.waitForSelector('#view .view-title');
  const back = await state(page);
  check('after a reload the same song is waiting, paused, at the same place', back.status === 'paused' && back.id === was.id && Math.abs(back.time - was.time) < 2, `${was.time.toFixed(1)} -> ${back.time.toFixed(1)}`);
  check('nothing plays by itself on opening', back.status === 'paused');
  check('the bar shows it', (await page.textContent('#player .now__title')) === was.title && /^1:3\d$/.test(await page.textContent('#player [data-bind="elapsed"]')));
  await page.click('#player .playbtn');
  await waitStatus(page, 'playing');
  await sleep(900);
  const on = await state(page);
  check('pressing play continues from that place', on.time >= was.time - 1.5 && on.time <= was.time + 4, on.time.toFixed(1));
  await page.click('#player [data-act="next"]');
  await page.waitForFunction((id) => window.GF.player.current().id !== id, was.id);
  check('the rest of the queue is still there', (await state(page)).len > 2);

  // a reload in mid-song does not resume by itself
  await sleep(600);
  await page.reload();
  await page.waitForSelector('#view .view-title');
  await sleep(500);
  check('reloading while a song plays leaves it paused', (await state(page)).status === 'paused');
  check('no script errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
};

groups.motion = async (browser) => {
  const { sleep } = t();
  const read = (page) => page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    const btn = getComputedStyle(document.querySelector('#player .playbtn'));
    const sheet = getComputedStyle(document.getElementById('sheet'));
    return { press: v('--press-ms'), move: v('--move-ms'), sheetIn: v('--sheet-in-ms'), sheetOut: v('--sheet-out-ms'), btn: btn.transitionProperty + ' ' + btn.transitionDuration, sheet: sheet.transitionProperty + ' ' + sheet.transitionDuration };
  });
  const a = await open(browser, { storage: SEEDED, file: 'index.html' });   // styles are inside the page, so they can be inspected
  const normal = await read(a.page);
  check('press feedback is 90ms', normal.press === '90ms' && /transform/.test(normal.btn) && /0\.09s/.test(normal.btn), normal.btn);
  check('row movement is 180ms', normal.move === '180ms');
  check('the phone player closes in 200ms and opens in 240ms', normal.sheetOut === '200ms' && normal.sheetIn === '240ms' && /0\.2s/.test(normal.sheet), normal.sheet);
  const animated = await a.page.evaluate(() => {
    const names = new Set();
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        const walk = (r) => {
          if (r.cssRules) Array.from(r.cssRules).forEach(walk);
          if (r.type === CSSRule.KEYFRAMES_RULE) names.add('keyframes:' + r.name);
          if (r.style && r.style.transition && !/^(none|all 0s)/.test(r.style.transition)) names.add(r.style.transition.replace(/\s+/g, ' '));
        };
        walk(rule);
      }
    }
    return Array.from(names);
  });
  const stray = animated.filter((x) => !/var\(--press-ms\)|var\(--sheet-(in|out)-ms\)|var\(--move-ms\)/.test(x));
  check('the stylesheet animates nothing outside the three treatments', stray.length === 0, stray.join(' || '));
  await a.ctx.close();

  const b = await open(browser, { storage: SEEDED, reducedMotion: true });
  const reduced = await read(b.page);
  check('with reduced motion every duration is zero', reduced.press === '0ms' && reduced.move === '0ms' && reduced.sheetIn === '0ms' && reduced.sheetOut === '0ms', JSON.stringify(reduced));
  await b.ctx.close();
};

groups.outside = async (browser) => {
  const { search, sleep, waitStatus } = t();
  const { ctx, page, problems } = await open(browser, { storage: KEY });
  const hosts = new Set();
  page.on('request', (r) => { const u = r.url(); if (!/^(data:|blob:|file:)/.test(u)) hosts.add(new URL(u).host); });
  await page.reload();
  await page.waitForSelector('#view .view-title');
  await page.click('text=Choose my songs');
  await page.waitForSelector('#view .section .row[data-id]', { timeout: 10000 });
  await page.locator('#view .row[data-id] .row__main').first().click();
  await waitStatus(page, 'playing');
  await search(page, 'summer');
  await page.click('.nav a[data-nav="library"]');
  await sleep(500);
  check('the app contacts only the catalog: no ad, tracking, font or script hosts', hosts.size === 1 && hosts.has('127.0.0.1:8787'), Array.from(hosts).join(', '));

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/data:[a-z/+-]+;base64,[A-Za-z0-9+/=]+/g, 'data:…');
  const urls = Array.from(new Set((html.match(/https?:\/\/[^\s"'`<>)\\]+/g) || []).map((u) => new URL(u).host))).sort();
  const allowed = ['api.jamendo.com', 'developer.jamendo.com', 'devportal.jamendo.com', 'www.jamendo.com', 'www.w3.org'];
  check('the shipped file names only Jamendo addresses (plus the SVG namespace)', urls.every((h) => allowed.includes(h)), urls.join(', '));
  check('the shipped file contains no ad or analytics code', !/googletag|adsbygoogle|doubleclick|analytics|gtag\(|fbq\(|hotjar|segment\.com/i.test(html));
  const visible = await page.evaluate(() => document.body.innerText);
  check('no promotional wording on screen', !/\b(upgrade|premium|subscribe|sponsored|advert|free trial|go pro)\b/i.test(visible));
  check('no script errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
};

groups.singlefile = async (browser) => {
  const { search, waitStatus, sleep } = t();
  const { ctx, page, problems } = await open(browser, { storage: KEY, file: 'index.html', profile: newProfile() });
  check('the single file opens straight from disk', page.url().startsWith('file://') && /index\.html/.test(page.url()));
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => ({
    faces: Array.from(document.fonts).map((f) => f.family.replace(/"/g, '') + ' ' + f.weight + ' ' + f.status),
    heading: getComputedStyle(document.querySelector('.view-title')).fontFamily.split(',')[0].replace(/"/g, ''),
    body: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/"/g, ''),
    bonum: document.fonts.check('32px "TeX Gyre Bonum"'), inter: document.fonts.check('500 15px "Inter"')
  }));
  check('both embedded typefaces are in use', fonts.heading === 'TeX Gyre Bonum' && fonts.body === 'Inter' && fonts.bonum && fonts.inter, fonts.faces.join(' | '));
  await page.click('text=Choose my songs');
  await page.waitForSelector('#view .section .row[data-id]', { timeout: 10000 });
  await page.locator('#view .row[data-id] .row__main').first().click();
  await waitStatus(page, 'playing');
  await search(page, 'golden');
  await page.locator('#view .row[data-id]').nth(0).locator('[data-act="add"]').click();
  await page.fill('.menu input', 'From one file');
  await page.press('.menu input', 'Enter');
  await sleep(200);
  await page.reload();
  await page.waitForSelector('#view .view-title');
  check('search, playback and saved playlists work from the single file', (await t().stored(page, 'playlists'))[0].name === 'From one file');
  const size = fs.statSync(path.join(ROOT, 'index.html')).size;
  check('the file is self-contained and under 1 MB', size < 1024 * 1024, Math.round(size / 1024) + ' KB');
  check('no script errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
};

groups.backup = async (browser) => {
  const { search, sleep, stored, toastText, addToPlaylist } = t();
  const { ctx, page, problems } = await open(browser, { storage: SEEDED, profile: newProfile() });
  await search(page, 'summer');
  await addToPlaylist(page, 0, 'Keepers', true);
  await addToPlaylist(page, 1, 'Keepers', false);
  await page.click('#open-settings');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('dialog[open] .btn', { hasText: 'Save backup file' }).click()
  ]);
  const file = path.join(os.tmpdir(), 'gatefold-backup-test.json');
  await download.saveAs(file);
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  check('a backup file downloads with the playlists in it', /^gatefold-backup-\d{4}-\d\d-\d\d\.json$/.test(download.suggestedFilename()) && data.data.playlists[0].tracks.length === 2, download.suggestedFilename());
  check('the backup never contains the key', !raw.includes('devkey01'));
  await page.keyboard.press('Escape');

  await page.evaluate(() => { Object.keys(localStorage).filter((k) => /playlists|signals|meta|recs|queue/.test(k)).forEach((k) => localStorage.removeItem(k)); });
  await page.reload();
  await page.waitForSelector('#view .view-title');
  check('playlists are gone after browser data is cleared', (await stored(page, 'playlists')) == null);
  await page.click('#open-settings');
  await page.setInputFiles('dialog[open] input[type="file"]', file);
  await page.waitForFunction(() => /Restored 1 playlist/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  check('restoring the file brings them back', (await stored(page, 'playlists'))[0].name === 'Keepers' && (await stored(page, 'playlists'))[0].tracks.length === 2, await toastText(page));
  await page.setInputFiles('dialog[open] input[type="file"]', file);
  await page.waitForFunction(() => /Nothing new/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  check('restoring twice does not duplicate anything', (await stored(page, 'playlists')).length === 1);
  const junk = path.join(os.tmpdir(), 'not-a-backup.json');
  fs.writeFileSync(junk, '{"hello":"world"}');
  await page.setInputFiles('dialog[open] input[type="file"]', junk);
  await page.waitForFunction(() => /not a Gatefold backup/.test(document.getElementById('toast').textContent), null, { timeout: 5000 });
  check('a file that is not a backup is refused politely', true);
  check('no script errors', problems.length === 0, problems.join(' | '));
  await ctx.close();

  // a browser that refuses to store anything
  const b = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await b.newPage();
  const errs = [];
  p2.on('pageerror', (e) => errs.push(e.message));
  await p2.addInitScript(() => { Storage.prototype.setItem = function () { throw new Error('blocked'); }; });
  await p2.goto(appUrl(API.short));
  await p2.waitForSelector('#view .view-title');
  await p2.click('.nav a[data-nav="library"]');
  await p2.waitForSelector('#view[data-view="library"] .view-title');
  check('when the browser blocks storage the app still runs and says so', /isn't saving changes/.test(await p2.textContent('#view')) && errs.length === 0, errs.join(' | '));
  await b.close();
};

/* Playlists must survive reloads: straight after a change, shortly after, and later. */
groups.persist = async (browser) => {
  const { sleep } = t();
  let lost = 0, reloads = 0;
  for (const mode of ['profile', 'private']) {
    for (let i = 0; i < 8; i++) {
      const profile = mode === 'profile' ? newProfile() : null;
      const { ctx, page } = await open(browser, { storage: KEY, file: 'index.html', profile });
      await page.evaluate(() => { location.hash = '#library'; });
      await page.waitForSelector('#view[data-view="library"] [data-act="new"]');
      await page.click('#view [data-act="new"]');
      await page.fill('#view .newrow input', 'Kept ' + i);
      await page.press('#view .newrow input', 'Enter');
      for (const wait of [0, 150, 600]) {
        await sleep(wait);
        await page.reload();
        await page.waitForSelector('#view .view-title');
        reloads++;
        const ok = await page.evaluate((n) => {
          const p = JSON.parse(localStorage.getItem('gatefold.v1.playlists') || 'null');
          return !!p && p[0].name === 'Kept ' + n && !!localStorage.getItem('gatefold.v1.settings');
        }, i);
        if (!ok) lost++;
      }
      await ctx.close();
      if (profile) fs.rmSync(profile, { recursive: true, force: true });
    }
  }
  check('a new playlist survives every reload, including one made the instant after saving', lost === 0, `${reloads - lost} of ${reloads} reloads kept the data`);
};

/* The same file served from a web address, as it would be for use on a phone. */
groups.hosted = async (browser) => {
  const { search, waitStatus, sleep, stored } = t();
  const url = 'http://127.0.0.1:8790/?api=' + encodeURIComponent(API.short);
  let page, ctx, problems;
  try {
    ({ ctx, page, problems } = await open(browser, { storage: SEEDED, url, profile: newProfile() }));
  } catch (e) {
    check('the app loads from a web address', false, 'start dev/static-server.js first: ' + e.message.split('\n')[0]);
    return;
  }
  check('the app loads from a web address', page.url().startsWith('http://127.0.0.1:8790/'));
  await page.waitForSelector('#view .section .row[data-id]', { timeout: 10000 });
  await search(page, 'golden');
  await page.locator('#view .row[data-id] .row__main').first().click();
  await waitStatus(page, 'playing');
  await page.locator('#view .row[data-id]').nth(1).locator('[data-act="add"]').click();
  await page.fill('.menu input', 'Hosted');
  await page.press('.menu input', 'Enter');
  await page.click('.nav a[data-nav="library"]');
  await page.waitForSelector('#view .plrow');
  await page.click('#view .plrow');
  await page.waitForSelector('#view .plhead');
  check('areas, search, playback and playlists work when served from a web address', /#playlist\//.test(page.url()) && (await stored(page, 'playlists'))[0].name === 'Hosted' && (await state(page)).status === 'playing');
  await page.reload();
  await page.waitForSelector('#view .plhead');
  check('a reload on a playlist address reopens that playlist', (await page.textContent('#view .view-title')) === 'Hosted');
  await page.goBack();
  await page.waitForSelector('#view[data-view="library"] .view-title');
  check('the browser Back button returns to Library', true);
  check('no script errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
};

module.exports = { groups };
