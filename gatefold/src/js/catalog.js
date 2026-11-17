/* Gatefold: the music catalog (Jamendo API v3.0).
   This is the only file that talks to Jamendo. It finds songs and returns
   them in one plain shape the rest of the app uses.

   Documentation: https://developer.jamendo.com/v3.0/docs
   - Every call needs a client_id (the "key").
   - /tracks searches by free text, tags, artist, id; `audio` is the stream address.
   - /tracks/similar finds tracks like a given track.
   - Replies carry headers.status / headers.code (5 = key not valid, 6 = rate limited).
   - A JSONP `callback` parameter is documented; it is used only if the
     browser refuses a normal request. */
(function (GF) {
  'use strict';

  var U = GF.util;
  var JAMENDO_API = 'https://api.jamendo.com/v3.0';
  var TEST_KEY = '709fa152';      // published by Jamendo "ONLY for TESTING the read api"
  var TIMEOUT_MS = 12000;
  var IMAGE_SIZES = [100, 200, 300, 400, 500, 600];

  var apiBase = JAMENDO_API;
  var clientId = '';
  var preferJsonp = false;
  var jsonpCount = 0;

  function configure(opts) {
    if (Object.prototype.hasOwnProperty.call(opts, 'clientId')) clientId = String(opts.clientId || '').trim();
    if (opts.apiBase) apiBase = String(opts.apiBase).replace(/\/+$/, '');
  }

  function fail(kind, message, extra) {
    var e = new Error(message);
    e.kind = kind;
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  function buildUrl(path, params) {
    var qs = new URLSearchParams();
    qs.set('client_id', clientId);
    qs.set('format', 'json');
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v == null || v === '') return;
      // Jamendo separates several values with "+", which is how a space is encoded
      qs.set(k, Array.isArray(v) ? v.join(' ') : String(v));
    });
    return apiBase + path + '/?' + qs.toString();
  }

  function viaFetch(url) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
    return fetch(url, { signal: ctl.signal, credentials: 'omit' })
      .then(function (res) {
        return res.json().then(
          function (body) { return { res: res, body: body }; },
          function () { return { res: res, body: null }; }
        );
      })
      .then(function (out) {
        clearTimeout(timer);
        if (out.body && out.body.headers) return out.body;
        throw fail('api', 'Jamendo sent a reply the app could not read (HTTP ' + out.res.status + ').');
      }, function (e) {
        clearTimeout(timer);
        if (e && e.kind) throw e;
        if (e && e.name === 'AbortError') throw fail('timeout', 'Jamendo took too long to answer.');
        throw fail('blocked', 'The request did not go through.');
      });
  }

  function viaJsonp(url) {
    return new Promise(function (resolve, reject) {
      var name = '__gatefoldJsonp' + (++jsonpCount);
      var script = document.createElement('script');
      var settled = false;
      function done(fn, arg) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window[name] = function () {};     // a late reply must not throw
        if (script.parentNode) script.parentNode.removeChild(script);
        fn(arg);
      }
      var timer = setTimeout(function () {
        done(reject, fail('timeout', 'Jamendo took too long to answer.'));
      }, TIMEOUT_MS);
      window[name] = function (body) { done(resolve, body); };
      script.onerror = function () { done(reject, fail('network', "Couldn't reach Jamendo.")); };
      script.async = true;
      script.src = url + '&callback=' + name;
      document.head.appendChild(script);
    });
  }

  function unwrap(body) {
    var hd = body && body.headers;
    if (!hd) throw fail('api', 'Jamendo sent a reply the app could not read.');
    var code = Number(hd.code);
    if (hd.status !== 'success' || code !== 0) {
      if (code === 5) throw fail('key', "Jamendo didn't recognize this key.", { code: code });
      if (code === 11) throw fail('key', 'Jamendo has suspended this key.', { code: code });
      if (code === 6) throw fail('rate', 'Jamendo is limiting requests right now. Try again in a minute.', { code: code });
      var detail = U.decode(hd.error_message || '').slice(0, 160);
      throw fail('api', 'Jamendo reported a problem' + (detail ? ': ' + detail : '.'), { code: code });
    }
    return Array.isArray(body.results) ? body.results : [];
  }

  function request(path, params) {
    if (!clientId) return Promise.reject(fail('nokey', 'Add your Jamendo key to continue.'));
    if (navigator.onLine === false) return Promise.reject(fail('offline', "You're offline."));
    var url = buildUrl(path, params);
    var attempt = preferJsonp ? viaJsonp(url) : viaFetch(url).catch(function (e) {
      if (e.kind !== 'blocked') throw e;
      if (navigator.onLine === false) throw fail('offline', "You're offline.");
      // The browser refused a normal request (usually a cross-site rule).
      // Jamendo documents JSONP for exactly this case.
      return viaJsonp(url).then(function (body) { preferJsonp = true; return body; });
    });
    return attempt.then(unwrap);
  }

  /* ---- One song, in the shape the rest of the app uses ---- */
  function cleanTags(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (t) { return String(t || '').toLowerCase().trim(); }).filter(Boolean).slice(0, 12);
  }

  /* Jamendo's own addresses are always available over https. Asking for the
     secure form avoids browsers blocking pictures or audio on a secure page. */
  function secure(u) {
    u = U.safeUrl(u);
    return /^http:\/\/([\w-]+\.)*jamendo\.com(\/|\?|$)/i.test(u) ? u.replace(/^http:/i, 'https:') : u;
  }

  function toTrack(r) {
    if (!r || r.id == null) return null;
    var info = r.musicinfo || {};
    var tags = info.tags || {};
    var id = String(r.id);
    return {
      id: id,
      title: U.decode(r.name || r.track_name || 'Untitled'),
      artist: U.decode(r.artist_name || 'Unknown artist'),
      artistId: r.artist_id != null ? String(r.artist_id) : '',
      album: U.decode(r.album_name || ''),
      albumId: r.album_id != null && r.album_id !== '' ? String(r.album_id) : '',
      duration: Math.max(0, Math.round(Number(r.duration) || 0)),
      art: secure(r.album_image) || secure(r.image),
      audio: secure(r.audio),
      url: secure(r.shareurl) || secure(r.shorturl) || 'https://www.jamendo.com/track/' + encodeURIComponent(id),
      genres: cleanTags(tags.genres),
      moods: cleanTags(tags.vartags),
      instruments: cleanTags(tags.instruments),
      speed: String(info.speed || ''),
      vocal: String(info.vocalinstrumental || '')
    };
  }

  var TRACK_FIELDS = { include: 'musicinfo', audioformat: 'mp32', imagesize: 300 };

  function tracks(path, params) {
    var merged = {};
    Object.keys(TRACK_FIELDS).forEach(function (k) { merged[k] = TRACK_FIELDS[k]; });
    Object.keys(params).forEach(function (k) { merged[k] = params[k]; });
    return request(path, merged).then(function (rows) {
      return rows.map(toTrack).filter(Boolean);
    });
  }

  /* Free-text search across song, artist and album names (and tags). */
  function search(query, opts) {
    opts = opts || {};
    return tracks('/tracks', { search: query, limit: opts.limit || 30, offset: opts.offset || 0 });
  }

  function byIds(ids) {
    if (!ids.length) return Promise.resolve([]);
    return tracks('/tracks', { id: ids, limit: Math.min(200, ids.length) });
  }

  function byArtistId(artistId, opts) {
    opts = opts || {};
    return tracks('/tracks', { artist_id: artistId, limit: opts.limit || 30, order: 'popularity_total' });
  }

  function byArtistName(name, opts) {
    opts = opts || {};
    return tracks('/tracks', { artist_name: name, limit: opts.limit || 20, order: 'popularity_total' });
  }

  /* any = true: songs with any of the tags (best matches first); otherwise all of them */
  function byTags(tags, opts) {
    opts = opts || {};
    var p = { limit: opts.limit || 40, offset: opts.offset || 0, boost: 'popularity_month' };
    p[opts.any === false ? 'tags' : 'fuzzytags'] = tags;
    return tracks('/tracks', p);
  }

  /* Jamendo's lookup for tracks most similar to an artist who is not on Jamendo. */
  function likeOutsideArtist(name, opts) {
    opts = opts || {};
    return tracks('/tracks', { xartist: name, limit: opts.limit || 30 });
  }

  function similarTo(trackId, opts) {
    opts = opts || {};
    return tracks('/tracks/similar', { id: trackId, limit: opts.limit || 30, no_artist: opts.noArtist || undefined });
  }

  function popular(opts) {
    opts = opts || {};
    return tracks('/tracks', { order: 'popularity_month', limit: opts.limit || 30, offset: opts.offset || 0 });
  }

  /* Smallest possible call, used to check a key. */
  function ping() {
    return request('/tracks', { limit: 1 }).then(function () { return true; });
  }

  /* Ask Jamendo's image server for a size that suits where the cover is shown. */
  function artAt(url, px) {
    if (!url) return '';
    var want = px * Math.min(2, window.devicePixelRatio || 1);
    var size = IMAGE_SIZES[IMAGE_SIZES.length - 1];
    for (var i = 0; i < IMAGE_SIZES.length; i++) {
      if (IMAGE_SIZES[i] >= want) { size = IMAGE_SIZES[i]; break; }
    }
    return /([?&]width=)\d+/.test(url) ? url.replace(/([?&]width=)\d+/, '$1' + size) : url;
  }

  GF.catalog = {
    name: 'Jamendo',
    home: 'https://www.jamendo.com',
    signup: 'https://devportal.jamendo.com',
    TEST_KEY: TEST_KEY,
    configure: configure,
    hasKey: function () { return !!clientId; },
    key: function () { return clientId; },
    isTestKey: function () { return clientId === TEST_KEY; },
    isLive: function () { return apiBase === JAMENDO_API; },
    route: function () { return preferJsonp ? 'fallback (JSONP)' : 'direct'; },
    search: search,
    byIds: byIds,
    byArtistId: byArtistId,
    byArtistName: byArtistName,
    byTags: byTags,
    likeOutsideArtist: likeOutsideArtist,
    similarTo: similarTo,
    popular: popular,
    ping: ping,
    artAt: artAt
  };
})(window.GF);
