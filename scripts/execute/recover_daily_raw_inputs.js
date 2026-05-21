const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function text(value) {
  return String(value ?? '').trim();
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = '1';
    }
  }
  return {
    date: text(options.date || options.today || new Date().toISOString().slice(0, 10)).slice(0, 10),
    maxPages: Number(options.maxPages || 200),
  };
}

function runNode(args = []) {
  const child = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  const output = `${child.stdout || ''}${child.stderr || ''}`;
  if (child.status !== 0) {
    throw new Error(output.trim() || `command failed: node ${args.join(' ')}`);
  }
  return output.trim();
}

function parseLastJson(output = '') {
  const trimmed = text(output);
  const start = trimmed.lastIndexOf('\n{');
  const jsonText = start >= 0 ? trimmed.slice(start + 1) : trimmed;
  return JSON.parse(jsonText);
}

function inspectDeposit(date) {
  const output = runNode([path.join('scripts', 'execute', 'inspect_daily_deposit.js'), '--date', date, '--json']);
  return parseLastJson(output);
}

function recoverAd(date) {
  const output = runNode([path.join('scripts', 'execute', 'recover_ad_sku_summary_raw.js'), '--date', date]);
  return parseLastJson(output);
}

function recoverInventory(date, maxPages) {
  const output = runNode([
    path.join('scripts', 'execute', 'recover_inventory_raw_from_list.js'),
    '--date',
    date,
    '--maxPages',
    String(maxPages || 200),
  ]);
  return parseLastJson(output);
}

function recoverSalesCore(date) {
  const output = runNode([path.join('scripts', 'execute', 'recover_sales_core_raw.js'), '--date', date]);
  return parseLastJson(output);
}

function run(options = parseArgs()) {
  const before = inspectDeposit(options.date);
  const missingBefore = new Set(Array.isArray(before.missing) ? before.missing : []);
  const suspiciousBefore = new Set((Array.isArray(before.suspicious) ? before.suspicious : [])
    .map(item => text(item?.type || item))
    .filter(Boolean));
  const actions = [];

  if (missingBefore.has('ad_full_original_csv')) {
    try {
      const result = recoverAd(options.date);
      actions.push({ class: 'ad_full_original_csv', status: 'recovered', rows: result.rowCount, file: result.csvFile });
    } catch (error) {
      actions.push({ class: 'ad_full_original_csv', status: 'failed', error: error.message });
    }
  } else {
    actions.push({ class: 'ad_full_original_csv', status: 'already_present' });
  }

  if (missingBefore.has('inventory_original_csv') || suspiciousBefore.has('inventory_csv_tiny')) {
    try {
      const result = recoverInventory(options.date, options.maxPages);
      actions.push({
        class: 'inventory_original_csv',
        status: 'recovered',
        reason: missingBefore.has('inventory_original_csv') ? 'missing' : 'suspicious',
        rows: result.rowCount,
        file: result.csvFile,
      });
    } catch (error) {
      actions.push({ class: 'inventory_original_csv', status: 'failed', error: error.message });
    }
  } else {
    actions.push({ class: 'inventory_original_csv', status: 'already_present' });
  }

  if (missingBefore.has('sales_core_original_xlsx') || suspiciousBefore.has('sales_core_original_zero_summary')) {
    try {
      const result = recoverSalesCore(options.date);
      actions.push({
        class: 'sales_core_original_xlsx',
        status: 'recovered',
        reason: missingBefore.has('sales_core_original_xlsx') ? 'missing' : 'suspicious',
        rows: result.rowCount,
        file: result.csvFile,
      });
    } catch (error) {
      actions.push({
        class: 'sales_core_original_xlsx',
        status: 'failed',
        error: error.message,
        nextAction: 'restore sellerinventory login/session or download table-export*.xlsx into the daily raw folder',
      });
    }
  } else {
    actions.push({ class: 'sales_core_original_xlsx', status: 'already_present' });
  }

  const after = inspectDeposit(options.date);
  return {
    ok: true,
    date: options.date,
    before: {
      status: before.status,
      missing: before.missing || [],
      suspicious: before.suspicious || [],
      rawRecoveryOpen: before.rawRecoveryOpen,
    },
    actions,
    after: {
      status: after.status,
      missing: after.missing || [],
      suspicious: after.suspicious || [],
      rawRecoveryOpen: after.rawRecoveryOpen,
      outFile: after.outFile,
      recoveryQueueFile: after.recoveryQueueFile,
      recoveryQueueMarkdownFile: after.recoveryQueueMarkdownFile,
    },
  };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(run(), null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  recoverSalesCore,
  inspectDeposit,
  parseArgs,
  run,
};
