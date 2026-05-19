const fs = require('fs');
const path = require('path');
const { evaluate, listTabs } = require('../../discovery/lib/cdp');
const {
  DELETE_ENDPOINT,
  QUERY_ENDPOINT,
  buildEditApplyDeleteForm,
  buildEditApplyQueryForm,
  classifyEditApplyDeleteResponse,
  extractEditApplyRows,
  normalizeEditApplyQuery,
} = require('../../src/listing_copy_application');

const ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  return {
    id: get('--id') || '',
    sku: get('--sku') || '',
    reason: get('--reason') || '',
    remark: get('--remark') || '',
    startTime: get('--start-time') || '',
    endTime: get('--end-time') || '',
    seller: get('--seller') || 'HJ17,HJ171,HJ172',
    limit: Number(get('--limit') || 50) || 50,
    out: get('--out') || '',
    execute: args.includes('--execute'),
    queryOnly: args.includes('--query-only'),
    browserUrl: get('--browser-url') || process.env.DISCOVERY_BROWSER_URL || 'http://127.0.0.1:9222',
  };
}

function defaultOutputFile() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(SNAPSHOT_DIR, `listing_copy_application_withdrawal_${stamp}.json`);
}

async function findSellerInventoryTab(browserUrl) {
  const tabs = await listTabs(browserUrl);
  const tab = tabs.find(item => String(item.url || '').includes('sellerinventory.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) {
    throw new Error('Cannot find sellerinventory tab on Chrome debug port. Open sellerinventory.yswg.com.cn in debug Chrome first.');
  }
  return tab;
}

function browserExecutorSource() {
  return async function editApplyBrowserExecutor(args) {
    const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
    const findStorageValue = (patterns, validator = value => !!value) => {
      const stores = [localStorage, sessionStorage];
      for (const store of stores) {
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          const value = store.getItem(key);
          if (patterns.some(pattern => pattern.test(key)) && validator(value)) return value;
        }
      }
      for (const store of stores) {
        for (let i = 0; i < store.length; i++) {
          const value = store.getItem(store.key(i));
          if (validator(value)) return value;
        }
      }
      return '';
    };
    const csrf =
      document.querySelector('meta[name="csrf-token"]')?.content ||
      document.querySelector('input[name="_token"]')?.value ||
      window.Laravel?.csrfToken ||
      document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
      '';
    const inventoryReferrer = [...document.querySelectorAll('iframe')]
      .map(frame => frame.src || '')
      .find(src => src.includes('/pm/edit_apply/index') || src.includes('Inventory-Token')) || location.href;
    const inventoryToken = (inventoryReferrer ? new URL(inventoryReferrer, location.origin).searchParams.get('Inventory-Token') : '') ||
      localStorage.getItem('surfaceKey') ||
      sessionStorage.getItem('surfaceKey') ||
      findStorageValue([/inventory/i, /surface/i, /token/i], value => !!value && !String(value).startsWith('eyJ'));
    const jwtToken = localStorage.getItem('jwt_token') ||
      sessionStorage.getItem('jwt_token') ||
      findStorageValue([/jwt/i, /token/i], value => /^eyJ/.test(String(value || '')));
    const headers = {
      accept: 'application/json, text/javascript, */*; q=0.01',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
    };
    if (csrf) headers['x-csrf-token'] = decodeURIComponent(csrf);
    if (inventoryToken) headers['inventory-token'] = inventoryToken;
    if (jwtToken) headers['jwt-token'] = jwtToken;

    const postForm = async (url, params) => {
      const res = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        headers,
        referrer: inventoryReferrer,
        body: params.toString(),
      });
      const body = await res.text();
      try { return JSON.parse(body || '{}'); } catch (_) { return { code: 0, msg: body.slice(0, 500), httpStatus: res.status }; }
    };

    const queryResponse = await postForm(args.queryEndpoint, new URLSearchParams(args.queryBody));
    const rowCandidates = [
      queryResponse.rows,
      queryResponse.data,
      queryResponse.data?.rows,
      queryResponse.data?.list,
      queryResponse.data?.data,
      queryResponse.result,
      queryResponse.result?.rows,
      queryResponse.result?.list,
    ];
    const rows = (rowCandidates.find(Array.isArray) || []).map(row => ({
      id: text(row.id || row.product_audit_id || row.productAuditId),
      sku: text(row.sku),
      relativeSku: text(row.relative_sku || row.relativeSku),
      reason: text(row.reason),
      remark: text(row.remark),
      status: text(row.status || row.status_text || row.statusText),
      applierName: text(row.applier_name || row.applierName),
      createdAt: text(row.created_at || row.createdAt || row.created_time || row.createdTime),
    })).filter(row => row.id);

    const targetIds = args.id ? [String(args.id)] : rows.map(row => row.id);
    const deleteEvents = [];
    if (args.execute && !args.queryOnly) {
      for (const id of targetIds) {
        const params = new URLSearchParams();
        params.set('_token', decodeURIComponent(csrf));
        params.set('id', id);
        const response = await postForm(args.deleteEndpoint, params);
        deleteEvents.push({ id, response });
      }
    }

    return JSON.stringify({
      tokenState: {
        hasCsrf: !!csrf,
        hasInventoryToken: !!inventoryToken,
        hasJwtToken: !!jwtToken,
        referrerHasInventoryToken: inventoryReferrer.includes('Inventory-Token='),
      },
      queryResponse,
      rows,
      targetIds,
      deleteEvents,
    });
  };
}

async function runWithdrawal(options = {}) {
  if (options.execute && !options.id) throw new Error('Live withdrawal requires --id to avoid bulk deletion.');
  const query = normalizeEditApplyQuery(options);
  const queryBody = buildEditApplyQueryForm(query).toString();
  const dryRun = !options.execute || options.queryOnly;
  const base = {
    generatedAt: new Date().toISOString(),
    dryRun,
    query,
    queryEndpoint: QUERY_ENDPOINT,
    deleteEndpoint: DELETE_ENDPOINT,
    queryBody,
    deletePreview: options.id ? buildEditApplyDeleteForm({ id: options.id, csrf: '[dynamic-csrf]' }).toString() : '',
  };
  if (dryRun && options.queryOnly !== true) return base;

  const tab = await findSellerInventoryTab(options.browserUrl);
  const expression = `(${browserExecutorSource()})(${JSON.stringify({
    id: options.id,
    execute: options.execute,
    queryOnly: options.queryOnly,
    queryEndpoint: QUERY_ENDPOINT,
    deleteEndpoint: DELETE_ENDPOINT,
    queryBody,
  })})`;
  const raw = await evaluate(tab, expression, true);
  const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
  const rows = extractEditApplyRows(parsed.queryResponse || {}).length ? extractEditApplyRows(parsed.queryResponse || {}) : (parsed.rows || []);
  const deleteEvents = (parsed.deleteEvents || []).map(event => ({
    id: String(event.id || ''),
    ...classifyEditApplyDeleteResponse(event.response || {}),
    response: {
      code: event.response?.code,
      msg: event.response?.msg || event.response?.message || '',
    },
  }));
  return {
    ...base,
    dryRun: false,
    tokenState: parsed.tokenState || {},
    rows,
    targetIds: parsed.targetIds || [],
    deleteEvents,
    summary: {
      rows: rows.length,
      targetIds: (parsed.targetIds || []).length,
      deleted: deleteEvents.filter(event => event.success).length,
      failed: deleteEvents.filter(event => !event.success).length,
    },
  };
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.id && !options.sku && !options.reason && !options.remark) {
    throw new Error('Provide --id, --sku, --reason, or --remark to constrain the edit-apply query.');
  }
  if (options.execute && !options.id) {
    throw new Error('Live withdrawal requires --id to avoid bulk deletion.');
  }
  const result = await runWithdrawal(options);
  const out = path.resolve(options.out || defaultOutputFile());
  writeJson(out, result);
  console.log(JSON.stringify({ mode: result.dryRun ? 'dry-run' : (options.execute ? 'execute' : 'query'), out, summary: result.summary || {} }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  defaultOutputFile,
  parseArgs,
  runWithdrawal,
};
