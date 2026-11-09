/* จัดกะ FMS — pure logic (no DOM). Shared by planner.js and tests/shift-planner.test.js. */
(function(root){
  'use strict';
  var TH_WD = ['อา','จ','อ','พ','พฤ','ศ','ส'];          // index = JS getDay()
  var EN_WD = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var WEEK_ORDER = [1,2,3,4,5,6,0];                      // Mon..Sun for pickers
  var SHIFTS = [];                                       // 9-hour shifts every hour: 0000-0900 … 2300-0800
  for (var h = 0; h < 24; h++) SHIFTS.push(pad(h) + '00-' + pad((h + 9) % 24) + '00');
  var POS = {
    driver: ['2W Shipper','4W Shipper','2W Shipper (Subcon Monthly)','4W Shipper (Subcon Monthly)','4W First Mile','4W First Mile (PROJ)','Subcon Monthly'],
    ops: ['Hub Agent','Hub Agent Support','Senior Agent','Agent, Hub','Assistant Supervisor, Hub','Hub Supervisor']
  };
  var FUNCS = ['Pickup+Delivery','Delivery','Pickup','LH'];

  function pad(n){ return String(n).padStart(2, '0'); }
  function wdOf(iso){ var p = iso.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); }
  function daysInMonth(ym){
    var p = ym.split('-').map(Number), n = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate(), out = [];
    for (var d = 1; d <= n; d++) out.push(p[0] + '-' + pad(p[1]) + '-' + pad(d));
    return out;
  }
  function addMonths(ym, k){ var p = ym.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1 + k, 1)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1); }
  function bkkMonth(now){
    var parts = new Intl.DateTimeFormat('en-CA', {year:'numeric', month:'2-digit', timeZone:'Asia/Bangkok'}).formatToParts(now || new Date());
    return parts.find(function(x){ return x.type === 'year'; }).value + '-' + parts.find(function(x){ return x.type === 'month'; }).value;
  }
  function monthLabel(ym){
    var p = ym.split('-').map(Number);
    var names = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    return names[p[1] - 1] + ' ' + (p[0] + 543);
  }
  function shortDate(iso){
    var m = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    var p = iso.split('-').map(Number); return p[2] + ' ' + m[p[1] - 1];
  }
  function normId(type, v){
    v = String(v == null ? '' : v).trim();
    if (type === 'ops') return /^\d+$/.test(v) ? 'Ops' + v : v.replace(/^ops\s*/i, 'Ops');
    return v;
  }
  function uid(){ return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

  function emptyData(){
    return { version: 2, settings: { station: 'ABBTG-A - บางบัวทอง', rdCode: 'RD' }, employees: [], overrides: {} };
  }
  function newEmp(type, o){
    var e = { id: uid(), type: type === 'ops' ? 'ops' : 'driver', wid: '', empId: '', name: '', nick: '', dept: '', func: type === 'ops' ? '' : 'Pickup+Delivery',
      pos: '', shift: '', offDays: [], comp: [], status: 'active', startDate: '', resignDate: '', note: '' };
    return Object.assign(e, o || {});
  }
  /* accepts the old planner's data (comp:[3 slots]) and returns the current shape */
  function migrate(x){
    var d = emptyData();
    if (!x || typeof x !== 'object') return d;
    d.settings = Object.assign(d.settings, x.settings || {});
    d.employees = (Array.isArray(x.employees) ? x.employees : []).map(function(e){
      var t = e && e.type === 'ops' ? 'ops' : 'driver';
      var n = newEmp(t, e);
      n.type = t;
      n.wid = normId(t, n.wid);
      n.offDays = (Array.isArray(n.offDays) ? n.offDays : []).map(Number).filter(function(v){ return v >= 0 && v <= 6; });
      n.comp = (Array.isArray(n.comp) ? n.comp : []).filter(function(v){ return /^\d{4}-\d{2}-\d{2}$/.test(v); });
      n.comp = n.comp.filter(function(v, i){ return n.comp.indexOf(v) === i; }).sort();
      n.status = n.status === 'resigned' ? 'resigned' : 'active';
      return n;
    });
    d.overrides = x.overrides && typeof x.overrides === 'object' ? x.overrides : {};
    return d;
  }

  function baseValue(D, e, iso){
    var rd = (D.settings && D.settings.rdCode) || 'RD';
    if (e.startDate && iso < e.startDate) return { v: '', k: 'bl' };
    if (e.status === 'resigned' && (!e.resignDate || iso >= e.resignDate)) return { v: '', k: 'bl' };
    if ((e.comp || []).indexOf(iso) >= 0) return { v: rd, k: 'cp' };
    if ((e.offDays || []).indexOf(wdOf(iso)) >= 0) return { v: rd, k: 'rd' };
    return { v: e.shift || '', k: e.shift ? 'w' : 'bl' };
  }
  function cellValue(D, e, iso){
    var key = e.id + '|' + iso, rd = (D.settings && D.settings.rdCode) || 'RD';
    if (D.overrides && Object.prototype.hasOwnProperty.call(D.overrides, key)) {
      var v = D.overrides[key]; if (v === '__rd') v = rd;
      return { v: v, k: v === '' ? 'bl' : v === rd ? 'rd' : 'w', ov: true };
    }
    return baseValue(D, e, iso);
  }
  /* does this person belong in the month's file at all? */
  function inMonth(e, ym){
    var days = daysInMonth(ym), first = days[0], last = days[days.length - 1];
    if (e.startDate && e.startDate > last) return false;
    if (e.status === 'resigned' && (!e.resignDate || e.resignDate <= first)) return false;
    return true;
  }
  function issue(e){
    if (!String(e.wid || '').trim()) return 'ไม่มี ' + (e.type === 'ops' ? 'Ops ID' : 'Driver ID');
    if (!String(e.name || '').trim()) return 'ไม่มีชื่อ';
    if (!e.shift) return 'ยังไม่ตั้งกะ';
    if (!(e.offDays || []).length) return 'ยังไม่ตั้งวันหยุด';
    if (e.type === 'ops' && !/^Ops\d+$/i.test(normId('ops', e.wid))) return 'Ops ID ต้องขึ้นต้นด้วย Ops';
    return '';
  }
  function monthList(D, ym, type){
    return D.employees.filter(function(e){ return (!type || e.type === type) && inMonth(e, ym); });
  }
  function stats(D, ym){
    var list = monthList(D, ym), bad = list.filter(function(e){ return issue(e); });
    function by(t){ var l = list.filter(function(e){ return e.type === t; }); return { total: l.length, bad: l.filter(function(e){ return issue(e); }).length }; }
    return { total: list.length, ok: list.length - bad.length, bad: bad.length, driver: by('driver'), ops: by('ops') };
  }
  function headerFor(type, dates){
    var fixed = type === 'ops' ? ['Ops ID','Staff Name','Department'] : ['Station Name','Driver ID','Employee ID','Staff Name','Function'];
    return fixed.concat(dates.map(function(iso){ return iso + '(' + EN_WD[wdOf(iso)] + ')'; }));
  }
  function rowFor(D, e, dates){
    var fixed = e.type === 'ops'
      ? [normId('ops', e.wid), String(e.name || '').trim(), String(e.dept || e.pos || '').trim()]
      : [D.settings.station, String(e.wid || '').trim(), String(e.empId || '').trim(), String(e.name || '').trim(), String(e.func || '').trim()];
    return fixed.concat(dates.map(function(iso){ return cellValue(D, e, iso).v; }));
  }

  /* Read people from a parsed FMS "Dedicated" sheet (see xlsx.js parseDedicated).
     Weekly off = a weekday that is RD on more than half of its occurrences; any other RD date = comp day. */
  function peopleFromFms(p, rd){
    rd = rd || 'RD';
    var out = [];
    p.data.forEach(function(r){
      var e = p.type === 'ops'
        ? newEmp('ops', { wid: normId('ops', r[0]), name: String(r[1] || '').trim(), dept: String(r[2] || '').trim() })
        : newEmp('driver', { wid: String(r[1] || '').trim(), empId: String(r[2] || '').trim(), name: String(r[3] || '').trim(), func: String(r[4] || '').trim() });
      if (!e.wid) return;
      var shiftCount = {}, wdRd = [0,0,0,0,0,0,0], wdAll = [0,0,0,0,0,0,0], rdDates = [];
      p.dates.forEach(function(d){
        var v = String(r[d.ci] == null ? '' : r[d.ci]).trim(), w = wdOf(d.iso);
        if (!v) return;
        wdAll[w]++;
        if (v.split(',').map(function(x){ return x.trim(); }).indexOf(rd) >= 0) { wdRd[w]++; rdDates.push(d.iso); }
        else shiftCount[v] = (shiftCount[v] || 0) + 1;
      });
      var best = ''; Object.keys(shiftCount).forEach(function(k){ if (!best || shiftCount[k] > shiftCount[best]) best = k; });
      e.shift = best;
      e.offDays = [0,1,2,3,4,5,6].filter(function(w){ return wdAll[w] && wdRd[w] / wdAll[w] > 0.5; });
      e.comp = rdDates.filter(function(iso){ return e.offDays.indexOf(wdOf(iso)) < 0; });
      out.push(e);
    });
    return out;
  }
  /* merge imported people into D: match by type + ID, keep local fields the file doesn't carry */
  function mergePeople(D, people){
    var added = 0, updated = 0;
    people.forEach(function(p){
      var cur = D.employees.find(function(e){ return e.type === p.type && normId(e.type, e.wid) === normId(p.type, p.wid); });
      if (!cur) { D.employees.push(p); added++; return; }
      ['name','empId','dept','func','shift'].forEach(function(k){ if (p[k]) cur[k] = p[k]; });
      if (p.offDays.length) cur.offDays = p.offDays;
      p.comp.forEach(function(iso){ if (cur.comp.indexOf(iso) < 0) cur.comp.push(iso); });
      cur.comp.sort();
      updated++;
    });
    return { added: added, updated: updated };
  }

  root.PlannerCore = {
    TH_WD: TH_WD, EN_WD: EN_WD, WEEK_ORDER: WEEK_ORDER, SHIFTS: SHIFTS, POS: POS, FUNCS: FUNCS,
    pad: pad, wdOf: wdOf, daysInMonth: daysInMonth, addMonths: addMonths, bkkMonth: bkkMonth, monthLabel: monthLabel, shortDate: shortDate,
    normId: normId, uid: uid, emptyData: emptyData, newEmp: newEmp, migrate: migrate,
    cellValue: cellValue, inMonth: inMonth, issue: issue, monthList: monthList, stats: stats,
    headerFor: headerFor, rowFor: rowFor, peopleFromFms: peopleFromFms, mergePeople: mergePeople
  };
})(typeof window !== 'undefined' ? window : globalThis);
