const assert = require('assert');
const {
  buildListingCopyDryRunReport,
  buildListingCopyEditForm,
  buildListingCopyEditPreview,
  classifyListingCopyEditResponse,
  extractRepeatedWordFromBackendMessage,
  flattenListingCopyActions,
  mergeOriginCopyForSubmission,
  normalizeProductDescriptionText,
  normalizeCopyEditPayload,
  plannedOriginalTitleMatchesOrigin,
  repairParentTitleForBackendMessage,
  validateCopyEditAction,
} = require('../src/listing_copy_edit');

const action = {
  entityType: 'listing',
  actionType: 'copy_edit',
  productId: '3005337',
  sku: 'MF6292',
  filedType: 'A',
  toEditorFlag: 1,
  variantStatus: 2,
  beforeStatus: 0,
  languageType: 'us,uk,ca',
  synchronizeFields: ['bullet_points1'],
  synchronizeVariantSkus: [],
  remark: 'Summer title keyword update',
  reason: 'Season title update',
  original: {
    parentTitle: 'Old title',
    bulletPoints: ['Old bullet'],
    productDescription: 'Old description',
    searchCoreKeywords: 'old keyword',
  },
  now: {
    parentTitle: 'New title',
    bulletPoints: ['New bullet'],
    productDescription: 'New description',
    searchCoreKeywords: 'new keyword',
  },
  phraseFrequencyText: 'frequency text',
  decisionStage: 'ai_approved',
  approvedBy: 'codex',
  actionSource: ['codex'],
  requiresAiDecision: false,
  canAutoExecute: true,
};

{
  const normalized = normalizeCopyEditPayload(action);
  assert.strictEqual(normalized.productId, '3005337');
  assert.strictEqual(normalized.original.parentTitle, 'Old title');
  assert.deepStrictEqual(normalized.synchronizeFields, []);
}

{
  const formatted = normalizeProductDescriptionText('</br>Features: </br>As a gift: </br>Line one\n</br>Line two');
  assert.strictEqual(formatted, '</br>Features:\n</br>As a gift:\n</br>Line one\n</br>Line two');
}

{
  const multilineDescription = '</br>Features:\n</br>\n</br>As a gift:\n</br>Line one';
  const normalized = normalizeCopyEditPayload({
    ...action,
    now: {
      ...action.now,
      parentTitle: 'New title with extra   spaces',
      productDescription: multilineDescription,
    },
  });
  assert.strictEqual(normalized.now.parentTitle, 'New title with extra spaces');
  assert.strictEqual(normalized.now.productDescription, multilineDescription);
}

{
  const validation = validateCopyEditAction(action);
  assert.strictEqual(validation.ok, true);
  assert.ok(validation.warnings.includes('sync_fields_omitted_without_variant_skus'));
}

{
  const validation = validateCopyEditAction({
    ...action,
    now: { parentTitle: 'A'.repeat(201) },
  });
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.errors.includes('parent_title_too_long'));
}

{
  const validation = validateCopyEditAction({
    ...action,
    now: { parentTitle: 'Brand '.repeat(22).trim() },
    titleMaxLength: 125,
  });
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.errors.includes('parent_title_over_125_conservative_limit'));
}

{
  const validation = validateCopyEditAction({
    ...action,
    now: { parentTitle: 'Brand Party Party Party Gift Set' },
  });
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.errors.includes('parent_title_repeated_word:party'));
}

{
  const validation = validateCopyEditAction({
    ...action,
    original: {
      parentTitle: 'Reallnaive Wedding Gift Box for Father of the Bride or Groom - 10oz Whiskey Glass - Sentimental Gift from Daughter or Son(Groom)',
    },
    now: {
      parentTitle: "Reallnaive Father's Day Wedding Gift Box for Dad, 10oz Whiskey Glass, Sentimental Gift from Daughter or Son",
    },
  });
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.errors.includes('parent_title_variant_specific_term_removed:bride'));
  assert.ok(validation.errors.includes('parent_title_variant_specific_term_removed:groom'));
}

{
  const validation = validateCopyEditAction({
    ...action,
    original: {
      parentTitle: 'Reallnaive Wedding Gift Box for Father of the Bride or Groom - 10oz Whiskey Glass - Sentimental Gift from Daughter or Son(Groom)',
    },
    now: {
      parentTitle: "Reallnaive Father's Day Wedding Gift Box for Father of the Bride or Groom, 10oz Whiskey Glass, Sentimental Gift from Daughter or Son",
    },
  });
  assert.strictEqual(validation.ok, true);
}

{
  const validation = validateCopyEditAction({
    ...action,
    now: { parentTitle: 'Brand Baby Shower Gift Set' },
    productCompliance: { productLabel: '\u975e\u513f\u7ae5\u4ea7\u54c1' },
  });
  assert.strictEqual(validation.ok, true);
  assert.strictEqual(validation.warnings.includes('parent_title_child_term_added_non_child_product:baby'), false);
}

{
  const validation = validateCopyEditAction({
    ...action,
    now: { parentTitle: 'Brand Kids Gift Set' },
    productCompliance: { productLabel: '\u5176\u4ed6\u513f\u7ae5\u4ea7\u54c1' },
  });
  assert.strictEqual(validation.ok, true);
  assert.ok(validation.warnings.includes('parent_title_child_term_added_child_product:kids'));
}

{
  const validation = validateCopyEditAction({
    ...action,
    original: { parentTitle: 'WinnerWhy Baby Shower Game Sign Kit' },
    now: { parentTitle: 'WinnerWhy Baby Shower Game Sign Kit Bridal Shower Favors' },
    productCompliance: { productLabel: '\u975e\u513f\u7ae5\u4ea7\u54c1' },
  });
  assert.strictEqual(validation.ok, true);
  assert.strictEqual(validation.warnings.some(item => item.includes('child_term')), false);
}

{
  const validation = validateCopyEditAction({
    ...action,
    original: { parentTitle: 'WinnerWhy Gender Reveal Party Game Sign Kit' },
    now: { parentTitle: 'WinnerWhy Gender Reveal Baby Shower Party Game Sign Kit' },
    productCompliance: { productLabel: '\u975e\u513f\u7ae5\u4ea7\u54c1' },
    productContext: {
      occasion: ['baby shower'],
      positioning: 'baby shower game sign',
    },
  });
  assert.strictEqual(validation.ok, true);
  assert.strictEqual(validation.warnings.some(item => item.includes('child_term')), false);
}

{
  const validation = validateCopyEditAction({
    ...action,
    original: { parentTitle: 'Brand Gift Set' },
    now: { parentTitle: 'Brand Kids Gift Set' },
    productCompliance: { productLabel: '\u975e\u513f\u7ae5\u4ea7\u54c1' },
  });
  assert.strictEqual(validation.ok, true);
  assert.ok(validation.warnings.includes('parent_title_child_term_added_non_child_product:kids'));
}

{
  const validation = validateCopyEditAction({
    ...action,
    original: { parentTitle: 'Brand Baby Pool Float for Teens' },
    now: { parentTitle: 'Brand Baby Pool Float for Teens Summer Product Season' },
  });
  assert.strictEqual(validation.ok, true);
}

{
  const validation = validateCopyEditAction({
    ...action,
    now: { parentTitle: 'Brand Gift Set!' },
  });
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.errors.includes('parent_title_blocked_special_char:!'));
}

{
  const message = 'OB5032标题含有重复词≥3次(party)，请检查修改!';
  assert.strictEqual(extractRepeatedWordFromBackendMessage(message), 'party');
  const repaired = repairParentTitleForBackendMessage(
    'Lewtemi Mexican Duck Piñata for Birthday Party Bridal Party Gifts Fiesta Decorations',
    message
  );
  assert.strictEqual(repaired.title, 'Lewtemi Mexican Duck Piñata for Birthday Party Wedding Favor Gifts Fiesta Decorations');
  assert.deepStrictEqual(repaired.repairs, ['replace_bridal_party_gifts']);
}

{
  const message = '该组变体母体标题加MF2768变体名称字符数204超过200无法修改';
  const repaired = repairParentTitleForBackendMessage(
    'HyDren 48 Inch Inflatable Number Pool Float – Giant Balloon Style Birthday Pool Party Decoration, Summer Outdoor Floating Fun, Large Inflatable Photo Prop for Teens, Adults, Summer Product Season',
    message
  );
  assert.ok(repaired.title.length <= 191);
  assert.strictEqual(repaired.title.includes('Adults'), false);
  assert.ok(repaired.repairs.includes('shorten_for_variant_title_limit'));
}

{
  const form = buildListingCopyEditForm(action);
  assert.strictEqual(form.get('product_id'), '3005337');
  assert.strictEqual(form.get('sku'), 'MF6292');
  assert.strictEqual(form.get('filed_type'), 'A');
  assert.strictEqual(form.get('variant_status'), '2');
  assert.strictEqual(form.get('original[parent_title]'), 'Old title');
  assert.strictEqual(form.get('now[parent_title]'), 'New title');
  assert.strictEqual(form.get('original[product_description]'), 'Old description');
  assert.strictEqual(form.get('now[search_core_keywords]'), 'new keyword');
  assert.deepStrictEqual(form.getAll('synchronizeFields[]'), []);
}

{
  const multilineDescription = '</br>Features:\n</br>\n</br>As a gift:\n</br>Line one';
  const form = buildListingCopyEditForm({
    ...action,
    original: {
      ...action.original,
      productDescription: multilineDescription,
    },
    now: {
      ...action.now,
      productDescription: multilineDescription,
    },
  });
  assert.strictEqual(form.get('original[product_description]'), multilineDescription);
  assert.strictEqual(form.get('now[product_description]'), multilineDescription);
}

{
  const merged = mergeOriginCopyForSubmission(
    {
      ...action,
      original: { parentTitle: '' },
      now: { parentTitle: 'Title only change' },
      phraseFrequencyText: '',
    },
    {
      parentTitle: 'Origin title',
      bulletPoints: ['Origin bullet 1', 'Origin bullet 2'],
      productDescription: 'Origin description',
      searchCoreKeywords: 'origin search terms',
      phraseFrequencyText: 'origin frequency',
    }
  );

  assert.strictEqual(merged.original.productDescription, 'Origin description');
  assert.deepStrictEqual(merged.now.bulletPoints, ['Origin bullet 1', 'Origin bullet 2']);
  assert.strictEqual(merged.now.productDescription, 'Origin description');
  assert.strictEqual(merged.now.searchCoreKeywords, 'origin search terms');
  assert.strictEqual(merged.now.parentTitle, 'Title only change');
  assert.strictEqual(merged.phraseFrequencyText, 'origin frequency');
}

{
  const match = plannedOriginalTitleMatchesOrigin(action, {
    parentTitle: 'Old title',
  });
  assert.strictEqual(match.ok, true);

  const stale = plannedOriginalTitleMatchesOrigin(action, {
    parentTitle: 'Bucherry Juneteenth Cupcake Toppers Juneteenth Decorations Mini Round Acrylic Cupcake Picks',
  });
  assert.strictEqual(stale.ok, false);
  assert.strictEqual(stale.error, 'origin_parent_title_mismatch');
  assert.strictEqual(stale.plannedTitle, 'Old title');
}

{
  const preview = buildListingCopyEditPreview(action);
  assert.strictEqual(preview.sku, 'MF6292');
  assert.strictEqual(preview.endpoint.includes('productEditApply/store'), true);
  assert.strictEqual(preview.now.parentTitle, 'New title');
  assert.ok(preview.formKeys.includes('now[parent_title]'));
  assert.strictEqual(preview.validation.ok, true);
}

{
  assert.deepStrictEqual(classifyListingCopyEditResponse({ code: 200, id: 123 }), {
    apiStatus: 'api_success',
    finalStatus: 'submitted_pending_review',
    success: true,
    applicationId: '123',
    message: '',
  });
  assert.strictEqual(classifyListingCopyEditResponse({ code: 500, msg: 'bad' }).success, false);
  assert.deepStrictEqual(
    classifyListingCopyEditResponse({ code: 500, msg: '同组变体MF6328正在修改母体标题，请勿重复提交修改！' }),
    {
      apiStatus: 'covered',
      finalStatus: 'covered_by_existing_variant_application',
      success: true,
      applicationId: '',
      message: '同组变体MF6328正在修改母体标题，请勿重复提交修改！',
    }
  );
}

{
  const schema = {
    items: [
      { sku: 'MF6292', actions: [action] },
      { sku: 'SKIP', actions: [{ ...action, entityType: 'keyword' }] },
    ],
  };
  const actions = flattenListingCopyActions(schema);
  assert.strictEqual(actions.length, 1);
  assert.strictEqual(actions[0].sku, 'MF6292');
}

{
  const report = buildListingCopyDryRunReport([{ sku: 'MF6292', actions: [action] }], { businessDate: '2026-05-16' });
  assert.strictEqual(report.summary.total, 1);
  assert.strictEqual(report.summary.valid, 1);
  assert.strictEqual(report.items[0].dryRun, true);
}

console.log('listing_copy_edit tests passed');
