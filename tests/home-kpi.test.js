'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/home.js'), 'utf8');

function loadHome() {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', style: {}, setAttribute() {}, addEventListener() {} });
      return elements.get(id);
    },
    addEventListener() {},
    querySelector() { return null; }
  };
  const window = {};
  vm.runInNewContext(source, { window, document, setInterval() {} }, { filename: 'assets/home.js' });
  return { home: window.SPX_HOME, elements };
}

test('PDTY = Assign / (Active 2W + Active 4W)', () => {
  const { home } = loadHome();
  const result = home.calculate({
    assign: 600,
    delivered: 1,
    people: [
      { position: '2WH', assign: 1 },
      { position: '4WH', assign: 1 },
      { position: 'unknown', assign: 1 },
      { position: '2WH', assign: 0 }
    ]
  }, { todayVolume: 100 });
  assert.equal(result.active2, 1);
  assert.equal(result.active4, 1);
  assert.equal(result.pdty, 300);
});

test('SLA = Delivered / Today\'s Volume; Assign does not act as the denominator', () => {
  const { home } = loadHome();
  const result = home.calculate({
    assign: 500,
    delivered: 90,
    people: [{ position: '2WH', assign: 1 }]
  }, { todayVolume: 100 });
  assert.equal(result.sla, 0.9);
});

test('PDTY and SLA display unavailable when their denominators are zero', () => {
  const { home } = loadHome();
  const result = home.calculate({
    assign: 10,
    delivered: 0,
    people: [{ position: '2WH', assign: 0 }]
  }, { todayVolume: 0 });
  assert.equal(result.pdty, null);
  assert.equal(result.sla, null);
});

test('2W and 4W Allocation formulas remain unchanged', () => {
  const { home } = loadHome();
  const result = home.calculate({
    assign: 100,
    delivered: 50,
    people: [
      { position: '2WH', assign: 70 },
      { position: '4WH', assign: 30 }
    ]
  }, { todayVolume: 100 });
  assert.equal(result.allocation2, 0.7);
  assert.equal(result.allocation4, 0.3);
});

test('Home card labels and cache keys match the revised formulas', () => {
  assert.match(source, /Assign ÷ \(Active 2W \+ Active 4W\)/);
  assert.match(source, /Delivered ÷ Today\\?'s Volume × 100/);
  assert.match(source, /calculate\(t,metrics\)/);
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(index, /assets\/home\.js\?v=\d{8}[a-z0-9]+/);
  assert.match(sw, /var VERSION = '\d{8}[a-z0-9]+'/);
});
