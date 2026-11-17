/* DEVELOPMENT ONLY. End-to-end checks run in a real browser (headless Chrome)
   against the stand-in catalog in dev/mock-jamendo.js.

   Start the three stand-in servers first (see tests/README in the source
   notes), then:  node tests/e2e.js [group ...]

   These prove the app's own behaviour. They do not prove anything about the
   live Jamendo service, which this machine cannot reach. */
const fs = require('fs');
const path = require('path');
const { ROOT, API, appUrl, launch, open, KEY, state, newProfile } = require('./lib');

const results = [];
let group = '';
function check(name, ok, detail) {
  results.push({ group, name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${group}] ${name}${detail != null && detail !== '' ? '  -> ' + detail : ''}`);
}

const SEEDED = Object.assign({}, KEY, {
  seeds: { artists: ['Taylor Swift'], genres: ['pop'], done: true, rev: 1, turn: 0, resolved: {} }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitStatus = (page, status, timeout = 6000) =>
  page.waitForFunction((s) => window.GF.player.state.status === s, status, { timeout });
const titles = (page) => page.$$eval('#view .row[data-id] .row__title', (els) => els.map((e) => e.textContent));
const ids = (page) => page.$$eval('#view .row[data-id]', (els) => els.map((e) => e.dataset.id));
const toastText = (page) => page.$eval('#toast', (e) => e.textContent).catch(() => '');
const stored = (page, key) => page.evaluate((k) => JSON.parse(window.localStorage.getItem('gatefold.v1.' + k) || 'null'), key);

async function search(page, q) {
  if (!(await page.evaluate(() => location.hash === '#search'))) {
    await page.evaluate(() => { location.hash = '#search'; });
    await page.waitForSelector('#search-input');
  }
  await page.fill('#search-input', q);
  await page.press('#search-input', 'Enter');
  await page.waitForFunction(() => {
    const v = document.getElementById('view');
    return !v.querySelector('.row--ghost') && (v.querySelector('.row[data-id]') || v.querySelector('.empty') || v.querySelector('.notice'));
  }, null, { timeout: 8000 });
}

async function nearEnd(page, left = 1.3) {
  await page.waitForFunction(() => window.GF.player.state.status === 'playing' && window.GF.player.state.duration > 0);
  await page.evaluate((l) => { const P = window.GF.player; P.seek(Math.max(0, P.state.duration - l)); }, left);
}

async function addToPlaylist(page, rowIndex, playlistName, create) {
  await page.locator('#view .row[data-id]').nth(rowIndex).locator('[data-act="add"]').click();
  await page.waitForSelector('.menu');
  if (create) {
    if (await page.locator('.menu .menu__item', { hasText: 'New playlist' }).count()) {
      await page.locator('.menu .menu__item', { hasText: 'New playlist' }).click();
    }
    await page.fill('.menu input', playlistName);
    await page.press('.menu input', 'Enter');
  } else {
    await page.locator('.menu .menu__item', { hasText: playlistName }).first().click();
  }
  await page.waitForSelector('.menu', { state: 'detached' });
}

/* ------------------------------------------------------------------ */
const groups = {};

groups.key = async (browser) => {
  const { ctx, page, problems } = await open(browser);
  check('first run shows the connect panel on Listen', await page.locator('#view .panel', { hasText: 'Connect to Jamendo' }).count() === 1);
  await page.click('.nav a[data-nav="library"]');
  await page.waitForSelector('#view[data-view="library"] .view-title');
  check('Library opens without a key', await page.locator('#view .view-title', { hasText: 'Library' }).count() === 1);
  await page.click('.nav a[data-nav="search"]');
  await page.waitForSelector('#search-input');
  check('Search explains that a key is needed', await page.locator('#view .panel', { hasText: 'Connect to Jamendo' }).count() === 1);
  check('search field is disabled without a key', await page.locator('#search-input').isDisabled());

  await page.fill('#view .panel input', 'not a key!');
  await page.click('#view .panel button[type="submit"]');
  check('malformed key is refused before any request', /doesn't look like a Client ID/.test(await page.textContent('#view .panel__error')));

  await page.fill('#view .panel input', 'wrongkey1');
  await page.click('#view .panel button[type="submit"]');
  await page.waitForFunction(() => /didn't recognize/.test(document.querySelector('#view .panel__error').textContent), null, { timeout: 6000 });
  check('a key Jamendo rejects gives a clear message', true, await page.textContent('#view .panel__error'));
  check('rejected key is not saved', (await stored(page, 'settings')) == null || !(await stored(page, 'settings')).clientId);

  await page.fill('#view .panel input', 'devkey01');
  await page.click('#view .panel button[type="submit"]');
  await page.waitForSelector('#search-input:not([disabled])', { timeout: 6000 });
  check('a valid key connects and unlocks Search', (await stored(page, 'settings')).clientId === 'devkey01', await toastText(page));

  await page.click('#open-settings');
  await page.waitForSelector('dialog[open]');
  check('Settings shows the key masked', /devk••••/.test(await page.textContent('dialog[open]')));
  await page.click('dialog[open] [data-act="check"]');
  await page.waitForFunction(() => /Finished/.test(document.querySelector('dialog[open] .checks').textContent), null, { timeout: 30000 });
  const lines = await page.$$eval('dialog[open] .checks__item', (els) => els.map((e) => (e.classList.contains('is-ok') ? 'ok: ' : e.classList.contains('is-bad') ? 'BAD: ' : 'info: ') + e.textContent));
  check('"Check the connection" tests the key, the catalog, a whole stream and artwork',
    lines.some((l) => /^ok: Jamendo accepted the key/.test(l)) && lines.some((l) => /^ok: The catalog answers/.test(l)) &&
    lines.some((l) => /^ok: Songs arrive whole/.test(l)) && lines.some((l) => /^ok: Cover artwork loads/.test(l)) && !lines.some((l) => /^BAD/.test(l)),
    lines.join(' || '));
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog[open]', { state: 'detached' });
  check('Escape closes Settings', true);
  check('no script errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
};

groups.listen = async (browser) => {
  const { ctx, page, problems } = await open(browser, { storage: KEY });
  check('with a key and no history, Listen asks for favorites', await page.locator('#view .panel', { hasText: 'Start with a few favorites' }).count() === 1);
  const chips = await page.$$eval('#view .chip--static', (els) => els.map((e) => e.textContent.trim()));
  check('the three named artists are offered as a starting point', chips.join(',') === 'Don Toliver,Taylor Swift,Katy Perry', chips.join(','));

  await page.click('#view .chip__x[aria-label="Remove Katy Perry"]');
  await page.fill('#view .panel input', 'Katy Perry');
  await page.press('#view .panel input', 'Enter');
  check('artists can be removed and added', (await page.$$('#view .chip--static')).length === 3);
  await page.click('#view .chip:text-is("Jazz")');
  await page.click('text=Choose my songs');
  await page.waitForSelector('#view .section .row[data-id]', { timeout: 10000 });

  const reasons = await page.$$eval('#view .section__title', (els) => els.map((e) => e.textContent));
  const perGroup = await page.$$eval('#view .section', (els) => els.map((e) => e.querySelectorAll('.row[data-id]').length));
  check('a selection appears from favorites alone', reasons.length >= 2, reasons.join(' | '));
  check('at most three groups of at most five songs', reasons.length <= 3 && perGroup.every((n) => n >= 2 && n <= 5), perGroup.join(','));
  check('Jamendo-side similarity is credited as such', reasons.some((r) => /^Similar to Taylor Swift, according to Jamendo$/.test(r)));
  check('a stand-in genre is labelled honestly', reasons.some((r) => /standing in for (Katy Perry|Don Toliver)$/.test(r)), reasons.join(' | '));
  const all = await ids(page);
  check('no song is recommended twice', new Set(all).size === all.length);

  // play something from the selection: the queue is the whole selection
  await page.locator('#view .row[data-id] .row__main').first().click();
  await waitStatus(page, 'playing');
  const s1 = await state(page);
  check('playing from Listen queues the whole selection', s1.len === all.length && s1.id === all[0], `queue ${s1.len}`);
  check('no script errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
};

groups.play = async (browser) => {
  const { ctx, page, problems } = await open(browser, { storage: SEEDED });
  await search(page, 'golden');
  const found = await titles(page);
  check('search returns matching songs', found.length > 0 && found.every((t) => /golden/i.test(t)), found.slice(0, 4).join(' | '));
  const meta = await page.$eval('#view .row[data-id]', (r) => ({
    artist: r.dataset.artist, album: r.querySelector('.row__album').textContent,
    img: !!r.querySelector('.art img'), dur: r.querySelector('.row__dur').textContent
  }));
  check('each result shows artist, album, artwork and length', meta.artist && meta.album && meta.img && /^\d+:\d\d$/.test(meta.dur), JSON.stringify(meta));

  const order = await ids(page);
  await page.locator('#view .row[data-id] .row__main').first().click();
  await waitStatus(page, 'playing');
  await sleep(1300);
  let s = await state(page);
  check('clicking a result plays it', s.status === 'playing' && s.id === order[0] && s.time > 0.5, `time ${s.time.toFixed(2)}`);
  check('the playing row is marked', await page.$eval('#view .row[data-id]', (r) => r.classList.contains('is-current') && r.getAttribute('aria-current') === 'true'));
  check('the bar shows the same song', (await page.textContent('#player .now__title')) === found[0]);
  check('the play button now offers Pause', (await page.getAttribute('#player .playbtn', 'aria-label')) === 'Pause');
  check('the row itself offers Pause', /^Pause /.test(await page.getAttribute('#view .row.is-current .row__main', 'aria-label')));

  await page.click('#player .playbtn');
  await waitStatus(page, 'paused');
  const t1 = (await state(page)).time;
  await sleep(700);
  check('pause stops the song', Math.abs((await state(page)).time - t1) < 0.05);
  check('row and bar agree when paused', await page.$eval('#view .row.is-current', (r) => r.classList.contains('is-paused')) &&
    (await page.getAttribute('#player .playbtn', 'aria-label')) === 'Play');
  await page.locator('#view .row.is-current .row__main').click();
  await waitStatus(page, 'playing');
  check('clicking the playing row resumes it rather than restarting', (await state(page)).time >= t1 - 0.05);

  // seeking with the slider
  await page.$eval('#player [data-bind="seek"]', (el) => { el.value = '4'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(400);
  s = await state(page);
  check('the slider seeks', s.time >= 3.8 && s.time < 6, `time ${s.time.toFixed(2)}`);

  // volume
  await page.$eval('#player [data-bind="volume"]', (el) => { el.value = '40'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  check('volume changes and is remembered', Math.abs((await stored(page, 'playback')).volume - 0.4) < 0.01);
  await page.click('#player [data-act="mute"]');
  check('mute toggles', (await stored(page, 'playback')).muted === true && (await page.getAttribute('#player [data-act="mute"]', 'aria-label')) === 'Unmute');
  await page.click('#player [data-act="mute"]');

  // automatic continuation
  await nearEnd(page);
  await page.waitForFunction((first) => window.GF.player.current().id !== first, order[0], { timeout: 8000 });
  await waitStatus(page, 'playing');
  s = await state(page);
  check('the next result starts by itself', s.id === order[1] && s.status === 'playing', s.title);

  // previous: restart after 3 s, go back before that
  await sleep(3400);
  await page.click('#player [data-act="prev"]');
  await sleep(300);
  s = await state(page);
  check('Previous restarts a song that is under way', s.id === order[1] && s.time < 1.5, `time ${s.time.toFixed(2)}`);
  await page.click('#player [data-act="prev"]');
  await page.waitForFunction((id) => window.GF.player.current().id === id, order[0]);
  check('Previous again goes to the song before', true);
  await page.click('#player [data-act="next"]');
  await page.waitForFunction((id) => window.GF.player.current().id === id, order[1]);
  check('Next moves forward', true);

  // moving between areas does not interrupt
  await waitStatus(page, 'playing');
  const before = await state(page);
  for (const area of ['library', 'listen', 'search']) {
    await page.click(`.nav a[data-nav="${area}"]`);
    await page.waitForSelector('#view .view-title');
    await sleep(350);
  }
  const after = await state(page);
  check('playback continues across Listen, Search and Library', after.status === 'playing' && after.id === before.id && after.time > before.time, `${before.time.toFixed(1)}s -> ${after.time.toFixed(1)}s`);
  check('search results are still there on return', (await titles(page)).length === found.length);

  // shuffle and repeat
  await page.click('#player [data-act="shuffle"]');
  let st = await state(page);
  check('shuffle keeps the current song and reorders the rest', st.shuffle === true && st.id === before.id && st.pos === 0);
  await page.click('#player [data-act="shuffle"]');
  st = await state(page);
  check('turning shuffle off restores the original order', st.shuffle === false && st.pos === order.indexOf(st.id));
  await page.click('#player [data-act="repeat"]');
  check('repeat cycles to "all"', (await state(page)).repeat === 'all' && (await page.getAttribute('#player [data-act="repeat"]', 'aria-label')) === 'Repeat: all songs');
  await page.click('#player [data-act="repeat"]');
  check('then to "this song"', (await state(page)).repeat === 'one');
  await nearEnd(page);
  await sleep(2600);
  st = await state(page);
  check('repeat-one replays the same song', st.id === before.id && st.status === 'playing' && st.time < 3, `time ${st.time.toFixed(2)}`);
  await page.click('#player [data-act="repeat"]');
  check('and back to off', (await state(page)).repeat === 'off');

  // space bar
  await page.locator('#view .view-title').focus();
  await page.keyboard.press('Space');
  await waitStatus(page, 'paused');
  await page.keyboard.press('Space');
  await waitStatus(page, 'playing');
  check('Space pauses and resumes', true);
  await page.focus('#search-input');
  await page.keyboard.press('Space');
  await sleep(200);
  check('Space typed in the search field does not pause', (await state(page)).status === 'playing');

  check('no script errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
};

groups.playlists = async (browser) => {
  const profile = newProfile();
  let { ctx, page, problems } = await open(browser, { storage: SEEDED, profile });
  await search(page, 'summer');
  const found = await titles(page);
  const foundIds = await ids(page);
  check('enough songs to build a playlist from', found.length >= 5, String(found.length));

  await addToPlaylist(page, 0, 'Road Trip', true);
  check('a playlist can be created while saving a song', /Added to Road Trip/.test(await toastText(page)), await toastText(page));
  for (const i of [1, 2, 3]) await addToPlaylist(page, i, 'Road Trip', false);
  let pl = (await stored(page, 'playlists'))[0];
  check('four songs saved in the order they were added', pl.tracks.map((t) => t.id).join() === foundIds.slice(0, 4).join());

  await page.locator('#view .row[data-id]').nth(0).locator('[data-act="add"]').click();
  await page.waitForSelector('.menu');
  check('a song already in the playlist cannot be added twice', await page.locator('.menu .menu__item', { hasText: 'Road Trip' }).isDisabled());
  await page.keyboard.press('Escape');
  await page.waitForSelector('.menu', { state: 'detached' });
  check('Escape closes the menu and returns focus to its button',
    await page.evaluate(() => document.activeElement && document.activeElement.dataset.act === 'add'));

  await page.click('.nav a[data-nav="library"]');
  await page.waitForSelector('#view .plrow');
  check('Library lists the playlist with its size', /4 songs/.test(await page.textContent('#view .plrow__meta')), await page.textContent('#view .plrow__meta'));
  await page.click('#view .plrow');
  await page.waitForSelector('#view .plhead');
  check('the playlist opens inside Library', (await page.getAttribute('.nav a[data-nav="library"]', 'aria-current')) === 'page' && /#playlist\//.test(page.url()));
  check('songs appear in saved order', (await ids(page)).join() === foundIds.slice(0, 4).join());

  // reorder with the keyboard
  await page.locator('#view .row[data-id]').nth(0).locator('.row__grip').focus();
  await page.keyboard.press('ArrowDown');
  await sleep(300);
  let expect = [foundIds[1], foundIds[0], foundIds[2], foundIds[3]];
  pl = (await stored(page, 'playlists'))[0];
  check('arrow keys on the handle move a song', pl.tracks.map((t) => t.id).join() === expect.join() && (await ids(page)).join() === expect.join());
  check('focus stays on the moved song', await page.evaluate((id) => document.activeElement.closest('.row').dataset.id === id, foundIds[0]));
  check('row numbers follow the new order', (await page.$$eval('#view .row__num', (els) => els.map((e) => e.textContent))).join() === '1,2,3,4');

  // reorder by dragging: last song to the top
  const grip = page.locator('#view .row[data-id]').nth(3).locator('.row__grip');
  const gb = await grip.boundingBox();
  const firstBox = await page.locator('#view .row[data-id]').nth(0).boundingBox();
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(gb.x + gb.width / 2, gb.y - 40, { steps: 6 });
  await page.mouse.move(gb.x + gb.width / 2, firstBox.y + 6, { steps: 10 });
  await sleep(120);
  await page.mouse.up();
  await sleep(350);
  expect = [foundIds[3], foundIds[1], foundIds[0], foundIds[2]];
  pl = (await stored(page, 'playlists'))[0];
  check('dragging the handle moves a song', pl.tracks.map((t) => t.id).join() === expect.join(), pl.tracks.map((t) => t.id).join());
  check('the list on screen matches what was saved', (await ids(page)).join() === expect.join());

  // move with the menu
  await page.locator('#view .row[data-id]').nth(0).locator('[data-act="more"]').click();
  await page.locator('.menu .menu__item', { hasText: 'Move down' }).click();
  await sleep(300);
  expect = [foundIds[1], foundIds[3], foundIds[0], foundIds[2]];
  check('"Move down" in the menu works without dragging', (await stored(page, 'playlists'))[0].tracks.map((t) => t.id).join() === expect.join());

  // remove and undo
  await page.locator('#view .row[data-id]').nth(1).locator('[data-act="more"]').click();
  await page.locator('.menu .menu__item', { hasText: 'Remove from playlist' }).click();
  await sleep(300);
  check('a song can be removed', (await stored(page, 'playlists'))[0].tracks.length === 3 && (await ids(page)).length === 3);
  check('the header count updates', /3 songs/.test(await page.textContent('#view .plhead__meta')));
  await page.click('#toast .toast__action');
  await sleep(300);
  check('Undo puts it back in the same place', (await stored(page, 'playlists'))[0].tracks.map((t) => t.id).join() === expect.join());
  await page.locator('#view .row[data-id]').nth(1).locator('[data-act="more"]').click();
  await page.locator('.menu .menu__item', { hasText: 'Remove from playlist' }).click();
  await sleep(300);
  expect = [foundIds[1], foundIds[0], foundIds[2]];

  // rename
  await page.click('#view [data-act="rename"]');
  await page.fill('#view .plhead__rename input', 'Road Trip 2026');
  await page.keyboard.press('Enter');
  await sleep(200);
  check('rename updates the header', (await page.textContent('#view .view-title')) === 'Road Trip 2026');
  check('rename is saved', (await stored(page, 'playlists'))[0].name === 'Road Trip 2026');

  // reload: everything still there
  await page.reload();
  await page.waitForSelector('#view .plhead');
  check('after a reload the playlist is intact', (await page.textContent('#view .view-title')) === 'Road Trip 2026' && (await ids(page)).join() === expect.join());

  // quit the browser completely, then open the app again
  const playlistUrl = page.url();
  await ctx.close();
  ({ ctx, page, problems } = await open(browser, { profile, url: playlistUrl }));
  await page.waitForSelector('#view .plhead');
  check('after quitting the browser and reopening the app the playlist is intact', (await page.textContent('#view .view-title')) === 'Road Trip 2026' && (await ids(page)).join() === expect.join() && (await stored(page, 'settings')).clientId === 'devkey01');

  // play in saved order to the end
  await page.click('#view [data-act="play-all"]');
  await waitStatus(page, 'playing');
  const played = [];
  for (let i = 0; i < expect.length; i++) {
    const s = await state(page);
    played.push(s.id);
    await nearEnd(page);
    if (i < expect.length - 1) await page.waitForFunction((id) => window.GF.player.current().id !== id, s.id, { timeout: 8000 });
  }
  check('Play runs through the playlist in its saved order', played.join() === expect.join(), played.join());
  await waitStatus(page, 'paused', 8000);
  let s = await state(page);
  check('at the end it stops on the last song, ready to play again', s.status === 'paused' && s.id === expect[2] && s.time < 0.5);
  check('the bar shows Play again', (await page.getAttribute('#player .playbtn', 'aria-label')) === 'Play');

  // editing the playlist that is playing changes what comes next
  await page.locator('#view .row[data-id] .row__main').first().click();
  await waitStatus(page, 'playing');
  await page.locator('#view .row[data-id]').nth(2).locator('.row__grip').focus();
  await page.keyboard.press('ArrowUp');
  await sleep(250);
  expect = [foundIds[1], foundIds[2], foundIds[0]];
  await page.click('#player [data-act="next"]');
  await page.waitForFunction((id) => window.GF.player.current().id === id, expect[1], { timeout: 5000 });
  check('reordering a playing playlist changes the next song', true);

  // removing the song that is playing lets it finish, then carries on from its place
  await page.locator('#view .row.is-current [data-act="more"]').click();
  await page.locator('.menu .menu__item', { hasText: 'Remove from playlist' }).click();
  await sleep(300);
  let live = await state(page);
  check('removing the playing song from its playlist does not cut it off', live.status === 'playing' && live.id === expect[1] && (await ids(page)).length === 2);
  await page.click('#toast .toast__action');
  await sleep(300);
  check('and Undo puts it back while it plays', (await ids(page)).join() === expect.join() && (await state(page)).id === expect[1] && (await state(page)).status === 'playing');

  // repeat all wraps
  await page.click('#player [data-act="repeat"]');
  await page.click('#player [data-act="next"]');
  await page.waitForFunction((id) => window.GF.player.current().id === id, expect[2]);
  await page.click('#player [data-act="next"]');
  await page.waitForFunction((id) => window.GF.player.current().id === id, expect[0], { timeout: 5000 });
  check('repeat-all wraps from the last song to the first', true);
  await page.click('#player [data-act="repeat"]');
  await page.click('#player [data-act="repeat"]');

  // shuffle button
  await page.click('#view [data-act="shuffle-all"]');
  await waitStatus(page, 'playing');
  s = await state(page);
  check('Shuffle plays the playlist in a shuffled order', s.shuffle === true && s.len === 3);
  await page.click('#view [data-act="play-all"]');
  await waitStatus(page, 'playing');
  s = await state(page);
  check('Play switches shuffle off and starts from the first song', s.shuffle === false && s.id === expect[0]);

  // delete and undo
  await page.click('#view [data-act="delete"]');
  await page.waitForSelector('dialog[open]');
  await page.locator('dialog[open] .btn', { hasText: 'Delete playlist' }).click();
  await page.waitForSelector('#view .view-title:text-is("Library")');
  check('deleting returns to Library with the playlist gone', (await stored(page, 'playlists')).length === 0 && (await page.locator('#view .empty').count()) === 1);
  check('the song keeps playing after its playlist is deleted', (await state(page)).status === 'playing');
  await page.click('#toast .toast__action');
  await page.waitForSelector('#view .plrow');
  check('Undo restores the deleted playlist', (await stored(page, 'playlists'))[0].tracks.length === 3);

  // create from Library
  await page.click('#view [data-act="new"]');
  await page.fill('#view .newrow input', 'Road Trip 2026');
  await page.keyboard.press('Enter');
  await sleep(200);
  const names = (await stored(page, 'playlists')).map((p) => p.name);
  check('a second playlist with the same name gets a distinct name', names.includes('Road Trip 2026 2'), names.join(' | '));

  check('no script errors', problems.length === 0, problems.join(' | '));
  await ctx.close();
};

module.exports = { groups, check, results, search, nearEnd, addToPlaylist, titles, ids, stored, toastText, waitStatus, sleep, SEEDED, setGroup: (g) => { group = g; } };

if (require.main === module) {
  (async () => {
    const more = require('./e2e-more');
    Object.assign(groups, more.groups);
    const wanted = process.argv.slice(2);
    const names = wanted.length ? wanted : Object.keys(groups);
    const browser = await launch();
    for (const name of names) {
      group = name;
      try { await groups[name](browser); }
      catch (e) { check('group ran to completion', false, e.message.split('\n')[0]); }
    }
    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
    fs.writeFileSync(path.join(ROOT, 'tests', 'last-run.json'), JSON.stringify(results, null, 2));
    process.exit(failed.length ? 1 : 0);
  })();
}
