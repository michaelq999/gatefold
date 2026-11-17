/* Gatefold: saving things in this browser.
   Everything the app remembers (playlists, key, history, player state)
   goes through this file. Nothing is sent anywhere. */
(function (GF) {
  'use strict';

  var PREFIX = 'gatefold.v1.';
  var BACKUP_KEYS = ['playlists', 'seeds', 'signals', 'meta'];   // the key is never part of a backup
  var bus = GF.util.emitter();
  var memory = {};
  var ls = null;
  var available = false;

  try {
    ls = window.localStorage;
    var probe = PREFIX + '__probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    available = true;
  } catch (err) {
    available = false;
  }

  function get(key, fallback) {
    try {
      var raw = available ? ls.getItem(PREFIX + key) : memory[key];
      if (raw == null) return fallback;
      var value = JSON.parse(raw);
      return value == null ? fallback : value;
    } catch (err) {
      return fallback;
    }
  }

  function set(key, value) {
    var raw = JSON.stringify(value);
    try {
      if (available) ls.setItem(PREFIX + key, raw);
      else memory[key] = raw;
      return true;
    } catch (err) {
      memory[key] = raw;
      bus.emit('error', { key: key, error: err });
      return false;
    }
  }

  function remove(key) {
    try {
      if (available) ls.removeItem(PREFIX + key);
      delete memory[key];
    } catch (err) { /* nothing to do */ }
  }

  function exportBackup() {
    var data = {};
    BACKUP_KEYS.forEach(function (k) {
      var v = get(k, null);
      if (v != null) data[k] = v;
    });
    return { app: 'gatefold', version: 1, exportedAt: new Date().toISOString(), data: data };
  }

  /* Returns the validated data block of a backup file, or throws. */
  function readBackup(obj) {
    if (!obj || obj.app !== 'gatefold' || typeof obj.data !== 'object' || !obj.data) {
      throw new Error('That file is not a Gatefold backup.');
    }
    var out = {};
    BACKUP_KEYS.forEach(function (k) {
      if (obj.data[k] != null) out[k] = obj.data[k];
    });
    return out;
  }

  /* Another tab changed something: let the app refresh what it shows. */
  window.addEventListener('storage', function (e) {
    if (e.key && e.key.indexOf(PREFIX) === 0) bus.emit('external', { key: e.key.slice(PREFIX.length) });
  });

  GF.store = {
    get: get,
    set: set,
    remove: remove,
    available: available,
    on: bus.on,
    exportBackup: exportBackup,
    readBackup: readBackup
  };
})(window.GF);
