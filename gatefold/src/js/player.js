/* Gatefold: the player.
   One audio element, one queue, one state object. Every play button, row
   highlight and time readout in the interface is drawn from this state, so
   they cannot disagree with what is actually sounding. */
(function (GF) {
  'use strict';

  var U = GF.util, S = GF.store;
  var bus = U.emitter();
  var audio = new Audio();
  audio.preload = 'auto';

  var st = {
    queue: [],          // songs in their natural order
    order: [],          // indexes into queue, in playing order (shuffled or not)
    pos: -1,            // where we are in `order`
    status: 'idle',     // idle | loading | playing | paused | error
    time: 0,
    duration: 0,
    volume: 1,
    muted: false,
    shuffle: false,
    repeat: 'off',      // off | all | one
    context: null,      // where the queue came from: { type, id, name }
    canVolume: true,    // false on phones that only allow hardware volume
    shortStream: false, // the stream is much shorter than the listed length
    error: ''
  };

  var wantPlay = false;       // what the listener asked for, regardless of buffering
  var loadedId = null;        // id of the song currently in the audio element
  var loadToken = 0;
  var pendingSeek = null;
  var heardSeconds = 0;       // seconds actually played of the current song
  var lastTick = 0;
  var retried = {};
  var unavailable = {};
  var failStreak = 0;
  var advanceTimer = null;

  function current() {
    return st.pos >= 0 && st.pos < st.order.length ? st.queue[st.order[st.pos]] : null;
  }

  function setStatus(s) {
    if (st.status === s) return;
    st.status = s;
    if (s !== 'error') st.error = '';
    syncMediaState();
    bus.emit('state');
  }

  function notify(message) { bus.emit('notice', message); }

  /* ---- Listening notes for recommendations ---- */
  function closeOut(reason) {
    var t = current();
    if (!t || t.ghost && !heardSeconds) { heardSeconds = 0; return; }
    var d = st.duration || t.duration || 0;
    if (heardSeconds >= 30 || (d > 0 && heardSeconds >= d * 0.5)) {
      bus.emit('signal', { track: t, kind: 'listen' });
      if (reason === 'ended' || (d > 0 && heardSeconds >= d * 0.9)) bus.emit('signal', { track: t, kind: 'finish' });
    } else if (reason === 'next' && heardSeconds >= 2 && heardSeconds < 12) {
      bus.emit('signal', { track: t, kind: 'skip' });
    }
    heardSeconds = 0;
  }

  /* ---- Loading and playing ---- */
  function load(autoplay) {
    var t = current();
    loadToken++;
    clearTimeout(advanceTimer);
    heardSeconds = 0;
    lastTick = 0;
    pendingSeek = null;
    st.time = 0;
    st.duration = t ? (t.duration || 0) : 0;
    st.shortStream = false;
    bus.emit('track', t);
    bus.emit('time');
    if (!t) { wantPlay = false; loadedId = null; silence(); setStatus('idle'); return; }
    setMediaMeta(t);
    if (!t.audio || unavailable[t.id]) {
      // nothing playable here: stop the previous song and move on
      wantPlay = !!autoplay;
      loadedId = null;
      silence();
      failed(t);
      return;
    }
    wantPlay = !!autoplay;
    loadedId = t.id;
    audio.src = t.audio;
    if (autoplay) { setStatus('loading'); attemptPlay(); }
    else setStatus('paused');
    persistPos();
  }

  function silence() {
    try { audio.pause(); } catch (e) { /* nothing loaded */ }
  }

  function attemptPlay() {
    var token = loadToken;
    var p;
    try { p = audio.play(); } catch (e) { p = null; }
    if (p && typeof p.catch === 'function') {
      p.catch(function (e) {
        if (token !== loadToken) return;
        if (e && e.name === 'NotAllowedError') {
          // the browser wants a tap before sound can start
          wantPlay = false;
          setStatus('paused');
          notify('Press play to start listening.');
        }
        // anything else arrives through the audio element's error event
      });
    }
  }

  function playList(tracks, startIndex, context, opts) {
    opts = opts || {};
    closeOut('switch');
    st.queue = (tracks || []).slice();
    st.context = context || null;
    var n = st.queue.length;
    if (!n) { st.order = []; st.pos = -1; load(false); return; }
    if (opts.shuffle != null && st.shuffle !== !!opts.shuffle) { st.shuffle = !!opts.shuffle; saveSettings(); }
    var start = U.clamp(startIndex || 0, 0, n - 1);
    if (st.shuffle) {
      st.order = [start].concat(U.shuffle(U.range(n).filter(function (i) { return i !== start; })));
      st.pos = 0;
    } else {
      st.order = U.range(n);
      st.pos = start;
    }
    failStreak = 0;
    bus.emit('queue');
    load(true);
  }

  function play() {
    var t = current();
    if (!t) return;
    if (st.status === 'error' || unavailable[t.id]) {
      // pressing play on a song that failed means "try again"
      delete unavailable[t.id];
      retried[t.id] = false;
      failStreak = 0;
      loadedId = null;
      bus.emit('available', t);
    }
    wantPlay = true;
    if (loadedId !== t.id) {
      // a restored session, or a retry: put the song in the audio element first
      if (!t.audio) { failed(t); return; }
      var resumeAt = st.time;
      loadToken++;
      loadedId = t.id;
      audio.src = t.audio;
      pendingSeek = resumeAt > 2 ? resumeAt : null;
      setStatus('loading');
    } else if (audio.readyState < 3) {
      setStatus('loading');
    }
    attemptPlay();
  }

  function pause() {
    wantPlay = false;
    clearTimeout(advanceTimer);
    try { audio.pause(); } catch (e) { /* nothing loaded yet */ }
    setStatus(current() ? 'paused' : 'idle');
    persistNow();
  }

  function toggle() {
    if (!current()) return;
    if (st.status === 'playing' || (st.status === 'loading' && wantPlay)) pause();
    else play();
  }

  function hasNext() {
    return st.pos + 1 < st.order.length || (st.repeat === 'all' && st.order.length > 0);
  }

  function step(reason) {
    closeOut(reason);
    var n = st.order.length;
    if (st.pos + 1 < n) {
      st.pos += 1;
      load(true);
    } else if (st.repeat === 'all' && n > 0) {
      st.pos = 0;
      load(true);
    } else if (reason === 'ended' || reason === 'failed') {
      // end of the queue: rest on the last song, ready to start it again
      wantPlay = false;
      lastTick = 0;
      st.time = 0;
      try { audio.currentTime = 0; } catch (e) { /* not seekable */ }
      setStatus(st.status === 'error' ? 'error' : 'paused');
      bus.emit('time');
      persistNow();
    }
  }

  function next() {
    if (!current() || !hasNext()) return;
    clearTimeout(advanceTimer);
    step('next');
  }

  function prev() {
    var t = current();
    if (!t) return;
    clearTimeout(advanceTimer);
    if (st.time > 3 || st.pos <= 0) { seek(0); return; }
    closeOut('prev');
    st.pos -= 1;
    load(true);
  }

  function seek(sec) {
    var t = current();
    if (!t) return;
    var max = st.duration || t.duration || 0;
    sec = U.clamp(Number(sec) || 0, 0, Math.max(0, max - 0.25));
    if (loadedId === t.id && audio.readyState >= 1) {
      try { audio.currentTime = sec; } catch (e) { pendingSeek = sec; }
    } else {
      pendingSeek = sec;
    }
    st.time = sec;
    lastTick = sec;
    bus.emit('time');
    persistSoon();
  }

  /* ---- Volume, shuffle, repeat ---- */
  function setVolume(v) {
    st.volume = U.clamp(Number(v) || 0, 0, 1);
    st.muted = st.volume === 0;
    applyVolume();
    saveSettings();
    bus.emit('state');
  }

  function toggleMute() {
    st.muted = !st.muted;
    if (!st.muted && st.volume === 0) st.volume = 0.6;
    applyVolume();
    saveSettings();
    bus.emit('state');
  }

  function applyVolume() {
    try { audio.volume = st.volume; audio.muted = st.muted; } catch (e) { /* read-only on some phones */ }
  }

  function toggleShuffle() {
    st.shuffle = !st.shuffle;
    var n = st.queue.length;
    if (n) {
      var cur = st.order[st.pos];
      if (st.shuffle) {
        st.order = [cur].concat(U.shuffle(U.range(n).filter(function (i) { return i !== cur; })));
        st.pos = 0;
      } else {
        st.order = U.range(n);
        st.pos = cur;
      }
    }
    saveSettings();
    persistSoon();
    bus.emit('queue');
    bus.emit('state');
  }

  function cycleRepeat() {
    st.repeat = st.repeat === 'off' ? 'all' : st.repeat === 'all' ? 'one' : 'off';
    saveSettings();
    bus.emit('state');
  }

  /* ---- When a song will not play ---- */
  function failed(t) {
    unavailable[t.id] = true;
    bus.emit('unavailable', t);
    failStreak += 1;
    if (wantPlay && failStreak < 3 && hasNext() && st.order.length > 1) {
      notify("Couldn't play “" + t.title + "”. Skipping to the next song.");
      setStatus('loading');
      advanceTimer = setTimeout(function () { step('failed'); }, 1200);
      return;
    }
    wantPlay = false;
    st.error = failStreak >= 3
      ? 'Three songs in a row would not play. Check your connection, then press play.'
      : "Couldn't play “" + t.title + "”.";
    st.status = 'error';
    syncMediaState();
    bus.emit('state');
    notify(st.error);
  }

  function onAudioError() {
    var t = current();
    if (!t || loadedId !== t.id) return;
    var code = audio.error && audio.error.code;
    if (code === 1) return;                       // the load was replaced on purpose
    if (navigator.onLine === false) {
      wantPlay = false;
      loadedId = null;
      setStatus('paused');
      notify("You're offline. Press play when you're back online.");
      return;
    }
    // Stream addresses can go stale. Ask the catalog once for a fresh one.
    if (!retried[t.id] && GF.catalog.hasKey()) {
      retried[t.id] = true;
      var token = loadToken;
      var resumeAt = st.time;
      setStatus('loading');
      GF.catalog.byIds([t.id]).then(function (list) {
        if (token !== loadToken) return;
        var fresh = list[0];
        if (fresh && fresh.audio && fresh.audio !== t.audio) {
          t.audio = fresh.audio;
          bus.emit('refreshed', t);
          pendingSeek = resumeAt > 2 ? resumeAt : null;
          audio.src = t.audio;
          if (wantPlay) attemptPlay(); else setStatus('paused');
        } else {
          failed(t);
        }
      }, function () {
        if (token === loadToken) failed(t);
      });
      return;
    }
    failed(t);
  }

  /* ---- Audio element events ---- */
  audio.addEventListener('playing', function () {
    failStreak = 0;
    setStatus('playing');
  });

  audio.addEventListener('pause', function () {
    // Pauses we asked for are handled in pause(). This catches the system
    // pausing us (headphones unplugged, a phone call) while a song is loaded.
    if (audio.ended || audio.readyState === 0) return;
    if (wantPlay && st.status === 'playing') { wantPlay = false; setStatus('paused'); persistNow(); }
  });

  audio.addEventListener('waiting', function () {
    if (wantPlay && st.status !== 'error') setStatus('loading');
  });

  audio.addEventListener('canplay', function () {
    if (st.status === 'loading' && !wantPlay) setStatus('paused');
  });

  function readDuration() {
    var t = current();
    var d = audio.duration;
    if (!t || loadedId !== t.id || !isFinite(d) || d <= 0) return;
    st.duration = d;
    // Catalog says several minutes but the stream is far shorter: say so.
    st.shortStream = t.duration >= 90 && d < t.duration * 0.6;
    bus.emit('state');
    bus.emit('time');
  }
  audio.addEventListener('durationchange', readDuration);
  audio.addEventListener('loadedmetadata', function () {
    readDuration();
    if (pendingSeek != null) {
      try { audio.currentTime = Math.min(pendingSeek, Math.max(0, (audio.duration || pendingSeek) - 1)); } catch (e) { /* ignore */ }
      lastTick = pendingSeek;
      pendingSeek = null;
    }
  });

  audio.addEventListener('timeupdate', function () {
    var t = current();
    if (!t || loadedId !== t.id) return;
    var now = audio.currentTime;
    var delta = now - lastTick;
    if (delta > 0 && delta < 1.5 && !audio.paused) heardSeconds += delta;
    lastTick = now;
    st.time = now;
    bus.emit('time');
    persistSoon();
    syncMediaPosition();
  });

  audio.addEventListener('seeking', function () { lastTick = audio.currentTime; });

  audio.addEventListener('ended', function () {
    if (st.repeat === 'one') {
      closeOut('ended');
      lastTick = 0;
      try { audio.currentTime = 0; } catch (e) { /* ignore */ }
      attemptPlay();
      return;
    }
    step('ended');
  });

  audio.addEventListener('error', onAudioError);

  /* ---- Lock-screen and keyboard media keys ---- */
  function setMediaMeta(t) {
    if (!('mediaSession' in navigator) || typeof window.MediaMetadata !== 'function') return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: t.title,
        artist: t.artist,
        album: t.album || '',
        artwork: t.art ? [{ src: GF.catalog.artAt(t.art, 300), sizes: '300x300' }] : []
      });
    } catch (e) { /* optional feature */ }
  }

  function syncMediaState() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = st.status === 'playing' || st.status === 'loading' ? 'playing'
        : st.status === 'paused' ? 'paused' : 'none';
    } catch (e) { /* optional feature */ }
  }

  var syncMediaPosition = U.throttle(function () {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!st.duration || !isFinite(st.duration)) return;
    try {
      navigator.mediaSession.setPositionState({ duration: st.duration, position: Math.min(st.time, st.duration), playbackRate: 1 });
    } catch (e) { /* optional feature */ }
  }, 2000);

  if ('mediaSession' in navigator) {
    [['play', play], ['pause', pause], ['previoustrack', prev], ['nexttrack', next],
      ['seekto', function (d) { if (d && d.seekTime != null) seek(d.seekTime); }]
    ].forEach(function (pair) {
      try { navigator.mediaSession.setActionHandler(pair[0], pair[1]); } catch (e) { /* not supported here */ }
    });
  }

  /* ---- Remembering between visits ---- */
  function saveSettings() {
    S.set('playback', { volume: st.volume, muted: st.muted, shuffle: st.shuffle, repeat: st.repeat });
  }

  /* The queue is written only when it changes; the position is written
     every few seconds while a song plays. */
  function persistQueue() {
    if (!st.queue.length) { S.remove('queue'); S.remove('queuepos'); return; }
    S.set('queue', {
      tracks: st.queue.slice(0, 500),
      order: st.queue.length <= 500 ? st.order : null,
      context: st.context
    });
    persistPos();
  }

  function persistPos() {
    if (!st.queue.length) return;
    S.set('queuepos', { pos: st.pos, time: Math.floor(st.time) });
  }
  var persistSoon = U.throttle(persistPos, 4000);
  var persistNow = persistPos;
  bus.on('queue', persistQueue);

  function restore() {
    var pb = S.get('playback', null);
    if (pb) {
      if (typeof pb.volume === 'number') st.volume = U.clamp(pb.volume, 0, 1);
      st.muted = !!pb.muted;
      st.shuffle = !!pb.shuffle;
      if (['off', 'all', 'one'].indexOf(pb.repeat) !== -1) st.repeat = pb.repeat;
    }
    // Some phones ignore volume set by a page; hide the slider there.
    try {
      audio.volume = 0.5;
      st.canVolume = Math.abs(audio.volume - 0.5) < 0.01;
    } catch (e) { st.canVolume = false; }
    applyVolume();

    var q = S.get('queue', null);
    var qp = S.get('queuepos', null) || {};
    if (q && Array.isArray(q.tracks) && q.tracks.length) {
      var n = q.tracks.length;
      var okOrder = Array.isArray(q.order) && q.order.length === n &&
        q.order.every(function (i) { return Number.isInteger(i) && i >= 0 && i < n; });
      st.queue = q.tracks.filter(function (t) { return t && t.id; });
      n = st.queue.length;
      if (!n) return;
      st.order = okOrder && n === q.tracks.length ? q.order : U.range(n);
      st.pos = U.clamp(Number(qp.pos) || 0, 0, n - 1);
      st.context = q.context || null;
      var t = current();
      st.duration = t.duration || 0;
      st.time = U.clamp(Number(qp.time) || 0, 0, Math.max(0, st.duration - 1));
      st.status = 'paused';
      loadedId = null;        // loaded into the audio element on the first press of play
    }
  }

  /* A playlist that is playing was edited: keep the queue in step with it. */
  function syncQueue(playlistId, tracks) {
    if (!st.context || st.context.type !== 'playlist' || st.context.id !== playlistId) return;
    var cur = current();
    if (!cur) return;
    var queue = tracks.slice();
    var idx = -1;
    for (var i = 0; i < queue.length; i++) if (queue[i].id === cur.id) { idx = i; break; }
    if (idx === -1) {
      // The playing song was removed. Let it finish, then carry on from its old place.
      idx = Math.min(st.order[st.pos], queue.length);
      var ghost = {};
      Object.keys(cur).forEach(function (k) { ghost[k] = cur[k]; });
      ghost.ghost = true;
      queue.splice(idx, 0, ghost);
    }
    st.queue = queue;
    if (st.shuffle) {
      st.order = [idx].concat(U.shuffle(U.range(queue.length).filter(function (j) { return j !== idx; })));
      st.pos = 0;
    } else {
      st.order = U.range(queue.length);
      st.pos = idx;
    }
    persistSoon();
    bus.emit('queue');
  }

  function renameContext(playlistId, name) {
    if (st.context && st.context.type === 'playlist' && st.context.id === playlistId) {
      st.context.name = name;
      persistQueue();
      bus.emit('state');
    }
  }

  window.addEventListener('pagehide', persistNow);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') persistNow();
  });

  GF.player = {
    state: st,
    current: current,
    isUnavailable: function (id) { return !!unavailable[id]; },
    isActive: function () { return st.status === 'playing' || (st.status === 'loading' && wantPlay); },
    hasNext: hasNext,
    playList: playList,
    play: play,
    pause: pause,
    toggle: toggle,
    next: next,
    prev: prev,
    seek: seek,
    setVolume: setVolume,
    toggleMute: toggleMute,
    toggleShuffle: toggleShuffle,
    cycleRepeat: cycleRepeat,
    syncQueue: syncQueue,
    renameContext: renameContext,
    restore: restore,
    on: bus.on
  };
})(window.GF);
