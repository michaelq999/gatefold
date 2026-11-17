/* Gatefold: the Listen area.
   A short selection of recommended songs, in up to three groups, each with
   the reason it is there. Before any history exists it asks for a few
   favorite artists or genres. */
(function (GF) {
  'use strict';

  var U = GF.util, h = U.h, C = GF.catalog, T = GF.taste, UI = GF.ui;
  var root = null;
  var token = 0;
  var building = false;
  var lastError = null;

  function head(sub, actions) {
    return h('header', { class: 'view-head' },
      h('h1', { class: 'view-title', tabindex: '-1', text: 'Listen' }),
      sub ? h('p', { class: 'view-sub', text: sub }) : null,
      actions ? h('div', { class: 'view-actions' }, actions) : null);
  }

  /* ---- Favorites: a few artists and genres to start from ---- */
  function favoritesForm(opts) {
    var artists = opts.artists.slice();
    var genres = opts.genres.slice();
    var chips = h('div', { class: 'chips', role: 'list', 'aria-label': 'Artists you like' });
    var input = h('input', {
      class: 'field', type: 'text', maxlength: '60', autocomplete: 'off',
      placeholder: 'Add an artist', 'aria-label': 'Add an artist'
    });
    var error = h('p', { class: 'panel__error', role: 'alert', hidden: true });

    function say(message) {
      error.textContent = message || '';
      error.hidden = !message;
    }

    function drawChips() {
      U.clear(chips);
      artists.forEach(function (name) {
        chips.appendChild(h('span', { class: 'chip chip--static', role: 'listitem' }, name,
          h('button', {
            class: 'chip__x', type: 'button', 'aria-label': 'Remove ' + name,
            onclick: function () {
              artists.splice(artists.indexOf(name), 1);
              drawChips();
              input.focus();
            }
          }, UI.icon('close'))));
      });
      chips.hidden = !artists.length;
    }

    function addArtist() {
      var name = input.value.replace(/\s+/g, ' ').trim();
      if (!name) return true;
      var lower = name.toLowerCase();
      if (artists.some(function (a) { return a.toLowerCase() === lower; })) { input.value = ''; return true; }
      if (artists.length >= 8) { say('Eight artists is the limit. Remove one to add another.'); return false; }
      artists.push(name);
      input.value = '';
      say('');
      drawChips();
      return true;
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addArtist(); }
    });

    var genreChips = h('div', { class: 'chips' }, T.GENRE_CHOICES.map(function (tag) {
      return h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(genres.indexOf(tag) !== -1),
        onclick: function (e) {
          var i = genres.indexOf(tag);
          if (i === -1) {
            if (genres.length >= 8) { say('Eight genres is the limit.'); return; }
            genres.push(tag);
          } else {
            genres.splice(i, 1);
          }
          say('');
          e.currentTarget.setAttribute('aria-pressed', String(i === -1));
        }
      }, T.capital(T.tagLabel(tag)));
    }));

    function submit() {
      if (!addArtist()) return;
      if (!artists.length && !genres.length) { say('Add at least one artist or genre.'); input.focus(); return; }
      opts.onSubmit({ artists: artists, genres: genres });
    }

    drawChips();
    return h('div', { class: 'panel__group', style: 'gap:var(--s4)' },
      h('div', { class: 'panel__group' },
        h('h3', { class: 'label', text: 'Artists you like' }),
        chips,
        h('div', { class: 'inline-form' }, input,
          h('button', { class: 'btn', type: 'button', onclick: addArtist }, 'Add')),
        h('p', { class: 'label', text: 'Any artist works, including ones that are not on Jamendo. Gatefold looks for independent songs in a similar style.' })),
      h('div', { class: 'panel__group' },
        h('h3', { class: 'label', text: 'Genres' }),
        genreChips),
      error,
      h('div', { class: 'panel__actions' },
        h('button', { class: 'btn btn--primary', type: 'button', onclick: submit }, opts.submitLabel),
        opts.onCancel ? h('button', { class: 'btn btn--quiet', type: 'button', onclick: opts.onCancel }, 'Cancel') : null));
  }

  function saveFavorites(values) {
    T.setSeeds(values);
    startBuild(true);
  }

  function editFavorites() {
    var seeds = T.seeds();
    var dlg = UI.dialog({
      title: 'Your favorites',
      body: h('div', null,
        h('p', { text: 'Gatefold starts from these when choosing songs. What you play and save counts for more over time.' })),
      actions: []
    });
    dlg.body.appendChild(favoritesForm({
      artists: seeds.artists,
      genres: seeds.genres,
      submitLabel: 'Save favorites',
      onSubmit: function (values) { dlg.close(); saveFavorites(values); },
      onCancel: function () { dlg.close(); }
    }));
  }

  /* ---- Building a selection ---- */
  function startBuild(fresh) {
    var mine = ++token;
    // the Refresh button is redrawn while songs are chosen: hand keyboard focus back afterwards
    var active = document.activeElement;
    var hadFocus = !!(active && active.dataset && active.dataset.act === 'refresh');
    function settle() {
      redraw();
      var button = hadFocus && root ? root.querySelector('[data-act="refresh"]') : null;
      if (button && (document.activeElement === document.body || !document.activeElement)) button.focus();
    }
    building = true;
    lastError = null;
    redraw();
    T.build({ fresh: !!fresh }).then(function () {
      if (mine !== token) return;
      building = false;
      settle();
      UI.announce('Your selection is ready.');
    }, function (err) {
      if (mine !== token) return;
      building = false;
      lastError = err;
      settle();
    });
  }

  function redraw() {
    if (root && document.contains(root) && root.dataset.view === 'listen') draw();
  }

  function sections(rec) {
    var queue = [];
    rec.groups.forEach(function (g) { g.tracks.forEach(function (t) { queue.push(t); }); });
    var wrap = h('div', { class: 'sections' });
    rec.groups.forEach(function (g) {
      wrap.appendChild(h('section', { class: 'section' },
        h('div', { class: 'section__head' }, h('h2', { class: 'section__title', text: g.reason })),
        UI.trackList(g.tracks, {
          queue: function () { return queue; },
          context: { type: 'listen', name: 'Listen' }
        })));
    });
    return wrap;
  }

  function placeholder() {
    var wrap = h('div', { class: 'sections' });
    wrap.appendChild(h('p', { class: 'sr-only', role: 'status', text: 'Choosing songs.' }));
    for (var i = 0; i < 2; i++) {
      wrap.appendChild(h('section', { class: 'section', 'aria-hidden': 'true' },
        h('div', { class: 'section__head' }, h('span', { class: 'ghost', style: 'display:block;width:220px;height:14px;margin:3px 0' })),
        UI.ghostRows(5)));
    }
    return wrap;
  }

  function draw() {
    U.clear(root);

    if (!C.hasKey()) {
      root.appendChild(head('Music from independent artists, chosen around what you like.'));
      root.appendChild(GF.settings.connectPanel({ onConnected: function () { GF.app.refresh(); } }));
      root.appendChild(UI.credit());
      return;
    }

    var seeds = T.seeds();
    if (!seeds.done && !T.hasHistory()) {
      root.appendChild(head('Tell Gatefold what you like and it will choose your first songs.'));
      root.appendChild(h('section', { class: 'panel', 'aria-label': 'Choose your favorites' },
        h('h2', { class: 'panel__title', text: 'Start with a few favorites' }),
        h('p', { text: 'Name some artists, pick some genres, or both. You can change them at any time.' }),
        favoritesForm({
          artists: T.SUGGESTED_ARTISTS,
          genres: [],
          submitLabel: 'Choose my songs',
          onSubmit: saveFavorites
        })));
      root.appendChild(UI.credit());
      return;
    }

    var rec = T.cached();
    var sub = T.hasHistory() ? 'A short selection based on what you play and save.' : 'A short selection based on your favorites.';
    root.appendChild(head(sub, [
      h('button', { class: 'btn btn--quiet', type: 'button', onclick: editFavorites }, 'Favorites'),
      h('button', {
        class: 'btn', type: 'button', disabled: building, dataset: { act: 'refresh' },
        onclick: function () { startBuild(true); }
      }, UI.icon('refresh'), 'Refresh')
    ]));

    if (lastError) root.appendChild(UI.errorNotice(lastError, function () { startBuild(false); }));

    if (building) {
      root.appendChild(placeholder());
    } else if (rec && rec.groups.length) {
      root.appendChild(sections(rec));
      if (rec.notes && rec.notes.length) {
        root.appendChild(h('div', { style: 'margin-top:var(--s5)' }, UI.notice({ quiet: true, text: rec.notes.join(' ') })));
      }
    } else if (!lastError) {
      root.appendChild(UI.empty('Nothing to suggest yet',
        (rec && rec.notes && rec.notes.length ? rec.notes.join(' ') + ' ' : '') +
        'Try different artists, or add a genre or two.',
        { label: 'Edit favorites', run: editFavorites }));
    }
    root.appendChild(UI.credit());
  }

  function render(rootEl, params, info) {
    root = rootEl;
    // On arriving: build a new selection if there is none, or if enough has changed
    if (info && info.enter && !building && C.hasKey() && (T.seeds().done || T.hasHistory())) {
      var rec = T.cached();
      if (T.isStale(rec)) { startBuild(false); return root.querySelector('.view-title'); }
    }
    draw();
    return root.querySelector('.view-title');
  }

  GF.views = GF.views || {};
  GF.views.listen = { title: 'Listen', render: render };
})(window.GF);
