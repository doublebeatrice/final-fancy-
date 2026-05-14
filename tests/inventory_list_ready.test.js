const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const panelPath = path.join(__dirname, '..', 'extension', 'panel.js');
const panelSource = fs.readFileSync(panelPath, 'utf8');

function extractFunction(name) {
  const start = panelSource.indexOf(`function ${name}`);
  assert.notStrictEqual(start, -1, `${name} should exist in panel.js`);
  const bodyStart = panelSource.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < panelSource.length; i += 1) {
    const char = panelSource[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return panelSource.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function loadFunction(name) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${extractFunction(name)}; this.fn = ${name};`, context);
  return context.fn;
}

function fakeDoc({ readyState = 'complete', searchBtn = false, tableMarker = false } = {}) {
  return {
    readyState,
    querySelector(selector) {
      if (selector === 'input.search_btn') return searchBtn ? {} : null;
      if (selector === '.layui-table-view,.layui-table-main,table') return tableMarker ? {} : null;
      return null;
    },
  };
}

const isInventoryListFrameReady = loadFunction('isInventoryListFrameReady');

assert.strictEqual(
  isInventoryListFrameReady(fakeDoc({ searchBtn: true }), {}),
  true,
  'ready product list frame should not require window.list_table'
);

assert.strictEqual(
  isInventoryListFrameReady(fakeDoc({ readyState: 'loading', searchBtn: true }), {}),
  false,
  'loading frame is not ready'
);

assert.strictEqual(
  isInventoryListFrameReady(fakeDoc(), {}),
  false,
  'frame without query/table markers is not ready'
);

console.log('inventory_list_ready.test.js passed');
