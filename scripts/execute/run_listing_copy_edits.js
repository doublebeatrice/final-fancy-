const fs = require('fs');
const path = require('path');
const { evaluate, listTabs } = require('../../discovery/lib/cdp');
const { listingProtectionForSku, loadProtectedListingSkus, normalizeProtectedListingSkus } = require('../../src/listing_copy_protection');
const {
  ENDPOINT,
  buildListingCopyDryRunReport,
  buildListingCopyEditForm,
  classifyListingCopyEditResponse,
  flattenListingCopyActions,
  normalizeCopyEditPayload,
  validateCopyEditAction,
} = require('../../src/listing_copy_edit');

const ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');
const PROTECTED_LISTING_SKUS_FILE = path.join(ROOT, 'data', 'listing_copy_protected_skus.json');
const DEFAULT_SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, 'latest_snapshot.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

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
    schema: get('--schema') || args.find(arg => arg && !arg.startsWith('--')) || '',
    out: get('--out') || '',
    limit: Number(get('--limit') || 0),
    execute: args.includes('--execute'),
    browserUrl: get('--browser-url') || process.env.DISCOVERY_BROWSER_URL || 'http://127.0.0.1:9222',
    protectedListingSkus: get('--protected-listing-skus') || PROTECTED_LISTING_SKUS_FILE,
    snapshot: get('--snapshot') || DEFAULT_SNAPSHOT_FILE,
  };
}

function latestListingApplicationFile(dir = SNAPSHOT_DIR) {
  if (!fs.existsSync(dir)) return '';
  return fs.readdirSync(dir)
    .filter(name => /^season_title_listing_applications_\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map(name => path.join(dir, name))
    .filter(file => fs.statSync(file).size > 3)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
}

function defaultDryRunFile(businessDate = '') {
  const date = businessDate || new Date().toISOString().slice(0, 10);
  return path.join(SNAPSHOT_DIR, `listing_copy_edit_dry_run_${date}.json`);
}

function defaultExecutionFile(businessDate = '') {
  const date = businessDate || new Date().toISOString().slice(0, 10);
  return path.join(SNAPSHOT_DIR, `listing_copy_edit_execution_${date}.json`);
}

function loadListingCopyPlan(schemaFile, options = {}) {
  const resolved = path.resolve(schemaFile || latestListingApplicationFile());
  if (!resolved || !fs.existsSync(resolved)) throw new Error(`listing copy schema not found: ${resolved || '(none)'}`);
  const schema = readJson(resolved);
  let actions = flattenListingCopyActions(schema);
  if (options.limit > 0) actions = actions.slice(0, options.limit);
  return {
    schemaFile: resolved,
    businessDate: schema.businessDate || '',
    actions,
    schema,
  };
}

function redactExecutionResult(result = {}) {
  const response = { ...(result.response || result) };
  if (response.debug) response.debug = '[redacted]';
  if (response.headers) response.headers = '[redacted]';
  if (response.cookies) response.cookies = '[redacted]';
  return {
    response,
    tokenState: result.tokenState || {},
  };
}

function splitExecutableActions(actions = [], options = {}) {
  const protectedListingSkus = normalizeProtectedListingSkus(options.protectedListingSkus || []);
  const snapshot = options.snapshot || {};
  const valid = [];
  const invalid = [];
  for (const action of actions || []) {
    const protection = listingProtectionForSku(action.sku, protectedListingSkus, snapshot);
    if (protection) {
      invalid.push({
        sku: action.sku,
        productId: action.productId,
        errors: ['protected_listing_hold'],
        warnings: [],
        listingProtection: protection,
      });
      continue;
    }
    const validation = validateCopyEditAction(action);
    if (validation.ok) valid.push(validation.payload);
    else invalid.push({
      sku: action.sku,
      productId: action.productId,
      errors: validation.errors,
      warnings: validation.warnings,
    });
  }
  return { valid, invalid };
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
  return async function listingCopyBrowserExecutor(args) {
    const actions = args.actions || [];
    const endpoint = args.endpoint;
    const normalizeText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
    const normalizeDescriptionText = value => {
      const raw = String(value ?? '');
      if (!raw) return '';
      return raw
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t\f\v]*(?:\n[ \t\f\v]*)?<\/br>[ \t\f\v]*/gi, '\n</br>')
        .split('\n')
        .map(line => line.replace(/[ \t\f\v]+/g, ' ').trim())
        .join('\n')
        .replace(/^\n+|\n+$/g, '');
    };
    const asList = value => Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : (value ? [normalizeText(value)] : []);
    const csrf =
      document.querySelector('meta[name="csrf-token"]')?.content ||
      document.querySelector('input[name="_token"]')?.value ||
      window.Laravel?.csrfToken ||
      document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
      '';
    const iframeSrc = [...document.querySelectorAll('iframe')]
      .map(frame => frame.src || '')
      .find(src => src.includes('/pm/formal/list') || src.includes('Inventory-Token')) || location.href;
    const headers = {
      accept: '*/*',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
    };
    if (csrf) headers['x-csrf-token'] = decodeURIComponent(csrf);

    const appendAll = (params, key, values) => {
      for (const value of values || []) params.append(key, value);
    };
    const getOriginData = async sku => {
      const url = `https://sellerinventory.yswg.com.cn/kernel/productEditApply/getOriginData?sku=${encodeURIComponent(sku)}&type=en`;
      const res = await fetch(url, { credentials: 'include', headers: { accept: 'application/json, text/plain, */*' }, referrer: iframeSrc });
      const text = await res.text();
      try { return JSON.parse(text || '{}'); } catch (_) { return { code: 0, msg: text.slice(0, 300) }; }
    };
    const originPayload = origin => {
      const data = origin?.data || origin?.result || origin || {};
      return {
        parentTitle: normalizeText(data.parent_title || data.parentTitle || data.title || data.title_en || ''),
        titleEn: normalizeText(data.title_en || data.titleEn || ''),
        bulletPoints: asList(data.bullet_points || data.bulletPoints),
        productDescription: normalizeDescriptionText(data.product_description || data.productDescription || ''),
        searchCoreKeywords: normalizeText(data.search_core_keywords || data.searchCoreKeywords || ''),
        phraseFrequencyText: normalizeText(data.phrase_frequency_text || data.phraseFrequencyText || ''),
      };
    };
    const originTitleMatchesPlan = (input, originCopy) => {
      const plannedTitle = normalizeText(input.original?.parentTitle || input.original?.parent_title || '').toLowerCase();
      const originTitle = normalizeText(originCopy.parentTitle || originCopy.parent_title || originCopy.title || '').toLowerCase();
      if (plannedTitle && originTitle && plannedTitle !== originTitle) return { ok: false, plannedTitle, originTitle, field: 'parent_title' };
      const plannedTitleEn = normalizeText(input.original?.titleEn || input.original?.title_en || '').toLowerCase();
      const originTitleEn = normalizeText(originCopy.titleEn || originCopy.title_en || '').toLowerCase();
      if (plannedTitleEn && originTitleEn && plannedTitleEn !== originTitleEn) return { ok: false, plannedTitle: plannedTitleEn, originTitle: originTitleEn, field: 'title_en' };
      return { ok: true, plannedTitle, originTitle, field: '' };
    };
    const buildBody = action => {
      const original = action.original || {};
      const now = action.now || {};
      const syncSkus = asList(action.synchronizeVariantSkus);
      const syncFields = syncSkus.length ? asList(action.synchronizeFields) : [];
      const params = new URLSearchParams();
      params.set('product_id', normalizeText(action.productId));
      params.set('sku', normalizeText(action.sku));
      params.set('to_editor_flag', String(action.toEditorFlag || 1));
      params.set('filed_type', normalizeText(action.filedType || 'A'));
      params.set('relation', '');
      params.set('variant_status', String(action.variantStatus || 2));
      params.set('before_status', String(action.beforeStatus || 0));
      params.set('is_simple_wa', '0');
      params.set('title_type', '1');
      params.set('language_type', normalizeText(action.languageType || 'us,uk,ca'));
      appendAll(params, 'synchronizeFields[]', syncFields);
      params.set('synchronizeSkus', syncSkus.join(','));
      params.set('remark', normalizeText(action.remark));
      params.set('reason', normalizeText(action.reason));
      if (action.omitParentTitle !== true) params.set('original[parent_title]', normalizeText(original.parentTitle));
      params.set('original[title_en]', normalizeText(original.titleEn));
      appendAll(params, 'original[bullet_points][]', asList(original.bulletPoints));
      params.set('original[product_description]', normalizeDescriptionText(original.productDescription));
      params.set('original[search_core_keywords]', normalizeText(original.searchCoreKeywords));
      if (action.omitParentTitle !== true) params.set('now[parent_title]', normalizeText(now.parentTitle));
      params.set('now[title_en]', normalizeText(now.titleEn));
      appendAll(params, 'now[bullet_points][]', asList(now.bulletPoints));
      params.set('now[product_description]', normalizeDescriptionText(now.productDescription));
      params.set('now[search_core_keywords]', normalizeText(now.searchCoreKeywords));
      params.set('now[synchronize_variant_sku]', syncSkus.join(','));
      params.set('exclude_simple', '');
      params.set('phrase_frequency_text', normalizeText(action.phraseFrequencyText));
      params.set('origin', 'codex_listing_copy_edit');
      return params.toString();
    };
    const repeatedWordFromMessage = message => {
      const match = String(message || '').match(/\(([^()]{1,40})\)/);
      return match ? normalizeText(match[1]).toLowerCase() : '';
    };
    const lengthOverflowFromMessage = message => {
      const match = String(message || '').match(/字符数\s*(\d+)\s*超过\s*(\d+)/);
      if (!match) return null;
      const actual = Number(match[1]);
      const limit = Number(match[2]);
      if (!Number.isFinite(actual) || !Number.isFinite(limit) || actual <= limit) return null;
      return { actual, limit, overflow: actual - limit };
    };
    const shortenTitleForLimit = (title, targetLength) => {
      let next = normalizeText(title);
      const replacements = [
        [/\s*,?\s*Adults\b,?/ig, ''],
        [/\bLarge\s+/ig, ''],
        [/\bOutdoor\s+/ig, ''],
        [/\bGiant\s+/ig, ''],
      ];
      for (const [pattern, replacement] of replacements) {
        if (next.length <= targetLength) break;
        next = next.replace(pattern, replacement).replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim();
      }
      if (next.length > targetLength) {
        let cut = next.slice(0, targetLength).trim();
        const lastSpace = cut.lastIndexOf(' ');
        if (lastSpace > 60) cut = cut.slice(0, lastSpace).trim();
        next = cut;
      }
      return next;
    };
    const repairTitleForMessage = (title, message) => {
      const word = repeatedWordFromMessage(message);
      let next = normalizeText(title);
      const repairs = [];
      const overflow = lengthOverflowFromMessage(message);
      if (overflow) {
        next = shortenTitleForLimit(next, Math.max(60, next.length - overflow.overflow - 2));
        repairs.push('shorten_for_variant_title_limit');
      }
      if (word === 'party') {
        const before = next;
        next = next
          .replace(/\bBridal Party Gifts\b/ig, 'Wedding Favor Gifts')
          .replace(/\bParty Gifts\b/ig, 'Gifts')
          .replace(/\bParty Supplies\b/ig, 'Supplies');
        if (next !== before) repairs.push('replace_bridal_party_gifts');
      }
      return { title: next, repairs, repeatedWord: word };
    };
    const postAction = async action => {
      const res = await fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        headers,
        referrer: iframeSrc,
        body: buildBody(action),
      });
      const text = await res.text();
      try { return JSON.parse(text || '{}'); } catch (_) { return { code: 0, msg: text.slice(0, 500), httpStatus: res.status }; }
    };

    const events = [];
    for (const input of actions) {
      const origin = await getOriginData(input.sku);
      const originCopy = originPayload(origin);
      const originMatch = originTitleMatchesPlan(input, originCopy);
      if (!originMatch.ok) {
        events.push({
          sku: input.sku,
          productId: input.productId,
          response: {
            code: 0,
            msg: originMatch.field === 'title_en' ? 'origin_title_en_mismatch' : 'origin_parent_title_mismatch',
            plannedOriginalTitle: input.original?.parentTitle || '',
            liveOriginTitle: originCopy.parentTitle || '',
            plannedOriginalTitleEn: input.original?.titleEn || input.original?.title_en || '',
            liveOriginTitleEn: originCopy.titleEn || '',
          },
          submittedTitle: '',
          autoRepairs: [],
          originFetched: Number(origin?.code) === 200 || !!originCopy.parentTitle,
          tokenState: { hasCsrf: !!csrf, referrerHasInventoryToken: iframeSrc.includes('Inventory-Token=') },
        });
        continue;
      }
      const inputNow = input.now || {};
      const inputNowBullets = asList(inputNow.bulletPoints);
      const originBullets = asList(originCopy.bulletPoints);
      const action = {
        ...input,
        original: {
          ...(input.original || {}),
          parentTitle: normalizeText(originCopy.parentTitle || input.original?.parentTitle),
          titleEn: normalizeText(originCopy.titleEn || input.original?.titleEn || input.original?.title_en),
          bulletPoints: originBullets.length ? originBullets : asList(input.original?.bulletPoints),
          productDescription: normalizeDescriptionText(originCopy.productDescription || input.original?.productDescription),
          searchCoreKeywords: normalizeText(originCopy.searchCoreKeywords || input.original?.searchCoreKeywords),
        },
        now: {
          ...inputNow,
          parentTitle: normalizeText(inputNow.parentTitle || originCopy.parentTitle || input.original?.parentTitle),
          titleEn: normalizeText(inputNow.titleEn || inputNow.title_en || originCopy.titleEn || input.original?.titleEn || input.original?.title_en),
          bulletPoints: inputNowBullets.length ? inputNowBullets : originBullets,
          productDescription: normalizeDescriptionText(inputNow.productDescription || originCopy.productDescription || input.original?.productDescription),
          searchCoreKeywords: normalizeText(inputNow.searchCoreKeywords || originCopy.searchCoreKeywords || input.original?.searchCoreKeywords),
        },
        phraseFrequencyText: normalizeText(input.phraseFrequencyText || originCopy.phraseFrequencyText),
      };
      try {
        let response = await postAction(action);
        const autoRepairs = [];
        if (Number(response?.code) !== 200) {
          const repaired = repairTitleForMessage(action.now?.parentTitle, response.msg || response.message);
          if (repaired.repairs.length && repaired.title && repaired.title !== action.now?.parentTitle) {
            action.now.parentTitle = repaired.title;
            autoRepairs.push(...repaired.repairs);
            response = await postAction(action);
          }
        }
        events.push({
          sku: action.sku,
          productId: action.productId,
          response,
          submittedTitle: action.now?.titleEn || action.now?.parentTitle || '',
          autoRepairs,
          originFetched: Number(origin?.code) === 200 || !!originCopy.parentTitle,
          tokenState: { hasCsrf: !!csrf, referrerHasInventoryToken: iframeSrc.includes('Inventory-Token=') },
        });
      } catch (error) {
        events.push({
          sku: input.sku,
          productId: input.productId,
          response: { code: 0, msg: error.message },
          originFetched: Number(origin?.code) === 200 || !!originCopy.parentTitle,
          tokenState: { hasCsrf: !!csrf, referrerHasInventoryToken: iframeSrc.includes('Inventory-Token=') },
        });
      }
    }
    return JSON.stringify({ events });
  };
}

async function executeListingCopyActions(actions, options = {}) {
  const tab = await findSellerInventoryTab(options.browserUrl);
  const expression = `(${browserExecutorSource()})(${JSON.stringify({ actions, endpoint: ENDPOINT })})`;
  const raw = await evaluate(tab, expression, true);
  const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
  const events = (parsed.events || []).map(event => {
    const classified = classifyListingCopyEditResponse(event.response || {});
      return {
        sku: event.sku,
        productId: event.productId,
        ...classified,
        submittedTitle: event.submittedTitle || '',
        autoRepairs: event.autoRepairs || [],
        originFetched: event.originFetched === true,
        tokenState: event.tokenState || {},
        result: redactExecutionResult(event),
    };
  });
  return {
    executedAt: new Date().toISOString(),
    summary: {
      total: events.length,
      submitted: events.filter(event => event.finalStatus === 'submitted_pending_review').length,
      covered: events.filter(event => event.finalStatus === 'covered_by_existing_variant_application').length,
      failed: events.filter(event => !event.success).length,
    },
    events,
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const protectedListingSkus = loadProtectedListingSkus(path.resolve(options.protectedListingSkus));
  const snapshot = fs.existsSync(path.resolve(options.snapshot)) ? readJson(path.resolve(options.snapshot)) : {};
  const plan = loadListingCopyPlan(options.schema || latestListingApplicationFile(), { limit: options.limit });
  if (!options.execute) {
    const split = splitExecutableActions(plan.actions, { protectedListingSkus, snapshot });
    const report = buildListingCopyDryRunReport(split.valid, { businessDate: plan.businessDate });
    report.skippedInvalid = split.invalid;
    report.summary.invalidSkipped = split.invalid.length;
    const out = path.resolve(options.out || defaultDryRunFile(plan.businessDate));
    writeJson(out, {
      ...report,
      schemaFile: plan.schemaFile,
      protectedListingSkusFile: path.resolve(options.protectedListingSkus),
    });
    console.log(JSON.stringify({ mode: 'dry-run', out, summary: report.summary }, null, 2));
    return;
  }

  const split = splitExecutableActions(plan.actions, { protectedListingSkus, snapshot });
  if (!split.valid.length) {
    throw new Error(`listing copy plan has no valid executable actions: ${JSON.stringify(split.invalid)}`);
  }
  const result = await executeListingCopyActions(split.valid.map(normalizeCopyEditPayload), options);
  result.skippedInvalid = split.invalid;
  result.summary.invalidSkipped = split.invalid.length;
  const out = path.resolve(options.out || defaultExecutionFile(plan.businessDate));
  writeJson(out, {
    ...result,
    schemaFile: plan.schemaFile,
    protectedListingSkusFile: path.resolve(options.protectedListingSkus),
  });
  console.log(JSON.stringify({ mode: 'execute', out, summary: result.summary }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = {
  browserExecutorSource,
  defaultDryRunFile,
  defaultExecutionFile,
  executeListingCopyActions,
  latestListingApplicationFile,
  loadListingCopyPlan,
  redactExecutionResult,
  splitExecutableActions,
};
