/* DEVELOPMENT ONLY. Shared helpers for the browser tests. */
const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('These tests need Playwright. In the project folder run:\n  npm install playwright\n  npx playwright install chromium');
  process.exit(1);
}
// Use an installed Chrome if one is named or found, otherwise Playwright's own Chromium.
const CHROME = process.env.CHROME_PATH || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);

const ROOT = path.join(__dirname, '..');
const API = { short: 'http://127.0.0.1:8787/v3.0', long: 'http://127.0.0.1:8788/v3.0', nocors: 'http://127.0.0.1:8789/v3.0' };
const appUrl = (api, file) => `file://${path.join(ROOT, file || 'src/index.html')}?api=${encodeURIComponent(api)}`;

async function launch() {
  return chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
}

/* opts.profile: a folder to use as a real browser profile. Storage is then
   written to disk as in everyday use, and closing the returned context closes
   that browser, so "quit and reopen" can be tested. Without it, a throwaway
   private window is used; Chrome keeps such a window's storage in memory only
   and may drop it when the machine is short of memory, so checks that depend
   on data surviving a reload use a profile. */
async function open(browser, opts = {}) {
  const settings = {
    viewport: opts.viewport || { width: 1440, height: 900 },
    deviceScaleFactor: opts.dpr || 1,
    hasTouch: !!opts.touch,
    isMobile: !!opts.touch,
    reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference'
  };
  let ctx, page;
  if (opts.profile) {
    ctx = await chromium.launchPersistentContext(opts.profile, Object.assign({
      executablePath: CHROME,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
      acceptDownloads: true
    }, settings));
    page = ctx.pages()[0] || await ctx.newPage();
  } else {
    ctx = await browser.newContext(settings);
    page = await ctx.newPage();
  }
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  await page.goto(opts.url || appUrl(API[opts.api || 'short'], opts.file));
  if (!opts.noWait) await page.waitForSelector('#view .view-title, #view .plhead');
  if (opts.storage) {
    // Put the starting data in place the way a person's earlier visit would have:
    // write it from the loaded page, then load the page again.
    // (Do not seed with a script injected at document start. On a page opened
    // from a file, Chrome can hand such a script an empty storage area in place
    // of the real one, which then looks like the app losing its data. Measured
    // here: 3 losses in 16 reloads on a bare page with an injected script,
    // none in 60 without one.)
    await page.evaluate((data) => {
      Object.keys(data).forEach((k) => window.localStorage.setItem('gatefold.v1.' + k, JSON.stringify(data[k])));
    }, opts.storage);
    await page.reload();
    if (!opts.noWait) await page.waitForSelector('#view .view-title, #view .plhead');
  }
  return { ctx, page, problems };
}

const KEY = { settings: { clientId: 'devkey01' } };
const state = (page) => page.evaluate(() => {
  const s = window.GF.player.state, t = window.GF.player.current();
  return { status: s.status, time: s.time, duration: s.duration, pos: s.pos, len: s.order.length, id: t && t.id, title: t && t.title, shuffle: s.shuffle, repeat: s.repeat, short: s.shortStream, error: s.error };
});

const os = require('os');
const newProfile = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gatefold-profile-'));

module.exports = { ROOT, API, appUrl, launch, open, KEY, state, newProfile };
