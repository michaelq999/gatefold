/* Gatefold: the Jamendo key, backups and the Settings dialog. */
(function (GF) {
  'use strict';

  var U = GF.util, h = U.h, S = GF.store, C = GF.catalog, UI = GF.ui;
  var SESSION_FLAG = 'gatefold.testkey';

  function savedKey() {
    var s = S.get('settings', {});
    return s && typeof s.clientId === 'string' ? s.clientId : '';
  }

  function testKeyActive() {
    try { return window.sessionStorage.getItem(SESSION_FLAG) === '1'; } catch (e) { return false; }
  }

  function setTestKey(on) {
    try {
      if (on) window.sessionStorage.setItem(SESSION_FLAG, '1');
      else window.sessionStorage.removeItem(SESSION_FLAG);
    } catch (e) { /* session storage unavailable: the test key lasts until reload */ }
  }

  /* Decide which key the catalog uses when the app starts */
  function applyStoredKey() {
    var key = savedKey();
    C.configure({ clientId: key || (testKeyActive() ? C.TEST_KEY : '') });
  }

  function explain(err) {
    var kind = err && err.kind;
    if (kind === 'key') return "Jamendo didn't recognize that key. Check that you copied the Client ID, not the Client Secret.";
    if (kind === 'offline') return "You're offline. Connect to the internet, then try again.";
    if (kind === 'rate') return 'Jamendo is limiting requests right now. Wait a minute, then try again.';
    if (kind === 'timeout' || kind === 'network') return "Couldn't reach Jamendo. Check your connection, then try again.";
    return (err && err.message) || "Couldn't check the key. Try again.";
  }

  /* Check a key with Jamendo, then keep it. Leaves the old key in place on failure. */
  function connect(key, asTest) {
    var previous = C.key();
    C.configure({ clientId: key });
    return C.ping().then(function () {
      if (asTest) {
        setTestKey(true);
      } else {
        setTestKey(false);
        var s = S.get('settings', {});
        s.clientId = key;
        S.set('settings', s);
      }
      GF.app.keyChanged();
    }, function (err) {
      C.configure({ clientId: previous });
      throw err;
    });
  }

  function forgetKey() {
    var s = S.get('settings', {});
    delete s.clientId;
    S.set('settings', s);
    setTestKey(false);
    C.configure({ clientId: '' });
    GF.app.keyChanged();
  }

  /* The first-run panel, also used inside Settings */
  function connectPanel(opts) {
    opts = opts || {};
    var input = h('input', {
      class: 'field', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      maxlength: '64', placeholder: 'Paste your Client ID', 'aria-label': 'Jamendo Client ID'
    });
    var button = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Connect');
    var error = h('p', { class: 'panel__error', role: 'alert', hidden: true });
    var tryButton = h('button', { class: 'link', type: 'button' }, "Try it first with Jamendo's test key");

    function busy(on, label) {
      button.disabled = on;
      tryButton.disabled = on;
      button.textContent = on ? 'Checking…' : 'Connect';
      if (label) error.textContent = label;
    }
    function fail(message) {
      error.textContent = message;
      error.hidden = false;
    }
    function run(key, asTest) {
      error.hidden = true;
      busy(true);
      connect(key, asTest).then(function () {
        busy(false);
        UI.toast(asTest ? "Connected with Jamendo's test key." : 'Connected to Jamendo.');
        if (opts.onConnected) opts.onConnected();
      }, function (err) {
        busy(false);
        fail(explain(err));
      });
    }

    var form = h('form', { class: 'inline-form', novalidate: true }, input, button);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var key = input.value.trim();
      if (!/^[A-Za-z0-9]{6,64}$/.test(key)) {
        fail(key ? "That doesn't look like a Client ID. It is a short code of letters and numbers." : 'Paste your Client ID first.');
        input.focus();
        return;
      }
      run(key, false);
    });
    tryButton.addEventListener('click', function () { run(C.TEST_KEY, true); });

    return h('section', { class: 'panel', 'aria-label': 'Connect to Jamendo' },
      opts.heading === false ? null : h('h2', { class: 'panel__title', text: 'Connect to Jamendo' }),
      h('p', { text: 'Gatefold plays music from Jamendo, a free catalog of independent artists. Jamendo asks every app for a free key so it knows who is asking.' }),
      h('ol', { class: 'steps' },
        h('li', null, h('span', null, 'Open ',
          h('a', { class: 'link', href: C.signup, target: '_blank', rel: 'noopener noreferrer' }, 'devportal.jamendo.com'),
          ' and sign up. It is free.')),
        h('li', null, h('span', null, 'Create an application. Any name works, such as “My music player”.')),
        h('li', null, h('span', null, 'Copy its ', h('strong', null, 'Client ID'), ' and paste it here.'))),
      form,
      error,
      h('p', { class: 'label', text: 'The key is saved only in this browser and is sent only to Jamendo.' }),
      h('div', { class: 'panel__group', style: 'gap:var(--s1)' },
        h('p', null, tryButton),
        h('p', { class: 'label', text: 'Jamendo publishes a shared key for testing. It is fine for a first look, and Gatefold forgets it when you close this tab.' })));
  }

  /* ---- Connection check ----
     Runs the real calls the app depends on and reports each one in plain
     words. This is how to confirm, on your own connection, that Jamendo
     accepts the key, sends whole songs rather than previews, and answers
     the "similar to an outside artist" lookup. */
  function probeAudio(url) {
    return new Promise(function (resolve, reject) {
      var a = new Audio();
      var timer = setTimeout(function () { stop(); reject(new Error('timeout')); }, 15000);
      function stop() {
        clearTimeout(timer);
        a.removeAttribute('src');
        try { a.load(); } catch (e) { /* nothing to release */ }
      }
      a.preload = 'metadata';
      a.addEventListener('loadedmetadata', function () { var d = a.duration; stop(); resolve(d); });
      a.addEventListener('error', function () { stop(); reject(new Error('load')); });
      a.src = url;
    });
  }

  function probeImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var timer = setTimeout(function () { reject(new Error('timeout')); }, 12000);
      img.onload = function () { clearTimeout(timer); resolve(); };
      img.onerror = function () { clearTimeout(timer); reject(new Error('load')); };
      img.src = url;
    });
  }

  function runCheck(listEl, button) {
    var T = GF.taste;
    var failed = 0;
    U.clear(listEl);
    listEl.hidden = false;
    button.disabled = true;
    button.textContent = 'Checking…';

    function line(state, text) {
      if (state === 'bad') failed++;
      listEl.appendChild(h('li', { class: 'checks__item is-' + state },
        UI.icon(state === 'ok' ? 'check' : state === 'bad' ? 'close' : 'right'), h('span', { text: text })));
    }
    function finish() {
      button.disabled = false;
      button.textContent = 'Check the connection';
      line(failed ? 'bad' : 'ok', failed
        ? 'Finished with ' + U.plural(failed, 'problem', 'problems') + '. The lines marked × say what to look at.'
        : 'Finished. Everything Gatefold needs from Jamendo is working. Requests went by the ' + C.route() + ' route.');
    }

    C.ping().then(function () {
      line('ok', 'Jamendo accepted the key.');
      return C.popular({ limit: 8 });
    }).then(function (songs) {
      var song = null;
      songs.forEach(function (t) { if (!song && t.audio && t.duration > 0) song = t; });
      if (!song) { line('bad', 'The catalog answered but sent no playable songs.'); return null; }
      line('ok', 'The catalog answers: ' + U.plural(songs.length, 'song', 'songs') + ' received.');
      return probeAudio(song.audio).then(function (seconds) {
        var listed = U.fmtTime(song.duration), got = U.fmtTime(seconds);
        if (!isFinite(seconds) || seconds <= 0) line('info', 'The stream for “' + song.title + '” loads, but the browser could not read its length.');
        else if (seconds >= song.duration * 0.9) line('ok', 'Songs arrive whole: “' + song.title + '” is listed at ' + listed + ' and its stream is ' + got + ' long.');
        else if (seconds < song.duration * 0.6) line('bad', 'The stream for “' + song.title + '” is ' + got + ' long but the song is listed at ' + listed + '. Jamendo may be sending previews.');
        else line('info', 'The stream for “' + song.title + '” is ' + got + ' long; the song is listed at ' + listed + '.');
      }, function () {
        line('bad', 'The stream for “' + song.title + '” would not load.');
      }).then(function () {
        if (!song.art) return null;
        return probeImage(C.artAt(song.art, 100)).then(
          function () { line('ok', 'Cover artwork loads.'); },
          function () { line('bad', 'Cover artwork would not load. Songs will show letter tiles instead.'); });
      });
    }).then(function () {
      // Jamendo's lookup for artists who are not on Jamendo
      var names = T.seeds().artists.slice(0, 3);
      var i = 0;
      function next() {
        if (i >= names.length) return null;
        var name = names[i++];
        return C.likeOutsideArtist(name, { limit: 5 }).then(function (list) {
          if (list.length) line('ok', 'Jamendo found songs similar to ' + name + '.');
          else line('info', 'Jamendo has no “similar to ' + name + '” results. Gatefold uses a matching genre instead, when it has one.');
        }, function (err) {
          if (T.isFatal(err)) throw err;
          line('info', 'Jamendo did not answer the “similar to ' + name + '” lookup. Gatefold uses a matching genre instead, when it has one.');
        }).then(next);
      }
      return next();
    }).then(function () {
      // the genre names Gatefold relies on for your favorites: do they exist on Jamendo?
      var seeds = T.seeds();
      var tags = seeds.genres.slice();
      seeds.artists.forEach(function (name) {
        T.standInTags(name).forEach(function (tag) { if (tags.indexOf(tag) === -1) tags.push(tag); });
      });
      tags = tags.slice(0, 8);
      if (!tags.length) return null;
      var empty = [];
      var i = 0;
      function next() {
        if (i >= tags.length) {
          if (empty.length) line('info', 'Jamendo returned no songs for the genre ' + U.listWords(empty.map(T.tagLabel)) + '. Those favorites will not add to Listen.');
          if (empty.length < tags.length) {
            line('ok', 'Genre lookups return songs: ' + U.listWords(tags.filter(function (g) { return empty.indexOf(g) === -1; }).map(T.tagLabel)) + '.');
          }
          return null;
        }
        var tag = tags[i++];
        return C.byTags([tag], { limit: 3 }).then(function (list) {
          if (!list.length) empty.push(tag);
        }, function (err) {
          if (T.isFatal(err)) throw err;
          empty.push(tag);
        }).then(next);
      }
      return next();
    }).then(finish, function (err) {
      line('bad', explain(err));
      finish();
    });
  }

  /* ---- Backup file ---- */
  function downloadBackup() {
    var data = JSON.stringify(S.exportBackup(), null, 2);
    var d = new Date();
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    var name = 'gatefold-backup-' + d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + '.json';
    var url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    var a = h('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    UI.toast('Backup saved as ' + name + '.');
  }

  function restoreBackup(file) {
    var reader = new FileReader();
    reader.onerror = function () { UI.toast("Couldn't read that file."); };
    reader.onload = function () {
      try {
        var data = S.readBackup(JSON.parse(String(reader.result)));
        var count = GF.playlists.merge(data.playlists || []);
        GF.taste.merge(data);
        UI.toast(count ? 'Restored ' + U.plural(count, 'playlist', 'playlists') + '.' : 'Nothing new in that backup.');
        GF.app.refresh();
      } catch (err) {
        UI.toast(err && /Gatefold backup/.test(err.message) ? err.message : "That file couldn't be read as a Gatefold backup.");
      }
    };
    reader.readAsText(file);
  }

  /* ---- Settings dialog ---- */
  function maskKey(key) {
    return key.slice(0, 4) + '••••';
  }

  function open() {
    var dlg;
    var body = h('div');

    function keySection() {
      var key = savedKey();
      var sec = h('div', { class: 'setting' }, h('h3', { class: 'setting__title', text: 'Jamendo key' }));
      var results = h('ul', { class: 'checks', role: 'status', hidden: true });
      var checkButton = h('button', { class: 'btn', type: 'button', dataset: { act: 'check' } }, 'Check the connection');
      checkButton.addEventListener('click', function () { runCheck(results, checkButton); });
      if (key) {
        sec.appendChild(h('p', null, 'Connected with key ', h('code', { text: maskKey(key) }), '.'));
        sec.appendChild(h('div', { class: 'setting__row' },
          checkButton,
          h('button', { class: 'btn btn--quiet', type: 'button', onclick: function () { swapToForm(sec); } }, 'Change key'),
          h('button', { class: 'btn btn--quiet', type: 'button', onclick: function () { forgetKey(); draw(); } }, 'Remove key')));
        sec.appendChild(results);
      } else {
        if (C.isTestKey()) {
          sec.appendChild(h('p', { text: "Using Jamendo's shared test key for this tab only. Add your own key for regular listening." }));
          sec.appendChild(h('div', { class: 'setting__row' }, checkButton));
          sec.appendChild(results);
        }
        sec.appendChild(connectPanel({ heading: false, onConnected: draw }));
      }
      return sec;
    }

    function swapToForm(sec) {
      U.clear(sec);
      sec.appendChild(h('h3', { class: 'setting__title', text: 'Jamendo key' }));
      sec.appendChild(connectPanel({ heading: false, onConnected: draw }));
      var field = sec.querySelector('input');
      if (field) field.focus();
    }

    function backupSection() {
      var file = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', 'aria-label': 'Choose a backup file', tabindex: '-1' });
      file.addEventListener('change', function () {
        if (file.files && file.files[0]) restoreBackup(file.files[0]);
        file.value = '';
      });
      return h('div', { class: 'setting' },
        h('h3', { class: 'setting__title', text: 'Backup' }),
        h('p', { text: 'Playlists and listening history are saved in this browser only. Save a backup file before you clear browser data, or to move them to another device.' }),
        h('div', { class: 'setting__row' },
          h('button', { class: 'btn', type: 'button', onclick: downloadBackup }, 'Save backup file'),
          h('button', { class: 'btn', type: 'button', onclick: function () { file.click(); } }, 'Restore from file'),
          file));
    }

    function historySection() {
      return h('div', { class: 'setting' },
        h('h3', { class: 'setting__title', text: 'Recommendations' }),
        h('p', { text: 'Gatefold keeps a private note of what you play and save, only to choose songs for Listen. Clearing it also clears your favorites.' }),
        h('div', { class: 'setting__row' },
          h('button', {
            class: 'btn', type: 'button',
            onclick: function () {
              UI.confirm({
                title: 'Clear listening history?',
                text: 'Recommendations start over from scratch. Your playlists are not affected.',
                confirmLabel: 'Clear history',
                onConfirm: function () { GF.taste.clear(); UI.toast('Listening history cleared.'); GF.app.refresh(); }
              });
            }
          }, 'Clear history and favorites')));
    }

    function aboutSection() {
      return h('div', { class: 'setting' },
        h('h3', { class: 'setting__title', text: 'About' }),
        h('p', null, 'Music provided by ',
          h('a', { class: 'link', href: C.home, target: '_blank', rel: 'noopener noreferrer' }, 'Jamendo'),
          '. Songs are by independent artists who share them under Creative Commons licenses. Gatefold is a personal, non-commercial player with no ads.'),
        h('p', { class: 'label', text: 'Typefaces: TeX Gyre Bonum (GUST Font License) and Inter (SIL Open Font License 1.1). Gatefold 1.0.' }));
    }

    function draw() {
      U.clear(body);
      body.appendChild(keySection());
      body.appendChild(backupSection());
      body.appendChild(historySection());
      body.appendChild(aboutSection());
      if (!S.available) {
        body.insertBefore(UI.notice({
          quiet: true,
          title: "This browser isn't saving changes",
          text: 'Private browsing or a storage setting is blocking it. Playlists will be lost when this tab closes.'
        }), body.firstChild);
      }
    }

    draw();
    dlg = UI.dialog({ title: 'Settings', body: body, actions: [{ label: 'Done', primary: true }] });
    return dlg;
  }

  GF.settings = {
    open: open,
    connectPanel: connectPanel,
    applyStoredKey: applyStoredKey,
    savedKey: savedKey
  };
})(window.GF);
