/* Gatefold: small shared helpers. No app logic lives here. */
(function (GF) {
  'use strict';

  /* Build a DOM element. Text always goes in as text nodes, never as HTML,
     so names coming from the catalog cannot inject markup. */
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(el, child) {
    if (child == null || child === false || child === true) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(el, c); }); return; }
    el.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  function emitter() {
    var map = {};
    function on(evt, fn) {
      (map[evt] = map[evt] || []).push(fn);
      return function () { off(evt, fn); };
    }
    function off(evt, fn) {
      var list = map[evt];
      if (!list) return;
      var i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    }
    function emit(evt, arg) {
      (map[evt] || []).slice().forEach(function (fn) {
        try { fn(arg); } catch (err) { console.error('[gatefold] listener failed', err); }
      });
    }
    return { on: on, off: off, emit: emit };
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function range(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(i);
    return out;
  }

  /* Fisher-Yates on a copy */
  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function debounce(fn, ms) {
    var timer = null;
    function run() {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { timer = null; fn.apply(self, args); }, ms);
    }
    run.cancel = function () { clearTimeout(timer); timer = null; };
    return run;
  }

  function throttle(fn, ms) {
    var last = 0, timer = null;
    return function () {
      var now = Date.now(), wait = ms - (now - last);
      if (wait <= 0) { last = now; fn(); return; }
      if (!timer) timer = setTimeout(function () { timer = null; last = Date.now(); fn(); }, wait);
    };
  }

  /* 3:48, 1:02:07 */
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    var hrs = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var ss = (s < 10 ? '0' : '') + s;
    if (hrs) return hrs + ':' + (m < 10 ? '0' : '') + m + ':' + ss;
    return m + ':' + ss;
  }

  /* 1 hr 32 min, 45 min */
  function fmtTotal(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    if (!sec) return '';
    var hrs = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    if (m === 60) { hrs += 1; m = 0; }
    if (hrs && m) return hrs + ' hr ' + m + ' min';
    if (hrs) return hrs + ' hr';
    if (m) return m + ' min';
    return sec + ' sec';
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* Jamendo sometimes returns names with HTML entities (&amp;, &#039;).
     A detached textarea decodes them without running any markup. */
  var decoder = null;
  function decode(str) {
    if (str == null) return '';
    str = String(str);
    if (str.indexOf('&') === -1) return str;
    decoder = decoder || document.createElement('textarea');
    decoder.innerHTML = str;
    return decoder.value;
  }

  /* Only http(s) addresses are ever used for audio, images or links. */
  function safeUrl(u) {
    if (typeof u !== 'string') return '';
    u = u.trim();
    return /^https?:\/\//i.test(u) ? u : '';
  }

  function hash(str) {
    var n = 0;
    str = String(str || '');
    for (var i = 0; i < str.length; i++) n = (n * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(n);
  }

  /* "a", "a and b", "a, b and c" */
  function listWords(items) {
    if (items.length <= 1) return items[0] || '';
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  function isPhone() {
    return window.matchMedia('(max-width: 719px)').matches;
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  GF.util = {
    h: h, append: append, clear: clear, emitter: emitter, clamp: clamp, range: range,
    shuffle: shuffle, uid: uid, debounce: debounce, throttle: throttle,
    fmtTime: fmtTime, fmtTotal: fmtTotal, plural: plural, decode: decode,
    safeUrl: safeUrl, hash: hash, listWords: listWords, isPhone: isPhone,
    reducedMotion: reducedMotion
  };
})(window.GF = window.GF || {});
