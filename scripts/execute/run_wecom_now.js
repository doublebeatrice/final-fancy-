const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const { buildWecomFill } = require('./generate_wecom_daily_fill');
const { buildWecomWeekly30dFill } = require('./generate_wecom_weekly_30d_fill');
const { archiveDateDir } = require('./quick_daily_core_summary');

const ROOT = path.resolve(__dirname, '..', '..');
const TREND_ROOT = path.join(ROOT, '黄成喆个人数据趋势');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');

function text(value) {
  return String(value ?? '').trim();
}

function chinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
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
      options[key] = true;
    }
  }
  const mode = text(options.mode || 'both').toLowerCase();
  return {
    date: text(options.date || chinaDate()).slice(0, 10),
    mode: ['daily', '30d', 'both'].includes(mode) ? mode : 'both',
    json: !!options.json,
    forceRecover: !!(options['force-recover'] || options.forceRecover),
    skipReady: !!(options['skip-ready'] || options.skipReady),
    no30dDate: options['30d-date'] === true || options['30d-date'] === 'true',
  };
}

function rawDailyDir(date) {
  return path.join(TREND_ROOT, '原数据', '原日数据', archiveDateDir(date));
}

function existing(filePath) {
  return filePath && fs.existsSync(filePath) ? filePath : '';
}

function locateSources(date) {
  const rawDir = rawDailyDir(date);
  return {
    rawDir,
    salesCore7d: existing(path.join(rawDir, `seller_sales_core_7d_${date}.json`)),
    salesCore30d: existing(path.join(rawDir, `seller_sales_core_30d_${date}.json`)),
    successRate:
      existing(path.join(rawDir, `seller_success_rate_HJ17_${date}.json`)) ||
      existing(path.join(SNAPSHOT_DIR, `seller_success_rate_HJ17_${date}.json`)),
  };
}

function probeInventoryTab() {
  return new Promise(resolve => {
    const req = http.get('http://127.0.0.1:9222/json/list', { timeout: 1500 }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const tabs = JSON.parse(body);
          const tab = tabs.find(item => String(item.url || '').includes('sellerinventory.yswg.com.cn'));
          resolve(!!tab?.webSocketDebuggerUrl);
        } catch (_) {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function runChild(label, command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ label, stdout, stderr });
      else reject(new Error(`${label} exited ${code}: ${stderr || stdout}`));
    });
  });
}

async function ensureChromeReady() {
  if (await probeInventoryTab()) return { ran: false };
  await runChild(
    'chrome:ready',
    'powershell.exe',
    ['-ExecutionPolicy', 'Bypass', '-File', 'scripts\\execute\\open_debug_browser_fixed_profile.ps1'],
  );
  if (!(await probeInventoryTab())) {
    throw new Error('chrome:ready ran but sellerinventory tab still not reachable on 127.0.0.1:9222');
  }
  return { ran: true };
}

async function recoverSalesCore(date, days) {
  await runChild(
    `sales-core ${days}d`,
    process.execPath,
    ['scripts/execute/recover_sales_core_raw.js', '--date', date, '--days', String(days)],
  );
}

async function recoverSuccessRate(date) {
  await runChild(
    'success-rate HJ17',
    process.execPath,
    ['scripts/execute/fetch_seller_success_rate.js', '--depositDate', date],
  );
}

async function orchestrate(options) {
  const { date, mode, forceRecover, skipReady } = options;
  const need = {
    salesCore7d: mode === 'daily' || mode === 'both',
    salesCore30d: mode === '30d' || mode === 'both',
    successRate: true,
  };

  const sources = locateSources(date);
  const recoverSteps = [];
  const recovered = [];
  if (need.salesCore7d && (!sources.salesCore7d || forceRecover)) {
    recoverSteps.push({ name: 'sales_core_7d', fn: () => recoverSalesCore(date, 7) });
  }
  if (need.salesCore30d && (!sources.salesCore30d || forceRecover)) {
    recoverSteps.push({ name: 'sales_core_30d', fn: () => recoverSalesCore(date, 30) });
  }
  if (need.successRate && (!sources.successRate || forceRecover)) {
    recoverSteps.push({ name: 'seller_success_rate_HJ17', fn: () => recoverSuccessRate(date) });
  }

  let chromeReady = { ran: false, skipped: true };
  if (recoverSteps.length && !skipReady) {
    chromeReady = await ensureChromeReady();
  } else if (!recoverSteps.length) {
    chromeReady = { ran: false, skipped: true, reason: 'all sources cached' };
  }

  for (const step of recoverSteps) {
    await step.fn();
    recovered.push(step.name);
  }

  const result = { date, mode, chromeReady, recovered, daily: null, weekly30d: null };

  if (mode === 'daily' || mode === 'both') {
    const daily = buildWecomFill({ date, dateFormat: 'zh' });
    result.daily = {
      tsv: daily.tsv,
      missing: daily.missing[date] || [],
      files: daily.rows[0]?.files || {},
    };
  }
  if (mode === '30d' || mode === 'both') {
    const weekly = buildWecomWeekly30dFill({
      date,
      dateFormat: 'zh',
      rows: 'selected',
      noDate: !options.no30dDate,
    });
    result.weekly30d = {
      tsv: weekly.tsv,
      missing: weekly.missing,
      warnings: weekly.warnings,
      files: weekly.files,
    };
  }

  return result;
}

function formatHuman(result) {
  const lines = [];
  if (result.daily) {
    if (result.mode === 'both') lines.push('今日:');
    lines.push(result.daily.tsv);
    if (result.daily.missing.length) {
      lines.push(`  缺: ${result.daily.missing.join(', ')}`);
    }
  }
  if (result.daily && result.weekly30d) lines.push('');
  if (result.weekly30d) {
    if (result.mode === 'both') lines.push('30天:');
    lines.push(result.weekly30d.tsv);
    if (result.weekly30d.missing.length) {
      lines.push(`  缺: ${result.weekly30d.missing.join(', ')}`);
    }
    for (const warning of result.weekly30d.warnings || []) {
      lines.push(`  注意: ${warning}`);
    }
  }
  if (result.recovered.length) {
    lines.push('');
    lines.push(`(已现场恢复: ${result.recovered.join(', ')})`);
  }
  return lines.join('\n');
}

async function main() {
  const options = parseArgs();
  const result = await orchestrate(options);
  console.log(options.json ? JSON.stringify(result, null, 2) : formatHuman(result));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { orchestrate, parseArgs };
