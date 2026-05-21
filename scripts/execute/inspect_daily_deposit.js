const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function text(value) {
  return String(value ?? '').trim();
}

function dateOnly(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function localDateOnly(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function localDate(value) {
  const raw = text(value);
  const [, yyyy, mm, dd] = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  if (!yyyy) return null;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

function extractDateFromName(name = '') {
  const hit = text(name).match(/(20\d{2})[-_](\d{2})[-_](\d{2})/);
  return hit ? `${hit[1]}-${hit[2]}-${hit[3]}` : '';
}

function diffDays(leftDate, rightDate) {
  const left = localDate(leftDate);
  const right = localDate(rightDate);
  if (!left || !right) return null;
  return Math.round((left.getTime() - right.getTime()) / 86400000);
}

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return fallback;
  }
}

function statFile(file) {
  if (!file || !fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  return {
    file,
    bytes: stat.size,
    lastWriteTime: stat.mtime.toISOString(),
  };
}

function dedupe(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function listFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(dir, entry.name));
}

function walkFiles(dir, predicate, limit = 200) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length && out.length < limit) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (!predicate || predicate(full)) out.push(full);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function findTrendRoot() {
  const direct = path.join(ROOT, '黄成喆个人数据趋势');
  if (fs.existsSync(direct)) return direct;
  const hit = fs.readdirSync(ROOT, { withFileTypes: true })
    .find(entry => entry.isDirectory() && /个人数据趋势|personal|trend/i.test(entry.name));
  return hit ? path.join(ROOT, hit.name) : '';
}

function archiveDateDir(date) {
  const [, month, day] = date.match(/^\d{4}-(\d{2})-(\d{2})$/) || [];
  if (!month || !day) throw new Error(`date must be YYYY-MM-DD: ${date}`);
  return `${Number(month)}-${Number(day)}`;
}

function findRawRoot(trendRoot) {
  const direct = path.join(trendRoot, '原数据', '原日数据');
  if (fs.existsSync(direct)) return direct;
  const candidates = walkFiles(trendRoot, file => /\.(csv|xlsx|json)$/i.test(file), 20)
    .map(file => path.dirname(file));
  return candidates.find(dir => /原日数据|raw|data/i.test(dir)) || '';
}

function findDailyHtml(trendRoot, date) {
  if (!trendRoot) return '';
  const direct = path.join(trendRoot, '每日 近七天 数据趋势', `${date}.html`);
  if (fs.existsSync(direct)) return direct;
  const hits = walkFiles(trendRoot, file => path.basename(file) === `${date}.html`, 5);
  return hits[0] || '';
}

function findLatestRunSnapshot(date) {
  const runsRoot = path.join(ROOT, 'data', 'snapshots', 'runs');
  if (!fs.existsSync(runsRoot)) return '';
  const candidates = fs.readdirSync(runsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(runsRoot, entry.name, `snapshot_${date}.json`))
    .filter(file => fs.existsSync(file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0] || '';
}

function pick(files, matcher) {
  return files.filter(file => matcher(path.basename(file), file)).map(statFile).filter(Boolean);
}

function isOriginalSalesCoreFile(name, date) {
  return (
    (/\.xlsx$/i.test(name) && (/^table-export/i.test(name) || name.includes(date))) ||
    (/^seller_sales_core_\d+d_\d{4}-\d{2}-\d{2}\.csv$/i.test(name) && name.includes(date))
  );
}

function parseCsvLine(line = '') {
  const cells = [];
  let current = '';
  let quoted = false;
  const raw = String(line ?? '');

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map(text);
}

function readCsvRows(file, limit = 20) {
  try {
    const content = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return content
      .split(/\r?\n/)
      .filter(line => text(line))
      .slice(0, limit)
      .map(parseCsvLine);
  } catch (error) {
    return [];
  }
}

function normalizeColumnName(value) {
  return text(value).toLowerCase().replace(/[\s_-]+/g, '');
}

function isZeroishNumeric(value) {
  const raw = text(value);
  if (!raw) return true;
  const normalized = raw.replace(/[%,$,\s\uFF0C]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) && Math.abs(number) < 1e-9;
}

function isZeroSummarySalesCoreFile(file) {
  if (!/\.csv$/i.test(file || '')) return false;
  const rows = readCsvRows(file, 30);
  if (rows.length < 2) return false;

  const headers = rows[0].map(normalizeColumnName);
  const sellerTitleIndex = headers.indexOf('sellertitle');
  if (sellerTitleIndex < 0) return false;

  const metricNames = new Set([
    'advcost',
    'adspend',
    'advspend',
    'ordersales',
    'saleamount',
    'sales',
    'grossprofit',
    'netprofit',
    'acos',
    'refundpercent',
    'salenum',
    'orders',
    'ordercount',
  ]);
  const metricIndexes = headers
    .map((header, index) => (metricNames.has(header) ? index : -1))
    .filter(index => index >= 0);
  if (!metricIndexes.length) return false;

  return rows.slice(1).some(row => {
    const sellerTitle = text(row[sellerTitleIndex]);
    const isSummaryRow = sellerTitle.includes('\u6240\u9009\u7f16\u53f7\u6c47\u603b')
      || (/selected/i.test(sellerTitle) && /summary/i.test(sellerTitle));
    if (!isSummaryRow) return false;
    return metricIndexes.every(index => isZeroishNumeric(row[index]));
  });
}

function defaultRawCandidateRoots() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return dedupe([
    home ? path.join(home, 'Downloads') : '',
    home ? path.join(home, 'Desktop') : '',
    'D:\\chrome dl',
    'D:\\Backup\\Downloads',
    'D:\\Backup\\Documents\\Downloads',
  ]).filter(dir => fs.existsSync(dir));
}

function recentFileCandidate(file, root = '', targetDate = '') {
  const stat = statFile(file);
  if (!stat) return null;
  const name = path.basename(file);
  const candidateDate = extractDateFromName(name) || localDateOnly(fs.statSync(file).mtime);
  const ageDays = diffDays(targetDate, candidateDate);
  const sameDate = ageDays === 0;
  return {
    ...stat,
    root,
    name,
    candidateDate,
    ageDays,
    sameDate,
    action: sameDate ? 'copy_to_daily_raw' : (Number(ageDays) > 0 ? 'reference_only_stale' : 'review_future_dated'),
  };
}

function collectRawDownloadCandidates(date, missing = [], options = {}) {
  const roots = dedupe(options.rawCandidateRoots || defaultRawCandidateRoots())
    .filter(dir => fs.existsSync(dir));
  const days = Number.isFinite(Number(options.rawCandidateDays))
    ? Math.max(0, Number(options.rawCandidateDays))
    : 7;
  const [, yyyy, mm, dd] = text(date).match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  const cutoff = yyyy
    ? new Date(Number(yyyy), Number(mm) - 1, Number(dd))
    : new Date(`${date}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - days);
  const limit = Number.isFinite(Number(options.rawCandidateLimit))
    ? Math.max(1, Number(options.rawCandidateLimit))
    : 80;
  const missingSet = new Set(missing);
  const byMissingClass = {
    sales_core_original_xlsx: [],
    inventory_original_csv: [],
    ad_full_original_csv: [],
  };

  function maybeAdd(file, root) {
    const name = path.basename(file);
    const stat = fs.statSync(file);
    if (stat.mtime < cutoff) return;
    if (missingSet.has('sales_core_original_xlsx') && isOriginalSalesCoreFile(name, date)) {
      byMissingClass.sales_core_original_xlsx.push(recentFileCandidate(file, root, date));
    }
    if (missingSet.has('inventory_original_csv') && /^inv_auto_filtered_/i.test(name) && !name.includes('_from_snapshot_') && /\.csv$/i.test(name)) {
      byMissingClass.inventory_original_csv.push(recentFileCandidate(file, root, date));
    }
    if (
      missingSet.has('ad_full_original_csv') &&
      /\.csv$/i.test(name) &&
      !name.includes('_from_snapshot_') &&
      (/\u5e7f\u544a\u5168\u76d8\u5bfc\u51fa|\u8fd130\u5929|30\u5929|30d|ad_sku|sku_summary/i.test(name))
    ) {
      byMissingClass.ad_full_original_csv.push(recentFileCandidate(file, root, date));
    }
  }

  for (const root of roots) {
    const candidates = walkFiles(
      root,
      file => /\.(csv|xlsx)$/i.test(file) && /table-export|seller_sales_core|inv_auto_filtered|\u5e7f\u544a|30d|ad_sku|sku_summary/i.test(path.basename(file)),
      limit,
    );
    for (const file of candidates) maybeAdd(file, root);
  }

  for (const key of Object.keys(byMissingClass)) {
    byMissingClass[key] = byMissingClass[key]
      .filter(Boolean)
      .sort((a, b) => new Date(b.lastWriteTime).getTime() - new Date(a.lastWriteTime).getTime())
      .slice(0, 10);
  }

  const total = Object.values(byMissingClass).reduce((sum, items) => sum + items.length, 0);
  const flatCandidates = Object.values(byMissingClass).flat();
  const sameDateTotal = flatCandidates.filter(item => item.sameDate === true).length;
  const staleTotal = flatCandidates.filter(item => item.sameDate === false && Number(item.ageDays) > 0).length;
  return {
    cutoffDate: localDateOnly(cutoff),
    rootsSearched: roots,
    total,
    sameDateTotal,
    staleTotal,
    byMissingClass,
  };
}

const RAW_RECOVERY_LABELS = {
  sales_core_original_xlsx: {
    label: 'Sales core raw export',
    expectedPattern: 'table-export*.xlsx, same-date .xlsx, or seller_sales_core_*d_<date>.csv',
    sourceAction: 'Download all selected rows from the sales core data page, or run the seller sales core API raw recovery.',
  },
  inventory_original_csv: {
    label: 'Inventory original CSV',
    expectedPattern: 'inv_auto_filtered_*.csv',
    sourceAction: 'Run the sellerinventory export bookmarklet or equivalent full inventory export.',
  },
  ad_full_original_csv: {
    label: 'Ad full export CSV',
    expectedPattern: '广告全盘导出_近30天_*.csv or ad_sku_summary_30d_*.csv',
    sourceAction: 'Run the ad SKU summary full export bookmarklet or equivalent 30-day ad export.',
  },
};

const SUSPICIOUS_RAW_RECOVERY_CLASSES = {
  sales_core_original_zero_summary: 'sales_core_original_xlsx',
  inventory_csv_tiny: 'inventory_original_csv',
};

function buildRawRecoveryQueue(status = {}) {
  const missing = Array.isArray(status.missing) ? status.missing.map(text).filter(Boolean) : [];
  const suspicious = Array.isArray(status.suspicious) ? status.suspicious : [];
  const rawMissing = ['sales_core_original_xlsx', 'inventory_original_csv', 'ad_full_original_csv']
    .filter(key => missing.includes(key));
  const rawSuspicious = suspicious
    .map(item => ({
      issueType: text(item?.type),
      file: text(item?.file),
      bytes: item?.bytes ?? null,
      missingClass: SUSPICIOUS_RAW_RECOVERY_CLASSES[text(item?.type)] || '',
    }))
    .filter(item => item.missingClass);
  const byMissingClass = status.rawDownloadCandidates?.byMissingClass || {};
  const rawDir = text(status.rawDir);
  const classes = dedupe([...rawMissing, ...rawSuspicious.map(item => item.missingClass)]);
  const items = classes.map(missingClass => {
    const candidates = Array.isArray(byMissingClass[missingClass]) ? byMissingClass[missingClass] : [];
    const suspiciousItems = rawSuspicious.filter(item => item.missingClass === missingClass);
    const isMissing = rawMissing.includes(missingClass);
    const sameDateCandidate = candidates.find(item => item?.sameDate === true);
    const staleCandidate = candidates.find(item => item?.sameDate === false);
    const candidate = sameDateCandidate || staleCandidate || null;
    const state = !isMissing && suspiciousItems.length
      ? 'suspicious_needs_redownload'
      : sameDateCandidate
        ? 'same_date_candidate_ready'
        : staleCandidate
          ? 'stale_candidate_review'
          : 'needs_redownload';
    const label = RAW_RECOVERY_LABELS[missingClass] || {};

    return {
      missingClass,
      issueTypes: suspiciousItems.map(item => item.issueType),
      suspiciousFiles: suspiciousItems.map(item => ({
        file: item.file,
        bytes: item.bytes,
      })),
      label: label.label || missingClass,
      expectedPattern: label.expectedPattern || '',
      state,
      candidate: candidate
        ? {
            name: text(candidate.name),
            file: text(candidate.file),
            candidateDate: text(candidate.candidateDate),
            ageDays: candidate.ageDays ?? null,
            sameDate: candidate.sameDate === true,
            action: text(candidate.action),
          }
        : null,
      nextAction: !isMissing && suspiciousItems.length
        ? 'redownload_or_recover_same_date_original_file'
        : sameDateCandidate
        ? 'archive_same_date_candidate'
        : staleCandidate
          ? 'review_stale_candidate_or_redownload_same_date_file'
          : 'redownload_same_date_original_file',
      operatorAction: !isMissing && suspiciousItems.length
        ? label.sourceAction || 'Restore or redownload the same-date original file.'
        : sameDateCandidate
        ? `Run: npm run ops:deposit:status -- --date ${status.date} --json --archive-candidates`
        : label.sourceAction || 'Restore or redownload the same-date original file.',
      completionCondition: rawDir
        ? `A valid matching original file exists in ${rawDir} and ops:deposit:status no longer lists ${missingClass} as missing or suspicious.`
        : `A valid matching original file exists in the daily raw folder and ops:deposit:status no longer lists ${missingClass} as missing or suspicious.`,
    };
  });

  return {
    date: text(status.date),
    generatedAt: new Date().toISOString(),
    status: items.length ? 'open' : 'clear',
    rawDir,
    items,
    summary: {
      rawRecoveryItems: items.length,
      missingRawOriginals: rawMissing.length,
      suspiciousRawOriginals: items.filter(item => item.issueTypes.length).length,
      sameDateCandidates: items.filter(item => item.state === 'same_date_candidate_ready').length,
      staleCandidates: items.filter(item => item.state === 'stale_candidate_review').length,
      needsRedownload: items.filter(item => item.state !== 'same_date_candidate_ready').length,
    },
  };
}

function buildRawRecoveryQueueMarkdown(queue = {}) {
  const lines = [
    `# Raw recovery queue - ${queue.date || ''}`,
    '',
    `- Status: ${queue.status || 'unknown'}`,
    `- Raw dir: ${queue.rawDir || '(unknown)'}`,
    `- Raw recovery items: ${queue.summary?.rawRecoveryItems ?? queue.items?.length ?? 0}`,
    `- Missing raw originals: ${queue.summary?.missingRawOriginals ?? 0}`,
    `- Suspicious raw originals: ${queue.summary?.suspiciousRawOriginals ?? 0}`,
    `- Same-date candidates: ${queue.summary?.sameDateCandidates ?? 0}`,
    `- Stale candidates: ${queue.summary?.staleCandidates ?? 0}`,
    `- Needs redownload: ${queue.summary?.needsRedownload ?? 0}`,
    '',
  ];

  if (!Array.isArray(queue.items) || !queue.items.length) {
    lines.push('No raw recovery items are open.');
    return `${lines.join('\n')}\n`;
  }

  lines.push('| Missing class | State | Issues | Expected file | Candidate | Next action |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const item of queue.items) {
    const candidate = item.candidate
      ? `${item.candidate.name || item.candidate.file || 'candidate'} (${item.candidate.candidateDate || 'unknown'})`
      : 'none';
    const issues = Array.isArray(item.issueTypes) && item.issueTypes.length ? item.issueTypes.join(', ') : 'missing';
    lines.push(`| ${item.missingClass} | ${item.state} | ${issues} | ${item.expectedPattern || ''} | ${candidate} | ${item.nextAction} |`);
  }

  lines.push('');
  lines.push('## Operator actions');
  for (const item of queue.items) {
    lines.push(`- ${item.label}: ${item.operatorAction}`);
    lines.push(`  Completion: ${item.completionCondition}`);
  }
  return `${lines.join('\n')}\n`;
}

function archiveSameDateRawCandidates(status = {}) {
  const rawDir = text(status.rawDir);
  const result = {
    rawDir,
    copied: [],
    skipped: [],
    errors: [],
  };
  if (!rawDir) {
    result.errors.push({ reason: 'rawDir_missing' });
    return result;
  }

  fs.mkdirSync(rawDir, { recursive: true });
  const resolvedRawDir = path.resolve(rawDir);
  const byMissingClass = status.rawDownloadCandidates?.byMissingClass || {};
  for (const [missingClass, candidates] of Object.entries(byMissingClass)) {
    const candidate = (Array.isArray(candidates) ? candidates : [])
      .find(item => item?.sameDate === true && item?.action === 'copy_to_daily_raw');
    if (!candidate) {
      result.skipped.push({ missingClass, reason: 'no_same_date_candidate' });
      continue;
    }

    const source = text(candidate.file);
    if (!source || !fs.existsSync(source)) {
      result.errors.push({ missingClass, source, reason: 'source_missing' });
      continue;
    }

    const destination = path.join(rawDir, path.basename(source));
    const resolvedDestination = path.resolve(destination);
    if (resolvedDestination !== resolvedRawDir && !resolvedDestination.startsWith(`${resolvedRawDir}${path.sep}`)) {
      result.errors.push({ missingClass, source, destination, reason: 'destination_outside_raw_dir' });
      continue;
    }

    try {
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      result.copied.push({ missingClass, source, destination });
    } catch (error) {
      if (error && error.code === 'EEXIST') {
        result.skipped.push({ missingClass, source, destination, reason: 'destination_exists' });
      } else {
        result.errors.push({ missingClass, source, destination, reason: error.message || String(error) });
      }
    }
  }
  return result;
}

function classifyDailyDeposit(date, options = {}) {
  const trendRoot = options.trendRoot || findTrendRoot();
  const rawRoot = options.rawRoot || findRawRoot(trendRoot);
  const rawDir = rawRoot ? path.join(rawRoot, archiveDateDir(date)) : '';
  const files = listFiles(rawDir);
  const htmlFile = findDailyHtml(trendRoot, date);
  const snapshotFile = options.snapshotFile || findLatestRunSnapshot(date) || path.join(ROOT, 'data', 'snapshots', 'latest_snapshot.json');

  const originalSalesCore = pick(files, name => isOriginalSalesCoreFile(name, date));
  const originalInventory = pick(files, name => /^inv_auto_filtered_/i.test(name) && !name.includes('_from_snapshot_') && /\.csv$/i.test(name));
  const originalAdExport = pick(files, name => /\.csv$/i.test(name) && !name.includes('_from_snapshot_') && (/广告全盘导出|近30|30天|30d|ad_sku|sku_summary/i.test(name)));
  const derivedSalesCore = pick(files, name => name === `seller_sales_from_snapshot_${date}.csv`);
  const derivedInventory = pick(files, name => name === `inv_auto_filtered_from_snapshot_${date}.csv`);
  const derivedAdExport = pick(files, name => name === `ad_sku_summary_from_snapshot_${date}.csv`);
  const sellerSuccessJson = pick(files, name => name === `seller_success_rate_HJ17_${date}.json`);
  const sellerSuccessCsv = pick(files, name => name === `seller_success_rate_HJ17_${date}.csv`);
  const depositManifest = pick(files, name => name === `daily_deposit_manifest_${date}.json`);

  const completed = [];
  const missing = [];
  const suspicious = [];

  function requireItem(key, found, fallbackFound = []) {
    if (found.length) completed.push(key);
    else if (fallbackFound.length) {
      completed.push(`${key}_derived`);
      missing.push(key);
    } else {
      missing.push(key);
    }
  }

  requireItem('sales_core_original_xlsx', originalSalesCore, derivedSalesCore);
  requireItem('inventory_original_csv', originalInventory, derivedInventory);
  requireItem('ad_full_original_csv', originalAdExport, derivedAdExport);
  requireItem('seller_success_rate_json', sellerSuccessJson);
  requireItem('seller_success_rate_csv', sellerSuccessCsv);
  requireItem('daily_html', htmlFile ? [statFile(htmlFile)] : []);
  requireItem('snapshot_json', snapshotFile && fs.existsSync(snapshotFile) ? [statFile(snapshotFile)] : []);
  requireItem('daily_deposit_manifest', depositManifest);

  const inventoryFilesForTinyCheck = originalInventory.length ? originalInventory : derivedInventory;
  for (const file of inventoryFilesForTinyCheck) {
    if (file.bytes > 0 && file.bytes < 1024 * 1024) {
      suspicious.push({
        type: 'inventory_csv_tiny',
        file: file.file,
        bytes: file.bytes,
      });
    }
  }

  for (const file of originalSalesCore) {
    if (isZeroSummarySalesCoreFile(file.file)) {
      suspicious.push({
        type: 'sales_core_original_zero_summary',
        file: file.file,
        bytes: file.bytes,
      });
    }
  }

  if (derivedSalesCore.length && !originalSalesCore.length) suspicious.push({ type: 'sales_core_is_snapshot_derived', file: derivedSalesCore[0].file });
  if (derivedAdExport.length && !originalAdExport.length) suspicious.push({ type: 'ad_export_is_snapshot_derived', file: derivedAdExport[0].file });
  if (derivedInventory.length && !originalInventory.length) suspicious.push({ type: 'inventory_is_snapshot_derived', file: derivedInventory[0].file });

  const rawOriginalMissing = ['sales_core_original_xlsx', 'inventory_original_csv', 'ad_full_original_csv']
    .filter(key => missing.includes(key));
  const suspiciousRawRecoveryClasses = dedupe(
    suspicious.map(item => SUSPICIOUS_RAW_RECOVERY_CLASSES[text(item.type)] || '').filter(Boolean),
  );
  const rawRecoveryClasses = dedupe([...rawOriginalMissing, ...suspiciousRawRecoveryClasses]);
  const hardMissing = missing.filter(key => !rawOriginalMissing.includes(key));
  const status = hardMissing.length
    ? 'blocked'
    : (rawOriginalMissing.length || suspicious.length ? 'partial' : 'complete');
  const rawDownloadCandidates = rawRecoveryClasses.length
    ? collectRawDownloadCandidates(date, rawRecoveryClasses, options)
    : {
      cutoffDate: '',
      rootsSearched: [],
      total: 0,
      sameDateTotal: 0,
      staleTotal: 0,
      byMissingClass: {
        sales_core_original_xlsx: [],
        inventory_original_csv: [],
        ad_full_original_csv: [],
      },
    };

  const snapshot = readJson(snapshotFile, {});
  const output = {
    date,
    generatedAt: new Date().toISOString(),
    status,
    rawDir,
    trendRoot,
    completed,
    missing,
    suspicious,
    files: {
      originalSalesCore,
      originalInventory,
      originalAdExport,
      derivedSalesCore,
      derivedInventory,
      derivedAdExport,
      sellerSuccessJson,
      sellerSuccessCsv,
      depositManifest,
      html: htmlFile ? statFile(htmlFile) : null,
      snapshot: snapshotFile && fs.existsSync(snapshotFile) ? statFile(snapshotFile) : null,
    },
    sourceCounts: {
      productCards: Array.isArray(snapshot.productCards) ? snapshot.productCards.length : 0,
      sellerSalesRows: Array.isArray(snapshot.sellerSalesRows) ? snapshot.sellerSalesRows.length : 0,
      adSkuSummaryRows: Array.isArray(snapshot.adSkuSummaryRows) ? snapshot.adSkuSummaryRows.length : 0,
    },
    rawDownloadCandidates,
    notes: [
      rawOriginalMissing.length
        ? 'Raw manual download set is incomplete; snapshot-derived files are preserved as fallback database inputs.'
        : (suspiciousRawRecoveryClasses.length
          ? 'Raw manual download set exists but at least one original file is suspicious and should be recovered.'
          : 'Raw manual download set is complete.'),
      rawDownloadCandidates.total > 0
        ? `Raw download candidates found: ${rawDownloadCandidates.total}. Review/copy them into the daily raw folder if they match the business date.`
        : 'No recent raw download candidates were found in configured download folders.',
      'HTML is the readable view; CSV/JSON/snapshot/status files are the durable data layer.',
    ],
  };
  output.rawRecoveryQueue = buildRawRecoveryQueue(output);

  return output;
}

function defaultOutFile(status) {
  return path.join(status.rawDir || path.join(ROOT, 'data'), `daily_deposit_status_${status.date}.json`);
}

function defaultRecoveryQueueFile(status, ext = 'json') {
  return path.join(ROOT, 'data', 'tasks', `raw_recovery_queue_${status.date}.${ext}`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  const rawCandidateRoots = get('--raw-candidate-roots') || get('--download-roots') || '';
  return {
    date: dateOnly(get('--date') || args.find(arg => /^\d{4}-\d{2}-\d{2}$/.test(arg)) || new Date().toISOString().slice(0, 10)),
    outFile: get('--out') || '',
    snapshotFile: get('--snapshot') || '',
    trendRoot: get('--trend-root') || '',
    rawRoot: get('--raw-root') || '',
    rawCandidateRoots: rawCandidateRoots
      ? rawCandidateRoots.split(/[;,]/).map(item => text(item)).filter(Boolean)
      : undefined,
    rawCandidateDays: get('--raw-candidate-days') || '',
    rawCandidateLimit: get('--raw-candidate-limit') || '',
    archiveCandidates: args.includes('--archive-candidates'),
  };
}

function main() {
  const options = parseArgs(process.argv);
  let status = classifyDailyDeposit(options.date, {
    snapshotFile: options.snapshotFile,
    trendRoot: options.trendRoot,
    rawRoot: options.rawRoot,
    rawCandidateRoots: options.rawCandidateRoots,
    rawCandidateDays: options.rawCandidateDays,
    rawCandidateLimit: options.rawCandidateLimit,
  });
  let archive = null;
  if (options.archiveCandidates) {
    archive = archiveSameDateRawCandidates(status);
    status = classifyDailyDeposit(options.date, {
      snapshotFile: options.snapshotFile,
      trendRoot: options.trendRoot,
      rawRoot: options.rawRoot,
      rawCandidateRoots: options.rawCandidateRoots,
      rawCandidateDays: options.rawCandidateDays,
      rawCandidateLimit: options.rawCandidateLimit,
    });
    status.rawCandidateArchive = archive;
    status.notes = [
      ...(status.notes || []),
      archive.copied.length
        ? `Archived same-day raw download candidates: ${archive.copied.length}.`
        : 'No same-day raw download candidates were archived.',
    ];
  }
  const outFile = options.outFile || defaultOutFile(status);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(status, null, 2), 'utf8');
  const recoveryQueue = buildRawRecoveryQueue(status);
  const recoveryQueueFile = defaultRecoveryQueueFile(status, 'json');
  const recoveryQueueMarkdownFile = defaultRecoveryQueueFile(status, 'md');
  fs.mkdirSync(path.dirname(recoveryQueueFile), { recursive: true });
  fs.writeFileSync(recoveryQueueFile, JSON.stringify(recoveryQueue, null, 2), 'utf8');
  fs.writeFileSync(recoveryQueueMarkdownFile, buildRawRecoveryQueueMarkdown(recoveryQueue), 'utf8');
  console.log(JSON.stringify({
    ok: true,
    outFile,
    recoveryQueueFile,
    recoveryQueueMarkdownFile,
    status: status.status,
    missing: status.missing,
    suspicious: status.suspicious.map(item => item.type),
    rawRecoveryOpen: recoveryQueue.summary.rawRecoveryItems,
    archivedCandidates: archive ? archive.copied.length : 0,
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = {
  archiveSameDateRawCandidates,
  buildRawRecoveryQueue,
  buildRawRecoveryQueueMarkdown,
  collectRawDownloadCandidates,
  classifyDailyDeposit,
  defaultOutFile,
  defaultRecoveryQueueFile,
  parseArgs,
};
