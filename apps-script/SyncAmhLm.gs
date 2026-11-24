/**
* SyncAmhLm.gs — ส่งตัวเลขหน้า AMH-LM จากแท็บ "AMH-LM" ในชีต ไป Supabase (RPC sync_amh_lm)
*                หน้าเว็บ amh-lm/ อ่านจาก Supabase อีกที
*
* ติดตั้ง (ครั้งเดียว) — อยู่ในโปรเจ็กต์ Apps Script เดียวกับ Sync.gs ได้ ใช้ SYNC_SECRET ตัวเดียวกัน
*  1) Extensions > Apps Script > + > สคริปต์ ตั้งชื่อ SyncAmhLm แล้ววางโค้ดนี้ > บันทึก
*  2) เลือก amhLmInstallTriggers > Run > อนุญาตสิทธิ์  (onEdit ของแท็บ AMH-LM + ทุก 15 นาที แล้วซิงก์ 1 ครั้ง)
*  3) ซิงก์เอง: amhLmSyncNow   ·   ดูผลล่าสุด: amhLmStatus
*
* สคริปต์นี้ "อ่าน" ชีตเท่านั้น ไม่เขียนอะไรลงชีต
*
* รูปแบบแท็บ AMH-LM (แถว 1 = หัวตาราง, อ่านตามชื่อในคอลัมน์ A ไม่อ่านตามตำแหน่งเซลล์)
*   A ส่วน     | B รายการ        | C กลุ่ม                    | D ค่า1    | E ค่า2     | F ค่า3     | G ค่า4       | H อัปเดต FMS
*   date       |                 |                            | 2026-11-24
*   kpi        | est_inbound     | total                      | 10721                                         | 24 Nov 18:40
*   backlog    | >6 Days         | total/hub_aging            | to_buyer  | to_seller  | to_transfer
*   lh         | LT1QBO2B2DAW1   | Arrived                    | orders    | ATD 09:00  | ETA 10:39
*   progress   | received        | before_cutoff              | volume    | total      | completed
*   fleet      | 2WH             | full_time/total            | actual    | scheduled  | delivered  | handed_over
*   cod        | today           |                            | orders    | ค้างเก็บ (บาท)
* ช่องว่าง = ไม่มีข้อมูล (หน้าเว็บแสดง "—") ไม่ใช่ 0
*/

var AMH_LM_CONFIG = {
  SUPABASE_URL: 'https://bkmvwgoldyrzmgvmeskp.supabase.co',
  SUPABASE_KEY: 'sb_publishable_glOfpLrNGGdz95Qt62eVJg_rlzIxqQ_',   // publishable (public) key — not a secret
  RPC: 'sync_amh_lm',
  SECRET_PROP: 'SYNC_SECRET',
  SHEET: 'AMH-LM',
  HUB: 'ABBTG-A',
  TIMER_MINUTES: 15
};

function amhLmSyncNow() {
  var r = SpxAmhLm_.run('manual');
  Logger.log(JSON.stringify(r));
  return r;
}

function amhLmInstallTriggers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('สคริปต์ต้องผูกกับ Google Sheet');
  amhLmRemoveTriggers();
  ScriptApp.newTrigger('amhLmOnEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('amhLmOnTimer').timeBased().everyMinutes(AMH_LM_CONFIG.TIMER_MINUTES).create();
  return amhLmSyncNow();
}

function amhLmRemoveTriggers() {
  var names = { amhLmOnEdit: 1, amhLmOnTimer: 1 };
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (names[t.getHandlerFunction()]) ScriptApp.deleteTrigger(t);
  });
}

function amhLmStatus() {
  var p = PropertiesService.getScriptProperties();
  var s = { lastOk: p.getProperty('AMH_LM_LAST_OK') || '-', lastError: p.getProperty('AMH_LM_LAST_ERROR') || '-',
    lastWarnings: p.getProperty('AMH_LM_LAST_WARN') || '-' };
  Logger.log(JSON.stringify(s, null, 2));
  return s;
}

function amhLmOnEdit(e) {
  try {
    var name = e && e.range ? e.range.getSheet().getName() : '';
    if (name && name !== AMH_LM_CONFIG.SHEET) return;
  } catch (err) { /* unknown → sync */ }
  SpxAmhLm_.run('edit');
}

function amhLmOnTimer() { SpxAmhLm_.run('timer'); }

var SpxAmhLm_ = (function () {
  var KPI_KEYS = ['est_inbound','actual_inbound','forward_inbounded','return_inbounded','delivered_to_buyer',
    'returned_to_seller','avg_l7d_delivered','avg_l7d_returned','dtp_value','dtp_target','expedite','super_expedite',
    'lh_loading','lh_transporting','today_volume','to_handover','to_deliver','completion_rate','cfr',
    'delivering_attempted','ft_headcount','ft_attendance_rate','pt_headcount','pt_attendance_rate',
    'ft_orders_per_rider','pt_orders_per_rider','cod_pending_satang'];
  var KPI_SCOPES = ['total','hub','fleet','forward','return'];
  var STAGES = ['transported','received','assigning','assigned','delivering','delivered','on_hold'];
  var DIRECTIONS = ['before_cutoff','to_buyer','to_seller'];
  var AGING = ['hub_aging','leg_aging','delivery_attempts'];
  var COD = ['today','1_3_days','4_5_days','over_5_days'];
  var MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };

  function has(list, v) { return list.indexOf(v) >= 0; }
  function str(v) { return v == null ? '' : String(v).trim(); }
  function low(v) { return str(v).toLowerCase(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** "10,721" / "97.0%" / "฿262,012" / 5 → number; blank or "-" → null; junk → NaN */
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var s = str(v);
    if (s === '' || s === '-' || s === '—') return null;
    var n = Number(s.replace(/[,\s%฿]/g, ''));
    return isFinite(n) ? n : NaN;
  }

  /** a Date cell, "2026-11-24 18:40", "24/11/2026 18:40" or FMS-style "24 Nov 18:40" → ISO with +07:00, else null */
  function stamp(v, year) {
    if (v instanceof Date && !isNaN(v)) {
      var b = new Date(v.getTime() + 7 * 3600000);   // shown in Bangkok time
      return b.getUTCFullYear() + '-' + pad(b.getUTCMonth() + 1) + '-' + pad(b.getUTCDate()) + 'T' +
        pad(b.getUTCHours()) + ':' + pad(b.getUTCMinutes()) + ':00+07:00';
    }
    var s = str(v), m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(s))) return m[1] + '-' + m[2] + '-' + m[3] + 'T' + pad(+m[4]) + ':' + m[5] + ':00+07:00';
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})/.exec(s))) return m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]) + 'T' + pad(+m[4]) + ':' + m[5] + ':00+07:00';
    if ((m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{1,2}):(\d{2})/.exec(s)) && MONTHS[m[2].toLowerCase()] != null && year)
      return year + '-' + pad(MONTHS[m[2].toLowerCase()] + 1) + '-' + pad(+m[1]) + 'T' + pad(+m[3]) + ':' + m[4] + ':00+07:00';
    return null;
  }

  function dateCell(v) {
    if (v instanceof Date && !isNaN(v)) return stamp(v).slice(0, 10);
    var s = str(v), m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) return s;
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) return m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    return null;
  }

  /** rows: 2-D array (row 1 = header) → { payload, warnings }. Pure: no Apps Script calls. */
  function parse(rows, hub) {
    var warnings = [], out = { hub: hub || 'ABBTG-A', business_date: null };
    var lists = { kpi: [], backlog: [], lh: [], progress: [], fleet: [], cod: [] }, seen = {};
    rows = rows || [];
    for (var i = 1; i < rows.length; i++) {
      if (low(rows[i][0]) === 'date') out.business_date = dateCell(rows[i][3]);
    }
    if (!out.business_date) warnings.push('ไม่พบแถว date (คอลัมน์ D = วันที่ทำงาน FMS)');
    var year = out.business_date ? out.business_date.slice(0, 4) : null;

    for (var r = 1; r < rows.length; r++) {
      var row = rows[r], sec = low(row[0]), item = str(row[1]), grp = low(row[2]), line = 'แถว ' + (r + 1);
      if (sec === '' || sec === 'date') continue;
      var text = sec === 'lh';   // lh: E/F hold times (ATD/ETA), not numbers
      var d = num(row[3]), e = text ? null : num(row[4]), f = text ? null : num(row[5]), g = num(row[6]), up = stamp(row[7], year);
      if ([d, e, f, g].some(function (x) { return x !== x; })) { warnings.push(line + ': มีค่าที่ไม่ใช่ตัวเลข'); continue; }
      if (str(row[7]) !== '' && !up) warnings.push(line + ': อ่านเวลาอัปเดตไม่ได้ (' + str(row[7]) + ')');
      // A template row with no values = "no data" for that row (never 0); the section still counts as present.
      if (has(['kpi','backlog','lh','progress','fleet','cod'], sec) && d === null && e === null && f === null && g === null &&
          (sec !== 'lh' || (!item && !str(row[4]) && !str(row[5])))) { seen[sec] = true; continue; }
      var key, parts;
      if (sec === 'kpi') {
        key = low(item); var scope = grp || 'total';
        if (key === 'cod_pending_baht') { key = 'cod_pending_satang'; if (d !== null) d = Math.round(d * 100); }   // the sheet holds baht
        if (!has(KPI_KEYS, key) || !has(KPI_SCOPES, scope)) { warnings.push(line + ': ไม่รู้จัก kpi ' + item + ' / ' + scope); continue; }
        if (d === null) { seen.kpi = true; continue; }
        lists.kpi.push({ key: key, scope: scope, value: d, updated: up });
      } else if (sec === 'backlog') {
        parts = grp.split('/');
        if (!has(['total','hub','fleet'], parts[0]) || !has(AGING, parts[1] || '') || !item) { warnings.push(line + ': backlog ต้องเป็น กลุ่ม total|hub|fleet / hub_aging|leg_aging|delivery_attempts'); continue; }
        lists.backlog.push({ scope: parts[0], aging_type: parts[1], bucket: item, sort: r, to_buyer: d, to_seller: e, to_transfer: f, updated: up });
      } else if (sec === 'lh') {
        if (!/^LT[0-9A-Z]+$/i.test(item)) { warnings.push(line + ': Trip ID ต้องขึ้นต้นด้วย LT'); continue; }
        lists.lh.push({ trip_id: item.toUpperCase(), status: str(row[2]), orders: d, atd: str(row[4]), eta: str(row[5]), sort: r, updated: up });
      } else if (sec === 'progress') {
        key = low(item).replace(/[\s-]+/g, '_');
        if (!has(STAGES, key) || !has(DIRECTIONS, grp)) { warnings.push(line + ': ไม่รู้จัก progress ' + item + ' / ' + grp); continue; }
        lists.progress.push({ direction: grp, stage: key, volume: d, total: e, completed: f, updated: up });
      } else if (sec === 'fleet') {
        parts = grp.split('/'); var vt = item.toUpperCase() === 'OTHERS' ? 'Others' : item.toUpperCase(), dir = parts[1] || 'total';
        if (!has(['full_time','part_time'], parts[0]) || !has(['2WH','4WH','Others'], vt) || !has(['total','forward','return'], dir)) { warnings.push(line + ': fleet ต้องเป็น 2WH|4WH|Others และ full_time|part_time[/total|forward|return]'); continue; }
        lists.fleet.push({ contract: parts[0], vehicle_type: vt, direction: dir, actual: d, scheduled: e, delivered: f, handed_over: g,
          section: (d === null && e === null) ? 'productivity' : 'headcount', updated: up });
      } else if (sec === 'cod') {
        key = low(item);
        if (!has(COD, key)) { warnings.push(line + ': cod ต้องเป็น today|1_3_days|4_5_days|over_5_days'); continue; }
        lists.cod.push({ bucket: key, orders: d, pending_satang: e === null ? null : Math.round(e * 100), updated: up });
      } else { warnings.push(line + ': ไม่รู้จักส่วน "' + str(row[0]) + '"'); continue; }
      seen[sec === 'kpi' ? 'kpi' : sec] = true;
    }
    Object.keys(lists).forEach(function (k) { if (seen[k]) out[k] = lists[k]; });
    return { payload: out, warnings: warnings };
  }

  /** Value columns (D–G) as the cell shows them: a "97.0%" cell holds 0.97, but the page needs 97.
      The date row and column H keep the raw value, so Date cells stay Dates (no locale/Buddhist-year guessing). */
  function mergeCells(raw, shown) {
    return raw.map(function (row, i) {
      if (low(row[0]) === 'date') return row;
      var r = row.slice();
      for (var c = 3; c <= 6; c++) r[c] = shown[i][c];
      return r;
    });
  }

  function run(source) {
    var props = PropertiesService.getScriptProperties();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return { ok: false, skipped: 'busy' };
    try {
      var secret = props.getProperty(AMH_LM_CONFIG.SECRET_PROP);
      if (!secret) throw new Error('ยังไม่ได้ตั้ง SYNC_SECRET ใน Script properties');
      var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(AMH_LM_CONFIG.SHEET);
      if (!sh) throw new Error('ไม่พบแท็บ ' + AMH_LM_CONFIG.SHEET);
      var range = sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 8);
      var p = parse(mergeCells(range.getValues(), range.getDisplayValues()), AMH_LM_CONFIG.HUB);
      props.setProperty('AMH_LM_LAST_WARN', p.warnings.join(' | ').slice(0, 2000) || '-');
      if (!p.payload.business_date) throw new Error(p.warnings[0]);
      var res = UrlFetchApp.fetch(AMH_LM_CONFIG.SUPABASE_URL + '/rest/v1/rpc/' + AMH_LM_CONFIG.RPC, {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { apikey: AMH_LM_CONFIG.SUPABASE_KEY, Authorization: 'Bearer ' + AMH_LM_CONFIG.SUPABASE_KEY },
        payload: JSON.stringify({ p_secret: secret, p_payload: p.payload })
      });
      var code = res.getResponseCode(), body = res.getContentText();
      if (code >= 300) throw new Error('HTTP ' + code + ': ' + body.slice(0, 300));
      props.setProperty('AMH_LM_LAST_OK', new Date().toISOString() + ' (' + source + ') ' + body.slice(0, 300));
      return { ok: true, result: JSON.parse(body), warnings: p.warnings };
    } catch (err) {
      props.setProperty('AMH_LM_LAST_ERROR', new Date().toISOString() + ' (' + source + ') ' + String(err && err.message || err));
      return { ok: false, error: String(err && err.message || err) };
    } finally {
      lock.releaseLock();
    }
  }

  return { parse: parse, num: num, stamp: stamp, mergeCells: mergeCells, run: run };
})();
