const fs = require('fs');
const path = require('path');
const { evaluate, listTabs } = require('../../discovery/lib/cdp');
const { validateCopyEditAction, ENDPOINT } = require('../../src/listing_copy_edit');

const ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'snapshots');

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = name => {
    const index = args.indexOf(name);
    return index >= 0 ? (args[index + 1] || '') : '';
  };
  return {
    sku: (get('--sku') || '').trim().toUpperCase(),
    title: get('--title'),
    bullets: get('--bullets'),
    searchTerms: get('--search-terms') || get('--search'),
    remark: get('--remark'),
    reason: get('--reason'),
    schema: get('--schema'),
    execute: args.includes('--execute'),
    out: get('--out'),
    browserUrl: get('--browser-url') || process.env.DISCOVERY_BROWSER_URL || 'http://127.0.0.1:9222',
  };
}

async function findSellerInventoryTab(browserUrl) {
  const tabs = await listTabs(browserUrl);
  const tab = tabs.find(item => String(item.url || '').includes('sellerinventory.yswg.com.cn') && item.webSocketDebuggerUrl);
  if (!tab) throw new Error('Cannot find sellerinventory tab on Chrome debug port. Open sellerinventory.yswg.com.cn in debug Chrome first.');
  return tab;
}

async function fetchOriginData(tab, sku) {
  const code = `(async () => {
    const url = 'https://sellerinventory.yswg.com.cn/kernel/productEditApply/getOriginData?sku=${sku}&type=en';
    const res = await fetch(url, { credentials: 'include', headers: { accept: 'application/json' } });
    return await res.json();
  })()`;
  return await evaluate(tab, code, true);
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function extractOriginCopy(origin) {
  const data = origin?.data || origin?.result || origin || {};
  return {
    productId: String(data.id || ''),
    parentTitle: text(data.parent_title || data.parentTitle || ''),
    titleEn: text(data.title_en || data.titleEn || ''),
    bulletPoints: (Array.isArray(data.bullet_points) ? data.bullet_points : []).map(text).filter(Boolean),
    productDescription: text(data.product_description || data.productDescription || ''),
    searchCoreKeywords: text(data.search_core_keywords || data.searchCoreKeywords || ''),
    phraseFrequencyText: text(data.phrase_frequency_text || data.phraseFrequencyText || ''),
  };
}

function buildSchemaFromArgs(opts, origin) {
  const bullets = opts.bullets
    ? opts.bullets.split('|||').map(text).filter(Boolean)
    : origin.bulletPoints;

  return {
    businessDate: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    source: 'edit_listing_copy_cli',
    items: [{
      sku: opts.sku,
      actions: [{
        entityType: 'listing',
        actionType: 'copy_edit',
        id: `listing::${origin.productId}::${opts.sku}::edit`,
        productId: origin.productId,
        sku: opts.sku,
        filedType: 'A',
        toEditorFlag: 1,
        variantStatus: 2,
        languageType: 'us',
        remark: opts.remark,
        reason: opts.reason || opts.remark,
        original: {
          parentTitle: origin.parentTitle,
          titleEn: origin.titleEn,
          bulletPoints: origin.bulletPoints,
          productDescription: origin.productDescription,
          searchCoreKeywords: origin.searchCoreKeywords,
        },
        now: {
          parentTitle: origin.parentTitle,
          titleEn: opts.title ? text(opts.title) : origin.titleEn,
          bulletPoints: bullets,
          productDescription: origin.productDescription,
          searchCoreKeywords: opts.searchTerms ? text(opts.searchTerms) : origin.searchCoreKeywords,
        },
        phraseFrequencyText: origin.phraseFrequencyText,
        riskLevel: 'listing_copy_edit_reviewed',
        confidence: 0.80,
        decisionStage: 'manual_approved',
        approvedBy: 'manual',
        actionSource: ['claude'],
        canAutoExecute: true,
      }],
    }],
  };
}

function buildSchemaFromFile(schemaFile, origin) {
  const raw = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
  const items = Array.isArray(raw) ? raw : (raw.items || [raw]);
  const actions = [];
  for (const item of items) {
    for (const action of (item.actions || [])) {
      if (action.entityType === 'listing' && action.actionType === 'copy_edit') {
        actions.push(action);
        continue;
      }
      if (action.id && action.id.startsWith('listing::')) {
        actions.push({ ...action, entityType: 'listing', actionType: 'copy_edit' });
      }
    }
    if (!item.actions && item.now) {
      actions.push(item);
    }
  }
  if (!actions.length) throw new Error(`No listing copy_edit actions found in ${schemaFile}`);
  const merged = actions.map(action => ({
    ...action,
    productId: action.productId || origin.productId,
    original: {
      parentTitle: origin.parentTitle,
      titleEn: origin.titleEn,
      bulletPoints: origin.bulletPoints,
      productDescription: origin.productDescription,
      searchCoreKeywords: origin.searchCoreKeywords,
      ...(action.original || {}),
    },
    phraseFrequencyText: action.phraseFrequencyText || origin.phraseFrequencyText || '',
    decisionStage: 'manual_approved',
    approvedBy: 'manual',
    canAutoExecute: true,
  }));
  return {
    businessDate: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    source: 'edit_listing_copy_cli',
    items: [{ sku: actions[0]?.sku || '', actions: merged }],
  };
}

function printDiff(schema, origin) {
  const action = schema.items[0]?.actions[0];
  if (!action) return;
  console.log('\n=== TITLE ===');
  if (action.now.titleEn !== origin.titleEn) {
    console.log('- ' + origin.titleEn);
    console.log('+ ' + action.now.titleEn);
  } else {
    console.log('(unchanged)');
  }
  console.log('\n=== BULLETS ===');
  const maxLen = Math.max(origin.bulletPoints.length, (action.now.bulletPoints || []).length);
  for (let i = 0; i < maxLen; i++) {
    const old = origin.bulletPoints[i] || '';
    const cur = (action.now.bulletPoints || [])[i] || '';
    if (old !== cur) {
      console.log(`B${i + 1} - ${old.slice(0, 70)}...`);
      console.log(`B${i + 1} + ${cur.slice(0, 70)}...`);
    } else {
      console.log(`B${i + 1}   (unchanged)`);
    }
  }
  console.log('\n=== SEARCH TERMS ===');
  if (action.now.searchCoreKeywords !== origin.searchCoreKeywords) {
    console.log('- ' + (origin.searchCoreKeywords || '(empty)'));
    console.log('+ ' + action.now.searchCoreKeywords);
  } else {
    console.log('(unchanged)');
  }
  console.log('\n=== REMARK ===');
  console.log(action.remark || '(none)');
  console.log('');
}

async function main() {
  const opts = parseArgs(process.argv);

  if (!opts.sku) {
    console.error('Usage: node scripts/execute/edit_listing_copy.js --sku <SKU> [--title "..."] [--bullets "B1|||B2|||..."] [--search-terms "..."] --remark "..." [--execute]');
    console.error('       node scripts/execute/edit_listing_copy.js --sku <SKU> --schema <file.json> --remark "..." [--execute]');
    process.exit(1);
  }

  if (!opts.remark && !opts.schema) {
    console.error('Error: --remark is required. Write a short human-readable reason for this edit.');
    process.exit(1);
  }

  console.log(`Fetching origin data for ${opts.sku}...`);
  const tab = await findSellerInventoryTab(opts.browserUrl);
  const originRaw = await fetchOriginData(tab, opts.sku);
  if (!originRaw || originRaw.code !== 200) {
    console.error('Failed to fetch origin data:', JSON.stringify(originRaw?.msg || originRaw || 'unknown'));
    process.exit(1);
  }
  const origin = extractOriginCopy(originRaw);
  console.log(`  productId: ${origin.productId}`);
  console.log(`  current title: ${origin.titleEn.slice(0, 80)}...`);
  console.log(`  current bullets: ${origin.bulletPoints.length}`);
  console.log(`  current search terms: ${origin.searchCoreKeywords ? origin.searchCoreKeywords.slice(0, 60) + '...' : '(empty)'}`);

  let schema;
  if (opts.schema) {
    schema = buildSchemaFromFile(path.resolve(opts.schema), origin);
    if (opts.remark) {
      schema.items[0].actions.forEach(a => { a.remark = opts.remark; a.reason = a.reason || opts.remark; });
    }
  } else {
    if (!opts.title && !opts.bullets && !opts.searchTerms) {
      console.error('Error: provide at least one of --title, --bullets, --search-terms (or use --schema <file>)');
      process.exit(1);
    }
    schema = buildSchemaFromArgs(opts, origin);
  }

  const action = schema.items[0]?.actions[0];
  const validation = validateCopyEditAction(action);
  if (!validation.ok) {
    console.error('\nValidation FAILED:');
    validation.errors.forEach(e => console.error('  ERROR:', e));
    validation.warnings.forEach(w => console.error('  WARN:', w));
    process.exit(2);
  }
  if (validation.warnings.length) {
    validation.warnings.forEach(w => console.log('  WARN:', w));
  }

  printDiff(schema, origin);

  const outFile = opts.out || path.join(SNAPSHOT_DIR, `listing_copy_edit_schema_${opts.sku.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(schema, null, 2), 'utf8');
  console.log(`Schema written: ${outFile}`);

  if (!opts.execute) {
    console.log('\nDry-run complete. Add --execute to submit.');
    console.log(`  npm run ops:listing:edit -- --sku ${opts.sku} --schema ${path.relative(ROOT, outFile)} --remark "..." --execute`);
    process.exit(0);
  }

  console.log('\nSubmitting...');
  const { execSync } = require('child_process');
  const result = execSync(`node scripts/execute/run_listing_copy_edits.js --schema "${outFile}" --execute`, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
  });
  console.log(result);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
