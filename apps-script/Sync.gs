/**
* Sync.gs — ส่งข้อมูลจาก Google Sheet "[ABBTG-A] Dashboard Last Mile" ไป Supabase
*           (เว็บใหม่บน GitHub Pages อ่านข้อมูลจาก Supabase)
*
* วิธีติดตั้ง (ทำครั้งเดียว)
*  1) เปิด Google Sheet > ส่วนขยาย (Extensions) > Apps Script
*  2) กด + > สคริปต์ ตั้งชื่อไฟล์ว่า Sync แล้ววางโค้ดนี้ทั้งหมด > บันทึก
*     (ไฟล์นี้อยู่ร่วมกับ Code.gs เดิมได้ — ชื่อฟังก์ชันไม่ชนกัน ตัวช่วยทั้งหมดอยู่ใน SpxSync_)
*  3) การตั้งค่าโปรเจ็กต์ (รูปเฟือง) > คุณสมบัติของสคริปต์ (Script properties) > เพิ่ม
*        พร็อพเพอร์ตี้: SYNC_SECRET   ค่า: (รหัสลับจากไฟล์ SYNC_SECRET.txt)
*  4) เลือกฟังก์ชัน installTriggers > เรียกใช้ (Run) > อนุญาตสิทธิ์
*     → ติดตั้งทริกเกอร์ onEdit / onChange / ทุก 15 นาที และซิงก์ทันที 1 ครั้ง
*  5) ซิงก์เองเมื่อไหร่ก็ได้: เลือก syncNow > Run   ·   ดูผลล่าสุด: syncStatus
*
* สคริปต์นี้ "อ่าน" ชีตเท่านั้น ไม่เขียนอะไรลงชีต
* ไม่มี service_role key — ใช้ publishable key + รหัสลับ (ตรวจกับค่า hash ในฐานข้อมูล)
*/

var SPX_SYNC_CONFIG = {
  SUPABASE_URL: 'https://bkmvwgoldyrzmgvmeskp.supabase.co',
  SUPABASE_KEY: 'sb_publishable_glOfpLrNGGdz95Qt62eVJg_rlzIxqQ_',   // publishable (public) key — not a secret
  RPC: 'sync_sheet',
  SECRET_PROP: 'SYNC_SECRET',                                       // Script Properties key (the secret lives there)
  SHEETS: { daily: 'Daily Report', fleet: 'Dayoff Fleet', ops: 'Dayoff Ops' },
  TIMER_MINUTES: 15                                                 // allowed: 1, 5, 10, 15, 30
};

/* ===================== public entry points (Run menu / triggers) ===================== */

/** ซิงก์ทันที (กด Run จาก editor) */
function syncNow() {
  var r = SpxSync_.run('manual', Date.now(), true);
  Logger.log(JSON.stringify(r));
  return r;
}

/** ติดตั้งทริกเกอร์ (ลบของเดิมของ Sync ก่อน) แล้วซิงก์ 1 ครั้ง */
function installTriggers() {
  SpxSync_.requireSecret();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('สคริปต์ต้องผูกกับ Google Sheet (Extensions > Apps Script จากตัวชีต)');
  removeSyncTriggers();
  ScriptApp.newTrigger('syncOnEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('syncOnChange').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('syncOnTimer').timeBased().everyMinutes(SPX_SYNC_CONFIG.TIMER_MINUTES).create();
  Logger.log('ติดตั้งทริกเกอร์แล้ว: onEdit, onChange, ทุก ' + SPX_SYNC_CONFIG.TIMER_MINUTES + ' นาที');
  return syncNow();
}

/** ลบทริกเกอร์ทั้งหมดของ Sync (ไม่แตะทริกเกอร์อื่น) */
function removeSyncTriggers() {
  var names = { syncOnEdit: 1, syncOnChange: 1, syncOnTimer: 1 };
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (names[t.getHandlerFunction()]) { ScriptApp.deleteTrigger(t); n++; }
  });
  Logger.log('ลบทริกเกอร์ Sync ' + n + ' รายการ');
  return n;
}

/** ดูผลซิงก์ล่าสุด */
function syncStatus() {
  var p = PropertiesService.getScriptProperties();
  var s = { lastOk: p.getProperty('SYNC_LAST_OK') || '-', lastError: p.getProperty('SYNC_LAST_ERROR') || '-',
    secretSet: !!p.getProperty(SPX_SYNC_CONFIG.SECRET_PROP),
    triggers: ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction() + ':' + t.getEventType(); }) };
  Logger.log(JSON.stringify(s, null, 2));
  return s;
}

/** installable onEdit — ซิงก์เมื่อแก้ไขแท็บที่เกี่ยวข้อง */
function syncOnEdit(e) {
  var t0 = Date.now();
  try {
    var name = e && e.range ? e.range.getSheet().getName() : '';
    if (name && !SpxSync_.isWatchedSheet(name)) return;
  } catch (err) { /* unknown sheet → sync anyway */ }
  SpxSync_.run('edit', t0, false);
}

/** installable onChange — โครงสร้างเปลี่ยน (แทรก/ลบแถว คอลัมน์ แท็บ ฯลฯ); การแก้ค่าให้ syncOnEdit จัดการ */
function syncOnChange(e) {
  var t0 = Date.now();
  var type = e && e.changeType;
  if (type === 'EDIT' || type === 'FORMAT') return;
  SpxSync_.run('change:' + (type || '?'), t0, false);
}

/** time-driven — กันพลาด (เช่น ข้อมูลที่มาจากสูตร/IMPORTRANGE ซึ่งไม่ทำให้เกิด onEdit) */
function syncOnTimer(e) {
  SpxSync_.run('timer', Date.now(), false);
}

/* ===================== implementation (namespaced: no global name collisions) ===================== */

var SpxSync_ = (function () {
  var DEFAULT_TZ = 'Asia/Bangkok';
  var TOTAL_LABEL = 'รวม';
  var C = SPX_SYNC_CONFIG;

  function props() { return PropertiesService.getScriptProperties(); }

  function requireSecret() {
    var s = props().getProperty(C.SECRET_PROP);
    if (!s || String(s).trim().length < 32) {
      throw new Error('ยังไม่ได้ตั้ง Script Property "' + C.SECRET_PROP + '" (การตั้งค่าโปรเจ็กต์ > คุณสมบัติของสคริปต์)');
    }
    return String(s).trim();
  }

  function isWatchedSheet(name) {
    var k = normKey_(name);
    for (var key in C.SHEETS) if (normKey_(C.SHEETS[key]) === k) return true;
    return false;
  }

  function findSheet_(ss, want) {
    var sh = ss.getSheetByName(want);
    if (sh) return sh;
    var real = findSheetName_(ss.getSheets().map(function (s) { return s.getName(); }), want);
    return real ? ss.getSheetByName(real) : null;
  }

  /** Build the JSON payload (same shapes as Code.gs getDashboardData / getRosterData). */
  function buildPayload(ss) {
    var tz = ss.getSpreadsheetTimeZone() || DEFAULT_TZ;
    var now = new Date();
    var stamp = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');
    var payload = { spreadsheetName: ss.getName(), timezone: tz, source: 'apps-script', builtAt: stamp };
    var missing = [];

    var dSheet = findSheet_(ss, C.SHEETS.daily);
    if (dSheet) {
      var d = parseSheet_(dSheet, tz);
      payload.daily = { sheetName: dSheet.getName(), loadedAt: stamp, warnings: d.warnings, drivers: d.drivers };
    } else missing.push(C.SHEETS.daily);

    ['fleet', 'ops'].forEach(function (k) {
      var sh = findSheet_(ss, C.SHEETS[k]);
      if (!sh) { missing.push(C.SHEETS[k]); return; }
      var r = parseRoster_(sh, tz, now);
      payload[k] = { sheetName: sh.getName(), loadedAt: stamp, cols: r.cols, dates: r.dates, people: r.people, warnings: r.warnings };
    });
    return { payload: payload, missing: missing };
  }

  function post_(payload, secret) {
    var headers = { apikey: C.SUPABASE_KEY };
    if (/^eyJ/.test(C.SUPABASE_KEY)) headers.Authorization = 'Bearer ' + C.SUPABASE_KEY; // legacy anon JWT key
    var res = UrlFetchApp.fetch(C.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/' + C.RPC, {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify({ p_secret: secret, p_payload: payload }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode(), body = res.getContentText();
    if (code < 200 || code >= 300) {
      var msg = body;
      try { var j = JSON.parse(body); msg = j.message || body; } catch (e) {}
      throw new Error('Supabase ' + code + ': ' + msg);
    }
    return JSON.parse(body);
  }

  /**
  * Serialised + de-duplicated sync. t0 = time the triggering event happened:
  * if another sync started after t0, it already contains this change → skip.
  */
  function run(reason, t0, throwOnError) {
    var p = props();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(120000)) return { ok: false, skipped: 'busy', reason: reason };
    try {
      var last = +(p.getProperty('SYNC_LAST_START') || 0);
      if (reason !== 'manual' && last > t0) return { ok: true, skipped: 'covered', reason: reason };
      p.setProperty('SYNC_LAST_START', String(Date.now()));
      var secret = requireSecret();
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) throw new Error('ไม่พบสเปรดชีต (สคริปต์ต้องผูกกับ Google Sheet)');
      var b = buildPayload(ss);
      if (!b.payload.daily && !b.payload.fleet && !b.payload.ops) throw new Error('ไม่พบแท็บที่ต้องซิงก์: ' + b.missing.join(', '));
      var out = post_(b.payload, secret);
      out.reason = reason;
      if (b.missing.length) out.missingTabs = b.missing;
      p.setProperty('SYNC_LAST_OK', b.payload.builtAt + ' ' + JSON.stringify(out));
      return out;
    } catch (err) {
      var m = (err && err.message) || String(err);
      p.setProperty('SYNC_LAST_ERROR', Utilities.formatDate(new Date(), DEFAULT_TZ, 'yyyy-MM-dd HH:mm:ss') + ' [' + reason + '] ' + m);
      if (throwOnError || reason === 'timer') throw err;   // manual: show in editor; timer: Apps Script failure e-mail
      console.error(m);
      return { ok: false, error: m, reason: reason };
    } finally {
      lock.releaseLock();
    }
  }

  /* ---------- parsing helpers: verbatim copy of Code.gs (v5) — keep in sync if Code.gs changes ---------- */
  function parseSheet_(sheet, tz) {
    var warnings = [];
    var range = sheet.getDataRange();
    var values = range.getValues();
    var display = range.getDisplayValues();
    if (!values.length) return { drivers: [], warnings: ['แท็บนี้ไม่มีข้อมูล'] };

    // Locate header row (first row whose cells contain "Driver ID"); default row 0.
    var hdrRow = -1;
    for (var r = 0; r < Math.min(values.length, 10) && hdrRow < 0; r++) {
      for (var c = 0; c < values[r].length; c++) {
        if (normKey_(values[r][c]) === 'driverid') { hdrRow = r; break; }
      }
    }
    if (hdrRow < 0) {
      hdrRow = 0;
      warnings.push('ไม่พบหัวตาราง "Driver ID" — ใช้แถวแรกเป็นหัวตาราง');
    }

    // Map columns by header text, fall back to fixed positions A..F.
    // Header text wins. Fallback indexes stay the old A–F layout so a sheet
    // without a position header does not shift Assign / Delivered / On-hold.
    // "ตำแหน่ง" and "position" are optional; a missing header sends "".
    var col = { id: 0, name: 1, first: 2, assign: 3, delivered: 4, onhold: 5, position: -1 };
    var keyMap = { driverid: 'id', 'ชื่อคนขับ': 'name', firstdel: 'first', assign: 'assign', delivered: 'delivered', onhold: 'onhold', 'ตำแหน่ง': 'position', position: 'position' };
    var found = {};
    values[hdrRow].forEach(function (h, i) {
      var k = keyMap[normKey_(h)];
      if (k && !found[k]) { col[k] = i; found[k] = true; }
    });

    var drivers = [];
    for (var i = hdrRow + 1; i < values.length; i++) {
      var row = values[i];
      var id = cellStr_(row[col.id]);
      var name = cellStr_(row[col.name]);
      if (name === TOTAL_LABEL || id === TOTAL_LABEL) continue; // summary row
      if (!id && !name) continue;                              // blank row

      var assign = toNum_(row[col.assign]);
      var delivered = toNum_(row[col.delivered]);
      var onhold = toNum_(row[col.onhold]);

      var position = col.position >= 0 ? cellStr_(row[col.position]) : '';
      drivers.push({
        id: id,
        name: name || '(ไม่ระบุชื่อ)',
        position: position,
        first: fmtTime_(row[col.first], display[i][col.first], tz),
        assign: assign,
        delivered: delivered,
        onhold: onhold
      });
    }
    return { drivers: drivers, warnings: warnings };
  }

  function normKey_(v) {
    return String(v == null ? '' : v).toLowerCase().replace(/[\s\-_]/g, '');
  }

  function cellStr_(v) {
    if (v == null) return '';
    if (typeof v === 'number') return String(v);
    return String(v).trim();
  }

  function toNum_(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null || v === '') return 0;
    var n = Number(String(v).replace(/[,\s]/g, ''));
    return isFinite(n) ? n : 0;
  }

  /**
  * First Del → "HH:mm". Accepts Date, "08:58", "8:58:00", day-fraction number.
  * Dates are formatted with Utilities.formatDate in the spreadsheet timezone.
  * Time-only cells come back as 1899-12-30 Dates; for old dates some zones
  * (incl. Asia/Bangkok, LMT +06:42) can drift by minutes, so if the cell's
  * displayed text shows a different HH:mm, the displayed text wins.
  */
  function fmtTime_(v, disp, tz) {
    var shown = normTime_(disp);
    if (v instanceof Date || Object.prototype.toString.call(v) === '[object Date]') {
      if (isNaN(v.getTime())) return shown || '-';
      var f = Utilities.formatDate(v, tz || DEFAULT_TZ, 'HH:mm');
      return (shown && shown !== f) ? shown : f;
    }
    if (typeof v === 'number' && isFinite(v) && v > 0) {
      if (shown) return shown;
      var mins = Math.round((v % 1) * 24 * 60);
      return pad2_(Math.floor(mins / 60) % 24) + ':' + pad2_(mins % 60);
    }
    var s = String(v == null ? '' : v).trim();
    return normTime_(s) || shown || s || '-';
  }

  /** "8:58", "08:58:00", "3/10/2026 8:58:00" → "08:58"; otherwise "". */
  function normTime_(s) {
    var m = String(s == null ? '' : s).match(/(?:^|\D)(\d{1,2}):(\d{2})(?!\d)/);
    return m ? pad2_(+m[1]) + ':' + m[2] : '';
  }

  function pad2_(n) { return (n < 10 ? '0' : '') + n; }

  /* ------------------------------------------------------------------ */
  /* Sheet-name helpers                                                  */
  /* ------------------------------------------------------------------ */

  /** "Dayoff Fleet", "Day off Ops", "DAYOFF …" → true */
  function isRosterSheetName_(name) {
    return /^day\s*off/i.test(String(name || '').trim());
  }

  /** Case/space-insensitive tab lookup → real tab name or ''. */
  function findSheetName_(names, want) {
    var k = normKey_(want);
    for (var i = 0; i < names.length; i++) if (names[i] === want) return names[i];
    for (var j = 0; j < names.length; j++) if (normKey_(names[j]) === k) return names[j];
    return '';
  }

  /* ------------------------------------------------------------------ */
  /* Roster parsing                                                      */
  /* ------------------------------------------------------------------ */

  var ROSTER_KEYS_ = {
    id:      ['driverid', 'opsid', 'staffid', 'workerid', 'id', 'รหัส', 'รหัสพนักงาน'],
    empId:   ['employeeid', 'empid', 'employeeno'],
    name:    ['staffname', 'name', 'drivername', 'employeename', 'ชื่อ', 'ชื่อพนักงาน', 'ชื่อคนขับ', 'ชื่อสกุล'],
    func:    ['function', 'department', 'dept', 'position', 'role', 'ตำแหน่ง', 'แผนก', 'หน้าที่'],
    station: ['stationname', 'station', 'hub']
  };

  function parseRoster_(sheet, tz, now) {
    var warnings = [];
    var empty = { cols: { id: '', empId: '', name: '', func: '', station: '' }, dates: [], people: [], warnings: ['แท็บนี้ไม่มีข้อมูล'] };
    var range = sheet.getDataRange();
    var values = range.getValues();
    var display = range.getDisplayValues();
    if (!values.length || !values[0].length) return empty;

    var curYear = +Utilities.formatDate(now || new Date(), tz, 'yyyy');

    // 1) Header row = the row (within the first 30) with the most date-like cells (≥ 2).
    var hdrRow = -1, best = 1, bestDates = null;
    for (var r = 0; r < Math.min(values.length, 30); r++) {
      var ds = headerDates_(values[r], display[r], tz, curYear);
      var n = 0;
      for (var c = 0; c < ds.length; c++) if (ds[c]) n++;
      if (n > best) { best = n; hdrRow = r; bestDates = ds; }
    }
    if (hdrRow < 0) {
      empty.warnings = ['ไม่พบแถวหัวตารางที่มีวันที่ (เช่น 2026-10-01) ในแท็บ "' + sheet.getName() + '"'];
      return empty;
    }

    // 2) Fixed columns by header text.
    var hdr = display[hdrRow];
    var col = { id: -1, empId: -1, name: -1, func: -1, station: -1 };
    var colText = { id: '', empId: '', name: '', func: '', station: '' };
    Object.keys(ROSTER_KEYS_).forEach(function (k) {
      var keys = ROSTER_KEYS_[k];
      for (var p = 0; p < keys.length && col[k] < 0; p++) {
        for (var c2 = 0; c2 < hdr.length; c2++) {
          if (bestDates[c2]) continue;
          var taken = false;
          for (var kk in col) if (col[kk] === c2) taken = true;
          if (!taken && normKey_(hdr[c2]) === keys[p]) { col[k] = c2; colText[k] = String(hdr[c2]).trim(); break; }
        }
      }
    });
    var firstDateCol = -1;
    for (var c3 = 0; c3 < bestDates.length; c3++) if (bestDates[c3]) { firstDateCol = c3; break; }
    // Fallbacks: name = first unmapped text column before the dates; id = first column.
    if (col.id < 0 && firstDateCol > 0) { col.id = 0; colText.id = String(hdr[0] || 'ID').trim(); warnings.push('ไม่พบคอลัมน์ ID — ใช้คอลัมน์แรกแทน'); }
    if (col.name < 0) {
      for (var c4 = 0; c4 < firstDateCol; c4++) {
        if (c4 !== col.id && c4 !== col.empId && c4 !== col.func && c4 !== col.station) { col.name = c4; colText.name = String(hdr[c4] || 'ชื่อ').trim(); break; }
      }
      if (col.name < 0) warnings.push('ไม่พบคอลัมน์ชื่อพนักงาน');
    }

    if (normKey_(sheet.getName()) === normKey_('Dayoff Fleet')) {
      colText.planHC = planHCFromAK_(display, col, hdrRow);
    }

    // 3) Date columns (sorted by date, duplicates dropped).
    var dcols = [];
    var seen = {};
    bestDates.forEach(function (d, i) {
      if (!d) return;
      if (seen[d]) { warnings.push('วันที่ ' + d + ' ซ้ำกันในหัวตาราง — ใช้คอลัมน์แรก'); return; }
      seen[d] = true;
      dcols.push({ d: d, c: i });
    });
    dcols.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });

    // 4) People rows.
    var people = [];
    for (var i = hdrRow + 1; i < display.length; i++) {
      var row = display[i];
      var get = function (k) { return col[k] >= 0 ? String(row[col[k]] == null ? '' : row[col[k]]).trim() : ''; };
      var id = get('id'), name = get('name');
      if (!id && !name) continue;                                   // blank row
      if (name === TOTAL_LABEL || id === TOTAL_LABEL || /^total$/i.test(id) || /^total$/i.test(name)) continue;
      var shifts = dcols.map(function (dc) { return normShift_(row[dc.c]); });
      people.push({
        id: id,
        empId: get('empId'),
        name: name || '(ไม่ระบุชื่อ)',
        func: get('func'),
        station: get('station'),
        shifts: shifts
      });
    }
    if (!people.length) warnings.push('ไม่พบรายชื่อพนักงานใต้หัวตาราง');

    return {
      cols: colText,
      dates: dcols.map(function (dc) { return dc.d; }),
      people: people,
      warnings: warnings
    };
  }

  /** Header cells → array of 'yyyy-MM-dd' or '' (same length as the row). */
  function headerDates_(vals, disp, tz, curYear) {
    var out = [];
    var lastY = 0, lastM = -1;
    for (var c = 0; c < vals.length; c++) {
      var d = cellDate_(vals[c], disp[c], tz);
      if (!d) {
        // Text without a year ("1-Oct", "1 ต.ค.") → infer year; roll over Dec → Jan.
        var p = parseDayMonth_(disp[c]);
        if (p) {
          var y = lastY || curYear;
          if (lastM >= 0 && p.m < lastM) y++;
          d = y + '-' + pad2_(p.m + 1) + '-' + pad2_(p.d);
        }
      }
      if (d) { lastY = +d.slice(0, 4); lastM = +d.slice(5, 7) - 1; }
      out.push(d || '');
    }
    return out;
  }

  /** One header cell → 'yyyy-MM-dd' (only when the year is known) or ''. */
  function cellDate_(v, disp, tz) {
    if (v instanceof Date || Object.prototype.toString.call(v) === '[object Date]') {
      if (isNaN(v.getTime())) return '';
      var y0 = +Utilities.formatDate(v, tz || DEFAULT_TZ, 'yyyy');
      if (y0 < 1950) return '';                                     // time-only cell
      return Utilities.formatDate(v, tz || DEFAULT_TZ, 'yyyy-MM-dd');
    }
    var s = String(disp != null && disp !== '' ? disp : (v == null ? '' : v)).trim();
    if (!s || s.length > 40) return '';
    var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?!\d)/);            // 2026-10-01(Thursday)
    if (m) return ymd_(+m[1], +m[2], +m[3]);
    m = s.match(/^(?:[^\d]{0,12}\s)?(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?!\d)/); // 01/10/2026 (d/m/y)
    if (m) return ymd_(+m[3], +m[2], +m[1]);
    var p = parseDayMonth_(s);
    if (p && p.y) return ymd_(p.y, p.m + 1, p.d);
    if (typeof v === 'number' && v > 40000 && v < 60000 && /^\d+(\.\d+)?$/.test(s)) {     // raw serial
      var dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5);
      return dt.getUTCFullYear() + '-' + pad2_(dt.getUTCMonth() + 1) + '-' + pad2_(dt.getUTCDate());
    }
    return '';
  }

  var MON_EN_ = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  var MON_TH_ = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  /** "1-Oct", "1 Oct 2026", "Oct 1", "1 ต.ค. 69" → {d, m(0-11), y|0}; else null. */
  function parseDayMonth_(s) {
    s = String(s == null ? '' : s).trim();
    if (!s || s.length > 40) return null;
    var m = s.match(/^(?:[A-Za-z]{3,9},?\s+)?(\d{1,2})[\s\-\/]*([A-Za-z]{3})[A-Za-z]*\.?(?:[\s\-\/,]*(\d{2,4}))?(?![\d:])/);
    var d, mo, y = 0;
    if (m && MON_EN_[m[2].toLowerCase()] != null) { d = +m[1]; mo = MON_EN_[m[2].toLowerCase()]; y = m[3] ? +m[3] : 0; }
    if (mo == null) {
      m = s.match(/^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?(?![\d:])/);
      if (m && MON_EN_[m[1].toLowerCase()] != null) { d = +m[2]; mo = MON_EN_[m[1].toLowerCase()]; y = m[3] ? +m[3] : 0; }
    }
    if (mo == null) {
      for (var i = 0; i < MON_TH_.length && mo == null; i++) {
        var re = new RegExp('^(\\d{1,2})\\s*' + MON_TH_[i].replace(/\./g, '\\.?') + '(?:\\s*(\\d{2,4}))?');
        var t = s.match(re);
        if (t) { d = +t[1]; mo = i; y = t[2] ? +t[2] : 0; }
      }
    }
    if (mo == null || !(d >= 1 && d <= 31)) return null;
    if (y && y < 100) y += (y > 50 ? 2500 : 2000);                  // "69" → 2569 (พ.ศ.), "26" → 2026
    if (y > 2400) y -= 543;                                         // พ.ศ. → ค.ศ.
    return { d: d, m: mo, y: y };
  }

  function ymd_(y, m, d) {
    if (y > 2400) y -= 543;
    if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    return y + '-' + pad2_(m) + '-' + pad2_(d);
  }

  /** Display text of a shift cell → trimmed, single-spaced, upper-cased ("rd" → "RD"). */
  function normShift_(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toUpperCase();
  }
  function planHCFromAK_(display, col, hdrRow) {
    var out = { source: 'dayoff fleet!AK4:AK', two: 0, four: 0 };
    var ak = 36; // Column AK, zero-based.
    for (var i = Math.max(hdrRow + 1, 3); i < display.length; i++) {
      var row = display[i] || [];
      var id = col.id >= 0 ? String(row[col.id] == null ? '' : row[col.id]).trim() : '';
      var name = col.name >= 0 ? String(row[col.name] == null ? '' : row[col.name]).trim() : '';
      if ((!id && !name) || id === TOTAL_LABEL || name === TOTAL_LABEL || /^total$/i.test(id) || /^total$/i.test(name)) continue;
      var position = String(row[ak] == null ? '' : row[ak]).replace(/\s+/g, ' ').trim().toUpperCase();
      if (position === '2WH') out.two++;
      else if (position === '4WH') out.four++;
    }
    return out;
  }

  return { run: run, buildPayload: buildPayload, requireSecret: requireSecret, isWatchedSheet: isWatchedSheet, planHCFromAK: planHCFromAK_ };
})();
