const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const {
  REMOVAL_INVENTORY_ROUTE,
  parseRemovalInventoryPageInspection,
  redactUrl,
} = require('../../src/removal_inventory_fields');

const ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');

function formatYmd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const eqIndex = item.indexOf('=');
    if (eqIndex >= 0) {
      options[item.slice(2, eqIndex)] = item.slice(eqIndex + 1);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = '1';
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const businessDate = String(options.date || options.businessDate || formatYmd(new Date())).slice(0, 10);
const previewLimit = Number(options.previewLimit || options['preview-limit'] || 10);
const outputFile = options.out || path.join(SNAPSHOT_DIR, `removal_inventory_fields_${businessDate}.json`);

function listTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function findInventoryTab() {
  const tabs = await listTabs();
  const tab = tabs.find(item => String(item.url || '').includes('sellerinventory.yswg.com.cn')) ||
    tabs.find(item => String(item.url || '').startsWith('http'));
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error('Cannot find sellerinventory tab on port 9222. Run npm run chrome:debug and log in to sellerinventory.yswg.com.cn first.');
  }
  return tab;
}

function createDevtoolsClient(ws) {
  let nextId = 1;
  return function send(method, params = {}, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      const timer = setTimeout(() => {
        ws.off('message', handler);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      const handler = data => {
        const response = JSON.parse(data);
        if (response.id !== id) return;
        clearTimeout(timer);
        ws.off('message', handler);
        if (response.error) return reject(new Error(JSON.stringify(response.error)));
        resolve(response.result);
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractionExpression() {
  return `
    (async () => {
      const route = ${JSON.stringify(REMOVAL_INVENTORY_ROUTE)};
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const clean = value => String(value || '').replace(/\\s+/g, ' ').trim();
      const visible = element => {
        if (!element) return false;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (element.type === 'hidden') return false;
        return element.getClientRects().length > 0 || !!clean(element.textContent || element.value || element.placeholder);
      };
      const waitForReady = async () => {
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
          if (document.readyState === 'complete' || document.readyState === 'interactive') return;
          await sleep(250);
        }
      };
      const docsForPage = () => {
        const docs = [{ url: location.href, title: document.title, doc: document }];
        for (const frame of Array.from(document.querySelectorAll('iframe'))) {
          try {
            const doc = frame.contentDocument;
            if (doc) docs.push({ url: frame.src || doc.location?.href || '', title: doc.title || frame.title || '', doc });
          } catch (_) {}
        }
        return docs;
      };
      const cleanHeader = value => clean(String(value || '').replace(/<br\\s*\\/?>/gi, ' / ').replace(/<[^>]+>/g, ' '));
      const labelFor = (doc, element) => {
        const id = element.getAttribute('id');
        const labels = [];
        if (id) labels.push(doc.querySelector('label[for="' + CSS.escape(id) + '"]')?.innerText);
        labels.push(element.closest('.layui-form-item')?.querySelector('.layui-form-label')?.innerText);
        labels.push(element.closest('.form-group')?.querySelector('label')?.innerText);
        labels.push(element.closest('label')?.innerText);
        labels.push(element.getAttribute('aria-label'));
        labels.push(element.getAttribute('placeholder'));
        labels.push(element.getAttribute('name'));
        labels.push(element.getAttribute('id'));
        return clean(labels.find(Boolean));
      };
      const elementControl = element => {
        const tag = element.tagName.toLowerCase();
        const type = element.getAttribute('type') || (tag === 'select' ? 'select-one' : tag);
        if (['hidden', 'submit', 'button', 'reset', 'password'].includes(type)) return null;
        if (!visible(element)) return null;
        return {
          label: '',
          name: element.getAttribute('name') || '',
          id: element.getAttribute('id') || '',
          type,
          value: element.value || '',
          placeholder: element.getAttribute('placeholder') || '',
          options: tag === 'select'
            ? Array.from(element.options || []).map(option => clean(option.textContent || option.value)).filter(Boolean).slice(0, 30)
            : []
        };
      };
      const controlsFromDoc = doc => {
        const groups = Array.from(doc.querySelectorAll('.layui-inline,.form-group'));
        if (groups.length) {
          return groups.map(group => {
            const label = clean(group.querySelector('.layui-form-label,label')?.innerText || '');
            const rawControls = Array.from(group.querySelectorAll('input,select,textarea'))
              .map(elementControl)
              .filter(item => item && (item.name || item.id || item.placeholder || item.options.length));
            const namedControls = rawControls.filter(item => item.name || item.id);
            const usable = namedControls.length ? namedControls : rawControls;
            if (!label && !usable.length) return null;
            const names = Array.from(new Set(usable.map(item => item.name).filter(Boolean)));
            const ids = Array.from(new Set(usable.map(item => item.id).filter(Boolean)));
            const types = Array.from(new Set(usable.map(item => item.type).filter(Boolean)));
            const values = Array.from(new Set(usable.map(item => item.value).filter(Boolean)));
            const placeholders = Array.from(new Set(usable.map(item => item.placeholder).filter(Boolean)));
            const options = Array.from(new Set(usable.flatMap(item => item.options || []).filter(Boolean)));
            return {
              label,
              name: names.join(','),
              id: ids.join(','),
              type: types.join(',') || 'text',
              value: values.join(','),
              placeholder: placeholders.join(' / '),
              options: options.slice(0, 30),
            };
          }).filter(Boolean);
        }
        return Array.from(doc.querySelectorAll('input,select,textarea'))
          .map(element => {
            const control = elementControl(element);
            if (!control) return null;
            control.label = labelFor(doc, element);
            return control;
          })
          .filter(Boolean);
      };
      const scriptColumnHeaders = doc => {
        const scriptText = Array.from(doc.scripts || []).map(script => script.textContent || '').join('\\n');
        const colsIndex = scriptText.indexOf('cols: [[');
        const endCandidates = ['page:', 'limits:', 'parseData', 'done:']
          .map(marker => scriptText.indexOf(marker, Math.max(0, colsIndex)))
          .filter(index => index > colsIndex);
        const endIndex = endCandidates.length ? Math.min(...endCandidates) : scriptText.length;
        const tableScript = colsIndex >= 0 ? scriptText.slice(colsIndex, endIndex) : scriptText;
        const titles = Array.from(tableScript.matchAll(/title\\s*:\\s*(['"\`])([\\s\\S]*?)\\1/g))
          .map(match => cleanHeader(match[2]))
          .filter(value => value && value.length <= 120 && !/[{};]/.test(value));
        const fields = Array.from(tableScript.matchAll(/field\\s*:\\s*(['"\`])([A-Za-z0-9_]+)\\1/g))
          .map(match => clean(match[2]))
          .filter(Boolean);
        return titles.length ? titles : fields;
      };
      const tableFromDoc = doc => {
        const headerCandidates = Array.from(doc.querySelectorAll('.layui-table-header th, table th'))
          .map(th => clean(th.innerText || th.textContent || th.getAttribute('data-field')))
          .filter(value => value && !['checkbox', 'radio'].includes(value.toLowerCase()));
        const seen = new Set();
        const headers = headerCandidates.filter(value => {
          if (seen.has(value)) return false;
          seen.add(value);
          return true;
        });
        if (!headers.length) {
          for (const header of scriptColumnHeaders(doc)) {
            if (!seen.has(header)) {
              seen.add(header);
              headers.push(header);
            }
          }
        }
        const rowSelectors = headers.length ? '.layui-table-body tbody tr, table tbody tr' : 'table tbody tr';
        const rows = Array.from(doc.querySelectorAll(rowSelectors))
          .filter(visible)
          .map(row => Array.from(row.querySelectorAll('td'))
            .map(cell => clean(cell.innerText || cell.textContent))
            .filter((value, index) => value || index < headers.length))
          .filter(row => row.some(Boolean))
          .filter(row => !row.join(' ').includes('\\u6682\\u65e0\\u6570\\u636e'))
          .slice(0, 50);
        return { headers, rows };
      };
      const summaryFromDoc = doc => Array.from(doc.querySelectorAll('.layui-laypage-count,.summary,.statistics,[class*="total"],[class*="summary"]'))
        .map(element => clean(element.innerText || element.textContent))
        .filter(value => value && /(\\u5408\\u8ba1|\\u603b\\u8ba1|\\u5171\\s*\\d+|total|summary)/i.test(value))
        .slice(0, 30);
      const endpointHintsFromDoc = doc => {
        const hints = new Set();
        const add = value => {
          const matchText = String(value || '');
          for (const match of matchText.matchAll(/\\/internalControl\\/inventory\\/[A-Za-z0-9_/-]*/g)) {
            hints.add(match[0]);
          }
        };
        add(doc.documentElement?.innerHTML || '');
        for (const script of Array.from(doc.scripts || [])) add(script.textContent || script.src || '');
        return Array.from(hints).slice(0, 40);
      };

      await waitForReady();
      await sleep(2500);
      const frames = docsForPage().map(item => {
        const doc = item.doc;
        const controls = controlsFromDoc(doc);
        const buttons = Array.from(doc.querySelectorAll('button,input[type="button"],input[type="submit"],.layui-btn'))
          .filter(visible)
          .map(element => clean(element.innerText || element.value || element.textContent))
          .filter(Boolean)
          .slice(0, 40);
        return {
          url: item.url,
          title: item.title,
          controls,
          buttons,
          table: tableFromDoc(doc),
          summaryTexts: summaryFromDoc(doc),
          endpointHints: endpointHintsFromDoc(doc),
        };
      });
      return {
        capturedAt: new Date().toISOString(),
        page: { url: location.href, title: document.title },
        route,
        frames,
      };
    })()
  `;
}

async function fetchRemovalInventoryFields() {
  const tab = await findInventoryTab();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));
  const send = createDevtoolsClient(ws);
  try {
    const targetUrl = `https://sellerinventory.yswg.com.cn${REMOVAL_INVENTORY_ROUTE}`;
    await send('Page.enable', {}, 10000);
    await send('Page.navigate', { url: targetUrl }, 30000);
    await delay(5000);
    const result = await send('Runtime.evaluate', {
      expression: extractionExpression(),
      awaitPromise: true,
      returnByValue: true,
    });
    const raw = result?.result?.value || {};
    const payload = parseRemovalInventoryPageInspection(raw, { previewLimit });
    payload.businessDate = businessDate;
    payload.source = {
      system: 'sellerinventory',
      route: REMOVAL_INVENTORY_ROUTE,
      tabUrl: redactUrl(raw?.page?.url || tab.url || ''),
    };
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf8');
    console.log(JSON.stringify({
      ok: true,
      outputFile,
      page: payload.page,
      filters: payload.filters.map(item => item.label).filter(Boolean),
      actions: payload.actions,
      tableColumns: payload.table.columns,
      visibleRowCount: payload.table.visibleRowCount,
      summaryFields: payload.summaryFields,
      endpointHints: payload.endpointHints,
      warnings: payload.warnings,
      boundary: payload.boundary,
    }, null, 2));
  } finally {
    ws.close();
  }
}

if (require.main === module) {
  fetchRemovalInventoryFields().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  fetchRemovalInventoryFields,
  parseArgs,
};
