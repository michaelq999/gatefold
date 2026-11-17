/* Gatefold: the Search area.
   Looks songs up in the connected catalog by song, artist or album name.
   Results stay in place while you move between areas. */
(function (GF) {
  'use strict';

  var U = GF.util, h = U.h, C = GF.catalog, UI = GF.ui;
  var PAGE = 30;
  var s = { q: '', status: 'idle', results: [], more: false, error: null, token: 0, loadingMore: false };
  var root = null, region = null, input = null, clearBtn = null;

  function run(query, append) {
    var q = String(query || '').replace(/\s+/g, ' ').trim();
    if (!append) s.q = q;
    if (q.length < 2) {
      s.token++;
      s.status = 'idle';
      s.results = [];
      s.more = false;
      s.error = null;
      drawResults();
      return;
    }
    var mine = ++s.token;
    if (append) s.loadingMore = true;
    else { s.status = 'loading'; s.error = null; }
    drawResults();

    C.search(q, { limit: PAGE, offset: append ? s.results.length : 0 }).then(function (list) {
      if (mine !== s.token) return;
      if (append) {
        var seen = {};
        s.results.forEach(function (t) { seen[t.id] = true; });
        s.results = s.results.concat(list.filter(function (t) { return !seen[t.id]; }));
      } else {
        s.results = list;
      }
      s.more = list.length >= PAGE;
      s.status = 'done';
      s.loadingMore = false;
      drawResults();
      UI.announce(s.results.length ? 'Showing ' + U.plural(s.results.length, 'song', 'songs') + '.' : 'No songs found.');
    }, function (err) {
      if (mine !== s.token) return;
      s.loadingMore = false;
      if (append) {
        UI.toast(err && err.kind === 'offline' ? "You're offline." : "Couldn't load more songs. Try again.");
      } else {
        s.status = 'error';
        s.error = err;
      }
      drawResults();
    });
  }

  var runSoon = U.debounce(function () { run(input.value, false); }, 450);

  function drawResults() {
    if (!region || !document.contains(region)) return;
    U.clear(region);

    if (!C.hasKey()) {
      region.appendChild(GF.settings.connectPanel({ onConnected: function () { GF.app.refresh(); } }));
      return;
    }
    if (s.status === 'idle') {
      region.appendChild(UI.empty('Search the Jamendo catalog',
        'Type a song, artist or album name. Everything here is by independent artists, so well-known chart names usually return nothing.'));
      return;
    }
    if (s.status === 'loading') {
      region.appendChild(h('p', { class: 'sr-only', role: 'status', text: 'Searching.' }));
      region.appendChild(UI.ghostRows(8));
      return;
    }
    if (s.status === 'error') {
      region.appendChild(UI.errorNotice(s.error, function () { run(s.q, false); }));
      return;
    }
    if (!s.results.length) {
      region.appendChild(UI.empty('No songs match “' + s.q + '”',
        'Check the spelling or try fewer words. Jamendo carries independent artists, so well-known chart names usually return nothing.'));
      return;
    }

    region.appendChild(h('div', { class: 'section__head' },
      h('h2', { class: 'label', text: 'Songs matching “' + s.q + '”' })));
    region.appendChild(UI.trackList(s.results, {
      queue: function () { return s.results; },
      context: { type: 'search', name: 'Search: ' + s.q }
    }));
    if (s.more) {
      region.appendChild(h('div', { style: 'margin-top:var(--s4)' },
        h('button', {
          class: 'btn', type: 'button', disabled: s.loadingMore, dataset: { act: 'more-results' },
          onclick: function () { run(s.q, true); }
        }, s.loadingMore ? 'Loading…' : 'Show more songs')));
    }
  }

  function syncClear() {
    if (clearBtn) clearBtn.hidden = !input.value;
  }

  function render(rootEl) {
    root = rootEl;
    U.clear(root);

    input = h('input', {
      class: 'field', type: 'search', id: 'search-input', value: s.q,
      placeholder: 'Songs, artists or albums', 'aria-label': 'Search songs, artists or albums',
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search',
      disabled: !C.hasKey()
    });
    clearBtn = UI.iconButton('close', 'Clear search', { class: 'search__clear' });
    clearBtn.addEventListener('click', function () {
      input.value = '';
      runSoon.cancel();
      syncClear();
      run('', false);
      input.focus();
    });
    input.addEventListener('input', function () {
      syncClear();
      runSoon();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      runSoon.cancel();
      run(input.value, false);
      if (U.isPhone()) input.blur();      // put the keyboard away so results are visible
    });

    root.appendChild(h('header', { class: 'view-head' },
      h('h1', { class: 'view-title', tabindex: '-1', text: 'Search' })));
    root.appendChild(h('div', { class: 'search', role: 'search' },
      UI.icon('search', 'search__icon'), input, clearBtn));
    region = h('div', { style: 'margin-top:var(--s5)' });
    root.appendChild(region);
    root.appendChild(UI.credit());

    syncClear();
    drawResults();

    // On a computer, put the cursor in the field straight away
    var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    return fine && C.hasKey() ? input : root.querySelector('.view-title');
  }

  GF.views = GF.views || {};
  GF.views.search = { title: 'Search', render: render };
})(window.GF);
