/* Offline Weekly Off snapshot storage. Auth tokens are never stored here. */
(function (root) {
  'use strict';
  var PREFIX = 'abbtga-weekly-off-snapshot-v1:';

  function userId(session) {
    var user = session && session.user;
    if (!user || user.is_anonymous === true || !user.id) return null;
    return String(user.id);
  }
  function key(id) { return PREFIX + encodeURIComponent(id); }
  function load(session) {
    var id = userId(session);
    if (!id) return null;
    try {
      var raw = root.localStorage.getItem(key(id));
      if (!raw) return null;
      var snapshot = JSON.parse(raw);
      if (!snapshot || snapshot.userId !== id || !Array.isArray(snapshot.fleet) ||
          !Array.isArray(snapshot.ops) || typeof snapshot.savedAt !== 'string') return null;
      return snapshot;
    } catch (_) { return null; }
  }
  function save(session, fleet, ops, savedAt) {
    var id = userId(session);
    if (!id || !Array.isArray(fleet) || !Array.isArray(ops)) return false;
    var snapshot = {userId:id, savedAt:savedAt || new Date().toISOString(), fleet:fleet, ops:ops};
    try {
      root.localStorage.setItem(key(id), JSON.stringify(snapshot));
      return true;
    } catch (_) { return false; }
  }
  function clear(session) {
    var id = userId(session);
    if (!id) return false;
    try { root.localStorage.removeItem(key(id)); return true; }
    catch (_) { return false; }
  }
  function formatTimestamp(value) {
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'ไม่ทราบเวลา';
    try { return new Intl.DateTimeFormat('th-TH', {dateStyle:'medium', timeStyle:'short'}).format(date); }
    catch (_) { return date.toLocaleString('th-TH'); }
  }

  root.WeeklyOffOfflineStore = {userId:userId, load:load, save:save, clear:clear, formatTimestamp:formatTimestamp};
})(window);
