/**
 * AmhLmImport.gs — รับตัวเลขหน้า FMS AMH-LM จากปุ่ม Tampermonkey ("📤 ส่ง AMH-LM เข้าชีต")
 * แล้วเขียนแท็บ "AMH-LM" (คอลัมน์ D–H + Trip ID ของ Linehaul) จากนั้นซิงก์เข้า Supabase ทันที (SpxAmhLm_.run)
 *
 * ถูกเรียกจาก doPost() ใน Line.gs เมื่อ body มีคีย์ "amhLmImport"
 * Body: {"amhLmImport":true,"token":"...","data":{businessDate, readStamp, stamps:{sec:"25 Nov 13:07"}, kpi:{"key|scope":[value,"sec"]},
 *        backlog:{"bucket|scope/aging":[b,s,t]}, trips:[[id,status,orders,atd,eta]], prog:{"stage|direction":[v,t,c]},
 *        fleet:{"vehicle|contract":[actual,scheduled,delivered,handed]}, cod:{bucket:[orders,baht]}}}
 * ค่าที่ FMS ไม่ได้แสดง = ไม่ส่งมา = ช่องว่าง (หน้าเว็บแสดง "—") ไม่ใส่ 0 แทน
 */
// Token lives in Script Properties (key AMH_LM_IMPORT_TOKEN), never in code: this repo is public.
// Set it once: Apps Script editor → Project Settings → Script properties → AMH_LM_IMPORT_TOKEN = same value as TOKEN in the userscript.
var AMH_LM_IMPORT_SHEET_ID = '1H5wADs0RkuBKXgBEjr0aXW8Hz59ZBh9Lygeh178gGyk';

function amhLmImportHandle_(contents) {
  function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
  try {
    var body = JSON.parse(contents);
    var want = PropertiesService.getScriptProperties().getProperty('AMH_LM_IMPORT_TOKEN');
    if (!want || want.length < 16) return out({ ok: false, error: 'ยังไม่ได้ตั้ง AMH_LM_IMPORT_TOKEN ใน Script properties' });
    if (body.token !== want) return out({ ok: false, error: 'bad token' });
    var data = body.data;
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(String(data.businessDate || ''))) return out({ ok: false, error: 'no businessDate' });
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var filled;
    try {
      var sh = SpreadsheetApp.openById(AMH_LM_IMPORT_SHEET_ID).getSheetByName('AMH-LM');
      if (!sh) return out({ ok: false, error: 'ไม่พบแท็บ AMH-LM' });
      var labels = sh.getRange(2, 1, 102, 3).getValues();
      var res = AmhLmRows_.build(labels, data);
      sh.getRange(2, 8, 102, 1).setNumberFormat('@');                       // H: keep "25 Nov 13:07" as text
      res.lhRows.forEach(function (r) { sh.getRange(r, 5, 1, 2).setNumberFormat('@'); });   // ATD/ETA as text
      sh.getRange(2, 4, 102, 5).setValues(res.rows.map(function (r) { return r.slice(3); }));
      res.lhRows.forEach(function (r, i) { sh.getRange(r, 2, 1, 2).setValues([[res.rows[r - 2][1], res.rows[r - 2][2]]]); });
      SpreadsheetApp.flush();
      filled = res.filled;
    } finally {
      lock.releaseLock();
    }
    var sync = SpxAmhLm_.run('import');   // push the tab to Workstation now (does not wait for the 15-min timer)
    return out({ ok: !!sync.ok, filled: filled, businessDate: data.businessDate, sync: sync.ok ? 'ok' : (sync.error || sync.skipped || 'failed') });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

/* Pure: sheet labels (A2:C103) + extracted FMS data → 102 rows of [A..H]. Shared with tests/amh-lm-import.test.js. */
var AmhLmRows_ = (function () {
  function build(labels, d) {
    var st = d.stamps || {}, lhIdx = 0, lhRows = [], kpi = d.kpi || {}, trips = d.trips || [];
    function stamp(sec) { return st[sec] || d.readStamp || ''; }
    var rows = labels.map(function (l, i) {
      var a = String(l[0] || '').trim(), b = String(l[1] || '').trim(), c = String(l[2] || '').trim();
      var blank = [a, b, c, '', '', '', '', ''], v;
      if (a === 'date') return [a, b, c, d.businessDate, '', '', '', ''];
      if (a === 'kpi') { v = kpi[b + '|' + c]; return v && v[0] !== '' && v[0] != null ? [a, b, c, v[0], '', '', '', stamp(v[1])] : blank; }
      if (a === 'backlog') { v = (d.backlog || {})[b + '|' + c]; return v ? [a, b, c, v[0], v[1], v[2], '', stamp('backlog')] : blank; }
      if (a === 'lh') { lhRows.push(i + 2); var t = trips[lhIdx++]; return t ? [a, t[0], t[1], t[2], t[3], t[4], '', stamp('lh')] : ['lh', '', '', '', '', '', '', '']; }
      if (a === 'progress') { v = (d.prog || {})[b + '|' + c]; return v ? [a, b, c, v[0], v[1], v[2], '', stamp('progress')] : blank; }
      if (a === 'fleet') { v = (d.fleet || {})[b + '|' + c]; return v ? [a, b, c, v[0], v[1], v[2] == null ? '' : v[2], v[3] == null ? '' : v[3], stamp('head')] : blank; }
      if (a === 'cod') { v = (d.cod || {})[b]; return v ? [a, b, c, v[0], v[1], '', '', stamp('fin')] : blank; }
      return blank;
    });
    var filled = rows.filter(function (r) { return r[0] !== 'date' && r.slice(3, 7).some(function (x) { return x !== ''; }); }).length;
    return { rows: rows, lhRows: lhRows, filled: filled };
  }
  return { build: build };
})();
