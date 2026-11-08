/* จัดกะ FMS — read/write the FMS "Upload Planned HC" .xlsx in the browser (no library).
   Writes into the system template so FMS accepts the file (error 181403009 otherwise). */
(function(root){
"use strict";
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* ---------------- ZIP / XLSX ---------------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function streamBytes(u8, ts) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ts)).arrayBuffer()); }
async function unzip(buf) {
  const dv = new DataView(buf), u = new Uint8Array(buf);
  let e = buf.byteLength - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('ไม่ใช่ไฟล์ .xlsx');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const files = {}, order = [];
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true);
    const data = u.subarray(lo + 30 + lnl + lxl, lo + 30 + lnl + lxl + csize);
    files[name] = method === 0 ? data.slice() : await streamBytes(data, new DecompressionStream('deflate-raw'));
    order.push(name); p += 46 + nl + xl + cl;
  }
  return { files, order };
}
async function zip(files, order) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0; const names = order || Object.keys(files);
  for (const name of names) {
    let data = files[name]; if (typeof data === 'string') data = enc.encode(data);
    const nb = enc.encode(name), crc = crc32(data); let comp = data, method = 0;
    if (data.length > 200 && typeof CompressionStream !== 'undefined') { try { comp = await streamBytes(data, new CompressionStream('deflate-raw')); method = 8; } catch (e) { comp = data; method = 0; } }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, comp.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, comp);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, comp.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nb); off += 30 + nb.length + comp.length;
  }
  const cd = central.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, names.length, true); end.setUint16(10, names.length, true); end.setUint32(12, cd, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const xmlDoc = u8 => new DOMParser().parseFromString(new TextDecoder().decode(u8), 'application/xml');
const colIdx = ref => { const L = ref.match(/^[A-Z]+/)[0]; let n = 0; for (const ch of L) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
function byTag(el, tag) { return Array.from(el.getElementsByTagNameNS('*', tag)); }
function sheetMap(files) {
  const wb = xmlDoc(files['xl/workbook.xml']), rels = xmlDoc(files['xl/_rels/workbook.xml.rels']);
  const rmap = {}; byTag(rels, 'Relationship').forEach(r => rmap[r.getAttribute('Id')] = r.getAttribute('Target'));
  const out = {};
  byTag(wb, 'sheet').forEach(s => { const id = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let t = rmap[id] || ''; t = t.startsWith('/') ? t.slice(1) : 'xl/' + t; out[s.getAttribute('name')] = t; });
  return out;
}
function readSheet(files, path) {
  let sst = [];
  if (files['xl/sharedStrings.xml']) sst = byTag(xmlDoc(files['xl/sharedStrings.xml']), 'si').map(si => byTag(si, 't').filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join(''));
  const doc = xmlDoc(files[path]); const rows = []; const styles = {};
  byTag(doc, 'row').forEach(r => {
    const ri = +r.getAttribute('r') - 1; const arr = rows[ri] = rows[ri] || [];
    byTag(r, 'c').forEach(c => {
      const ref = c.getAttribute('r'), t = c.getAttribute('t'), ci = colIdx(ref);
      if (c.getAttribute('s')) styles[ref] = c.getAttribute('s');
      let v = '';
      if (t === 's') v = sst[+(byTag(c, 'v')[0]?.textContent)] ?? '';
      else if (t === 'inlineStr') v = byTag(c, 't').map(x => x.textContent).join('');
      else v = byTag(c, 'v')[0]?.textContent ?? '';
      arr[ci] = v;
    });
  });
  for (let i = 0; i < rows.length; i++) rows[i] = rows[i] || [];
  return { rows, styles };
}
async function readXlsx(buf) {
  const { files, order } = await unzip(buf);
  const map = sheetMap(files);
  return { files, order, map };
}
/* parse the FMS Dedicated tab */
function parseDedicated(x) {
  const path = x.map['Dedicated']; if (!path) throw new Error('ไม่พบแท็บ "Dedicated" ในไฟล์');
  const { rows, styles } = readSheet(x.files, path);
  const hdr = (rows[2] || []).map(v => String(v || '').trim());
  let type = null, fixed = 0;
  if (/^ops id$/i.test(hdr[0])) { type = 'ops'; fixed = 3; }
  else if (/^station name$/i.test(hdr[0]) && /driver id/i.test(hdr[1] || '')) { type = 'driver'; fixed = 5; }
  else throw new Error('รูปแบบหัวตารางไม่ตรงกับ Template ของ FMS');
  const dates = []; for (let i = fixed; i < hdr.length; i++) { const m = (hdr[i] || '').match(/^(\d{4}-\d{2}-\d{2})/); if (m) dates.push({ ci: i, iso: m[1], label: hdr[i] }); }
  const data = [], dataRowNums = [];
  rows.slice(3).forEach((r, i) => { if (r.some(v => String(v ?? '').trim() !== '')) { data.push(r); dataRowNums.push(i + 4); } });
  return { path, type, fixed, dates, hdr, data, dataRowNums, top: rows.slice(0, 3), styles };
}

/* write rows into a real system template (keeps every other part of the file untouched) */
const dec = u8 => new TextDecoder().decode(u8);
function b64ToU8(b) { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
function sstWriter(files) {
  const xml = files['xl/sharedStrings.xml'] ? dec(files['xl/sharedStrings.xml']) : null;
  const list = xml ? byTag(xmlDoc(files['xl/sharedStrings.xml']), 'si').map(si => byTag(si, 't').filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join('')) : [];
  const idx = new Map(); list.forEach((v, i) => { if (!idx.has(v)) idx.set(v, i); });
  const added = []; let refs = 0;
  return {
    id(v) { refs++; if (idx.has(v)) return idx.get(v); const i = list.length + added.length; added.push(v); idx.set(v, i); return i; },
    ok: !!xml,
    finish() {
      if (!xml) return null;
      let out = xml.replace(/<\/sst>\s*$/, added.map(v => `<si><t xml:space="preserve">${esc(v)}</t></si>`).join('') + '</sst>');
      const uniq = list.length + added.length;
      out = out.replace(/uniqueCount="\d+"/, `uniqueCount="${uniq}"`);
      out = out.replace(/(<sst\b[^>]*?)\scount="(\d+)"/, (m, a, c) => `${a} count="${+c + refs}"`);
      return out;
    }
  };
}
function writeIntoTemplate(base, outRows, newHeader, opts) {
  // outRows: array of {orig: true, ri} (keep original xml) or {vals: [...]} for generated rows
  const files = Object.assign({}, base.files);
  const sx = dec(files[base.path]);
  const sst = sstWriter(files);
  const rowXml = {};
  const re = /<row\b[^>]*?\br="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g; let m;
  while ((m = re.exec(sx))) rowXml[+m[1]] = m[0];
  const idCols = base.type === 'ops' ? [0] : [1, 2];
  const hdrStyle = base.styles['A3'] || base.styles['B3'] || null;
  const cell = (ref, v, isId, st) => {
    if (v === '' || v == null) return '';
    v = String(v); const sa = st ? ` s="${st}"` : '';
    if (isId && opts.numericIds && /^\d{1,15}$/.test(v) && !/^0\d/.test(v)) return `<c r="${ref}"${sa}><v>${v}</v></c>`;
    if (!sst.ok) return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    return `<c r="${ref}"${sa} t="s"><v>${sst.id(v)}</v></c>`;
  };
  let body = '', maxC = 0;
  // rows 1-2 exactly as in the system file; row 3 too unless the month changed
  for (let r = 1; r <= 2; r++) if (rowXml[r]) body += rowXml[r];
  if (newHeader) { body += `<row r="3" spans="1:${newHeader.length}">${newHeader.map((v, ci) => cell(colName(ci) + 3, v, false, hdrStyle)).join('')}</row>`; maxC = newHeader.length; }
  else { if (rowXml[3]) body += rowXml[3]; maxC = base.hdr.length; }
  outRows.forEach((r, i) => {
    const rn = i + 4;
    if (r.orig != null && rowXml[r.orig] && r.orig === rn) { body += rowXml[r.orig]; return; }
    const vals = r.vals; maxC = Math.max(maxC, vals.length);
    body += `<row r="${rn}" spans="1:${vals.length}">${vals.map((v, ci) => cell(colName(ci) + rn, v, idCols.includes(ci))).join('')}</row>`;
  });
  const lastRow = 3 + outRows.length;
  let out;
  const sdStart = sx.search(/<sheetData\b/);
  const sdSelf = /<sheetData\s*\/>/.exec(sx);
  if (sdSelf) out = sx.slice(0, sdSelf.index) + `<sheetData>${body}</sheetData>` + sx.slice(sdSelf.index + sdSelf[0].length);
  else { const e = sx.indexOf('</sheetData>') + '</sheetData>'.length; out = sx.slice(0, sdStart) + `<sheetData>${body}</sheetData>` + sx.slice(e); }
  out = out.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:${colName(Math.max(maxC, 1) - 1)}${lastRow}"/>`);
  files[base.path] = out;
  const sstOut = sst.finish(); if (sstOut) files['xl/sharedStrings.xml'] = sstOut;
  const order = base.order.filter(n => n !== 'xl/calcChain.xml'); delete files['xl/calcChain.xml'];
  if (files['[Content_Types].xml']) files['[Content_Types].xml'] = dec(files['[Content_Types].xml']).replace(/<Override[^>]*calcChain[^>]*\/>/, '');
  return zip(files, order);
}


/* Build the upload file for one type/month.
   base = parsed template (parseDedicated + files/order). Same month as the template → the template's other
   rows are kept untouched and ours are updated in place; different month → template is only the layout. */
async function buildExport(D, type, ym, base) {
  const C = root.PlannerCore;
  if (!base || base.type !== type) throw new Error('ต้องใช้ Template ' + (type === 'ops' ? 'Ops' : 'Driver') + ' จาก FMS');
  const emps = C.monthList(D, ym, type).filter(e => String(e.wid || '').trim());
  const sameMonth = base.dates.length && base.dates[0].iso.slice(0, 7) === ym;
  const dates = sameMonth ? base.dates.map(d => d.iso) : C.daysInMonth(ym);
  const fixedN = base.fixed, idCol = type === 'ops' ? 0 : 1;
  const newHeader = sameMonth ? null : C.headerFor(type, dates);
  const dateCols = sameMonth ? base.dates.map(d => d.ci) : dates.map((_, i) => fixedN + i);
  const byId = new Map(emps.map(e => [C.normId(type, e.wid), e]));
  const used = new Set(), out = [];
  if (sameMonth) {
    base.dataRowNums.forEach((rn, k) => {
      const r = base.data[k], id = C.normId(type, r[idCol]), e = byId.get(id);
      if (!e) { out.push({ orig: rn, vals: r.slice() }); return; }
      used.add(id); const nr = r.slice(), gen = C.rowFor(D, e, []);
      for (let i = 0; i < fixedN; i++) if (gen[i] !== '' && !(type === 'driver' && i === 0 && nr[0])) nr[i] = gen[i];
      base.dates.forEach(d => { nr[d.ci] = C.cellValue(D, e, d.iso).v; });
      out.push({ vals: nr });
    });
  }
  emps.filter(e => !used.has(C.normId(type, e.wid))).forEach(e => {
    const nr = [], gen = C.rowFor(D, e, []);
    for (let i = 0; i < fixedN; i++) nr[i] = gen[i];
    dates.forEach((iso, i) => { nr[dateCols[i]] = C.cellValue(D, e, iso).v; });
    out.push({ vals: nr });
  });
  out.forEach(r => { if (r.vals) for (let j = 0; j < r.vals.length; j++) if (r.vals[j] == null) r.vals[j] = ''; });
  const blob = await writeIntoTemplate(base, out, newHeader, { numericIds: true });
  return { blob, count: emps.length, kept: sameMonth ? base.data.length - used.size : 0, sameMonth };
}
async function parseTemplate(buf) {
  const x = await readXlsx(buf);
  return Object.assign(parseDedicated(x), { files: x.files, order: x.order });
}
function u8ToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }

root.PlannerXlsx = { unzip, zip, readXlsx, parseDedicated, parseTemplate, buildExport, u8ToB64, b64ToU8 };
})(typeof window !== 'undefined' ? window : globalThis);
