/* Gatefold: shared interface pieces.
   Icons, artwork, song rows, menus, dialogs and the confirmation line. */
(function (GF) {
  'use strict';

  var U = GF.util, h = U.h;

  /* ---- Icons (drawn here so the app loads nothing from outside) ---- */
  var ICONS = {
    play: { solid: true, d: '<path d="M8 5.3v13.4a.6.6 0 0 0 .92.5l10.5-6.7a.6.6 0 0 0 0-1L8.92 4.8A.6.6 0 0 0 8 5.3z"/>' },
    pause: { solid: true, d: '<rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/>' },
    wait: { solid: true, d: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>' },
    next: { solid: true, d: '<path d="M5.5 6.2v11.6a.6.6 0 0 0 .93.5l8.8-5.8a.6.6 0 0 0 0-1l-8.8-5.8a.6.6 0 0 0-.93.5z"/><rect x="16.2" y="5.5" width="2.3" height="13" rx="1"/>' },
    prev: { solid: true, d: '<path d="M18.5 6.2v11.6a.6.6 0 0 1-.93.5l-8.8-5.8a.6.6 0 0 1 0-1l8.8-5.8a.6.6 0 0 1 .93.5z"/><rect x="5.5" y="5.5" width="2.3" height="13" rx="1"/>' },
    shuffle: { d: '<path d="M3 7h3.2a4 4 0 0 1 3.3 1.7l5 7.6a4 4 0 0 0 3.3 1.7H21"/><path d="M3 18h3.2a4 4 0 0 0 3.3-1.7l.6-.9"/><path d="M13.9 9.6l.6-.9A4 4 0 0 1 17.8 7H21"/><path d="M18.5 4.5L21 7l-2.5 2.5"/><path d="M18.5 15.5L21 18l-2.5 2.5"/>' },
    repeat: { d: '<path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19"/><path d="M16.5 3.5L19 6l-2.5 2.5"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5"/><path d="M7.5 20.5L5 18l2.5-2.5"/>' },
    repeatOne: { d: '<path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19"/><path d="M16.5 3.5L19 6l-2.5 2.5"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5"/><path d="M7.5 20.5L5 18l2.5-2.5"/><path d="M11 10.6l1.4-.9v4.8"/>' },
    volume: { d: '<path d="M4 9.6v4.8h3.2l4.3 3.4V6.2L7.2 9.6z"/><path d="M15 9.3a4 4 0 0 1 0 5.4"/><path d="M17.7 6.8a7.6 7.6 0 0 1 0 10.4"/>' },
    mute: { d: '<path d="M4 9.6v4.8h3.2l4.3 3.4V6.2L7.2 9.6z"/><path d="M15.5 9.7l4.6 4.6"/><path d="M20.1 9.7l-4.6 4.6"/>' },
    plus: { d: '<path d="M12 5.5v13"/><path d="M5.5 12h13"/>' },
    check: { d: '<path d="M5 12.6l4.4 4.4L19 7.4"/>' },
    more: { solid: true, d: '<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>' },
    search: { d: '<circle cx="11" cy="11" r="6.3"/><path d="M15.8 15.8l4.4 4.4"/>' },
    close: { d: '<path d="M6.5 6.5l11 11"/><path d="M17.5 6.5l-11 11"/>' },
    down: { d: '<path d="M6 9.5l6 6 6-6"/>' },
    left: { d: '<path d="M14.5 6l-6 6 6 6"/>' },
    right: { d: '<path d="M9.5 6l6 6-6 6"/>' },
    up: { d: '<path d="M6 14.5l6-6 6 6"/>' },
    grip: { solid: true, d: '<circle cx="9" cy="7" r="1.3"/><circle cx="15" cy="7" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="17" r="1.3"/><circle cx="15" cy="17" r="1.3"/>' },
    external: { d: '<path d="M14 5h5v5"/><path d="M19 5l-8.2 8.2"/><path d="M17 13.6V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4.4"/>' },
    settings: { d: '<path d="M4 7.5h8.5"/><path d="M16.5 7.5H20"/><circle cx="14.5" cy="7.5" r="2"/><path d="M4 16.5h3.5"/><path d="M11.5 16.5H20"/><circle cx="9.5" cy="16.5" r="2"/>' },
    refresh: { d: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.6 4.2v4.2h-4.2"/>' },
    trash: { d: '<path d="M5 7h14"/><path d="M9.5 7V5h5v2"/><path d="M7 7l.8 12h8.4L17 7"/>' },
    pencil: { d: '<path d="M5 19l.9-3.7 9.6-9.6a1.6 1.6 0 0 1 2.2 0l.6.6a1.6 1.6 0 0 1 0 2.2l-9.6 9.6z"/>' },
    listen: { d: '<path d="M5 15v-3a7 7 0 0 1 14 0v3"/><path d="M5 14h2.5v5H6a1 1 0 0 1-1-1z"/><path d="M19 14h-2.5v5H18a1 1 0 0 0 1-1z"/>' },
    library: { d: '<path d="M5 4.5v15"/><path d="M9.5 4.5v15"/><path d="M14 6l4.6 13"/>' },
    bars: { solid: true, d: '<rect x="5" y="11" width="3" height="8" rx="1"/><rect x="10.5" y="5" width="3" height="14" rx="1"/><rect x="16" y="8.5" width="3" height="10.5" rx="1"/>' }
  };

  function icon(name, cls) {
    var def = ICONS[name] || ICONS.more;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon' + (def.solid ? ' icon--solid' : '') + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = def.d;      // fixed strings from the table above, never catalog data
    return svg;
  }

  function iconButton(name, label, props) {
    props = props || {};
    props.type = 'button';
    props['aria-label'] = label;
    props.title = props.title || label;
    props.class = 'iconbtn' + (props.class ? ' ' + props.class : '');
    return h('button', props, icon(name));
  }

  /* ---- Artwork, with a deliberate fallback ---- */
  function firstLetter(text) {
    var m = /[\p{L}\p{N}]/u.exec(String(text || ''));
    return m ? m[0] : '♪';
  }

  function art(src, seedText, size) {
    var el = h('span', { class: 'art', 'aria-hidden': 'true' });
    if (size) el.style.setProperty('--art', size + 'px');
    function fallback() {
      el.classList.add('art--t' + (U.hash(seedText) % 5));
      el.insertBefore(h('span', { class: 'art__letter', text: firstLetter(seedText) }), el.firstChild);
    }
    var url = U.safeUrl(src);
    if (!url) { fallback(); return el; }
    var img = h('img', { alt: '', decoding: 'async', src: GF.catalog.artAt(url, size || 40) });
    img.addEventListener('error', function () {
      if (img.parentNode) img.parentNode.removeChild(img);
      fallback();
    });
    el.appendChild(img);
    return el;
  }

  /* Playlist artwork: four different covers in a 2 x 2, else one, else a letter tile */
  function mosaic(tracks, size, name) {
    var seen = {}, covers = [];
    tracks.forEach(function (t) {
      // songs from one album share a cover even though each has its own image address
      var key = t.albumId ? 'album:' + t.albumId : String(t.art).replace(/([?&])trackid=\d+/, '$1');
      if (covers.length >= 4 || !t.art || seen[key]) return;
      seen[key] = true;
      covers.push(t);
    });
    if (covers.length >= 4) {
      var el = h('span', { class: 'art art--mosaic', 'aria-hidden': 'true' });
      el.style.setProperty('--art', size + 'px');
      covers.forEach(function (t) { el.appendChild(art(t.art, t.album || t.title, Math.ceil(size / 2))); });
      return el;
    }
    if (covers.length) return art(covers[0].art, covers[0].album || covers[0].title, size);
    return art('', name, size);
  }

  /* ---- Song rows ---- */
  function trackRow(track, opts) {
    opts = opts || {};
    var li = h('li', { class: 'row', dataset: { id: track.id, title: track.title, artist: track.artist } });
    if (!track.audio) li.dataset.noaudio = '1';

    if (opts.grip) {
      li.appendChild(h('button', {
        class: 'row__grip', type: 'button', dataset: { act: 'grip' },
        'aria-label': 'Move ' + track.title + '. Drag, or use the up and down arrow keys.'
      }, icon('grip')));
    }

    var cover = art(track.art, track.album || track.title, 40);
    cover.appendChild(h('span', { class: 'art__now' }, icon('bars', 'i-playing'), icon('pause', 'i-paused')));

    li.appendChild(h('button', { class: 'row__main', type: 'button', dataset: { act: 'play' } },
      opts.number != null ? h('span', { class: 'row__num', text: String(opts.number) }) : null,
      cover,
      h('span', { class: 'row__text' },
        h('span', { class: 'row__title clip', text: track.title }),
        h('span', { class: 'row__meta clip' },
          h('span', { class: 'row__flag', text: 'Unavailable · ' }),
          track.artist,
          track.album ? h('span', { class: 'row__metaalbum', text: ' · ' + track.album }) : null)),
      h('span', { class: 'row__album clip', text: track.album || '' }),
      h('span', { class: 'row__dur', dataset: { dur: track.duration ? U.fmtTime(track.duration) : '' } })
    ));

    var actions = h('span', { class: 'row__actions' });
    if (opts.add !== false) {
      actions.appendChild(iconButton('plus', 'Add ' + track.title + ' to a playlist', { dataset: { act: 'add' }, 'aria-haspopup': 'menu' }));
    }
    actions.appendChild(iconButton('more', 'More options for ' + track.title, { dataset: { act: 'more' }, 'aria-haspopup': 'menu' }));
    li.appendChild(actions);
    syncRow(li);
    return li;
  }

  /* Draw one row's playing / paused / unavailable state from the player */
  function syncRow(li) {
    var P = GF.player;
    var cur = P.current();
    var id = li.dataset.id;
    var isCur = !!cur && cur.id === id;
    var active = isCur && P.isActive();
    var gone = li.dataset.noaudio === '1' || P.isUnavailable(id);
    li.classList.toggle('is-current', isCur);
    li.classList.toggle('is-paused', isCur && !active);
    li.classList.toggle('is-unavailable', gone);
    if (isCur) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current');
    var main = li.querySelector('.row__main');
    var dur = li.querySelector('.row__dur');
    if (dur) dur.textContent = gone ? 'Unavailable' : (dur.dataset.dur || '');
    if (main) {
      main.setAttribute('aria-label',
        (active ? 'Pause ' : 'Play ') + li.dataset.title + ' by ' + li.dataset.artist + (gone ? ' (unavailable)' : ''));
    }
  }

  function syncRows(root) {
    var rows = (root || document).querySelectorAll('.row[data-id]');
    for (var i = 0; i < rows.length; i++) syncRow(rows[i]);
  }

  /* A list of songs wired for play, add and the options menu.
     opts.queue(): every song that should follow when one is played
     opts.context: where the queue comes from, shown in the phone player
     opts.playlistId: set when the list is a playlist (adds reorder/remove) */
  function trackList(tracks, opts) {
    opts = opts || {};
    var ol = h('ol', { class: 'list' });
    tracks.forEach(function (t, i) {
      ol.appendChild(trackRow(t, {
        number: opts.numbered ? i + 1 : null,
        grip: !!opts.playlistId,
        add: !opts.playlistId
      }));
    });

    ol.addEventListener('click', function (e) {
      var actEl = e.target.closest('[data-act]');
      var row = e.target.closest('.row');
      if (!actEl || !row || !ol.contains(row)) return;
      var queue = opts.queue ? opts.queue() : tracks;
      var track = find(queue, row.dataset.id) || find(tracks, row.dataset.id);
      if (!track) return;
      var act = actEl.dataset.act;
      if (act === 'play') playFrom(queue, track, opts.context);
      else if (act === 'add') addMenu(actEl, track);
      else if (act === 'more') trackMenu(actEl, track, opts);
    });
    return ol;
  }

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function playFrom(queue, track, context) {
    var P = GF.player;
    var cur = P.current();
    if (cur && cur.id === track.id) { P.toggle(); return; }
    var index = queue.indexOf(track);
    if (index === -1) index = 0;
    P.playList(queue, index, context);
  }

  /* ---- Menus (a popover on computers, a bottom sheet on phones) ---- */
  var openState = null;

  function closeMenu(restoreFocus) {
    if (!openState) return;
    var s = openState;
    openState = null;
    s.menu.remove();
    s.scrim.remove();
    window.removeEventListener('resize', s.onResize);
    if (s.anchor) {
      s.anchor.removeAttribute('aria-expanded');
      if (restoreFocus !== false && document.contains(s.anchor)) s.anchor.focus();
    }
  }

  function openMenu(anchor, build, label) {
    closeMenu(false);
    var layer = document.getElementById('layer');
    var menu = h('div', { class: 'menu', role: 'menu', 'aria-label': label || 'Options' });
    var scrim = h('div', { class: 'scrim' });
    var startWidth = window.innerWidth;
    var state = {
      menu: menu, scrim: scrim, anchor: anchor,
      // close when the window is resized sideways; a keyboard opening only changes the height
      onResize: function () { if (window.innerWidth !== startWidth) closeMenu(false); }
    };
    openState = state;

    function place() {
      if (U.isPhone()) return;
      var r = anchor.getBoundingClientRect();
      var mw = menu.offsetWidth, mh = menu.offsetHeight;
      var left = U.clamp(r.right - mw, 8, Math.max(8, window.innerWidth - mw - 8));
      var top = r.bottom + 4;
      if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    }
    function focusFirst() {
      var first = menu.querySelector('input, .menu__item:not([disabled]), .btn');
      if (first) first.focus();
    }
    var api = { close: closeMenu, place: place, focusFirst: focusFirst };

    build(menu, api);
    layer.appendChild(scrim);
    layer.appendChild(menu);
    place();
    anchor.setAttribute('aria-expanded', 'true');
    focusFirst();

    scrim.addEventListener('pointerdown', function (e) { e.preventDefault(); closeMenu(false); });
    window.addEventListener('resize', state.onResize);
    if (!U.isPhone()) {
      var onScroll = function () {
        window.removeEventListener('scroll', onScroll);
        if (openState === state) closeMenu(false);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // On phones the menu sits at the bottom edge. When the on-screen keyboard
    // opens (typing a playlist name) lift the menu so it stays in view.
    var vv = window.visualViewport;
    if (vv && U.isPhone()) {
      var lift = function () {
        if (openState !== state) { vv.removeEventListener('resize', lift); vv.removeEventListener('scroll', lift); return; }
        var hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        menu.style.bottom = hidden ? hidden + 'px' : '';
      };
      vv.addEventListener('resize', lift);
      vv.addEventListener('scroll', lift);
    }
    menu.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); return; }
      if (e.key === 'Tab') { e.preventDefault(); closeMenu(true); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      if (e.target.tagName === 'INPUT' && (e.key === 'Home' || e.key === 'End')) return;
      var items = Array.prototype.slice.call(menu.querySelectorAll('input, .menu__item:not([disabled]), .btn'));
      if (!items.length) return;
      e.preventDefault();
      var i = items.indexOf(document.activeElement);
      if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = items.length - 1;
      else i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[i].focus();
    });
    return api;
  }

  function menuItem(iconName, label, props, meta) {
    props = props || {};
    var tag = props.href ? 'a' : 'button';
    props.class = 'menu__item';
    props.role = 'menuitem';
    if (tag === 'button') props.type = 'button';
    return h(tag, props, icon(iconName), h('span', { class: 'menu__name clip', text: label }),
      meta ? h('span', { class: 'menu__meta', text: meta }) : null);
  }

  function menuHead(track) {
    var sub = track.artist + (track.album ? ' · ' + track.album : '');
    return h('div', { class: 'menu__head' },
      h('div', { class: 'menu__title clip', text: track.title }),
      h('div', { class: 'menu__sub clip', text: sub }));
  }

  /* After a song is saved: the + turns into a check for a moment */
  function flashDone(button) {
    if (!button || !document.contains(button)) return;
    var svg = button.querySelector('svg');
    if (!svg) return;
    button.classList.add('is-done');
    button.replaceChild(icon('check'), svg);
    setTimeout(function () {
      if (!document.contains(button)) return;
      button.classList.remove('is-done');
      var now = button.querySelector('svg');
      if (now) button.replaceChild(icon('plus'), now);
    }, 1200);
  }

  function addToPlaylist(pl, track, anchor) {
    var res = GF.playlists.addTrack(pl.id, track);
    if (!res.ok) {
      toast(res.reason === 'duplicate' ? 'Already in ' + pl.name + '.' : "Couldn't add that song.");
      return;
    }
    if (anchor && anchor.dataset.act === 'add') flashDone(anchor);
    toast('Added to ' + pl.name + '.', {
      action: { label: 'Undo', run: function () { GF.playlists.removeTrack(pl.id, track.id); toast('Removed from ' + pl.name + '.'); } }
    });
  }

  function addMenu(anchor, track) {
    openMenu(anchor, function (menu, api) {
      function draw(asForm) {
        U.clear(menu);
        menu.appendChild(menuHead(track));
        var lists = GF.playlists.byRecent();
        if (!lists.length || asForm) {
          var input = h('input', {
            class: 'field', type: 'text', maxlength: '80', autocomplete: 'off',
            placeholder: 'Playlist name', 'aria-label': 'New playlist name'
          });
          var create = function () {
            var pl = GF.playlists.create(input.value);
            if (!pl) { input.focus(); return; }
            api.close(true);
            addToPlaylist(pl, track, anchor);
          };
          input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); create(); } });
          menu.appendChild(h('div', { class: 'menu__label', text: lists.length ? 'New playlist' : 'Save to a new playlist' }));
          menu.appendChild(h('div', { class: 'menu__form' }, input,
            h('button', { class: 'btn btn--primary', type: 'button', onclick: create }, 'Create and add')));
        } else {
          menu.appendChild(h('div', { class: 'menu__label', text: 'Add to playlist' }));
          lists.forEach(function (pl) {
            var inList = GF.playlists.has(pl.id, track.id);
            menu.appendChild(menuItem(inList ? 'check' : 'plus', pl.name, {
              disabled: inList,
              onclick: function () { api.close(true); addToPlaylist(pl, track, anchor); }
            }, inList ? 'Added' : U.plural(pl.tracks.length, 'song', 'songs')));
          });
          menu.appendChild(h('div', { class: 'menu__sep' }));
          menu.appendChild(menuItem('plus', 'New playlist…', { onclick: function () { draw(true); api.place(); api.focusFirst(); } }));
        }
      }
      draw(false);
    }, 'Add to playlist');
  }

  function trackMenu(anchor, track, opts) {
    opts = opts || {};
    openMenu(anchor, function (menu, api) {
      menu.appendChild(menuHead(track));
      menu.appendChild(menuItem('plus', opts.playlistId ? 'Add to another playlist' : 'Add to playlist', {
        onclick: function () { addMenu(anchor, track); }
      }));
      if (opts.playlistId && opts.onMove && opts.onRemove) {
        var pl = GF.playlists.get(opts.playlistId);
        var index = pl ? pl.tracks.map(function (t) { return t.id; }).indexOf(track.id) : -1;
        var last = pl ? pl.tracks.length - 1 : 0;
        menu.appendChild(menuItem('up', 'Move up', { disabled: index <= 0, onclick: function () { api.close(true); opts.onMove(track.id, -1); } }));
        menu.appendChild(menuItem('down', 'Move down', { disabled: index < 0 || index >= last, onclick: function () { api.close(true); opts.onMove(track.id, 1); } }));
        menu.appendChild(menuItem('trash', 'Remove from playlist', { onclick: function () { api.close(false); opts.onRemove(track.id); } }));
      }
      menu.appendChild(h('div', { class: 'menu__sep' }));
      menu.appendChild(menuItem('external', 'View on Jamendo', {
        href: track.url, target: '_blank', rel: 'noopener noreferrer',
        onclick: function () { api.close(false); }
      }));
    }, 'Options for ' + track.title);
  }

  /* ---- Dialogs ---- */
  var dialogCount = 0;

  function dialog(opts) {
    var id = 'dlg-title-' + (++dialogCount);
    var dlg = h('dialog', { class: 'dialog', 'aria-labelledby': id });
    var body = h('div', { class: 'dialog__body' }, opts.body);
    var actions = h('div', { class: 'dialog__actions' });
    function close() { if (dlg.open) dlg.close(); else dlg.remove(); }
    (opts.actions || []).forEach(function (a) {
      actions.appendChild(h('button', {
        class: 'btn' + (a.primary ? ' btn--primary' : a.quiet ? ' btn--quiet' : ''),
        type: 'button', autofocus: !!a.focus,
        onclick: function () { if (a.run) a.run(close); else close(); }
      }, a.label));
    });
    dlg.appendChild(h('div', { class: 'dialog__in' },
      h('h2', { class: 'dialog__title', id: id, text: opts.title }), body,
      actions.childNodes.length ? actions : null));
    document.body.appendChild(dlg);
    dlg.addEventListener('close', function () { dlg.remove(); if (opts.onClose) opts.onClose(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });   // click on the dimmed area
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    return { el: dlg, body: body, close: close };
  }

  function confirm(opts) {
    return dialog({
      title: opts.title,
      body: h('p', { text: opts.text }),
      actions: [
        { label: 'Cancel', quiet: true, focus: true },
        { label: opts.confirmLabel, primary: true, run: function (close) { close(); opts.onConfirm(); } }
      ]
    });
  }

  /* ---- Confirmation line ---- */
  var toastTimer = null;

  function hideToast() {
    clearTimeout(toastTimer);
    var host = document.getElementById('toast');
    if (host) U.clear(host);
  }

  function toast(message, opts) {
    opts = opts || {};
    var host = document.getElementById('toast');
    if (!host) return;
    U.clear(host);
    host.appendChild(h('div', { class: 'toast' },
      h('span', { text: message }),
      opts.action ? h('button', {
        class: 'toast__action', type: 'button',
        onclick: function () { hideToast(); opts.action.run(); }
      }, opts.action.label) : null));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, opts.ms || (opts.action ? 7000 : 4000));
  }

  /* ---- Notices, empty states, placeholders ---- */
  function notice(opts) {
    return h('div', { class: 'notice', role: opts.quiet ? null : 'alert' },
      h('div', { class: 'notice__body' },
        opts.title ? h('div', { class: 'notice__title', text: opts.title }) : null,
        h('div', { class: 'notice__text', text: opts.text })),
      opts.action ? h('button', { class: 'btn', type: 'button', onclick: opts.action.run }, opts.action.label) : null);
  }

  function empty(title, text, action) {
    return h('div', { class: 'empty' },
      h('h2', { class: 'empty__title', text: title }),
      text ? h('p', { text: text }) : null,
      action ? h(action.href ? 'a' : 'button', {
        class: 'btn' + (action.primary ? ' btn--primary' : ''),
        type: action.href ? null : 'button', href: action.href || null, onclick: action.run || null,
        dataset: action.act ? { act: action.act } : null
      }, action.label) : null);
  }

  function ghostRows(n) {
    var ol = h('ol', { class: 'list', 'aria-hidden': 'true' });
    for (var i = 0; i < n; i++) {
      ol.appendChild(h('li', { class: 'row row--ghost' },
        h('span', { class: 'ghost ghost--art' }),
        h('span', { style: 'flex:1' }, h('span', { class: 'ghost ghost--a', style: 'display:block' }), h('span', { class: 'ghost ghost--b', style: 'display:block' }))));
    }
    return ol;
  }

  /* What to say when the catalog cannot be reached */
  function errorNotice(err, retry) {
    var kind = err && err.kind;
    var title = "Couldn't reach Jamendo";
    var text = (err && err.message) || 'Something went wrong.';
    var action = retry ? { label: 'Try again', run: retry } : null;
    if (kind === 'offline') { title = "You're offline"; text = 'Search and recommendations need a connection. Your playlists are still here.'; }
    else if (kind === 'key' || kind === 'nokey') {
      title = kind === 'key' ? "Jamendo didn't accept the key" : 'A Jamendo key is needed';
      text = kind === 'key' ? 'Check the key in Settings. It may have been mistyped or withdrawn.' : 'Add your key in Settings to search and play.';
      action = { label: 'Open Settings', run: function () { GF.settings.open(); } };
    }
    else if (kind === 'rate') { title = 'Jamendo is busy'; }
    else if (kind === 'timeout') { title = 'Jamendo took too long to answer'; text = 'The catalog did not reply in time.'; }
    else if (kind === 'network') { text = 'The catalog did not respond. Check your connection, then try again.'; }
    return notice({ title: title, text: text, action: action });
  }

  /* ---- Moving rows smoothly to their new places (motion treatment 2) ---- */
  function flip(container, mutate) {
    if (U.reducedMotion()) { mutate(); return; }
    var kids = Array.prototype.slice.call(container.children).filter(function (el) {
      return !el.classList.contains('is-dragging');
    });
    var before = kids.map(function (el) { return el.getBoundingClientRect().top; });
    mutate();
    // measure where each row now sits with no leftover movement applied
    kids.forEach(function (el) { el.style.transition = 'none'; el.style.transform = ''; });
    var moved = [];
    kids.forEach(function (el, i) {
      if (!el.parentNode) return;
      var delta = before[i] - el.getBoundingClientRect().top;
      if (Math.abs(delta) < 0.5) { el.style.transition = ''; return; }
      el.style.transform = 'translateY(' + delta + 'px)';
      moved.push(el);
    });
    container.getBoundingClientRect();     // apply the starting positions before animating
    moved.forEach(function (el) {
      el.style.transition = 'transform var(--move-ms) var(--ease-out)';
      el.style.transform = '';
      var done = function (e) {
        if (e.target !== el) return;
        el.style.transition = '';
        el.removeEventListener('transitionend', done);
      };
      el.addEventListener('transitionend', done);
    });
  }

  /* A line for screen readers only */
  function announce(text) {
    var live = document.getElementById('live');
    if (!live) return;
    live.textContent = '';
    setTimeout(function () { live.textContent = text; }, 30);
  }

  /* Jamendo's terms ask every app to credit it as the source */
  function credit(extra) {
    return h('p', { class: 'credit' }, extra ? extra + ' ' : null, 'Music from independent artists on ',
      h('a', { class: 'link', href: GF.catalog.home, target: '_blank', rel: 'noopener noreferrer' }, 'Jamendo'), '.');
  }

  GF.ui = {
    icon: icon, iconButton: iconButton, art: art, mosaic: mosaic,
    trackRow: trackRow, trackList: trackList, syncRows: syncRows, playFrom: playFrom,
    openMenu: openMenu, closeMenu: closeMenu, menuItem: menuItem, addMenu: addMenu, trackMenu: trackMenu,
    dialog: dialog, confirm: confirm, toast: toast, hideToast: hideToast,
    notice: notice, empty: empty, ghostRows: ghostRows, errorNotice: errorNotice, flip: flip,
    announce: announce, credit: credit
  };
})(window.GF);
