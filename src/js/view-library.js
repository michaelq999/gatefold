/* Gatefold: the Library area.
   The list of playlists, and a single playlist with its songs: play in
   order, shuffle, rename, delete, reorder and remove. */
(function (GF) {
  'use strict';

  var U = GF.util, h = U.h, PL = GF.playlists, P = GF.player, UI = GF.ui, S = GF.store;
  var root = null;
  var creating = false;
  var cur = { id: null, renaming: false, ol: null, head: null, listWrap: null };
  var localChange = false;      // true while this view is applying its own edit

  /* ================= Library ================= */

  function startCreate() {
    creating = true;
    drawLibrary();
    var field = root.querySelector('.newrow input');
    if (field) field.focus();
  }

  function createRow() {
    var input = h('input', {
      class: 'field', type: 'text', maxlength: '80', autocomplete: 'off',
      placeholder: 'Playlist name', 'aria-label': 'New playlist name'
    });
    function cancel() {
      creating = false;
      drawLibrary();
      var btn = root.querySelector('[data-act="new"]');
      if (btn) btn.focus();
    }
    function create() {
      var pl = PL.create(input.value);
      if (!pl) { input.focus(); return; }
      creating = false;
      drawLibrary();
      var link = root.querySelector('.plrow[data-id="' + pl.id + '"]');
      if (link) link.focus();
      UI.announce('Created playlist ' + pl.name + '.');
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); create(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    return h('div', { class: 'newrow' }, input,
      h('button', { class: 'btn btn--primary', type: 'button', onclick: create }, 'Create'),
      h('button', { class: 'btn btn--quiet', type: 'button', onclick: cancel }, 'Cancel'));
  }

  function drawLibrary() {
    U.clear(root);
    var lists = PL.byCreated();

    root.appendChild(h('header', { class: 'view-head' },
      h('h1', { class: 'view-title', tabindex: '-1', text: 'Library' }),
      // with no playlists yet, the empty message below carries the one button
      lists.length || creating ? h('div', { class: 'view-actions' },
        h('button', { class: 'btn', type: 'button', dataset: { act: 'new' }, disabled: creating, onclick: startCreate },
          UI.icon('plus'), 'New playlist')) : null));

    if (!S.available) {
      root.appendChild(UI.notice({
        quiet: true,
        title: "This browser isn't saving changes",
        text: 'Private browsing or a storage setting is blocking it. Playlists will be lost when this tab closes.'
      }));
    }
    if (creating) root.appendChild(createRow());

    if (!lists.length) {
      if (!creating) {
        root.appendChild(UI.empty('No playlists yet',
          'Create one, then add songs with the + button next to any song.',
          { label: 'New playlist', primary: true, run: startCreate, act: 'new' }));
      }
    } else {
      var ul = h('ul', { class: 'list' });
      lists.forEach(function (pl) {
        ul.appendChild(h('li', null,
          h('a', { class: 'plrow', href: '#playlist/' + pl.id, dataset: { id: pl.id } },
            UI.mosaic(pl.tracks, 56, pl.name),
            h('span', { class: 'plrow__text' },
              h('span', { class: 'plrow__name clip', text: pl.name }),
              h('span', { class: 'plrow__meta clip', text: PL.describe(pl) })),
            UI.icon('right'))));
      });
      root.appendChild(ul);
    }
    root.appendChild(h('p', { class: 'credit', text: 'Playlists are saved in this browser. Settings can save them to a backup file.' }));
  }

  function renderLibrary(rootEl) {
    root = rootEl;
    cur.id = null;
    drawLibrary();
    return root.querySelector('.view-title');
  }

  /* ================= One playlist ================= */

  function context(pl) {
    return { type: 'playlist', id: pl.id, name: pl.name };
  }

  function rowFor(trackId) {
    if (!cur.ol) return null;
    var rows = cur.ol.children;
    for (var i = 0; i < rows.length; i++) if (rows[i].dataset.id === trackId) return rows[i];
    return null;
  }

  function indexIn(pl, trackId) {
    for (var i = 0; i < pl.tracks.length; i++) if (pl.tracks[i].id === trackId) return i;
    return -1;
  }

  function renumber() {
    if (!cur.ol) return;
    var rows = cur.ol.children;
    for (var i = 0; i < rows.length; i++) {
      var n = rows[i].querySelector('.row__num');
      if (n) n.textContent = String(i + 1);
    }
  }

  function buildHead(pl) {
    var n = pl.tracks.length;
    var art = UI.mosaic(pl.tracks, 160, pl.name);
    art.style.removeProperty('--art');      // sized by the playlist header rule

    var title;
    if (cur.renaming) {
      var input = h('input', { class: 'field', type: 'text', maxlength: '80', value: pl.name, autocomplete: 'off', 'aria-label': 'Playlist name' });
      var save = function () {
        if (!input.value.trim()) { input.focus(); return; }
        cur.renaming = false;
        PL.rename(pl.id, input.value);       // the change event redraws the header
        redrawPlaylist();
        focusAct('rename');
      };
      var cancel = function () { cur.renaming = false; redrawPlaylist(); focusAct('rename'); };
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
      title = h('div', { class: 'plhead__rename' }, input,
        h('button', { class: 'btn btn--primary', type: 'button', onclick: save }, 'Save'),
        h('button', { class: 'btn btn--quiet', type: 'button', onclick: cancel }, 'Cancel'));
    } else {
      title = h('h1', { class: 'view-title', tabindex: '-1', text: pl.name });
    }

    return h('div', { class: 'plhead' },
      art,
      h('div', { class: 'plhead__text' }, title, h('p', { class: 'plhead__meta', text: PL.describe(pl) })),
      h('div', { class: 'plhead__actions' },
        h('button', {
          class: 'btn btn--primary', type: 'button', disabled: !n, dataset: { act: 'play-all' },
          onclick: function () { var now = PL.get(pl.id); P.playList(now.tracks, 0, context(now), { shuffle: false }); }
        }, UI.icon('play'), 'Play'),
        h('button', {
          class: 'btn', type: 'button', disabled: !n, dataset: { act: 'shuffle-all' },
          onclick: function () {
            var now = PL.get(pl.id);
            P.playList(now.tracks, Math.floor(Math.random() * now.tracks.length), context(now), { shuffle: true });
          }
        }, UI.icon('shuffle'), 'Shuffle'),
        h('button', {
          class: 'btn btn--quiet', type: 'button', dataset: { act: 'rename' }, disabled: cur.renaming,
          onclick: startRename
        }, 'Rename'),
        h('button', { class: 'btn btn--quiet', type: 'button', dataset: { act: 'delete' }, onclick: function () { askDelete(pl.id); } }, 'Delete'),
        // narrow phones: the same two actions, in one menu
        UI.iconButton('more', 'More playlist actions', {
          class: 'plhead__more', dataset: { act: 'more-actions' }, 'aria-haspopup': 'menu',
          onclick: function (e) {
            UI.openMenu(e.currentTarget, function (menu, api) {
              menu.appendChild(UI.menuItem('pencil', 'Rename', { onclick: function () { api.close(false); startRename(); } }));
              menu.appendChild(UI.menuItem('trash', 'Delete playlist', { onclick: function () { api.close(false); askDelete(pl.id); } }));
            }, 'Playlist actions');
          }
        })));
  }

  function startRename() {
    cur.renaming = true;
    redrawPlaylist();
    var field = root.querySelector('.plhead__rename input');
    if (field) { field.focus(); field.select(); }
  }

  /* Focus the named control, or the phone menu button when that control is hidden */
  function focusAct(act) {
    var el = root.querySelector('[data-act="' + act + '"]');
    if (el && el.offsetParent === null) el = root.querySelector('[data-act="more-actions"]');
    if (el) el.focus();
  }

  function refreshHead() {
    var pl = PL.get(cur.id);
    if (!pl || !cur.head) return;
    var next = buildHead(pl);
    cur.head.parentNode.replaceChild(next, cur.head);
    cur.head = next;
  }

  function askDelete(id) {
    var pl = PL.get(id);
    if (!pl) return;
    UI.confirm({
      title: 'Delete “' + pl.name + '”?',
      text: pl.tracks.length
        ? 'The playlist and its list of ' + U.plural(pl.tracks.length, 'song', 'songs') + ' will be removed. The songs stay in the catalog.'
        : 'This empty playlist will be removed.',
      confirmLabel: 'Delete playlist',
      onConfirm: function () {
        var removed = PL.remove(id);
        GF.app.go('#library');
        if (removed) {
          UI.toast('Deleted “' + removed.name + '”.', {
            action: { label: 'Undo', run: function () { PL.restore(removed); } }
          });
        }
      }
    });
  }

  /* ---- Changing the order ---- */
  function moveBy(trackId, delta) {
    var pl = PL.get(cur.id);
    var ol = cur.ol;
    if (!pl || !ol) return;
    var from = indexIn(pl, trackId);
    var to = from + delta;
    var row = rowFor(trackId);
    if (from < 0 || to < 0 || to >= pl.tracks.length || !row) return;
    UI.flip(ol, function () {
      if (delta < 0) ol.insertBefore(row, row.previousElementSibling);
      else ol.insertBefore(row.nextElementSibling, row);
    });
    commitMove(trackId, from, to);
  }

  function commitMove(trackId, from, to) {
    localChange = true;
    PL.moveTrack(cur.id, from, to);
    localChange = false;
    renumber();
    var pl = PL.get(cur.id);
    var t = pl && pl.tracks[to];
    if (t) UI.announce(t.title + ' moved to position ' + (to + 1) + ' of ' + pl.tracks.length + '.');
  }

  function removeTrack(trackId) {
    var ol = cur.ol;
    var row = rowFor(trackId);
    var playlistId = cur.id;
    if (!ol || !row) return;
    var neighbour = row.nextElementSibling || row.previousElementSibling;
    UI.flip(ol, function () { row.remove(); });
    localChange = true;
    var res = PL.removeTrack(playlistId, trackId);
    localChange = false;
    if (!res) return;

    var pl = PL.get(playlistId);
    if (!pl.tracks.length) drawList(pl); else renumber();
    refreshHead();
    if (neighbour && document.contains(neighbour)) neighbour.querySelector('.row__main').focus();
    else focusAct('rename');

    UI.toast('Removed “' + res.track.title + '”.', {
      action: { label: 'Undo', run: function () { PL.addTrack(playlistId, res.track, res.index, true); } }
    });
  }

  /* Dragging by the handle (mouse or touch) and moving with the arrow keys */
  function enableReorder(ol) {
    var drag = null;
    var frame = 0;

    function rows() { return Array.prototype.slice.call(ol.children); }

    function place() {
      var list = ol.getBoundingClientRect();
      var n = ol.children.length;
      var top = U.clamp(drag.y - drag.grab, list.top, list.top + (n - 1) * drag.h);
      var target = U.clamp(Math.round((top - list.top) / drag.h), 0, n - 1);
      var now = rows().indexOf(drag.row);
      if (target !== now) {
        UI.flip(ol, function () {
          var ref = ol.children[target];
          ol.insertBefore(drag.row, target > now ? ref.nextSibling : ref);
        });
        now = target;
      }
      drag.row.style.transform = 'translateY(' + (top - (list.top + now * drag.h)) + 'px)';
    }

    function autoScroll() {
      var edge = 64;
      var bar = document.getElementById('player');
      var floor = (bar ? bar.getBoundingClientRect().top : window.innerHeight) - edge;
      var ceiling = edge + (U.isPhone() ? 0 : 56);
      var speed = 0;
      if (drag.y < ceiling) speed = -Math.ceil((ceiling - drag.y) / 5);
      else if (drag.y > floor) speed = Math.ceil((drag.y - floor) / 5);
      if (speed) window.scrollBy(0, U.clamp(speed, -16, 16));
    }

    function loop() {
      if (!drag) return;
      autoScroll();
      place();
      frame = window.requestAnimationFrame(loop);
    }

    function finish(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      window.cancelAnimationFrame(frame);
      var d = drag;
      drag = null;
      d.row.classList.remove('is-dragging');
      if (U.reducedMotion()) {
        d.row.style.transform = '';
      } else {
        d.row.style.transition = 'transform var(--move-ms) var(--ease-out)';
        d.row.style.transform = '';
        var settle = function (ev) {
          if (ev.target !== d.row) return;
          d.row.style.transition = '';
          d.row.removeEventListener('transitionend', settle);
        };
        d.row.addEventListener('transitionend', settle);
      }
      var to = rows().indexOf(d.row);
      if (to !== d.from) commitMove(d.row.dataset.id, d.from, to);
    }

    ol.addEventListener('pointerdown', function (e) {
      var grip = e.target.closest('.row__grip');
      if (!grip || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      var row = grip.closest('.row');
      if (!row) return;
      e.preventDefault();
      // The list holds the pointer, not the row: a row loses it the moment it is moved in the page.
      try { ol.setPointerCapture(e.pointerId); } catch (err) { /* pointer already released */ }
      var rect = row.getBoundingClientRect();
      drag = { row: row, id: e.pointerId, from: rows().indexOf(row), grab: e.clientY - rect.top, y: e.clientY, h: rect.height };
      row.style.transition = '';
      row.classList.add('is-dragging');
      grip.focus({ preventScroll: true });
      loop();
    });
    ol.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag.y = e.clientY;
      e.preventDefault();
    });
    ol.addEventListener('pointerup', finish);
    ol.addEventListener('pointercancel', finish);
    ol.addEventListener('lostpointercapture', finish);

    ol.addEventListener('keydown', function (e) {
      var grip = e.target.closest('.row__grip');
      if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      moveBy(grip.closest('.row').dataset.id, e.key === 'ArrowUp' ? -1 : 1);
      grip.focus({ preventScroll: false });
    });
  }

  function drawList(pl) {
    U.clear(cur.listWrap);
    cur.ol = null;
    if (!pl.tracks.length) {
      cur.listWrap.appendChild(UI.empty('This playlist is empty',
        'Add songs from Search or Listen with the + button next to any song.',
        { label: 'Find songs', href: '#search' }));
      return;
    }
    var ol = UI.trackList(pl.tracks, {
      playlistId: pl.id,
      numbered: true,
      queue: function () { var now = PL.get(pl.id); return now ? now.tracks : pl.tracks; },
      context: context(pl),
      onMove: moveBy,
      onRemove: removeTrack
    });
    enableReorder(ol);
    cur.ol = ol;
    cur.listWrap.appendChild(ol);
  }

  function redrawPlaylist() {
    if (!root || !cur.id) return;
    drawPlaylist(cur.id);
  }

  function drawPlaylist(id) {
    U.clear(root);
    var pl = PL.get(id);
    var back = h('a', { class: 'back', href: '#library' }, UI.icon('left'), 'Library');
    root.appendChild(back);
    if (!pl) {
      cur.id = null;
      root.appendChild(UI.empty('This playlist is no longer here', 'It may have been deleted.',
        { label: 'Go to Library', href: '#library' }));
      return;
    }
    cur.id = id;
    cur.head = buildHead(pl);
    cur.listWrap = h('div');
    root.appendChild(cur.head);
    root.appendChild(cur.listWrap);
    drawList(pl);
    root.appendChild(UI.credit());
  }

  function renderPlaylist(rootEl, params) {
    root = rootEl;
    cur.renaming = false;
    drawPlaylist(params.id);
    var pl = PL.get(params.id);
    return { focus: root.querySelector('.view-title'), title: pl ? pl.name : 'Playlist' };
  }

  /* Playlists changed somewhere (another area, another tab, or Undo) */
  function onPlaylists(change) {
    if (!root || !document.contains(root)) return;
    var view = root.dataset.view;
    if (view === 'library') { drawLibrary(); return; }
    if (view !== 'playlist' || localChange) return;
    if (change && change.id && cur.id && change.id !== cur.id && change.type !== 'external' && change.type !== 'merge') return;
    var y = window.scrollY;
    redrawPlaylist();
    window.scrollTo(0, y);
  }

  GF.views = GF.views || {};
  GF.views.library = { title: 'Library', render: renderLibrary, onPlaylists: onPlaylists };
  GF.views.playlist = { title: 'Playlist', render: renderPlaylist, onPlaylists: onPlaylists };
})(window.GF);
