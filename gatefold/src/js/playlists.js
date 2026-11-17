/* Gatefold: playlists.
   Creating, renaming, deleting, adding, removing and reordering.
   Each playlist keeps a small copy of its songs' details so it can be shown
   without asking the catalog again. */
(function (GF) {
  'use strict';

  var U = GF.util, S = GF.store;
  var bus = U.emitter();
  var lists = load();

  function load() {
    var raw = S.get('playlists', []);
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (p) { return p && p.id && Array.isArray(p.tracks); });
  }

  function save(change) {
    var ok = S.set('playlists', lists);
    bus.emit('change', change || {});
    return ok;
  }

  /* What a playlist remembers about a song */
  function snapshot(t) {
    return {
      id: String(t.id),
      title: t.title || 'Untitled',
      artist: t.artist || 'Unknown artist',
      artistId: t.artistId || '',
      album: t.album || '',
      albumId: t.albumId || '',
      duration: t.duration || 0,
      art: t.art || '',
      audio: t.audio || '',
      url: t.url || '',
      genres: t.genres || [],
      moods: t.moods || [],
      instruments: t.instruments || [],
      speed: t.speed || '',
      vocal: t.vocal || ''
    };
  }

  function cleanName(name) {
    return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  function uniqueName(name, exceptId) {
    var taken = {};
    lists.forEach(function (p) { if (p.id !== exceptId) taken[p.name.toLowerCase()] = true; });
    if (!taken[name.toLowerCase()]) return name;
    for (var n = 2; n < 1000; n++) {
      var candidate = name + ' ' + n;
      if (!taken[candidate.toLowerCase()]) return candidate;
    }
    return name;
  }

  function all() { return lists.slice(); }

  /* Newest first, for the Library */
  function byCreated() {
    return lists.map(function (p, i) { return { p: p, i: i }; })
      .sort(function (a, b) { return (b.p.createdAt - a.p.createdAt) || (b.i - a.i); })
      .map(function (x) { return x.p; });
  }

  /* Most recently changed first, for the "add to" menu */
  function byRecent() {
    return lists.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }

  function get(id) {
    for (var i = 0; i < lists.length; i++) if (lists[i].id === id) return lists[i];
    return null;
  }

  function create(name) {
    name = cleanName(name);
    if (!name) return null;
    var now = Date.now();
    var pl = { id: U.uid('pl'), name: uniqueName(name), createdAt: now, updatedAt: now, tracks: [] };
    lists.push(pl);
    save({ type: 'create', id: pl.id });
    return pl;
  }

  function rename(id, name) {
    var pl = get(id);
    name = cleanName(name);
    if (!pl || !name) return false;
    name = uniqueName(name, id);
    if (pl.name === name) return true;
    pl.name = name;
    pl.updatedAt = Date.now();
    save({ type: 'rename', id: id });
    return true;
  }

  function remove(id) {
    var pl = get(id);
    if (!pl) return null;
    lists = lists.filter(function (p) { return p.id !== id; });
    save({ type: 'delete', id: id });
    return pl;
  }

  /* Put a deleted playlist back (Undo) */
  function restore(pl) {
    if (!pl || get(pl.id)) return false;
    lists.push(pl);
    save({ type: 'create', id: pl.id });
    return true;
  }

  function has(id, trackId) {
    var pl = get(id);
    if (!pl) return false;
    trackId = String(trackId);
    return pl.tracks.some(function (t) { return t.id === trackId; });
  }

  /* putBack = true when undoing a removal: the song returns to its old place
     and is not counted as a fresh "saved this" for recommendations. */
  function addTrack(id, track, index, putBack) {
    var pl = get(id);
    if (!pl || !track) return { ok: false, reason: 'missing' };
    if (has(id, track.id)) return { ok: false, reason: 'duplicate' };
    var snap = snapshot(track);
    if (index == null || index < 0 || index > pl.tracks.length) pl.tracks.push(snap);
    else pl.tracks.splice(index, 0, snap);
    pl.updatedAt = Date.now();
    save({ type: putBack ? 'putback' : 'add', id: id, track: snap });
    return { ok: true };
  }

  function removeTrack(id, trackId) {
    var pl = get(id);
    if (!pl) return null;
    trackId = String(trackId);
    var index = -1;
    for (var i = 0; i < pl.tracks.length; i++) if (pl.tracks[i].id === trackId) { index = i; break; }
    if (index === -1) return null;
    var track = pl.tracks.splice(index, 1)[0];
    pl.updatedAt = Date.now();
    save({ type: 'remove', id: id, trackId: trackId });
    return { track: track, index: index };
  }

  function moveTrack(id, from, to) {
    var pl = get(id);
    if (!pl) return false;
    var n = pl.tracks.length;
    if (from < 0 || from >= n) return false;
    to = U.clamp(to, 0, n - 1);
    if (from === to) return false;
    var item = pl.tracks.splice(from, 1)[0];
    pl.tracks.splice(to, 0, item);
    pl.updatedAt = Date.now();
    save({ type: 'move', id: id, from: from, to: to });
    return true;
  }

  /* A stream address was refreshed after a failed play: keep the new one. */
  function updateAudio(trackId, audio) {
    var changed = false;
    trackId = String(trackId);
    lists.forEach(function (pl) {
      pl.tracks.forEach(function (t) {
        if (t.id === trackId && t.audio !== audio) { t.audio = audio; changed = true; }
      });
    });
    if (changed) S.set('playlists', lists);
  }

  function totalDuration(pl) {
    return pl.tracks.reduce(function (sum, t) { return sum + (t.duration || 0); }, 0);
  }

  function describe(pl) {
    var n = pl.tracks.length;
    if (!n) return 'No songs yet';
    var total = U.fmtTotal(totalDuration(pl));
    return U.plural(n, 'song', 'songs') + (total ? ' · ' + total : '');
  }

  /* Bring playlists in from a backup file. Nothing existing is thrown away:
     a playlist with the same id is replaced only if the backup's copy is newer. */
  function merge(incoming) {
    if (!Array.isArray(incoming)) return 0;
    var count = 0;
    incoming.forEach(function (p) {
      if (!p || !p.id || !Array.isArray(p.tracks)) return;
      var clean = {
        id: String(p.id),
        name: cleanName(p.name) || 'Playlist',
        createdAt: Number(p.createdAt) || Date.now(),
        updatedAt: Number(p.updatedAt) || Date.now(),
        tracks: p.tracks.filter(function (t) { return t && t.id; }).map(snapshot)
      };
      var existing = get(clean.id);
      if (!existing) { clean.name = uniqueName(clean.name); lists.push(clean); count++; }
      else if (clean.updatedAt > existing.updatedAt) {
        lists[lists.indexOf(existing)] = clean;
        count++;
      }
    });
    if (count) save({ type: 'merge' });
    return count;
  }

  /* Another tab saved changes */
  function reload() {
    lists = load();
    bus.emit('change', { type: 'external' });
  }

  GF.playlists = {
    all: all, byCreated: byCreated, byRecent: byRecent, get: get,
    create: create, rename: rename, remove: remove, restore: restore,
    has: has, addTrack: addTrack, removeTrack: removeTrack, moveTrack: moveTrack,
    updateAudio: updateAudio, totalDuration: totalDuration, describe: describe,
    merge: merge, reload: reload, snapshot: snapshot, on: bus.on
  };
})(window.GF);
