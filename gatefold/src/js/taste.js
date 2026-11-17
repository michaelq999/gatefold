/* Gatefold: recommendations.

   How it works, in plain terms:
   1. The app notes three things while you use it: songs you listen to,
      songs you finish, and songs you add to a playlist. A song skipped in its
      first seconds is noted too, only so it isn't suggested again soon.
   2. Each note adds weight to that song's artist and to its tags (genre,
      mood, instruments). Older notes count for less: the weight halves
      every 45 days.
   3. To build a selection the app asks the catalog for (a) songs similar to
      what you play by your top artist, (b) songs carrying your top genres,
      and (c) songs for the favorites you named. It removes anything you
      have heard recently or already saved, keeps at most a couple of songs
      per artist, and shows up to three groups of five, each with the reason.

   Nothing here is a statistic to look at. The notes exist only to choose songs. */
(function (GF) {
  'use strict';

  var U = GF.util, S = GF.store;
  var bus = U.emitter();

  var DAY = 86400000;
  var HALF_LIFE_DAYS = 45;
  var MAX_SIGNALS = 800;
  var WEIGHT = { listen: 1, finish: 1, add: 3 };
  var ARTIST_MIN = 3;       // e.g. one full listen plus another play, or one save
  var TAG_MIN = 1.5;
  var GROUP_SIZE = 5;
  var MAX_GROUPS = 3;
  var MIN_GROUP = 2;
  var RECENT_DAYS = 30;     // heard or skipped within this window: not suggested again

  /* Jamendo tags are single lowercase words. These are how they read on screen. */
  var TAG_LABELS = {
    hiphop: 'hip-hop', rnb: 'R&B', singersongwriter: 'singer-songwriter', triphop: 'trip-hop',
    drumnbass: 'drum and bass', lofi: 'lo-fi', poprock: 'pop rock', newage: 'new age',
    easylistening: 'easy listening', chillout: 'chill-out', indie: 'indie', electronic: 'electronic',
    hardrock: 'hard rock', postrock: 'post-rock', synthpop: 'synth-pop', electropop: 'electro-pop'
  };

  var GENRE_CHOICES = ['pop', 'hiphop', 'rnb', 'rock', 'indie', 'electronic', 'dance', 'house', 'folk',
    'singersongwriter', 'country', 'jazz', 'soul', 'funk', 'classical', 'ambient', 'soundtrack',
    'latin', 'reggae', 'metal'];

  /* The three artists this app was set up around. None of them is on Jamendo,
     so if Jamendo's own "similar to an outside artist" lookup returns nothing,
     these genres stand in for them, and the reason line says so.
     Any other artist name gets no stand-in: the app asks for a genre instead. */
  var SUGGESTED_ARTISTS = ['Don Toliver', 'Taylor Swift', 'Katy Perry'];
  var STAND_INS = {
    'taylor swift': { tags: ['pop', 'singersongwriter'], label: 'Pop and singer-songwriter' },
    'katy perry': { tags: ['pop', 'dance'], label: 'Pop and dance' },
    'don toliver': { tags: ['hiphop', 'rnb'], label: 'Hip-hop and R&B' }
  };

  var signals = arr(S.get('signals', []));
  var meta = obj(S.get('meta', {}));
  var seeds = normalSeeds(S.get('seeds', null));

  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

  function normalSeeds(s) {
    s = obj(s);
    return {
      artists: arr(s.artists).map(String).slice(0, 8),
      genres: arr(s.genres).map(String).slice(0, 8),
      done: !!s.done,
      rev: Number(s.rev) || 0,
      turn: Number(s.turn) || 0,
      resolved: obj(s.resolved)
    };
  }

  function tagLabel(tag) {
    return TAG_LABELS[tag] || tag;
  }

  function capital(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /* ---- Notes about listening ---- */
  function compact(t) {
    return {
      title: t.title, artist: t.artist, artistId: t.artistId || '',
      genres: t.genres || [], moods: t.moods || [], instruments: t.instruments || []
    };
  }

  function record(track, kind) {
    if (!track || !track.id) return;
    var id = String(track.id);
    meta[id] = compact(track);
    signals.push({ t: Date.now(), id: id, k: kind });
    if (signals.length > MAX_SIGNALS) {
      signals = signals.slice(signals.length - MAX_SIGNALS);
      var keep = {};
      signals.forEach(function (s) { keep[s.id] = true; });
      Object.keys(meta).forEach(function (k) { if (!keep[k]) delete meta[k]; });
    }
    S.set('signals', signals);
    S.set('meta', meta);
    bus.emit('signal', { kind: kind, track: track });
  }

  /* ---- Turning the notes into weights ---- */
  function profile() {
    var now = Date.now();
    var artists = {}, tags = {}, heard = {}, skipped = {}, saved = {};

    signals.forEach(function (s) {
      var ageDays = (now - s.t) / DAY;
      if (s.k === 'skip') { if (ageDays < RECENT_DAYS) skipped[s.id] = true; return; }
      if ((s.k === 'listen' || s.k === 'finish') && ageDays < RECENT_DAYS) heard[s.id] = true;
      var m = meta[s.id];
      var w = (WEIGHT[s.k] || 0) * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
      if (!m || !w) return;

      if (m.artistId) {
        var a = artists[m.artistId] || (artists[m.artistId] = { id: m.artistId, name: m.artist, score: 0, per: {} });
        a.score += w;
        a.per[s.id] = (a.per[s.id] || 0) + w;
      }
      spread(m.genres, 'genre', 1);
      spread(m.moods, 'mood', 0.6);
      spread(m.instruments, 'instrument', 0.25);

      function spread(list, kind, share) {
        if (!list || !list.length) return;
        var each = w * share / Math.sqrt(list.length);
        list.forEach(function (tag) {
          var e = tags[tag] || (tags[tag] = { tag: tag, kind: kind, score: 0, saved: 0 });
          e.score += each;
          if (s.k === 'add') e.saved += each;
        });
      }
    });

    GF.playlists.all().forEach(function (pl) {
      pl.tracks.forEach(function (t) { saved[t.id] = true; });
    });

    var artistList = Object.keys(artists).map(function (k) {
      var a = artists[k], best = null, bestScore = 0;
      Object.keys(a.per).forEach(function (id) { if (a.per[id] > bestScore) { bestScore = a.per[id]; best = id; } });
      return { id: a.id, name: a.name, score: a.score, best: best };
    }).sort(function (x, y) { return y.score - x.score; });

    var tagList = Object.keys(tags).map(function (k) { return tags[k]; })
      .sort(function (x, y) { return y.score - x.score; });

    return {
      artists: artistList,
      tags: tagList,
      tagScore: tags,
      artistScore: artists,
      maxTag: tagList.length ? tagList[0].score : 0,
      heard: heard, skipped: skipped, saved: saved
    };
  }

  /* How well a song fits the weights above */
  function affinity(t, p) {
    var s = 0;
    function add(list, share) {
      (list || []).forEach(function (tag) { if (p.tagScore[tag]) s += p.tagScore[tag].score * share; });
    }
    add(t.genres, 1);
    add(t.moods, 0.6);
    add(t.instruments, 0.25);
    return s;
  }

  function pick(cands, p, used, sameArtistOk) {
    var scored = [];
    cands.forEach(function (t, i) {
      if (!t || !t.audio || used[t.id] || p.heard[t.id] || p.saved[t.id] || p.skipped[t.id]) return;
      var s = p.maxTag ? affinity(t, p) / p.maxTag : 0;   // fit with what you play
      s += (1 - i / cands.length) * 0.6;                  // the catalog's own ordering
      s += Math.random() * 0.25;                          // a little variety between refreshes
      scored.push({ t: t, s: s });
    });
    scored.sort(function (a, b) { return b.s - a.s; });

    var out = [], perArtist = {};
    [sameArtistOk ? GROUP_SIZE : 1, 2].forEach(function (cap) {
      scored.forEach(function (c) {
        if (out.length >= GROUP_SIZE || out.indexOf(c.t) !== -1) return;
        var key = c.t.artistId || c.t.artist;
        if ((perArtist[key] || 0) >= cap) return;
        perArtist[key] = (perArtist[key] || 0) + 1;
        out.push(c.t);
      });
    });
    return out;
  }

  function isFatal(e) {
    return !!e && ['nokey', 'key', 'offline', 'network', 'timeout', 'rate'].indexOf(e.kind) !== -1;
  }

  /* Run a catalog call; a failure that only affects this one group returns nothing. */
  function soft(promise) {
    return promise.catch(function (e) { if (isFatal(e)) throw e; return []; });
  }

  /* Songs for some tags. Each refresh starts a little further down the
     catalog's list for variety; if that leaves too few, start from the top. */
  function byTagsVaried(tags, turn) {
    var offset = (turn % 3) * 20;
    return soft(GF.catalog.byTags(tags, { limit: 50, offset: offset })).then(function (list) {
      if (offset && list.length < 10) return soft(GF.catalog.byTags(tags, { limit: 50, offset: 0 }));
      return list;
    });
  }

  /* ---- The groups a selection can contain ---- */
  function artistPlan(a) {
    return {
      key: 'artist:' + a.id,
      run: function (ctx) {
        var C = GF.catalog;
        var similar = a.best ? soft(C.similarTo(a.best, { limit: 30, noArtist: a.id })) : Promise.resolve([]);
        return similar.then(function (list) {
          var picked = ctx.pick(list, false);
          if (picked.length >= MIN_GROUP) return { tracks: picked, reason: 'Because you play ' + a.name };
          return soft(C.byArtistId(a.id, { limit: 30 })).then(function (more) {
            return { tracks: ctx.pick(more, true), reason: 'More from ' + a.name };
          });
        });
      }
    };
  }

  function tagPlan(entries, turn) {
    var names = entries.map(function (e) { return e.tag; });
    var score = 0, savedPart = 0;
    entries.forEach(function (e) { score += e.score; savedPart += e.saved; });
    var verb = savedPart > score / 2 ? 'save' : 'play';
    return {
      key: 'tags:' + names.join('+'),
      run: function (ctx) {
        return byTagsVaried(names, turn).then(function (list) {
          return { tracks: ctx.pick(list, false), reason: 'Because you ' + verb + ' ' + U.listWords(names.map(tagLabel)) };
        });
      }
    };
  }

  function alsoPlan(entry, turn) {
    return {
      key: 'also:' + entry.tag,
      run: function (ctx) {
        return byTagsVaried([entry.tag], turn).then(function (list) {
          return { tracks: ctx.pick(list, false), reason: 'Because you also play ' + tagLabel(entry.tag) };
        });
      }
    };
  }

  function genreSeedPlan(tag, turn) {
    return {
      key: 'genre:' + tag,
      missing: 'Jamendo returned nothing for ' + tagLabel(tag) + '.',
      run: function (ctx) {
        return byTagsVaried([tag], turn).then(function (list) {
          return { tracks: ctx.pick(list, false), reason: 'Because you chose ' + tagLabel(tag) };
        });
      }
    };
  }

  /* A named favorite artist. Tried in this order, remembering what worked:
     1. the artist is on Jamendo             -> their own songs
     2. Jamendo's outside-artist similarity  -> "Similar to X, according to Jamendo"
     3. a stand-in genre (three names only)  -> "Pop and dance, standing in for X"   */
  function artistSeedPlan(name, turn) {
    var keyName = name.toLowerCase();
    var standIn = STAND_INS[keyName];
    var known = seeds.resolved[keyName];
    var order = ['jamendo', 'outside', 'standin'];
    if (known && order.indexOf(known.kind) !== -1) {
      order = [known.kind].concat(order.filter(function (k) { return k !== known.kind; }));
    }

    function attempt(kind, ctx) {
      var C = GF.catalog;
      if (kind === 'jamendo') {
        return soft(C.byArtistName(name, { limit: 20 })).then(function (list) {
          return { tracks: ctx.pick(list, true), reason: 'Because you chose ' + name };
        });
      }
      if (kind === 'outside') {
        return soft(C.likeOutsideArtist(name, { limit: 40 })).then(function (list) {
          return { tracks: ctx.pick(list, false), reason: 'Similar to ' + name + ', according to Jamendo' };
        });
      }
      if (!standIn) return Promise.resolve({ tracks: [] });
      return byTagsVaried(standIn.tags, turn).then(function (list) {
        return { tracks: ctx.pick(list, false), reason: standIn.label + ', standing in for ' + name };
      });
    }

    return {
      key: 'seed:' + keyName,
      missing: 'Jamendo has nothing that matches ' + name + '. Try adding a genre instead.',
      run: function (ctx) {
        var i = 0;
        function next() {
          if (i >= order.length) return Promise.resolve({ tracks: [] });
          var kind = order[i++];
          return attempt(kind, ctx).then(function (found) {
            if (found.tracks.length >= MIN_GROUP) {
              seeds.resolved[keyName] = { kind: kind, at: Date.now() };
              S.set('seeds', seeds);
              return found;
            }
            return next();
          });
        }
        return next();
      }
    };
  }

  function popularPlan() {
    return {
      key: 'popular',
      onlyIfEmpty: true,
      run: function (ctx) {
        return soft(GF.catalog.popular({ limit: 40 })).then(function (list) {
          return { tracks: ctx.pick(list, false), reason: 'Popular on Jamendo this month' };
        });
      }
    };
  }

  function rotate(list, by) {
    if (!list.length) return list;
    var n = by % list.length;
    return list.slice(n).concat(list.slice(0, n));
  }

  function makePlans(p, turn) {
    var strong = p.artists.filter(function (a) { return a.score >= ARTIST_MIN; });
    var genres = p.tags.filter(function (t) { return t.kind === 'genre' && t.score >= TAG_MIN; });

    var fromSeeds = rotate(
      seeds.artists.map(function (n) { return artistSeedPlan(n, turn); })
        .concat(seeds.genres.map(function (g) { return genreSeedPlan(g, turn); })),
      turn
    );
    var wider = genres[2] ? [alsoPlan(genres[2], turn)] : [];
    var third = turn % 2 ? wider.concat(fromSeeds) : fromSeeds.concat(wider);

    var plans = [];
    if (strong[0]) plans.push(artistPlan(strong[0]));
    if (genres.length) plans.push(tagPlan(genres.slice(0, 2), turn));
    plans = plans.concat(third);
    if (strong[1]) plans.push(artistPlan(strong[1]));
    plans.push(popularPlan());
    return plans;
  }

  /* ---- Build a selection ---- */
  function build(opts) {
    opts = opts || {};
    if (opts.fresh) { seeds.turn += 1; S.set('seeds', seeds); }
    var turn = seeds.turn;
    var p = profile();
    var used = {};
    var groups = [], notes = [];
    var ctx = { pick: function (list, sameArtistOk) { return pick(list || [], p, used, sameArtistOk); } };
    var plans = makePlans(p, turn);
    var i = 0;

    function step() {
      if (i >= plans.length || groups.length >= MAX_GROUPS) return Promise.resolve();
      var plan = plans[i++];
      if (plan.onlyIfEmpty && groups.length) return step();
      return plan.run(ctx).then(function (found) {
        if (found && found.tracks && found.tracks.length >= MIN_GROUP) {
          found.tracks.forEach(function (t) { used[t.id] = true; });
          groups.push({ key: plan.key, reason: found.reason, tracks: found.tracks });
        } else if (plan.missing) {
          notes.push(plan.missing);
        }
        return step();
      });
    }

    return step().then(function () {
      var result = { builtAt: Date.now(), seedsRev: seeds.rev, groups: groups, notes: notes };
      S.set('recs', result);
      bus.emit('built', result);
      return result;
    });
  }

  function cached() {
    var r = S.get('recs', null);
    return r && Array.isArray(r.groups) ? r : null;
  }

  /* Has enough changed since the last selection to justify a new one? */
  function isStale(rec) {
    if (!rec) return true;
    if (Date.now() - rec.builtAt > DAY) return true;
    if (rec.seedsRev !== seeds.rev) return true;
    var listens = 0, adds = 0;
    signals.forEach(function (s) {
      if (s.t <= rec.builtAt) return;
      if (s.k === 'add') adds++;
      else if (s.k === 'listen') listens++;
    });
    return adds >= 1 || listens >= 3;
  }

  /* ---- Favorites named by the listener ---- */
  function getSeeds() {
    return { artists: seeds.artists.slice(), genres: seeds.genres.slice(), done: seeds.done };
  }

  function setSeeds(next) {
    var seen = {};
    seeds.artists = arr(next.artists).map(function (n) { return String(n).replace(/\s+/g, ' ').trim().slice(0, 60); })
      .filter(function (n) {
        var k = n.toLowerCase();
        if (!n || seen[k]) return false;
        seen[k] = true;
        return true;
      }).slice(0, 8);
    seeds.genres = arr(next.genres).filter(function (g) { return GENRE_CHOICES.indexOf(g) !== -1; }).slice(0, 8);
    seeds.done = true;
    seeds.rev += 1;
    S.set('seeds', seeds);
    bus.emit('seeds', getSeeds());
  }

  function hasBasis() {
    return seeds.artists.length > 0 || seeds.genres.length > 0 || signals.length > 0;
  }

  function clear() {
    signals = [];
    meta = {};
    seeds = normalSeeds(null);
    S.set('signals', signals);
    S.set('meta', meta);
    S.set('seeds', seeds);
    S.remove('recs');
    bus.emit('cleared');
  }

  /* Bring listening notes and favorites in from a backup file */
  function merge(data) {
    var seen = {};
    signals.forEach(function (s) { seen[s.t + '|' + s.id + '|' + s.k] = true; });
    arr(data.signals).forEach(function (s) {
      if (!s || !s.id || !s.k || !s.t) return;
      var key = s.t + '|' + s.id + '|' + s.k;
      if (seen[key]) return;
      seen[key] = true;
      signals.push({ t: Number(s.t), id: String(s.id), k: String(s.k) });
    });
    signals.sort(function (a, b) { return a.t - b.t; });
    if (signals.length > MAX_SIGNALS) signals = signals.slice(signals.length - MAX_SIGNALS);
    var incomingMeta = obj(data.meta);
    Object.keys(incomingMeta).forEach(function (k) { if (!meta[k]) meta[k] = incomingMeta[k]; });
    var inSeeds = normalSeeds(data.seeds);
    if (inSeeds.artists.length || inSeeds.genres.length) {
      setSeeds({
        artists: seeds.artists.concat(inSeeds.artists),
        genres: seeds.genres.concat(inSeeds.genres.filter(function (g) { return seeds.genres.indexOf(g) === -1; }))
      });
    }
    S.set('signals', signals);
    S.set('meta', meta);
  }

  GF.taste = {
    record: record,
    build: build,
    cached: cached,
    isStale: isStale,
    seeds: getSeeds,
    setSeeds: setSeeds,
    hasBasis: hasBasis,
    hasHistory: function () { return signals.length > 0; },
    clear: clear,
    merge: merge,
    tagLabel: tagLabel,
    capital: capital,
    /* genre tags that stand in for a named artist when Jamendo has no match */
    standInTags: function (name) {
      var s = STAND_INS[String(name).toLowerCase()];
      return s ? s.tags.slice() : [];
    },
    isFatal: isFatal,
    GENRE_CHOICES: GENRE_CHOICES,
    SUGGESTED_ARTISTS: SUGGESTED_ARTISTS,
    on: bus.on
  };
})(window.GF);
