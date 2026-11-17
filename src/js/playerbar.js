/* Gatefold: the player controls.
   Three faces of the same player state: the bar on computers, the mini bar
   on phones, and the full sheet the mini bar expands into. */
(function (GF) {
  'use strict';

  var U = GF.util, h = U.h, P = GF.player, UI = GF.ui;
  var els = {};
  var scrubbing = false;
  var sheetOpen = false;

  function playButton() {
    return h('button', { class: 'playbtn', type: 'button', dataset: { act: 'toggle' }, 'aria-label': 'Play' },
      UI.icon('play', 'i-play'), UI.icon('pause', 'i-pause'), UI.icon('wait', 'i-wait'));
  }

  function transportButtons() {
    return [
      UI.iconButton('shuffle', 'Shuffle', { dataset: { act: 'shuffle' }, 'aria-pressed': 'false' }),
      UI.iconButton('prev', 'Previous song', { dataset: { act: 'prev' } }),
      playButton(),
      UI.iconButton('next', 'Next song', { dataset: { act: 'next' } }),
      UI.iconButton('repeat', 'Repeat: off', { dataset: { act: 'repeat' }, 'aria-pressed': 'false' })
    ];
  }

  function seekRow() {
    return h('div', { class: 'seek' },
      h('span', { class: 'seek__time', dataset: { bind: 'elapsed' }, text: '0:00' }),
      h('input', { class: 'range', type: 'range', min: '0', max: '1', step: '1', value: '0', dataset: { bind: 'seek' }, 'aria-label': 'Position in song' }),
      h('span', { class: 'seek__time', dataset: { bind: 'total' }, text: '0:00' }));
  }

  function mount() {
    var bar = document.getElementById('player');
    var sheet = document.getElementById('sheet');
    U.clear(bar);
    U.clear(sheet);

    /* computer bar */
    bar.appendChild(h('div', { class: 'player__progress', 'aria-hidden': 'true' }, h('span', { dataset: { bind: 'line' } })));
    bar.appendChild(h('div', { class: 'player__desk' },
      h('div', { class: 'now', dataset: { bind: 'now' } }),
      h('div', { class: 'transport' }, h('div', { class: 'transport__btns' }, transportButtons()), seekRow()),
      h('div', { class: 'side', dataset: { bind: 'side' } },
        UI.iconButton('volume', 'Mute', { dataset: { act: 'mute' } }),
        h('input', { class: 'range', type: 'range', min: '0', max: '100', step: '1', value: '100', dataset: { bind: 'volume' }, 'aria-label': 'Volume' }))
    ));

    /* phone mini bar */
    var miniPlay = h('button', { class: 'iconbtn', type: 'button', dataset: { act: 'toggle', bind: 'miniplay' }, 'aria-label': 'Play' },
      UI.icon('play', 'i-play'), UI.icon('pause', 'i-pause'), UI.icon('wait', 'i-wait'));
    bar.appendChild(h('div', { class: 'player__mini' },
      h('button', { class: 'mini__open', type: 'button', dataset: { act: 'open', bind: 'mini' }, 'aria-label': 'Open player' }),
      miniPlay,
      UI.iconButton('next', 'Next song', { dataset: { act: 'next' } })));

    /* phone full sheet */
    sheet.appendChild(h('div', { class: 'sheet__head' },
      UI.iconButton('down', 'Close player', { dataset: { act: 'close' } }),
      h('div', { class: 'sheet__from label clip', dataset: { bind: 'from' } })));
    sheet.appendChild(h('div', { class: 'sheet__art', dataset: { bind: 'bigart' } }));
    sheet.appendChild(h('div', { class: 'sheet__meta' },
      h('div', { class: 'sheet__text' },
        h('div', { class: 'sheet__title', dataset: { bind: 'bigtitle' } }),
        h('div', { class: 'sheet__artist clip', dataset: { bind: 'bigartist' } }),
        h('div', { class: 'now__flag', dataset: { bind: 'bigflag' } })),
      UI.iconButton('plus', 'Add this song to a playlist', { dataset: { act: 'add' }, 'aria-haspopup': 'menu' }),
      UI.iconButton('more', 'More options for this song', { dataset: { act: 'more' }, 'aria-haspopup': 'menu' })));
    sheet.appendChild(seekRow());
    sheet.appendChild(h('div', { class: 'sheet__btns' }, transportButtons()));

    els = { bar: bar, sheet: sheet };

    [bar, sheet].forEach(function (root) {
      root.addEventListener('click', onClick);
      root.addEventListener('input', onInput);
      root.addEventListener('change', onChange);
    });
    sheet.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
    });
    window.addEventListener('resize', function () { if (sheetOpen && !U.isPhone()) closeSheet(); });
    window.addEventListener('hashchange', function () { if (sheetOpen) closeSheet(false); });

    P.on('track', drawTrack);
    P.on('state', drawState);
    P.on('time', drawTime);
    drawTrack();
    drawState();
    drawTime();
  }

  function all(bind) {
    return Array.prototype.slice.call(document.querySelectorAll('#player [data-bind="' + bind + '"], #sheet [data-bind="' + bind + '"]'));
  }
  function acts(act) {
    return Array.prototype.slice.call(document.querySelectorAll('#player [data-act="' + act + '"], #sheet [data-act="' + act + '"]'));
  }

  /* ---- Actions ---- */
  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;
    var t = P.current();
    if (act === 'toggle') P.toggle();
    else if (act === 'next') P.next();
    else if (act === 'prev') P.prev();
    else if (act === 'shuffle') P.toggleShuffle();
    else if (act === 'repeat') P.cycleRepeat();
    else if (act === 'mute') P.toggleMute();
    else if (act === 'open') openSheet();
    else if (act === 'close') closeSheet();
    else if (act === 'add' && t) UI.addMenu(el, t);
    else if (act === 'more' && t) UI.trackMenu(el, t, {});
  }

  function onInput(e) {
    var bind = e.target.dataset.bind;
    if (bind === 'seek') {
      scrubbing = true;
      var v = Number(e.target.value);
      all('elapsed').forEach(function (n) { n.textContent = U.fmtTime(v); });
      fill(e.target, v, Number(e.target.max));
    } else if (bind === 'volume') {
      P.setVolume(Number(e.target.value) / 100);
    }
  }

  function onChange(e) {
    if (e.target.dataset.bind !== 'seek') return;
    scrubbing = false;
    P.seek(Number(e.target.value));
  }

  function fill(rangeEl, value, max) {
    rangeEl.style.setProperty('--p', (max > 0 ? U.clamp(value / max * 100, 0, 100) : 0) + '%');
  }

  /* ---- Drawing from the player state ---- */
  function drawTrack() {
    var t = P.current();
    var now = all('now')[0];
    var mini = all('mini')[0];
    U.clear(now);
    U.clear(mini);
    if (!t) {
      now.appendChild(h('div', { class: 'now__idle', text: 'Choose a song to start listening.' }));
      mini.appendChild(h('span', { class: 'mini__text now__idle', text: 'Choose a song to start listening.' }));
      mini.setAttribute('aria-label', 'Open player');
      mini.disabled = true;
      if (sheetOpen) closeSheet();
    } else {
      now.appendChild(UI.art(t.art, t.album || t.title, 56));
      now.appendChild(h('div', { class: 'now__text' },
        h('div', { class: 'now__title clip', text: t.title }),
        h('div', { class: 'now__artist clip', text: t.artist + (t.album ? ' · ' + t.album : '') }),
        h('div', { class: 'now__flag clip', dataset: { bind: 'flag' } })));
      now.appendChild(h('div', { class: 'now__btns' },
        UI.iconButton('plus', 'Add this song to a playlist', { dataset: { act: 'add' }, 'aria-haspopup': 'menu' }),
        UI.iconButton('more', 'More options for this song', { dataset: { act: 'more' }, 'aria-haspopup': 'menu' })));

      mini.disabled = false;
      mini.appendChild(UI.art(t.art, t.album || t.title, 44));
      mini.appendChild(h('span', { class: 'mini__text' },
        h('span', { class: 'now__title clip', text: t.title, style: 'display:block' }),
        h('span', { class: 'now__artist clip', text: t.artist, style: 'display:block' })));
      mini.setAttribute('aria-label', 'Open player: ' + t.title + ' by ' + t.artist);

      var big = all('bigart')[0];
      U.clear(big);
      big.appendChild(UI.art(t.art, t.album || t.title, 380));
      big.firstChild.style.removeProperty('--art');     // sized by the sheet's own rule
      all('bigtitle')[0].textContent = t.title;
      all('bigartist')[0].textContent = t.artist + (t.album ? ' · ' + t.album : '');
    }
    drawState();
  }

  function drawState() {
    var s = P.state;
    var t = P.current();
    var active = P.isActive();
    var loading = s.status === 'loading' && active;

    acts('toggle').forEach(function (b) {
      b.classList.toggle('is-playing', active && !loading);
      b.classList.toggle('is-loading', loading);
      b.disabled = !t;
      b.setAttribute('aria-label', loading ? 'Loading. Press to pause' : active ? 'Pause' : 'Play');
    });
    acts('prev').forEach(function (b) { b.disabled = !t; });
    acts('next').forEach(function (b) { b.disabled = !t || !P.hasNext(); });
    acts('shuffle').forEach(function (b) { b.setAttribute('aria-pressed', String(s.shuffle)); });
    acts('repeat').forEach(function (b) {
      var label = s.repeat === 'all' ? 'Repeat: all songs' : s.repeat === 'one' ? 'Repeat: this song' : 'Repeat: off';
      b.setAttribute('aria-pressed', String(s.repeat !== 'off'));
      b.setAttribute('aria-label', label);
      b.title = label;
      var svg = b.querySelector('svg');
      var want = s.repeat === 'one' ? 'repeatOne' : 'repeat';
      if (b.dataset.glyph !== want) { b.dataset.glyph = want; b.replaceChild(UI.icon(want), svg); }
    });
    all('seek').forEach(function (r) { r.disabled = !t; });

    var side = all('side')[0];
    side.hidden = !s.canVolume;
    acts('mute').forEach(function (b) {
      var silent = s.muted || s.volume === 0;
      var want = silent ? 'mute' : 'volume';
      b.setAttribute('aria-label', silent ? 'Unmute' : 'Mute');
      b.title = silent ? 'Unmute' : 'Mute';
      if (b.dataset.glyph !== want) { b.dataset.glyph = want; b.replaceChild(UI.icon(want), b.querySelector('svg')); }
    });
    all('volume').forEach(function (r) {
      var v = s.muted ? 0 : Math.round(s.volume * 100);
      r.value = String(v);
      fill(r, v, 100);
    });

    var flag = '';
    if (s.status === 'error') flag = "Couldn't play this song. Press play to try again.";
    else if (s.shortStream && t) flag = 'Short stream: ' + U.fmtTime(s.duration) + ' of ' + U.fmtTime(t.duration);
    all('flag').concat(all('bigflag')).forEach(function (n) { n.textContent = flag; n.hidden = !flag; });

    var from = all('from')[0];
    from.textContent = s.context && s.context.name ? 'Playing from ' + s.context.name : '';
  }

  function drawTime() {
    var s = P.state;
    var max = Math.max(1, Math.floor(s.duration || 0));
    var value = Math.min(max, Math.floor(s.time || 0));
    all('total').forEach(function (n) { n.textContent = U.fmtTime(s.duration || 0); });
    if (!scrubbing) {
      all('elapsed').forEach(function (n) { n.textContent = U.fmtTime(value); });
      all('seek').forEach(function (r) {
        r.max = String(max);
        r.value = String(value);
        r.setAttribute('aria-valuetext', U.fmtTime(value) + ' of ' + U.fmtTime(s.duration || 0));
        fill(r, value, max);
      });
    }
    var line = all('line')[0];
    if (line) line.style.width = (s.duration > 0 ? U.clamp(s.time / s.duration * 100, 0, 100) : 0) + '%';
  }

  /* ---- Phone sheet (motion treatment 3) ---- */
  var backdrop = ['.masthead', '#banner', '#main', '#tabs', '#player'];

  function openSheet() {
    if (sheetOpen || !P.current()) return;
    sheetOpen = true;
    els.sheet.classList.add('is-open');
    els.sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sheet-open');
    backdrop.forEach(function (sel) { var n = document.querySelector(sel); if (n) n.inert = true; });
    var close = els.sheet.querySelector('[data-act="close"]');
    if (close) close.focus();
  }

  function closeSheet(refocus) {
    if (!sheetOpen) return;
    sheetOpen = false;
    UI.closeMenu(false);
    els.sheet.classList.remove('is-open');
    els.sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sheet-open');
    backdrop.forEach(function (sel) { var n = document.querySelector(sel); if (n) n.inert = false; });
    var opener = els.bar.querySelector('[data-act="open"]');
    if (refocus !== false && opener && !opener.disabled) opener.focus();
  }

  GF.playerbar = { mount: mount, openSheet: openSheet, closeSheet: closeSheet };
})(window.GF);
