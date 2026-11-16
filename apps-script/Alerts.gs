/**
* Alerts.gs — แจ้งเตือนเข้ากลุ่ม SeaTalk เมื่อตัวเลขหน้างานหลุดเกณฑ์
*
* ใช้ข้อมูลชุดเดียวกับหน้า Workstation (อ่านผ่าน SpxSync_.buildPayload ใน Sync.gs)
* ดังนั้นต้องอยู่ในโปรเจ็กต์ Apps Script เดียวกับ Sync.gs
*
* วิธีติดตั้ง (ทำครั้งเดียว)
*  1) สร้าง webhook ใหม่ใน SeaTalk: เปิดกลุ่มที่จะรับแจ้งเตือน > เพิ่ม System Account (Bot) > คัดลอก Webhook URL
*  2) Google Sheet > Extensions > Apps Script > กด + > สคริปต์ ตั้งชื่อ Alerts แล้ววางโค้ดนี้ทั้งหมด > บันทึก
*  3) การตั้งค่าโปรเจ็กต์ (รูปเฟือง) > Script properties > เพิ่ม
*        SEATALK_ALERT_WEBHOOK = (Webhook URL จากข้อ 1)
*  4) เลือกฟังก์ชัน alertsTest > Run → ควรมีข้อความทดสอบเข้ากลุ่ม SeaTalk
*  5) เลือกฟังก์ชัน installAlertTrigger > Run → เช็กทุก 15 นาที
*
*  ดูว่าตอนนี้จะเตือนอะไรบ้างโดยไม่ส่งจริง: alertsPreview > Run แล้วดู Execution log
*  ปิดการแจ้งเตือน: removeAlertTrigger > Run
*
* สคริปต์นี้อ่านชีตเท่านั้น ไม่เขียนอะไรลงชีต
* แต่ละเรื่องเตือนไม่เกินวันละครั้ง (คนขับแต่ละคนก็เตือนไม่เกินวันละครั้ง)
* ถ้าข้อมูลของวันนี้ยังไม่เข้า (เช่น หลังเที่ยงคืน ก่อนวางข้อมูลใหม่) จะไม่เตือน
*/

var SPX_ALERT_CONFIG = {
  WEBHOOK_PROP: 'SEATALK_ALERT_WEBHOOK',
  HUB: 'ABBTG-A',
  TIMER_MINUTES: 15,           // allowed: 1, 5, 10, 15, 30
  ACTIVE_FROM: '08:00',        // ไม่เตือนนอกช่วงเวลานี้
  ACTIVE_TO: '21:00',
  NO_ASSIGN: { from: '10:00', max: 50 },            // No Assign = Today's Volume − Assign รวม
  SLA: { at: '20:00', min: 0.96 },                  // SLA = Delivered รวม ÷ Today's Volume (เหมือนหน้า Workstation)
  PDTY: { at: '10:30', targetLabel: 'PDTY Target' },// PDTY = Assign ÷ Active (2W+4W) · เป้าอ่านจาก DailySummary
  IDLE: { from: '10:00', to: '19:00', minutes: 60, maxListed: 10 }, // คนขับที่ยังมีงานค้างแต่ไม่ส่งนานเกิน
  SUMMARY_SHEET: 'DailySummary',
  DAILY_SHEET: 'Daily Report'
};

/* ===================== public entry points ===================== */

/** time-driven — เช็กและส่งแจ้งเตือน */
function alertsOnTimer(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    var r = SpxAlerts_.collect(new Date());
    if (!r.alerts.length) return;
    SpxAlerts_.send(SpxAlerts_.format(r));
    SpxAlerts_.markSent(r.today, r.alerts);
  } catch (err) {
    PropertiesService.getScriptProperties().setProperty('ALERT_LAST_ERROR',
      Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss') + ' ' + ((err && err.message) || err));
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/** ดูว่าตอนนี้จะเตือนอะไร (ไม่ส่ง ไม่บันทึก) */
function alertsPreview() {
  var r = SpxAlerts_.collect(new Date(), { ignoreSent: true });
  Logger.log(JSON.stringify(r.status, null, 2));
  Logger.log(r.alerts.length ? SpxAlerts_.format(r) : 'ตอนนี้ไม่มีเรื่องที่ต้องเตือน');
  return r;
}

/** ส่งข้อความทดสอบเข้ากลุ่ม เพื่อเช็ก webhook */
function alertsTest() {
  SpxAlerts_.send('✅ ทดสอบการแจ้งเตือน ' + SPX_ALERT_CONFIG.HUB + ' — webhook ใช้งานได้');
  Logger.log('ส่งข้อความทดสอบแล้ว');
}

/** ติดตั้งทริกเกอร์เช็กทุก 15 นาที (ลบของเดิมของ Alerts ก่อน ไม่แตะทริกเกอร์ของ Sync) */
function installAlertTrigger() {
  SpxAlerts_.webhook();
  removeAlertTrigger();
  ScriptApp.newTrigger('alertsOnTimer').timeBased().everyMinutes(SPX_ALERT_CONFIG.TIMER_MINUTES).create();
  Logger.log('ติดตั้งทริกเกอร์แจ้งเตือนแล้ว: ทุก ' + SPX_ALERT_CONFIG.TIMER_MINUTES + ' นาที');
}

/** ปิดการแจ้งเตือน */
function removeAlertTrigger() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'alertsOnTimer') { ScriptApp.deleteTrigger(t); n++; }
  });
  Logger.log('ลบทริกเกอร์แจ้งเตือน ' + n + ' รายการ');
  return n;
}

/* ===================== implementation ===================== */

var SpxAlerts_ = (function () {
  var C = SPX_ALERT_CONFIG;
  var TZ = 'Asia/Bangkok';
  var SENT_PREFIX = 'ALERT_SENT_';

  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var n = Number(String(v == null ? '' : v).replace(/[,%\s]/g, ''));
    return String(v == null ? '' : v).trim() !== '' && isFinite(n) ? n : null;
  }
  function fmt(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  /* same as Workstation home.js wheelOf */
  function wheelOf(func) {
    var s = String(func || '').toLowerCase();
    if (/4\s*w|4w|สี่ล้อ|van|pickup/.test(s)) return 4;
    if (/2\s*w|2w|สองล้อ|bike|motor|มอเตอร์/.test(s)) return 2;
    return 0;
  }
  /* same as Workstation driver.js gapMinutes: "h:m" → minutes */
  function gapMinutes(s) {
    var m = /^(\d+):(\d{1,2})$/.exec(String(s == null ? '' : s).trim());
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  /* "16/11/2026, 13:32:11" → "2026-11-16" (or "") */
  function stampDay(s) {
    var m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || ''));
    if (!m) return '';
    return m[3] + '-' + (m[2].length < 2 ? '0' : '') + m[2] + '-' + (m[1].length < 2 ? '0' : '') + m[1];
  }

  /**
  * Pure rule evaluation (no Apps Script services) — tested in tests/alerts.test.js.
  * input: { today:'yyyy-MM-dd', time:'HH:mm', drivers:[{id,name,position,assign,delivered,onhold,idle}],
  *          todayVolume, volumeDay, updateDay, pdtyTarget, sent:{key:true} }
  */
  function evaluate(input, cfg) {
    cfg = cfg || C;
    var t = input.time, sent = input.sent || {}, alerts = [];
    var status = { time: t, fresh: false, reason: '' };
    if (t < cfg.ACTIVE_FROM || t >= cfg.ACTIVE_TO) { status.reason = 'นอกช่วงเวลาแจ้งเตือน'; return { alerts: alerts, status: status }; }

    var drivers = (input.drivers || []).filter(function (d) { return d && (d.id || d.name); });
    var assign = 0, delivered = 0, assign2 = 0, assign4 = 0, active2 = 0, active4 = 0;
    drivers.forEach(function (d) {
      var a = num(d.assign) || 0, w = wheelOf(d.position);
      assign += a; delivered += num(d.delivered) || 0;
      if (w === 2) { assign2 += a; if (a > 0) active2++; }
      if (w === 4) { assign4 += a; if (a > 0) active4++; }
    });
    status.assign = assign; status.delivered = delivered;

    // Data must be today's: Daily Report updated today and drivers have work assigned.
    if (input.updateDay !== input.today || assign <= 0) {
      status.reason = 'ข้อมูลของวันนี้ยังไม่เข้า (Update Daily: ' + (input.updateDay || '—') + ', Assign รวม ' + assign + ')';
      return { alerts: alerts, status: status };
    }
    status.fresh = true;
    var volumeOk = input.volumeDay === input.today && input.todayVolume != null && input.todayVolume > 0;
    status.todayVolume = volumeOk ? input.todayVolume : null;

    // 1) No Assign
    if (volumeOk && t >= cfg.NO_ASSIGN.from && !sent.noAssign) {
      var noAssign = input.todayVolume - assign;
      status.noAssign = noAssign;
      if (noAssign > cfg.NO_ASSIGN.max) alerts.push({ key: 'noAssign',
        text: '📦 No Assign ' + fmt(noAssign) + ' ชิ้น (เกณฑ์ ไม่เกิน ' + fmt(cfg.NO_ASSIGN.max) + ') · Volume ' + fmt(input.todayVolume) + ' / Assign ' + fmt(assign) });
    }
    // 2) SLA at cutoff
    if (volumeOk && t >= cfg.SLA.at && !sent.sla) {
      var sla = delivered / input.todayVolume;
      status.sla = sla;
      if (sla < cfg.SLA.min) alerts.push({ key: 'sla',
        text: '🎯 SLA ' + (sla * 100).toFixed(2) + '% ต่ำกว่าเป้า ' + (cfg.SLA.min * 100).toFixed(0) + '% · Delivered ' + fmt(delivered) + ' / Volume ' + fmt(input.todayVolume) });
    }
    // 3) PDTY
    var active = active2 + active4, target = input.pdtyTarget;
    if (t >= cfg.PDTY.at && !sent.pdty && active > 0 && target != null && target > 0) {
      var pdty = (assign2 + assign4) / active;
      status.pdty = pdty;
      if (pdty < target) alerts.push({ key: 'pdty',
        text: '🛵 PDTY ' + pdty.toFixed(0) + ' ต่ำกว่าเป้า ' + fmt(target) + ' · Assign ' + fmt(assign2 + assign4) + ' ÷ Active ' + active + ' (2W ' + active2 + ' · 4W ' + active4 + ')' });
    }
    // 4) Idle drivers with work still pending
    if (t >= cfg.IDLE.from && t < cfg.IDLE.to) {
      var idle = drivers.map(function (d) {
        var left = (num(d.assign) || 0) - (num(d.delivered) || 0) - (num(d.onhold) || 0);
        return { key: 'idle:' + (d.id || d.name), d: d, gap: gapMinutes(d.idle), left: left };
      }).filter(function (x) { return x.gap != null && x.gap >= cfg.IDLE.minutes && x.left > 0 && !sent[x.key]; })
        .sort(function (a, b) { return b.gap - a.gap; });
      status.idle = idle.length;
      if (idle.length) {
        var lines = idle.slice(0, cfg.IDLE.maxListed).map(function (x) {
          return '   • [' + x.d.id + '] ' + x.d.name + ' (' + (x.d.position || '-') + ') ไม่ส่ง ' + x.d.idle + ' ชม. · ค้าง ' + fmt(x.left) + ' ชิ้น';
        });
        if (idle.length > cfg.IDLE.maxListed) lines.push('   • และอีก ' + (idle.length - cfg.IDLE.maxListed) + ' คน');
        alerts.push({ key: 'idle', keys: idle.map(function (x) { return x.key; }),
          text: '⏱️ คนขับไม่มีการส่งงานเกิน ' + cfg.IDLE.minutes + ' นาที ทั้งที่ยังมีงานค้าง (' + idle.length + ' คน)\n' + lines.join('\n') });
      }
    }
    return { alerts: alerts, status: status };
  }

  function labelValue(sheet, label) {
    if (!sheet) return null;
    var rows = sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), 2).getDisplayValues();
    for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).trim() === label) return rows[i][1];
    return null;
  }
  /* Daily Report K:M side panel: "Total Volume" | value | timestamp,  "Update Daily" | timestamp */
  function sidePanel(sheet) {
    var out = { volumeDay: '', updateDay: '' };
    if (!sheet) return out;
    var rows = sheet.getRange('K1:M20').getDisplayValues();
    rows.forEach(function (r) {
      var k = String(r[0]).trim();
      if (k === 'Total Volume') out.volumeDay = stampDay(r[2]);
      if (k === 'Update Daily') out.updateDay = stampDay(r[1]);
    });
    return out;
  }

  function loadSent(today) {
    var raw = PropertiesService.getScriptProperties().getProperty(SENT_PREFIX + today);
    try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
  }

  function collect(now, opts) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var today = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
    var built = SpxSync_.buildPayload(ss).payload;
    var kpis = built.fleet && built.fleet.cols && built.fleet.cols.homeKpis;
    var side = sidePanel(ss.getSheetByName(C.DAILY_SHEET));
    var input = {
      today: today,
      time: Utilities.formatDate(now, TZ, 'HH:mm'),
      drivers: built.daily ? built.daily.drivers : [],
      todayVolume: kpis ? num(kpis.todayVolume) : null,
      volumeDay: side.volumeDay,
      updateDay: side.updateDay,
      pdtyTarget: num(labelValue(ss.getSheetByName(C.SUMMARY_SHEET), C.PDTY.targetLabel)),
      sent: opts && opts.ignoreSent ? {} : loadSent(today)
    };
    var r = evaluate(input);
    r.today = today;
    r.time = input.time;
    return r;
  }

  function format(r) {
    var d = r.today.split('-');
    return '⚠️ แจ้งเตือน ' + C.HUB + ' · ' + d[2] + '/' + d[1] + ' ' + r.time + '\n\n' +
      r.alerts.map(function (a) { return a.text; }).join('\n\n');
  }

  function markSent(today, alerts) {
    var p = PropertiesService.getScriptProperties();
    var sent = loadSent(today);
    alerts.forEach(function (a) { (a.keys || [a.key]).forEach(function (k) { sent[k] = true; }); });
    p.setProperty(SENT_PREFIX + today, JSON.stringify(sent));
    // keep only today's record
    Object.keys(p.getProperties()).forEach(function (k) {
      if (k.indexOf(SENT_PREFIX) === 0 && k !== SENT_PREFIX + today) p.deleteProperty(k);
    });
  }

  function webhook() {
    var url = PropertiesService.getScriptProperties().getProperty(C.WEBHOOK_PROP);
    if (!url) throw new Error('ยังไม่ได้ตั้ง Script property ' + C.WEBHOOK_PROP);
    if (!/^https:\/\/openapi\.seatalk\.io\/webhook\/group\//.test(url)) throw new Error(C.WEBHOOK_PROP + ' ไม่ใช่ SeaTalk group webhook');
    return url;
  }

  function send(text) {
    var res = UrlFetchApp.fetch(webhook(), {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ tag: 'text', text: { content: text } })
    });
    var body = {};
    try { body = JSON.parse(res.getContentText()); } catch (e) { /* non-JSON */ }
    if (res.getResponseCode() !== 200 || body.code !== 0) {
      throw new Error('SeaTalk ตอบกลับ ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
    }
  }

  return { evaluate: evaluate, collect: collect, format: format, markSent: markSent, send: send, webhook: webhook, stampDay: stampDay };
})();
