/* DEVELOPMENT ONLY. A stand-in for the Jamendo API, used to test Gatefold on a
   computer that cannot reach Jamendo. It is not part of the app and is never
   shipped inside index.html.

   Every artist, album and song here is invented. The audio is generated test
   tones. The reply format follows Jamendo's documentation
   (https://developer.jamendo.com/v3.0/tracks) so the app's real catalog code
   runs unchanged against it.

   Run:   node dev/mock-jamendo.js            short test tones (6 to 20 seconds)
          LONG=1 node dev/mock-jamendo.js     song-length tones, for screenshots
          NO_CORS=1 node dev/mock-jamendo.js  forces the app's JSONP fallback
   Open:  src/index.html?api=http://127.0.0.1:8787/v3.0   (key: devkey01) */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8787;
const LONG = process.env.LONG === '1';
const NO_CORS = process.env.NO_CORS === '1';
const HOST = `http://127.0.0.1:${PORT}`;
const AUDIO_DIR = path.join(__dirname, 'audio', LONG ? 'long' : 'short');
const VALID_KEYS = ['devkey01', '709fa152'];

/* ---- a small invented catalog ---- */
let seed = 20261114;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (list) => list[Math.floor(rnd() * list.length)];

const audioFiles = fs.existsSync(AUDIO_DIR)
  ? fs.readdirSync(AUDIO_DIR).filter((f) => /^a\d+_\d+\.mp3$/.test(f)).sort()
  : [];
if (!audioFiles.length) {
  console.error('No test audio found. Run: bash dev/make-audio.sh');
  process.exit(1);
}
const audioFor = (i) => {
  const file = audioFiles[i % audioFiles.length];
  return { file, seconds: Number(/_(\d+)\.mp3$/.exec(file)[1]) };
};

const ARTISTS = [
  ['Marlow Finch', ['pop', 'singersongwriter'], ['happy', 'melodic'], ['guitar', 'piano'], 'vocal'],
  ['June Calloway', ['pop', 'dance'], ['energetic', 'summer'], ['synthesizer', 'drums'], 'vocal'],
  ['Velvet Arcade', ['pop', 'electronic'], ['dreamy', 'melodic'], ['synthesizer'], 'vocal'],
  ['Odessa Vane', ['rnb', 'soul'], ['romantic', 'groovy'], ['bass', 'keyboard'], 'vocal'],
  ['Kito Reyes', ['hiphop', 'rnb'], ['cool', 'night'], ['drummachine', 'bass'], 'vocal'],
  ['Northside Lowe', ['hiphop'], ['dark', 'energetic'], ['drummachine', 'synthesizer'], 'vocal'],
  ['Saffron Dusk', ['rnb', 'pop'], ['sexy', 'dreamy'], ['keyboard', 'bass'], 'vocal'],
  ['The Paper Lanterns', ['indie', 'rock'], ['melancholic', 'melodic'], ['guitar', 'drums'], 'vocal'],
  ['Halden Row', ['indie', 'folk'], ['calm', 'nature'], ['acousticguitar', 'violin'], 'vocal'],
  ['Wren & Tallow', ['folk', 'singersongwriter'], ['soft', 'emotional'], ['acousticguitar'], 'vocal'],
  ['Lumen District', ['electronic', 'house'], ['energetic', 'party'], ['synthesizer', 'drummachine'], 'instrumental'],
  ['Glasshouse Tide', ['electronic', 'ambient'], ['relaxing', 'space'], ['synthesizer'], 'instrumental'],
  ['Mira Solenne', ['dance', 'pop'], ['happy', 'party'], ['synthesizer', 'drums'], 'vocal'],
  ['Cobalt Hours', ['house', 'dance'], ['groovy', 'night'], ['drummachine', 'bass'], 'instrumental'],
  ['Arlo Penhallow', ['singersongwriter', 'country'], ['emotional', 'travel'], ['acousticguitar', 'harmonica'], 'vocal'],
  ['Brass Meridian', ['jazz', 'funk'], ['groovy', 'cool'], ['saxophone', 'trumpet'], 'instrumental'],
  ['Quiet Cartographers', ['ambient', 'soundtrack'], ['calm', 'film'], ['piano', 'strings'], 'instrumental'],
  ['Ines Okafor', ['soul', 'jazz'], ['romantic', 'soft'], ['piano', 'bass'], 'vocal'],
  ['Static Orchard', ['rock', 'indie'], ['energetic', 'dark'], ['electricguitar', 'drums'], 'vocal'],
  ['Deep Ferry', ['latin', 'pop'], ['summer', 'happy'], ['guitar', 'percussion'], 'vocal'],
  ['Tamsin Vale', ['pop', 'singersongwriter'], ['emotional', 'melodic'], ['piano'], 'vocal'],
  ['Low Sun Collective', ['reggae', 'funk'], ['relaxing', 'summer'], ['bass', 'guitar'], 'vocal'],
  ['Petra Halloran', ['classical', 'soundtrack'], ['calm', 'emotional'], ['piano', 'cello'], 'instrumental'],
  ['Hexwood', ['metal', 'rock'], ['dark', 'energetic'], ['electricguitar', 'drums'], 'vocal']
];

const WORDS_A = ['Paper', 'Quiet', 'Golden', 'Midnight', 'Slow', 'Borrowed', 'Electric', 'Open', 'Northern', 'Velvet',
  'Second', 'Faded', 'Summer', 'Hollow', 'Neon', 'Distant', 'Tender', 'Wild', 'Silver', 'Late'];
const WORDS_B = ['Rooms', 'Harbor', 'Signals', 'Weather', 'Avenue', 'Gardens', 'Letters', 'Motion', 'Hours', 'Static',
  'Postcards', 'Engines', 'Rivers', 'Fever', 'Daylight', 'Mirrors', 'Orbit', 'Tides', 'Company', 'Maps'];
const ALBUM_WORDS = ['Notes for a Small Hour', 'The Long Way Round', 'Blue Hour', 'Hometown Radio', 'Everything in Colour',
  'Soft Machines', 'Field Recordings', 'After the Parade', 'Good Weather', 'Night Shift', 'Second Summer', 'Arrivals'];

const tracks = [];
let trackId = 1000;
let albumId = 300;
ARTISTS.forEach((a, ai) => {
  const artistId = String(40 + ai);
  const albums = 1 + Math.floor(rnd() * 2);
  for (let al = 0; al < albums; al++) {
    const album = { id: String(albumId++), name: pick(ALBUM_WORDS) + (al ? ' II' : ''), year: 2015 + Math.floor(rnd() * 10) };
    const count = 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < count; i++) {
      const au = audioFor(trackId);
      tracks.push({
        id: String(trackId++), name: pick(WORDS_A) + ' ' + pick(WORDS_B), artistId, artist: a[0],
        albumId: album.id, album: album.name, position: i + 1, date: `${album.year}-0${1 + (i % 9)}-1${i}`,
        genres: a[1], moods: a[2], instruments: a[3], vocal: a[4], speed: pick(['low', 'medium', 'high']),
        audio: `${HOST}/audio/${au.file}`, seconds: au.seconds, pop: Math.floor(rnd() * 1000), art: true
      });
    }
  }
});

/* ---- deliberate awkward cases (search "edge" to see them all) ---- */
const edgeBase = { artistId: '900', albumId: '990', position: 1, date: '2020-02-02', genres: ['pop'], moods: ['melodic'], instruments: ['piano'], vocal: 'vocal', speed: 'medium', pop: 5, art: true };
const au0 = audioFor(0);
[
  { name: 'Edge: The Longest Night of the Year Spent Driving Home Through the Valley With the Windows Down (Extended Ambient Reprise, Remastered)', artist: 'The Extraordinarily Long-Named Travelling Orchestra of the Northern Territories', album: 'An Album Whose Name Also Refuses to Fit on a Single Line of Any Reasonable Screen' },
  { name: 'Edge: Rock &amp; Roll &#039;Til Dawn', artist: 'Smith &amp; Sons', album: 'Entities &lt;Encoded&gt;' },
  { name: 'Edge: A Single With No Album', artist: 'Edge Case Ensemble', album: '', albumId: '' },
  { name: 'Edge: No Artwork At All', artist: 'Edge Case Ensemble', album: 'Blank Sleeve', art: false },
  { name: 'Edge: Artwork Address Is Broken', artist: 'Edge Case Ensemble', album: 'Missing Picture', art: 'broken' },
  { name: 'Edge: Not Available To Stream', artist: 'Edge Case Ensemble', album: 'Withdrawn', audio: '' },
  { name: 'Edge: Stream Address Is Broken', artist: 'Edge Case Ensemble', album: 'Dead Link', audio: `${HOST}/audio/missing.mp3` },
  { name: 'Edge: Another Broken Stream', artist: 'Edge Case Ensemble', album: 'Dead Link', audio: `${HOST}/audio/missing-too.mp3` },
  { name: 'Edge: Stream Shorter Than Listed', artist: 'Edge Case Ensemble', album: 'Preview Only', seconds: 240 },
  { name: 'Edge: Été à Kraków — Ночь', artist: 'Zoë Łukasz', album: 'Ünïcödé' }
].forEach((e) => {
  tracks.push(Object.assign({}, edgeBase, { id: String(trackId++), audio: `${HOST}/audio/${au0.file}`, seconds: au0.seconds }, e));
});

/* Jamendo's "similar to an outside artist" lookup: answer for one name only,
   so both the direct path and the stand-in path of the app get exercised. */
const OUTSIDE = { 'taylor swift': ['pop', 'singersongwriter'] };

function toResult(t, width) {
  const img = t.art === true ? `${HOST}/art?type=album&id=${t.albumId || 't' + t.id}&width=${width}&trackid=${t.id}`
    : t.art === 'broken' ? `${HOST}/art-missing?width=${width}` : '';
  return {
    id: t.id, name: t.name, duration: t.seconds, artist_id: t.artistId, artist_name: t.artist,
    artist_idstr: t.artist.toLowerCase().replace(/\W+/g, '_'), album_name: t.album, album_id: t.albumId,
    license_ccurl: 'http://creativecommons.org/licenses/by-nc-sa/3.0/', position: t.position, releasedate: t.date,
    album_image: t.albumId ? img : '', audio: t.audio, audiodownload: '', prourl: '',
    shorturl: `https://jamen.do/t/${t.id}`, shareurl: `https://www.jamendo.com/track/${t.id}`,
    image: img, audiodownload_allowed: false,
    musicinfo: {
      vocalinstrumental: t.vocal, lang: 'en', gender: '', acousticelectric: '', speed: t.speed,
      tags: { genres: t.genres, instruments: t.instruments, vartags: t.moods }
    }
  };
}

const list = (v) => String(v || '').split(/[\s+]+/).filter(Boolean);
const tagsOf = (t) => t.genres.concat(t.moods, t.instruments);

function query(q, similar) {
  let rows = tracks.slice();
  if (similar) {
    const src = tracks.find((t) => t.id === String(q.id));
    if (!src) return [];
    const mine = tagsOf(src);
    rows = rows.filter((t) => t.id !== src.id && t.artistId !== String(q.no_artist || ''))
      .map((t) => ({ t, s: tagsOf(t).filter((x) => mine.includes(x)).length }))
      .filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.t.pop - a.t.pop).map((x) => x.t);
  } else {
    if (q.id) { const ids = list(q.id); rows = rows.filter((t) => ids.includes(t.id)); }
    if (q.artist_id) rows = rows.filter((t) => t.artistId === String(q.artist_id));
    if (q.artist_name) rows = rows.filter((t) => t.artist.toLowerCase() === String(q.artist_name).toLowerCase());
    if (q.tags) { const want = list(q.tags); rows = rows.filter((t) => want.every((x) => tagsOf(t).includes(x))); }
    if (q.fuzzytags) {
      const want = list(q.fuzzytags);
      rows = rows.map((t) => ({ t, s: want.filter((x) => tagsOf(t).includes(x)).length }))
        .filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.t.pop - a.t.pop).map((x) => x.t);
    }
    if (q.xartist) {
      const want = OUTSIDE[String(q.xartist).toLowerCase()];
      rows = want ? rows.filter((t) => want.some((x) => t.genres.includes(x))).sort((a, b) => b.pop - a.pop) : [];
    }
    if (q.search) {
      const words = String(q.search).toLowerCase().split(/\s+/).filter(Boolean);
      rows = rows.filter((t) => {
        const hay = (t.name + ' ' + t.artist + ' ' + t.album + ' ' + tagsOf(t).join(' ')).toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }
    if (/^popularity/.test(q.order || '')) rows.sort((a, b) => b.pop - a.pop);
  }
  const offset = Math.max(0, Number(q.offset) || 0);
  const limit = Math.min(200, Math.max(1, Number(q.limit) || 10));
  return rows.slice(offset, offset + limit);
}

/* ---- generated cover art ---- */
const PALETTES = [
  ['#1F3A5F', '#F2B134', '#E9E4D4'], ['#B5462E', '#F3D9B1', '#2E2A27'], ['#2F6F5E', '#E8C8A0', '#143029'],
  ['#6A4C93', '#F7B2AD', '#221B33'], ['#D9A441', '#27455C', '#F5EFE0'], ['#3C6E9E', '#F26B5B', '#F4EDE1'],
  ['#8C2F39', '#E9D8A6', '#1B1B1E'], ['#4F7942', '#F0E3C4', '#22331C'], ['#E07A5F', '#3D405B', '#F4F1DE'],
  ['#264653', '#E9C46A', '#E76F51'], ['#5B3A29', '#D8B48F', '#F3E9DC'], ['#335C67', '#FFF3B0', '#9E2A2B']
];
function cover(id) {
  let n = 0;
  for (const ch of String(id)) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b, c] = PALETTES[n % PALETTES.length];
  const kind = n % 4;
  const shapes = [
    `<circle cx="150" cy="150" r="96" fill="${b}"/><circle cx="150" cy="150" r="34" fill="${a}"/>`,
    `<rect x="0" y="170" width="300" height="130" fill="${b}"/><circle cx="210" cy="120" r="56" fill="${c}"/>`,
    `<path d="M0 300L300 0v300z" fill="${b}"/><rect x="40" y="40" width="80" height="80" fill="${c}"/>`,
    `<rect x="50" y="50" width="200" height="200" fill="none" stroke="${b}" stroke-width="22"/><rect x="110" y="110" width="80" height="80" fill="${c}"/>`
  ][kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><rect width="300" height="300" fill="${a}"/>${shapes}</svg>`;
}

/* ---- server ---- */
function sendJson(res, q, status, body) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!NO_CORS) headers['Access-Control-Allow-Origin'] = '*';
  if (q.callback && /^[\w.$]+$/.test(q.callback)) {
    headers['Content-Type'] = 'application/javascript; charset=utf-8';
    res.writeHead(200, headers);
    res.end(`${q.callback}(${JSON.stringify(body)});`);
    return;
  }
  headers['Content-Type'] = 'application/json; charset=utf-8';
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

const reply = (results) => ({ headers: { status: 'success', code: 0, error_message: '', warnings: '', results_count: results.length }, results });
const problem = (code, message) => ({ headers: { status: 'failed', code, error_message: message, warnings: '', results_count: 0 }, results: [] });

function serveAudio(req, res, file) {
  const full = path.join(AUDIO_DIR, path.basename(file));
  if (!fs.existsSync(full)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
  const size = fs.statSync(full).size;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  const base = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    res.writeHead(206, Object.assign(base, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 }));
    fs.createReadStream(full, { start, end }).pipe(res);
  } else {
    res.writeHead(200, Object.assign(base, { 'Content-Length': size }));
    fs.createReadStream(full).pipe(res);
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, HOST);
  const q = Object.fromEntries(url.searchParams.entries());
  const p = url.pathname.replace(/\/+$/, '');

  if (p.startsWith('/audio/')) return serveAudio(req, res, p.slice(7));
  if (p === '/art') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' });
    return res.end(cover(q.id));
  }
  if (p === '/v3.0/tracks' || p === '/v3.0/tracks/similar') {
    const wait = q.search === '__slow' ? 2500 : 140;
    return setTimeout(() => {
      if (!VALID_KEYS.includes(q.client_id)) return sendJson(res, q, 200, problem(5, 'Invalid Client Id: the client id received does not exist'));
      if (q.search === '__fail') return sendJson(res, q, 500, problem(1, 'Exception: deliberate test failure'));
      if (q.search === '__rate') return sendJson(res, q, 200, problem(6, 'Rate Limit Exceeded'));
      if (q.search === '__html') { res.writeHead(502, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' }); return res.end('<h1>Bad gateway</h1>'); }
      const width = Number(q.imagesize) || 200;
      sendJson(res, q, 200, reply(query(q, p.endsWith('/similar')).map((t) => toResult(t, width))));
    }, wait);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Stand-in Jamendo API on ${HOST}/v3.0  (${tracks.length} invented songs, ${LONG ? 'long' : 'short'} tones${NO_CORS ? ', CORS off' : ''})`);
});
