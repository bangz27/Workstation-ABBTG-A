// ==UserScript==
// @name         ABBTG-A AMH-LM → Google Sheet (ภาพรวม Last Mile)
// @namespace    abbtg-a
// @version      1.0
// @description  ปุ่ม 📤 บนหน้า FMS AMH-LM (Hub Overview): อ่านตัวเลขที่แสดงบนหน้า แล้วส่งเข้าแท็บ AMH-LM ของ [ABBTG-A] Dashboard Last Mile → หน้า "ภาพรวม Last Mile" ใน Workstation อัปเดตทันที
// @match        https://spx.shopee.co.th/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  /* ===== ตั้งค่า ===== */
  const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxXNsSxEIF3e-9BYUbazA-4oprMnvjDlZnxPtwzsMa8esRuuooBbqR5rt64dQ2knac3yw/exec';  // web app เดียวกับ Fleet Import
  const TOKEN = '';                            // ใส่ตอนติดตั้ง: ค่าเดียวกับ Script property AMH_LM_IMPORT_TOKEN (ห้าม commit ค่าจริง — repo นี้เป็น public)
  const REFRESH_MIN = 15;                      // ส่งอัตโนมัติ: รีโหลดหน้าแล้วส่งทุก ๆ กี่นาที (เมื่อเปิดสวิตช์)
  const ROUTE = /#\/dashboard\/all-mile-hub\/lm/;
  const AUTO_KEY = 'abbtg-amh-auto', PENDING_KEY = 'abbtg-amh-pending';

  const store = {
    get(k, s) { try { return (s || localStorage).getItem(k); } catch (e) { return null; } },
    set(k, v, s) { try { (s || localStorage).setItem(k, v); } catch (e) { /* ignore */ } },
    del(k, s) { try { (s || localStorage).removeItem(k); } catch (e) { /* ignore */ } },
  };
  const onPage = () => ROUTE.test(location.hash);
  const pad = n => String(n).padStart(2, '0');
  const hhmm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());

  /* ===== อ่านตัวเลขจากข้อความบนหน้า (ไม่ยิง API ของ FMS) ===== */
  function extract() {
    const s = document.body.innerText;
    const at = (a, from) => s.indexOf(a, from || 0);
    const start = at('Forecast');
    if (start < 0 || !/Today's Volume\s*\n[\d,]+/.test(s)) return null;          // page not loaded yet
    const sec = (a, b) => { const i = at(a, start); if (i < 0) return ''; const j = b ? at(b, i + a.length) : -1; return s.slice(i, j < 0 ? undefined : j); };
    const num = v => { if (v == null) return ''; const t = String(v).replace(/[,\s฿%]/g, ''); return t === '' || t === '-' || !isFinite(+t) ? '' : +t; };
    const after = (txt, label) => { const m = txt.match(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n([^\\n]+)')); return m ? num(m[1]) : ''; };
    const bkk = new Date(Date.now() + 7 * 3600e3), bd = new Date(bkk.getTime() - 9 * 3600e3);   // FMS day: 09:00 → 09:00 Bangkok
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const readStamp = `${pad(bkk.getUTCDate())} ${MON[bkk.getUTCMonth()]} ${pad(bkk.getUTCHours())}:${pad(bkk.getUTCMinutes())}`;
    const S = {
      forecast: sec('Forecast', 'Order Volume'), volume: sec('Order Volume', 'Days to Process'), dtp: sec('Days to Process', 'Backlog'),
      backlog: sec('Backlog', 'To Expedite'), expedite: sec('To Expedite', 'Linehaul Trip'), lh: sec('Linehaul Trip', 'Operation Progress'),
      progress: sec('Operation Progress', 'Fleet Head Counts'), head: sec('Fleet Head Counts', 'Fleet Productivity'),
      prod: sec('Fleet Productivity', 'Finance'), fin: sec('Finance')
    };
    const stamps = {};
    Object.keys(S).forEach(k => { const m = S[k].match(/Updated:\s*(\d{1,2} [A-Z][a-z]{2} \d{1,2}:\d{2})/); stamps[k] = m ? m[1] : readStamp; });
    const avg = [...S.volume.matchAll(/Avg\. L7D\s*\n([^\n]+)/g)].map(m => num(m[1]));
    const att = [...S.head.matchAll(/Attendance Rate\s*\n([^\n]+)/g)].map(m => num(m[1]));
    const dtp = S.dtp.match(/Days to Process\/Target\s*\n([^\n]+)\n\/\s*([^\n]+)/);
    const kpi = {
      'est_inbound|': [after(S.forecast, 'LM Est. Inbound'), 'forecast'], 'actual_inbound|': [after(S.forecast, 'Actual Inbounded'), 'forecast'],
      'forward_inbounded|': [after(S.volume, 'Total Forward Inbounded'), 'volume'], 'return_inbounded|': [after(S.volume, 'Total Return Inbounded'), 'volume'],
      'delivered_to_buyer|': [after(S.volume, 'Total Delivered to Buyer'), 'volume'], 'avg_l7d_delivered|': [avg[0] ?? '', 'volume'],
      'returned_to_seller|': [after(S.volume, 'Total Returned to Seller'), 'volume'], 'avg_l7d_returned|': [avg[1] ?? '', 'volume'],
      'dtp_value|': [dtp ? num(dtp[1]) : '', 'dtp'], 'dtp_target|': [dtp ? num(dtp[2]) : '', 'dtp'],
      'expedite|total': [after(S.expedite, '\nExpedite'), 'expedite'], 'super_expedite|total': [after(S.expedite, 'Super Expedite'), 'expedite'],
      'lh_loading|': [after(S.lh, 'Loading'), 'lh'], 'lh_transporting|': [after(S.lh, 'Transporting'), 'lh'],
      'today_volume|': [after(S.progress, "Today's Volume"), 'progress'], 'to_handover|': [after(S.progress, 'To Handover'), 'progress'],
      'to_deliver|': [after(S.progress, 'To Deliver'), 'progress'], 'completion_rate|': [after(S.progress, 'Completion Rate'), 'progress'],
      'cfr|': [after(S.progress, 'Clear Floor Rate (CFR)'), 'progress'], 'delivering_attempted|': [after(S.progress, 'Delivering attempted'), 'progress'],
      'ft_headcount|': [after(S.head, 'Full-Time'), 'head'], 'pt_headcount|': [after(S.head, 'Part-Time'), 'head'],
      'ft_attendance_rate|': [att[0] ?? '', 'head'], 'pt_attendance_rate|': [att[1] ?? '', 'head'],
      'ft_orders_per_rider|total': [after(S.prod, 'Full-Time'), 'prod'], 'pt_orders_per_rider|total': [after(S.prod, 'Part-Time'), 'prod'],
      'cod_pending_baht|': [after(S.fin, 'Pending COD Collection'), 'fin']
    };
    const aging = /LM Leg Aging/.test(S.backlog) ? 'leg_aging' : /LM Hub Aging/.test(S.backlog) ? 'hub_aging' : '';
    const backlog = {};
    for (const m of S.backlog.matchAll(/^(>6 Days|3-6 Days|1-2 Days)\t([\d,]+)\t([\d,]+)\t([\d,]+)/gm)) backlog[`${m[1]}|total/${aging}`] = [num(m[2]), num(m[3]), num(m[4])];
    const trips = [...S.lh.matchAll(/(LT[0-9A-Z]+)\t\s*([0-9:]*)\s*\t\s*([0-9:]*)\s*\t([\d,]+)\t([^\n]+)/g)].slice(0, 5)
      .map(m => [m[1], m[5].trim(), num(m[4]), m[2], m[3]]);
    const STAGE = { Transported: 'transported', Received: 'received', Assigning: 'assigning', Assigned: 'assigned', Delivering: 'delivering', Delivered: 'delivered', 'On-hold': 'on_hold' };
    const prog = {};
    for (const m of S.progress.matchAll(/^(Transported|Received|Assigning|Assigned|Delivering|Delivered|On-hold)\t([\d,-]+)\t([\d,-]+)\t\s*([\d,-]+)/gm)) prog[`${STAGE[m[1]]}|before_cutoff`] = [num(m[2]), num(m[3]), num(m[4])];
    const fleet = {};
    for (const m of S.head.matchAll(/^(2WH|4WH|Others)\t(\d+)\/(\d+)\t(\d+)\/(\d+)/gm)) { fleet[`${m[1]}|full_time`] = [num(m[2]), num(m[3])]; fleet[`${m[1]}|part_time`] = [num(m[4]), num(m[5])]; }
    for (const m of S.prod.matchAll(/^(2WH|4WH|Others)\t(\d+)\/(\d+)\t(\d+)\/(\d+)/gm)) {
      const f = fleet[`${m[1]}|full_time`] = fleet[`${m[1]}|full_time`] || ['', '']; f[2] = num(m[2]); f[3] = num(m[3]);
      const p = fleet[`${m[1]}|part_time`] = fleet[`${m[1]}|part_time`] || ['', '']; p[2] = num(m[4]); p[3] = num(m[5]);
    }
    const COD = { Today: 'today', '1-3 Days': '1_3_days', '4-5 Days': '4_5_days', '>5 Days': 'over_5_days' }, cod = {};
    for (const m of S.fin.matchAll(/^(Today|1-3 Days|4-5 Days|>5 Days)\t([\d,]+)\t(฿?[\d,]+)/gm)) cod[COD[m[1]]] = [num(m[2]), num(m[3])];
    const businessDate = `${bd.getUTCFullYear()}-${pad(bd.getUTCMonth() + 1)}-${pad(bd.getUTCDate())}`;
    const count = Object.values(kpi).filter(v => v[0] !== '').length + Object.keys(backlog).length + trips.length + Object.keys(prog).length;
    return { businessDate, readStamp, stamps, kpi, backlog, trips, prog, fleet, cod, count };
  }

  /* ===== ส่งเข้า Google Sheet ===== */
  let busy = false;
  function send(auto) {
    if (busy) return;
    const data = extract();
    if (!data) { setStatus('⏳ หน้ายังโหลดตัวเลขไม่ครบ — รอสักครู่แล้วกดใหม่', true); return; }
    if (data.count < 20) { setStatus(`⚠️ อ่านได้แค่ ${data.count} ค่า — รีเฟรชหน้าแล้วลองใหม่`, true); return; }
    busy = true; setStatus(`กำลังส่ง ${data.count} ค่า…`);
    GM_xmlhttpRequest({
      method: 'POST', url: WEBAPP_URL, headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      data: JSON.stringify({ amhLmImport: true, token: TOKEN, data }),
      timeout: 60000,
      onload: r => {
        busy = false;
        let j = null; try { j = JSON.parse(r.responseText); } catch (e) { /* not JSON */ }
        if (j && j.ok) setStatus(`✅ ส่งแล้ว ${hhmm(new Date())} · ${j.filled} แถว · วันทำงาน ${j.businessDate}${auto ? ' (อัตโนมัติ)' : ''}`);
        else setStatus('❌ ส่งไม่สำเร็จ: ' + (j ? (j.error || ('ซิงก์: ' + j.sync)) : ('HTTP ' + r.status)), true);
      },
      onerror: () => { busy = false; setStatus('❌ ต่อ Google ไม่ได้ (เน็ต?)', true); },
      ontimeout: () => { busy = false; setStatus('❌ Google ตอบช้าเกินไป ลองใหม่', true); }
    });
  }

  /* ===== ส่งอัตโนมัติทุก REFRESH_MIN นาที (เฉพาะตอนเปิดหน้า AMH-LM ค้างไว้) ===== */
  let timer = null, nextAt = null;
  const autoOn = () => store.get(AUTO_KEY) === '1';
  function schedule() {
    clearTimeout(timer);
    if (!autoOn() || !onPage()) { nextAt = null; render(); return; }
    nextAt = new Date(Date.now() + REFRESH_MIN * 60000);
    timer = setTimeout(() => { if (autoOn() && onPage()) { store.set(PENDING_KEY, '1', sessionStorage); location.reload(); } }, REFRESH_MIN * 60000);
    render();
  }
  function afterLoad() {                       // after an auto reload: wait for the numbers, then send once
    if (store.get(PENDING_KEY, sessionStorage) !== '1' || !onPage()) return;
    let tries = 0;
    const iv = setInterval(() => {
      if (extract() || ++tries > 30) { clearInterval(iv); store.del(PENDING_KEY, sessionStorage); if (extract()) send(true); schedule(); }
    }, 2000);
  }

  /* ===== ปุ่มบนหน้า ===== */
  let box = null, statusEl = null, autoEl = null;
  function ui() {
    if (box) { box.style.display = onPage() ? 'flex' : 'none'; return; }
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;flex-direction:column;gap:6px;align-items:flex-end;font:13px/1.4 sans-serif';
    const btn = document.createElement('button');
    btn.textContent = '📤 ส่ง AMH-LM เข้าชีต';
    btn.style.cssText = 'padding:8px 14px;border:2px solid #23272B;border-radius:8px;background:#FFC20E;color:#23272B;font-weight:700;cursor:pointer';
    btn.onclick = () => send(false);
    autoEl = document.createElement('label');
    autoEl.style.cssText = 'background:#fff;border:1px solid #C9CDD2;border-radius:6px;padding:3px 8px;cursor:pointer';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = autoOn(); cb.style.marginRight = '6px';
    cb.onchange = () => { if (cb.checked) store.set(AUTO_KEY, '1'); else store.del(AUTO_KEY); schedule(); };
    autoEl.append(cb, document.createTextNode(''));
    statusEl = document.createElement('div');
    statusEl.style.cssText = 'background:#fff;border:1px solid #C9CDD2;border-radius:6px;padding:3px 8px;max-width:340px';
    statusEl.textContent = 'พร้อมส่ง';
    box.append(statusEl, autoEl, btn);
    document.body.appendChild(box);
    box.style.display = onPage() ? 'flex' : 'none';
    render();
  }
  function render() {
    if (!autoEl) return;
    autoEl.lastChild.textContent = `ส่งอัตโนมัติทุก ${REFRESH_MIN} นาที` + (nextAt ? ` · รอบถัดไป ${hhmm(nextAt)}` : '');
  }
  function setStatus(t, bad) { if (!statusEl) ui(); statusEl.textContent = t; statusEl.style.color = bad ? '#C8372D' : '#23272B'; }

  if (globalThis.__AMH_TEST__) { globalThis.__AMH_TEST__.extract = extract; return; }   // tests/amh-lm-import.test.js
  window.addEventListener('hashchange', () => { ui(); schedule(); });
  ui(); schedule(); afterLoad();
})();
