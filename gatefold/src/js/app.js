/* Gatefold: start-up and wiring.
   Moves between the three areas, connects the player, playlists and
   recommendations to each other, and handles keyboard shortcuts. */
(function (GF) {
  'use strict';

  var U = GF.util, h = U.h, S = GF.store, C = GF.catalog, P = GF.player, T = GF.taste, PL = GF.playlists, UI = GF.ui;
  var APP_NAME = 'Gatefold';
  var viewEl = null;
  var route = { name: '', params: {} };
  var scrollMemo = {};
  var storageWarned = false;

  function parse(hash) {
    var path = String(hash || '').replace(/^#\/?/, '');
    if (path.indexOf('playlist/') === 0) return { name: 'playlist', params: { id: decodeURIComponent(path.slice(9)) } };
    if (path === 'search') return { name: 'search', params: {} };
    if (path === 'library') return { name: 'library', params: {} };
    return { name: 'listen', params: {} };
  }

  function routeKey(r) {
    return r.name === 'playlist' ? 'playlist/' + r.params.id : r.name;
  }

  function markNav(name) {
    var area = name === 'playlist' ? 'library' : name;
    var links = document.querySelectorAll('[data-nav]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].dataset.nav === area) links[i].setAttribute('aria-current', 'page');
      else links[i].removeAttribute('aria-current');
    }
  }

  function show(first) {
    var next = parse(window.location.hash);
    if (route.name) scrollMemo[routeKey(route)] = window.scrollY;
    route = next;
    UI.closeMenu(false);

    var view = GF.views[route.name];
    viewEl.dataset.view = route.name;
    var result = view.render(viewEl, route.params, { enter: true });
    var focusEl = result && result.nodeType ? result : result && result.focus;
    var title = (result && result.title) || view.title;

    markNav(route.name);
    document.title = title + ' · ' + APP_NAME;
    UI.syncRows(viewEl);

    var memo = route.name === 'playlist' ? 0 : scrollMemo[routeKey(route)] || 0;
    window.scrollTo(0, memo);
    if (!first && focusEl && typeof focusEl.focus === 'function') focusEl.focus({ preventScroll: true });
  }

  /* Draw the current area again without treating it as a new arrival */
  function refresh() {
    var view = GF.views[route.name];
    if (!view) return;
    var y = window.scrollY;
    viewEl.dataset.view = route.name;
    view.render(viewEl, route.params, { enter: route.name === 'listen' });
    UI.syncRows(viewEl);
    window.scrollTo(0, y);
  }

  function go(hash) {
    if (window.location.hash === hash) show(false);
    else window.location.hash = hash;
  }

  /* ---- The strip under the top bar ---- */
  function drawBanner() {
    var el = document.getElementById('banner');
    U.clear(el);
    var parts = [];
    if (!C.isLive()) {
      parts.push(h('span', { text: 'Demo data: a stand-in catalog used for development. Not connected to Jamendo.' }));
    } else if (C.isTestKey()) {
      parts.push(h('span', { text: "Using Jamendo's shared test key, which is meant for trying things out." }));
      parts.push(h('button', { type: 'button', onclick: function () { GF.settings.open(); } }, 'Add your own key'));
    }
    el.hidden = !parts.length;
    U.append(el, parts);
  }

  function keyChanged() {
    drawBanner();
    refresh();
  }

  /* ---- Wiring the parts together ---- */
  function wire() {
    P.on('track', function () { UI.syncRows(viewEl); });
    P.on('state', function () { UI.syncRows(viewEl); });
    P.on('unavailable', function () { UI.syncRows(viewEl); });
    P.on('available', function () { UI.syncRows(viewEl); });
    P.on('notice', function (message) { UI.toast(message); });

    // listening feeds recommendations; nothing else reads it
    P.on('signal', function (e) { T.record(e.track, e.kind); });
    P.on('refreshed', function (t) { PL.updateAudio(t.id, t.audio); });

    PL.on('change', function (change) {
      if (change.type === 'add' && change.track) T.record(change.track, 'add');
      if (change.id) {
        var pl = PL.get(change.id);
        if (pl) {
          if (change.type === 'rename') P.renameContext(pl.id, pl.name);
          else if (change.type !== 'create') P.syncQueue(pl.id, pl.tracks);
        }
      }
      var view = GF.views[route.name];
      if (view && view.onPlaylists) view.onPlaylists(change);
    });

    S.on('external', function (e) {
      if (e.key === 'playlists') PL.reload();
    });
    S.on('error', function () {
      if (storageWarned) return;
      storageWarned = true;
      UI.toast("Couldn't save that change. This browser's storage is full or blocked.", { ms: 7000 });
    });

    window.addEventListener('offline', function () { UI.toast("You're offline. Songs already loading may keep playing."); });
    window.addEventListener('online', function () { UI.toast('Back online.'); });
    window.addEventListener('hashchange', function () { show(false); });

    // Space plays and pauses, unless you are typing or on a button
    document.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.code !== 'Space') return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      var el = e.target;
      var tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || (el && el.isContentEditable)) return;
      if (document.querySelector('dialog[open]')) return;
      if (!P.current()) return;
      e.preventDefault();
      P.toggle();
    });

    var settingsBtn = document.getElementById('open-settings');
    if (settingsBtn) settingsBtn.addEventListener('click', function () { GF.settings.open(); });

    // "Skip to content" moves focus without changing the address (which picks the area)
    var skip = document.getElementById('skip');
    if (skip) skip.addEventListener('click', function (e) {
      e.preventDefault();
      document.getElementById('main').focus();
    });

    // icons for the fixed parts of the page
    var slots = document.querySelectorAll('[data-icon]');
    for (var i = 0; i < slots.length; i++) slots[i].insertBefore(UI.icon(slots[i].dataset.icon), slots[i].firstChild);
  }

  function start() {
    viewEl = document.getElementById('view');

    // Development only: a stand-in catalog on this computer. A remote address is never accepted.
    var api = new URLSearchParams(window.location.search).get('api');
    if (api && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(api)) C.configure({ apiBase: api });

    GF.settings.applyStoredKey();
    P.restore();
    GF.playerbar.mount();
    wire();
    drawBanner();
    show(true);
  }

  GF.app = { go: go, refresh: refresh, keyChanged: keyChanged, route: function () { return route; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.GF);
