# Listing Copy Edit Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-dry-run listing copy edit action that can preview and submit seller inventory product edit applications.

**Architecture:** Keep copy generation outside scripts. Add pure listing-copy helpers for validation, form mapping, preview generation, and response classification; wire those helpers into `src/ai_decision.js` and `auto_adjust.js`. Execution submits through the logged-in `sellerinventory.yswg.com.cn` browser tab and records application submission as `submitted_pending_review`.

**Tech Stack:** Node.js CommonJS, built-in `assert` tests, existing Chrome DevTools WebSocket pattern, existing `run_actions.js` execution chain.

---

## File Structure

- Create `src/listing_copy_edit.js`: pure helper module for normalizing copy payloads, building URL-encoded backend form data, redacted dry-run previews, and classifying API responses.
- Create `tests/listing_copy_edit.test.js`: unit tests for the helper module.
- Modify `src/ai_decision.js`: accept `entityType: "listing"` and `actionType: "copy_edit"`, normalize copy edit fields, enforce approval gates, and produce a submission verification spec.
- Modify `tests/ai_decision.test.js`: add validator tests for approved copy edits and missing approval.
- Modify `auto_adjust.js`: include listing copy edit actions in dry-run artifacts and execute them through seller inventory browser POST.
- Modify `package.json`: include `tests/listing_copy_edit.test.js` in `npm test`.
- Modify `README.md`: document the schema shape and safety boundary.

## Task 1: Pure Listing Copy Helpers

**Files:**
- Create: `src/listing_copy_edit.js`
- Test: `tests/listing_copy_edit.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing helper tests**

Add `tests/listing_copy_edit.test.js`:

```js
const assert = require('assert');
const {
  normalizeCopyEditPayload,
  buildListingCopyEditForm,
  buildListingCopyEditPreview,
  classifyListingCopyEditResponse,
} = require('../src/listing_copy_edit');

const action = {
  productId: '2839421',
  sku: 'STA2613',
  filedType: 'A',
  toEditorFlag: 1,
  variantStatus: 1,
  beforeStatus: 0,
  languageType: 'us,uk,ca',
  synchronizeFields: ['bullet_points1', 'bullet_points2', 'bullet_points3', 'bullet_points4'],
  synchronizeVariantSkus: ['STA2604', 'STA2607', 'STA2610'],
  remark: "Optimize Father's Day product copy",
  reason: 'Sales are weak; update copy for Father Day positioning.',
  original: {
    parentTitle: 'Old title',
    bulletPoints: ['Old bullet 1', 'Old bullet 2'],
  },
  now: {
    parentTitle: 'New title',
    bulletPoints: ['New bullet 1', 'New bullet 2', 'New bullet 3', 'New bullet 4', 'New bullet 5'],
  },
  phraseFrequencyText: 'Pastor Christian gift',
};

{
  const normalized = normalizeCopyEditPayload(action);
  assert.strictEqual(normalized.productId, '2839421');
  assert.strictEqual(normalized.sku, 'STA2613');
  assert.deepStrictEqual(normalized.synchronizeVariantSkus, ['STA2604', 'STA2607', 'STA2610']);
  assert.strictEqual(normalized.now.bulletPoints.length, 5);
  assert.deepStrictEqual(normalized.warnings, []);
}

{
  const form = buildListingCopyEditForm(action);
  assert.strictEqual(form.get('product_id'), '2839421');
  assert.strictEqual(form.get('sku'), 'STA2613');
  assert.strictEqual(form.get('filed_type'), 'A');
  assert.strictEqual(form.get('language_type'), 'us,uk,ca');
  assert.deepStrictEqual(form.getAll('synchronizeFields[]'), ['bullet_points1', 'bullet_points2', 'bullet_points3', 'bullet_points4']);
  assert.deepStrictEqual(form.getAll('original[bullet_points][]'), ['Old bullet 1', 'Old bullet 2']);
  assert.deepStrictEqual(form.getAll('now[bullet_points][]'), ['New bullet 1', 'New bullet 2', 'New bullet 3', 'New bullet 4', 'New bullet 5']);
  assert.strictEqual(form.get('now[synchronize_variant_sku]'), 'STA2604,STA2607,STA2610');
  assert.strictEqual(form.toString().includes('x-csrf-token'), false);
}

{
  const preview = buildListingCopyEditPreview(action);
  assert.strictEqual(preview.endpoint, 'https://sellerinventory.yswg.com.cn/kernel/productEditApply/store');
  assert.strictEqual(preview.productId, '2839421');
  assert.strictEqual(preview.sku, 'STA2613');
  assert.strictEqual(preview.sensitiveHeadersPersisted, false);
  assert.deepStrictEqual(preview.formKeys.filter(key => key === 'now[bullet_points][]').length, 5);
}

{
  assert.deepStrictEqual(
    classifyListingCopyEditResponse({ code: 200, msg: '提交成功!', id: 4407286, ids: [4407286] }),
    { ok: true, finalStatus: 'submitted_pending_review', applicationId: '4407286', applicationIds: ['4407286'], message: '提交成功!' }
  );
  assert.strictEqual(classifyListingCopyEditResponse({ code: 500, msg: 'failed' }).ok, false);
}

{
  const normalized = normalizeCopyEditPayload({
    productId: '',
    sku: 'STA2613',
    now: { parentTitle: '', bulletPoints: ['', 'Valid bullet'] },
  });
  assert.ok(normalized.errors.includes('productId_required'));
  assert.ok(normalized.warnings.includes('first_bullet_empty'));
}

{
  const normalized = normalizeCopyEditPayload({
    productId: '2251036',
    sku: 'EY5555',
    synchronizeFields: ['bullet_points1'],
    synchronizeVariantSkus: [],
    now: { parentTitle: "Father's Day Christian Keychains", bulletPoints: ['Valid bullet'] },
  });
  assert.ok(normalized.warnings.includes('sync_fields_without_variant_skus'));
  const form = buildListingCopyEditForm(normalized);
  assert.deepStrictEqual(form.getAll('synchronizeFields[]'), []);
}

console.log('listing_copy_edit tests passed');
```

Update `package.json` so `npm test` starts with:

```json
"test": "node tests/listing_copy_edit.test.js && node tests/adjust_lib.test.js && node tests/product_profile.test.js && node tests/ai_decision.test.js && node tests/listing_parser.test.js && node tests/generator_listing_signals.test.js && node tests/operation_scope.test.js && node tests/inventory_economics.test.js && node tests/sales_history_parser.test.js && node tests/ops_time_adjustment_task_scheduler.test.js && node tests/over_budget_policy.test.js && node tests/over_budget_seasonal_generator.test.js && node tests/overbudget_lower_bid_negative_profit.test.js && node tests/over_budget_budget_floor.test.js"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tests\listing_copy_edit.test.js
```

Expected: FAIL with `Cannot find module '../src/listing_copy_edit'`.

- [ ] **Step 3: Implement the helper module**

Create `src/listing_copy_edit.js` with these exports:

```js
const ENDPOINT = 'https://sellerinventory.yswg.com.cn/kernel/productEditApply/store';

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(item => cleanText(item)).filter(item => item || item === '');
}

function normalizeCopyEditPayload(input = {}) {
  const now = input.now || {};
  const original = input.original || {};
  const normalized = {
    productId: cleanText(input.productId || input.product_id),
    sku: cleanText(input.sku),
    filedType: cleanText(input.filedType || input.filed_type || 'A'),
    toEditorFlag: Number(input.toEditorFlag ?? input.to_editor_flag ?? 1),
    variantStatus: Number(input.variantStatus ?? input.variant_status ?? 1),
    beforeStatus: Number(input.beforeStatus ?? input.before_status ?? 0),
    languageType: cleanText(input.languageType || input.language_type || 'us,uk,ca'),
    synchronizeFields: cleanList(input.synchronizeFields || input.synchronize_fields),
    synchronizeVariantSkus: cleanList(input.synchronizeVariantSkus || input.synchronize_variant_sku),
    synchronizeSkus: cleanText(input.synchronizeSkus || input.synchronizeSkusText || ''),
    remark: cleanText(input.remark),
    reason: cleanText(input.reason),
    relation: cleanText(input.relation),
    isSimpleWa: cleanText(input.isSimpleWa || input.is_simple_wa),
    titleType: cleanText(input.titleType || input.title_type),
    excludeSimple: String(input.excludeSimple ?? input.exclude_simple ?? '1'),
    phraseFrequencyText: String(input.phraseFrequencyText || input.phrase_frequency_text || ''),
    origin: String(input.origin || ''),
    original: {
      parentTitle: cleanText(original.parentTitle || original.parent_title),
      bulletPoints: cleanList(original.bulletPoints || original.bullet_points),
    },
    now: {
      parentTitle: cleanText(now.parentTitle || now.parent_title),
      bulletPoints: cleanList(now.bulletPoints || now.bullet_points),
    },
    warnings: [],
    errors: [],
  };

  if (!normalized.productId) normalized.errors.push('productId_required');
  if (!normalized.sku) normalized.errors.push('sku_required');
  if (!normalized.now.parentTitle && !normalized.now.bulletPoints.some(Boolean)) normalized.errors.push('now_copy_required');
  if (!normalized.reason) normalized.warnings.push('reason_missing');
  if (normalized.now.bulletPoints.length && !normalized.now.bulletPoints[0]) normalized.warnings.push('first_bullet_empty');
  if (normalized.now.bulletPoints.length > 5) normalized.warnings.push('too_many_bullets');
  if (normalized.now.parentTitle.length > 200) normalized.warnings.push('title_over_200_chars');
  if (normalized.synchronizeVariantSkus.length && !normalized.synchronizeFields.length) normalized.warnings.push('variant_sync_without_fields');
  if (normalized.synchronizeFields.length && !normalized.synchronizeVariantSkus.length) {
    normalized.warnings.push('sync_fields_without_variant_skus');
    normalized.synchronizeFields = [];
  }

  return normalized;
}

function appendAll(params, key, values) {
  for (const value of values || []) params.append(key, value);
}

function buildListingCopyEditForm(input = {}) {
  const payload = normalizeCopyEditPayload(input);
  const params = new URLSearchParams();
  params.set('product_id', payload.productId);
  params.set('sku', payload.sku);
  params.set('to_editor_flag', String(payload.toEditorFlag));
  params.set('filed_type', payload.filedType);
  appendAll(params, 'synchronizeFields[]', payload.synchronizeFields);
  params.set('synchronizeSkus', payload.synchronizeSkus);
  params.set('remark', payload.remark);
  params.set('relation', payload.relation);
  params.set('variant_status', String(payload.variantStatus));
  params.set('before_status', String(payload.beforeStatus));
  params.set('is_simple_wa', payload.isSimpleWa);
  params.set('title_type', payload.titleType);
  params.set('language_type', payload.languageType);
  params.set('reason', payload.reason);
  params.set('original[parent_title]', payload.original.parentTitle);
  appendAll(params, 'original[bullet_points][]', payload.original.bulletPoints);
  params.set('now[parent_title]', payload.now.parentTitle);
  appendAll(params, 'now[bullet_points][]', payload.now.bulletPoints);
  params.set('now[synchronize_variant_sku]', payload.synchronizeVariantSkus.join(','));
  params.set('exclude_simple', payload.excludeSimple);
  params.set('phrase_frequency_text', payload.phraseFrequencyText);
  params.set('origin', payload.origin);
  return params;
}

function buildListingCopyEditPreview(input = {}) {
  const payload = normalizeCopyEditPayload(input);
  const form = buildListingCopyEditForm(payload);
  return {
    endpoint: ENDPOINT,
    method: 'POST',
    productId: payload.productId,
    sku: payload.sku,
    newTitle: payload.now.parentTitle,
    newBulletPoints: payload.now.bulletPoints,
    originalTitle: payload.original.parentTitle,
    originalBulletPoints: payload.original.bulletPoints,
    synchronizeFields: payload.synchronizeFields,
    synchronizeVariantSkus: payload.synchronizeVariantSkus,
    warnings: payload.warnings,
    errors: payload.errors,
    formKeys: [...form.keys()],
    sensitiveHeadersPersisted: false,
  };
}

function classifyListingCopyEditResponse(response = {}) {
  const applicationIds = Array.isArray(response.ids)
    ? response.ids.map(item => String(item)).filter(Boolean)
    : [];
  const applicationId = response.id ? String(response.id) : (applicationIds[0] || '');
  const ok = Number(response.code) === 200 && !!applicationId;
  return {
    ok,
    finalStatus: ok ? 'submitted_pending_review' : 'failed',
    applicationId,
    applicationIds,
    message: String(response.msg || response.message || ''),
  };
}

module.exports = {
  ENDPOINT,
  normalizeCopyEditPayload,
  buildListingCopyEditForm,
  buildListingCopyEditPreview,
  classifyListingCopyEditResponse,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node tests\listing_copy_edit.test.js
```

Expected: PASS and prints `listing_copy_edit tests passed`.

## Task 2: Action Schema Validation

**Files:**
- Modify: `src/ai_decision.js`
- Test: `tests/ai_decision.test.js`

- [ ] **Step 1: Write failing validator tests**

Append to `tests/ai_decision.test.js` before the final `console.log`:

```js
{
  const context = { products: buildProductContexts(cards, rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'approved listing copy edit',
      actions: [
        {
          entityType: 'listing',
          id: 'listing::2839421::SKU-1',
          actionType: 'copy_edit',
          productId: '2839421',
          reason: 'Manual copy update after weak sales.',
          now: {
            parentTitle: 'New Parent Title',
            bulletPoints: ['New bullet 1', 'New bullet 2'],
          },
          original: {
            parentTitle: 'Old Parent Title',
            bulletPoints: ['Old bullet 1'],
          },
          evidence: ['operator supplied copy'],
          confidence: 0.8,
          riskLevel: 'listing_copy_edit_reviewed',
          decisionStage: 'manual_approved',
          approvedBy: 'manual',
          actionSource: ['manual'],
          requiresAiDecision: false,
          canAutoExecute: true,
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.errors.length, 0);
  assert.strictEqual(validated.review.length, 0);
  assert.strictEqual(validated.plan[0].actions.length, 1);
  assert.strictEqual(validated.plan[0].actions[0].entityType, 'listing');
  assert.strictEqual(validated.plan[0].actions[0].actionType, 'copy_edit');
  assert.strictEqual(validated.plan[0].actions[0].verifySource, 'listingCopyEditApplications');
  assert.strictEqual(validated.plan[0].actions[0].expected.value, 'submitted_pending_review');
}

{
  const context = { products: buildProductContexts(cards, rowsByType, [], [], []).products };
  const validated = validateAndNormalizePlan([
    {
      sku: 'SKU-1',
      summary: 'unapproved listing copy edit',
      actions: [
        {
          entityType: 'listing',
          id: 'listing::2839421::SKU-1',
          actionType: 'copy_edit',
          productId: '2839421',
          reason: 'Candidate copy needs approval.',
          now: { parentTitle: 'New Parent Title', bulletPoints: ['New bullet 1'] },
          actionSource: ['generator_candidate'],
          decisionStage: 'candidate',
          requiresAiDecision: true,
        },
      ],
    },
  ], context);
  assert.strictEqual(validated.errors.length, 0);
  assert.strictEqual(validated.review.length, 1);
  assert.strictEqual(validated.plan[0].actions.length, 0);
  assert.ok(validated.review[0].action.reason.includes('missing_codex_execution_approval'));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tests\ai_decision.test.js
```

Expected: FAIL because `listing` and `copy_edit` are not accepted yet.

- [ ] **Step 3: Implement validator changes**

In `src/ai_decision.js`:

```js
const { normalizeCopyEditPayload } = require('./listing_copy_edit');
```

Update `normalizeEntityType`:

```js
if (['campaign', 'keyword', 'autoTarget', 'manualTarget', 'productAd', 'sbKeyword', 'sbTarget', 'sbCampaign', 'skuCandidate', 'sbCampaignCandidate', 'listing'].includes(text)) return text;
```

Update `normalizeActionType`:

```js
if (['bid', 'budget', 'placement', 'enable', 'pause', 'review', 'create', 'structure_fix', 'copy_edit'].includes(text)) return text;
```

Update `buildVerificationSpec` before the final `return null`:

```js
if (actionType === 'copy_edit') {
  return {
    verifySource: 'listingCopyEditApplications',
    verifyField: 'applicationStatus',
    expected: {
      type: 'enum',
      sourceField: 'apiResult.finalStatus',
      value: 'submitted_pending_review',
    },
  };
}
```

When resolving entity in `validateAndNormalizePlan`, treat listing like a SKU-level entity:

```js
const entity = actionType === 'create' || entityType === 'listing' || (actionType === 'review' && entityType === 'skuCandidate')
  ? { id, entityType, sourceSignals: ['codex'], currentBid: null }
  : findProductEntity(product, entityType, id);
```

After building the `normalized` object and before verification, add:

```js
if (actionType === 'copy_edit') {
  const copyPayload = normalizeCopyEditPayload({
    ...rawAction,
    sku,
  });
  normalized.productId = copyPayload.productId;
  normalized.copyEdit = copyPayload;
  normalized.formWarnings = copyPayload.warnings;
  if (copyPayload.errors.length) {
    errors.push({ sku, id, entityType, reason: `copy_edit invalid: ${copyPayload.errors.join(',')}` });
    continue;
  }
}
```

In `gateRisk`, before scale/build gates:

```js
if (gated.actionType === 'copy_edit') {
  const failures = executionApprovalFailures(gated);
  if (failures.length || gated.canAutoExecute !== true) {
    gated.actionType = 'review';
    gated.canAutoExecute = false;
    gated.riskLevel = 'manual_review';
    gated.reason = `${gated.reason || ''} [risk_gate:missing_codex_execution_approval:${failures.join(',') || 'canAutoExecute_not_true'}]`.trim();
    return gated;
  }
  gated.canAutoExecute = true;
  gated.riskLevel = gated.riskLevel || 'listing_copy_edit_reviewed';
  return gated;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node tests\ai_decision.test.js
```

Expected: PASS and prints `ai_decision tests passed`.

## Task 3: Runner Dry-Run Preview

**Files:**
- Modify: `auto_adjust.js`
- Test: `tests/listing_copy_edit.test.js`

- [ ] **Step 1: Add failing dry-run preview test**

Append to `tests/listing_copy_edit.test.js`:

```js
const { buildListingCopyDryRunReport } = require('../auto_adjust');

{
  const report = buildListingCopyDryRunReport([
    {
      sku: 'STA2613',
      actions: [
        {
          entityType: 'listing',
          actionType: 'copy_edit',
          productId: '2839421',
          sku: 'STA2613',
          now: { parentTitle: 'New title', bulletPoints: ['Bullet 1'] },
          original: { parentTitle: 'Old title', bulletPoints: ['Old bullet'] },
          synchronizeVariantSkus: ['STA2604'],
        },
      ],
    },
  ]);
  assert.strictEqual(report.count, 1);
  assert.strictEqual(report.items[0].productId, '2839421');
  assert.strictEqual(report.items[0].sensitiveHeadersPersisted, false);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tests\listing_copy_edit.test.js
```

Expected: FAIL because `buildListingCopyDryRunReport` is not exported.

- [ ] **Step 3: Implement dry-run report**

In `auto_adjust.js`, import the helper:

```js
const { buildListingCopyEditPreview, buildListingCopyEditForm, classifyListingCopyEditResponse, ENDPOINT: LISTING_COPY_EDIT_ENDPOINT } = require('./src/listing_copy_edit');
```

Add a pure helper near `groupEventsBySku`:

```js
function buildListingCopyDryRunReport(plan = []) {
  const items = [];
  for (const productPlan of plan || []) {
    for (const action of productPlan.actions || []) {
      if (action.entityType !== 'listing' || action.actionType !== 'copy_edit') continue;
      items.push(buildListingCopyEditPreview({ ...action, sku: action.sku || productPlan.sku }));
    }
  }
  return {
    count: items.length,
    items,
  };
}
```

In the dry-run block, add:

```js
const listingCopyDryRun = buildListingCopyDryRunReport(plan);
dryReport.listingCopyEdit = listingCopyDryRun;
if (listingCopyDryRun.count) {
  const listingCopyDryRunFile = path.join(SNAPSHOTS_DIR, `listing_copy_edit_dry_run_${today}.json`);
  fs.writeFileSync(listingCopyDryRunFile, JSON.stringify(listingCopyDryRun, null, 2));
  dryReport.listingCopyEditFile = listingCopyDryRunFile;
}
```

Export the helper at the bottom:

```js
module.exports = {
  groupByAccountSite,
  hasRecentCandidateBlock,
  buildListingCopyDryRunReport,
  run,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node tests\listing_copy_edit.test.js
```

Expected: PASS.

## Task 4: Seller Inventory Execution

**Files:**
- Modify: `auto_adjust.js`
- Test: `tests/listing_copy_edit.test.js`

- [ ] **Step 1: Add failing response-classification integration test**

Append to `tests/listing_copy_edit.test.js`:

```js
const { buildListingCopyExecutionEvent } = require('../auto_adjust');

{
  const event = buildListingCopyExecutionEvent(
    {
      id: 'listing::2839421::STA2613',
      sku: 'STA2613',
      entityType: 'listing',
      actionType: 'copy_edit',
      productId: '2839421',
    },
    { code: 200, msg: '提交成功!', id: 4407286, ids: [4407286] }
  );
  assert.strictEqual(event.entityType, 'listing');
  assert.strictEqual(event.apiStatus, 'api_success');
  assert.strictEqual(event.finalStatus, 'submitted_pending_review');
  assert.strictEqual(event.applicationId, '4407286');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tests\listing_copy_edit.test.js
```

Expected: FAIL because `buildListingCopyExecutionEvent` is not exported.

- [ ] **Step 3: Implement execution event and browser submission**

In `auto_adjust.js`, add:

```js
function buildListingCopyExecutionEvent(action, response) {
  const classified = classifyListingCopyEditResponse(response);
  return {
    sku: action.sku,
    id: action.id,
    entityType: 'listing',
    actionType: 'copy_edit',
    apiStatus: classified.ok ? 'api_success' : 'failed',
    finalStatus: classified.finalStatus,
    success: classified.ok,
    applicationId: classified.applicationId,
    applicationIds: classified.applicationIds,
    resultMessage: classified.message,
    errorReason: classified.ok ? '' : classified.message,
    action,
  };
}
```

Inside `run`, after `execAdApi`, add seller inventory helpers that use DevTools in the inventory tab:

```js
async function findSellerInventoryTab() {
  const tabs = await new Promise((resolve, reject) => {
    require('http').get('http://127.0.0.1:9222/json/list', res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
  const tab = tabs.find(item => String(item.url || '').includes('sellerinventory.yswg.com.cn'));
  if (!tab?.webSocketDebuggerUrl) throw new Error('Cannot find sellerinventory.yswg.com.cn tab on Chrome debug port 9222.');
  return tab;
}

async function evalInWs(webSocketUrl, expression, awaitPromise = false) {
  const invWs = new WebSocket(webSocketUrl);
  await new Promise(resolve => invWs.on('open', resolve));
  try {
    return await new Promise((resolve, reject) => {
      const id = Math.floor(Math.random() * 1000000);
      const timer = setTimeout(() => {
        invWs.off('message', handler);
        reject(new Error('Seller inventory evaluation timed out'));
      }, 120000);
      const handler = data => {
        const response = JSON.parse(data);
        if (response.id !== id) return;
        clearTimeout(timer);
        invWs.off('message', handler);
        if (response.error) return reject(new Error(JSON.stringify(response.error)));
        resolve(response.result?.result?.value);
      };
      invWs.on('message', handler);
      invWs.send(JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise },
      }));
    });
  } finally {
    try { invWs.close(); } catch (_) {}
  }
}

async function execListingCopyEdit(action) {
  const tab = await findSellerInventoryTab();
  const body = buildListingCopyEditForm(action).toString();
  const expression = `
    (async () => {
      const csrf =
        document.querySelector('meta[name="csrf-token"]')?.content ||
        document.querySelector('input[name="_token"]')?.value ||
        window.Laravel?.csrfToken ||
        document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)?.[1] ||
        '';
      const res = await fetch(${JSON.stringify(LISTING_COPY_EDIT_ENDPOINT)}, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        headers: {
          accept: '*/*',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'x-csrf-token': decodeURIComponent(csrf),
          'x-requested-with': 'XMLHttpRequest'
        },
        body: ${JSON.stringify(body)}
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      return JSON.stringify(json || { code: 0, msg: text.slice(0, 500), httpStatus: res.status });
    })()
  `;
  const text = await evalInWs(tab.webSocketDebuggerUrl, expression, true);
  try { return JSON.parse(text || '{}'); } catch (error) { return { code: 0, msg: error.message, raw: text }; }
}
```

In the execute section, create and execute listing items:

```js
const listingCopyItems = plan.flatMap(p => p.actions.filter(a => a.entityType === 'listing' && a.actionType === 'copy_edit').map(a => ({ ...a, sku: p.sku })));
```

Add executor:

```js
async function executeListingCopyItems(items) {
  let apiSuccess = 0;
  let apiFailed = 0;
  for (const item of items) {
    const response = await execListingCopyEdit(item);
    const event = buildListingCopyExecutionEvent(item, response);
    executionEvents.push(event);
    if (event.apiStatus === 'api_success') apiSuccess += 1;
    else apiFailed += 1;
    log(`Listing copy_edit ${item.sku}: ${event.finalStatus}`);
    await wait(300);
  }
  return { apiSuccess, apiFailed };
}
```

Call it after create execution:

```js
apiStats.listingCopyEdit = await executeListingCopyItems(listingCopyItems);
```

Export `buildListingCopyExecutionEvent`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node tests\listing_copy_edit.test.js
```

Expected: PASS.

## Task 4A: Original Copy Fetch and Theme Conflict Guard

**Files:**
- Modify: `auto_adjust.js`
- Test: `tests/listing_copy_edit.test.js`

- [ ] **Step 1: Add failing guard tests**

Append to `tests/listing_copy_edit.test.js`:

```js
const { detectListingCopyThemeConflict } = require('../src/listing_copy_edit');

{
  const conflict = detectListingCopyThemeConflict({
    title: 'Christian Keychains Fathers Day Gift',
    searchCoreKeywords: "father's day gifts christian keychains men faith-based accessories",
    operatorNote: '父亲节流量大',
    automaticSeasonLabels: ['Nurse Week', 'Graduation'],
  });
  assert.strictEqual(conflict.hasConflict, true);
  assert.strictEqual(conflict.preferredTheme, 'fathers_day');
  assert.ok(conflict.reasons.some(item => item.includes('father')));
}

{
  const conflict = detectListingCopyThemeConflict({
    title: 'Nurse Appreciation Keychains',
    searchCoreKeywords: 'nurse week gifts',
    operatorNote: '',
    automaticSeasonLabels: ['Nurse Week'],
  });
  assert.strictEqual(conflict.hasConflict, false);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tests\listing_copy_edit.test.js
```

Expected: FAIL because `detectListingCopyThemeConflict` is not exported.

- [ ] **Step 3: Implement conflict detection and original fetch hook**

Add to `src/listing_copy_edit.js`:

```js
function detectListingCopyThemeConflict(input = {}) {
  const evidence = [
    input.title,
    input.searchCoreKeywords,
    input.phraseFrequencyText,
    input.operatorNote,
  ].map(value => String(value || '').toLowerCase()).join(' ');
  const seasonText = (input.automaticSeasonLabels || []).map(value => String(value || '').toLowerCase()).join(' ');
  const fatherEvidence = /father|fathers|father's|dad|dads|men|父亲节/.test(evidence);
  const nurseGraduationOnly = /(nurse|graduation)/.test(seasonText) && !/(father|dad|父亲)/.test(seasonText);
  const reasons = [];
  if (fatherEvidence) reasons.push('concrete_text_contains_father_dad_men_or_fathers_day');
  if (nurseGraduationOnly) reasons.push('automatic_season_tags_are_nurse_or_graduation_without_father');
  return {
    hasConflict: fatherEvidence && nurseGraduationOnly,
    preferredTheme: fatherEvidence ? 'fathers_day' : '',
    reasons,
  };
}
```

Export `detectListingCopyThemeConflict`.

In `auto_adjust.js`, add an execution helper that can fetch original copy before submitting:

```js
async function fetchListingOriginalData(sku) {
  const tab = await findSellerInventoryTab();
  const expression = `
    (async () => {
      const res = await fetch('https://sellerinventory.yswg.com.cn/kernel/productEditApply/getOriginData?sku=${encodeURIComponent(sku)}&type=en', {
        credentials: 'include',
        headers: { 'x-requested-with': 'XMLHttpRequest' }
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (_) {}
      return JSON.stringify(json || { code: 0, msg: text.slice(0, 500) });
    })()
  `;
  const text = await evalInWs(tab.webSocketDebuggerUrl, expression, true);
  try { return JSON.parse(text || '{}'); } catch (error) { return { code: 0, msg: error.message, raw: text }; }
}
```

Use this only when an action is missing `original.parentTitle` or `original.bulletPoints`; fill from `title_en`, `bullet_points`, `search_core_keywords`, and `phrase_frequency_text` before building the form.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node tests\listing_copy_edit.test.js
```

Expected: PASS.

## Task 5: Verification Summary and Documentation

**Files:**
- Modify: `auto_adjust.js`
- Modify: `README.md`

- [ ] **Step 1: Add listing status to final success classification**

In `auto_adjust.js`, wherever landed IDs and SKU coverage treat success-like outcomes, include `submitted_pending_review`:

```js
if (event.finalStatus === 'success' || event.finalStatus === 'created_pending_visibility' || event.finalStatus === 'submitted_pending_review') {
  landedIds.add(executionEntityKey(event.entityType, event.id));
}
```

In the SKU coverage status block, add before failure checks:

```js
} else if (events.some(event => event.finalStatus === 'submitted_pending_review')) {
  status = 'adjusted';
  reason = 'listing_copy_edit_submitted_pending_review';
```

- [ ] **Step 2: Document schema and command flow**

Add to `README.md` near executable capabilities:

```markdown
### Listing Copy Edit Applications

Listing copy edits use `entityType: "listing"` and `actionType: "copy_edit"`. They submit a seller inventory product edit application through the current logged-in `sellerinventory.yswg.com.cn` debug Chrome session.

The default run is dry-run. Review `data/snapshots/listing_copy_edit_dry_run_<date>.json` before executing. Execution verifies only that the application was submitted and records `submitted_pending_review`; it does not claim the Amazon listing has changed.

Before submission, fetch `/kernel/productEditApply/getOriginData?sku=<SKU>&type=en` for the original copy baseline when snapshot listing fields are missing. Do not trust automatic season tags over concrete title/search/operator evidence. If `father`, `dad`, `men`, or `父亲节` appears in real listing/search/operator fields while automatic tags say Nurse Week or Graduation, block generation for theme-conflict review.

When no synchronized variant SKUs are selected, omit `synchronizeFields[]`; otherwise the backend can reject the request with `请选择要同步的变体`.

Required approval fields:

- `decisionStage: "manual_approved"` or `"ai_approved"`
- `approvedBy: "manual"` or `"codex"`
- `actionSource` includes `manual` or `codex`
- `requiresAiDecision: false`
- `canAutoExecute: true`
```

- [ ] **Step 3: Run syntax checks**

Run:

```powershell
node --check src\listing_copy_edit.js
node --check src\ai_decision.js
node --check auto_adjust.js
```

Expected: all exit 0 with no syntax errors.

## Task 6: Full Regression

**Files:**
- Verify all touched behavior.

- [ ] **Step 1: Run targeted tests**

Run:

```powershell
node tests\listing_copy_edit.test.js
node tests\ai_decision.test.js
```

Expected: both pass.

- [ ] **Step 2: Run full test suite**

Run:

```powershell
npm test
```

Expected: all project tests pass.

- [ ] **Step 3: Review diff for token safety**

Run:

```powershell
rg -n "Rd55|x-csrf-token.*[A-Za-z0-9]{20,}|Cookie:|sec-ch-ua|accept-language" src scripts tests README.md docs\superpowers\plans docs\superpowers\specs
git diff -- src\listing_copy_edit.js src\ai_decision.js auto_adjust.js tests\listing_copy_edit.test.js tests\ai_decision.test.js package.json README.md
```

Expected: no pasted one-time CSRF token, cookies, or copied browser headers; diff only contains normalized runtime token lookup and redacted previews.

- [ ] **Step 4: Commit implementation**

Stage only implementation files:

```powershell
git add -- src\listing_copy_edit.js src\ai_decision.js auto_adjust.js tests\listing_copy_edit.test.js tests\ai_decision.test.js package.json README.md docs\superpowers\plans\2026-05-09-listing-copy-edit-action.md
git commit -m "Add listing copy edit action workflow"
```

Expected: commit succeeds with only the listing copy edit workflow files staged.

## Self-Review

- Spec coverage: manual copy path, Codex-generated candidate path, default dry-run, approval gates, browser-session execution, redacted token handling, submission-only verification, docs, and tests are covered.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: plan uses `entityType: "listing"`, `actionType: "copy_edit"`, `copyEdit`, `listingCopyEditApplications`, and `submitted_pending_review` consistently across helper, validator, runner, and docs.
