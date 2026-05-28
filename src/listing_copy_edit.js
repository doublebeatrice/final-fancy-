const ENDPOINT = 'https://sellerinventory.yswg.com.cn/kernel/productEditApply/store';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeProductDescriptionText(value) {
  const raw = String(value ?? '');
  if (!raw) return '';
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]*(?:\n[ \t\f\v]*)?<\/br>[ \t\f\v]*/gi, '\n</br>')
    .split('\n')
    .map(line => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!value) return [];
  return [text(value)].filter(Boolean);
}

function normalizeSources(value) {
  if (Array.isArray(value)) return [...new Set(value.map(text).filter(Boolean))];
  return value ? [text(value)] : [];
}

const TITLE_REPEAT_EXEMPT_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

const CHILD_OR_SCHOOL_TERMS = [
  'baby',
  'babies',
  'kid',
  'kids',
  'child',
  'children',
  'toddler',
  'infant',
  'teen',
  'teens',
  'boy',
  'boys',
  'girl',
  'girls',
  'school',
];

const PROMO_OR_CLAIM_TERMS = [
  'free shipping',
  'best seller',
  'bestseller',
  'guaranteed',
  '100%',
  'cheap',
  'discount',
  'sale',
  'clearance',
  'hot sale',
];

const BLOCKED_TITLE_CHARS = ['!', '$', '?', '_', '{', '}', '^', '¬', '¦'];

const VARIANT_SPECIFIC_TITLE_TERMS = [
  { id: 'bride', source: /\bbride\b/i, target: /\bbride\b/i },
  { id: 'groom', source: /\bgroom\b/i, target: /\bgroom\b/i },
  { id: 'maid_of_honor', source: /\bmaid\s+of\s+honou?r\b/i, target: /\bmaid\s+of\s+honou?r\b/i },
  { id: 'matron_of_honor', source: /\bmatron\s+of\s+honou?r\b/i, target: /\bmatron\s+of\s+honou?r\b/i },
  { id: 'best_man', source: /\bbest\s+man\b/i, target: /\bbest\s+man\b/i },
  { id: 'godfather', source: /\bgodfather\b/i, target: /\bgodfather\b/i },
  { id: 'godmother', source: /\bgodmother\b/i, target: /\bgodmother\b/i },
];

const SEARCH_CORE_KEYWORDS_MAX_LENGTH = 250;
const CLOTHING_CATEGORY_TITLE_MAX_LENGTH = 125;
const US_ASSOCIATION_TERMS = new Set(['america', 'american', 'usa', 'us', 'united', 'states']);
const ANNIVERSARY_250_TERMS = new Set(['250', '250th']);

function termPattern(term) {
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
}

function productLabelInfo(input = {}) {
  const label = text(input.productLabel || input.product_label || input.productCompliance?.productLabel || input.productCompliance?.product_label);
  const isNonChildrenProduct = label.includes('\u975e\u513f\u7ae5\u4ea7\u54c1');
  const isChildrenProduct = !isNonChildrenProduct && label.includes('\u513f\u7ae5');
  return {
    productLabel: label,
    isChildrenProduct,
    isNonChildrenProduct,
  };
}

function normalizeProductContext(input = {}) {
  const source = input.productContext || input.product_context || {};
  return {
    listingTitle: text(source.listingTitle || source.listing_title || input.listingTitle || input.listing_title),
    productType: text(source.productType || source.product_type || input.productType || input.product_type || input.titleProductType || input.title_product_type),
    productTypes: list(source.productTypes || source.product_types),
    targetAudience: list(source.targetAudience || source.target_audience),
    occasion: list(source.occasion),
    visualTheme: list(source.visualTheme || source.visual_theme),
    positioning: text(source.positioning),
    categoryPath: text(source.categoryPath || source.category_path || input.categoryPath || input.category_path || input.categoryPathName || input.category_path_name),
  };
}

function contextText(context = {}) {
  return [
    context.listingTitle,
    context.productType,
    ...(context.productTypes || []),
    ...(context.targetAudience || []),
    ...(context.occasion || []),
    ...(context.visualTheme || []),
    context.positioning,
    context.categoryPath,
  ].map(text).filter(Boolean).join(' ');
}

function isBabyShowerContext(title = '', options = {}) {
  const combined = text([
    title,
    options.originalTitle,
    contextText(normalizeProductContext({ productContext: options.productContext || {} })),
  ].join(' ')).toLowerCase();
  return /\bbaby\s+shower\b|\bgender\s+reveal\b|\bbaby\s+sprinkle\b/.test(combined);
}

function auditParentTitlePolicy(title, options = {}) {
  const value = text(title);
  const original = text(options.originalTitle);
  const errors = [];
  for (const char of BLOCKED_TITLE_CHARS) {
    if (value.includes(char) && !original.includes(char)) errors.push(`parent_title_blocked_special_char:${char}`);
  }
  for (const term of PROMO_OR_CLAIM_TERMS) {
    if (termPattern(term).test(value) && !termPattern(term).test(original)) errors.push(`parent_title_promo_or_claim_term:${term}`);
  }
  const counts = new Map();
  const words = value.toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const word of words) {
    if (TITLE_REPEAT_EXEMPT_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  for (const [word, count] of counts) {
    if (count > 2) errors.push(`parent_title_repeated_word:${word}`);
  }
  return errors;
}

function auditChildTitleTerms(title, options = {}) {
  const value = text(title);
  const original = text(options.originalTitle);
  const compliance = productLabelInfo(options.productCompliance || {});
  const babyShowerContext = isBabyShowerContext(value, {
    originalTitle: original,
    productContext: options.productContext || {},
  });
  const warnings = [];
  for (const term of CHILD_OR_SCHOOL_TERMS) {
    if (!termPattern(term).test(value) || termPattern(term).test(original)) continue;
    if (['baby', 'babies'].includes(term) && babyShowerContext) continue;
    if (compliance.isChildrenProduct) warnings.push(`parent_title_child_term_added_child_product:${term}`);
    else if (compliance.isNonChildrenProduct) warnings.push(`parent_title_child_term_added_non_child_product:${term}`);
    else warnings.push(`parent_title_child_term_added_unknown_product_label:${term}`);
  }
  return warnings;
}

function auditVariantTitleSpecificity(title, options = {}) {
  const value = text(title);
  const original = text(options.originalTitle);
  if (!value || !original) return [];
  const errors = [];
  for (const term of VARIANT_SPECIFIC_TITLE_TERMS) {
    if (!term.source.test(original) || term.target.test(value)) continue;
    errors.push(`parent_title_variant_specific_term_removed:${term.id}`);
  }
  return errors;
}

function isClothingCategoryContext(context = {}) {
  const combined = text([
    context.categoryPath,
    context.productType,
    ...(context.productTypes || []),
  ].join(' ')).toLowerCase();
  return /\bclothes?\b|\bclothing\b|\bapparel\b|服装/.test(combined);
}

function audit250thUsTermSpacing(value, field = 'copy') {
  const tokens = String(value || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const errors = [];
  const anniversaryIndexes = [];
  const usIndexes = [];
  tokens.forEach((token, index) => {
    if (ANNIVERSARY_250_TERMS.has(token)) anniversaryIndexes.push(index);
    if (US_ASSOCIATION_TERMS.has(token)) usIndexes.push(index);
  });
  for (const anniversaryIndex of anniversaryIndexes) {
    for (const usIndex of usIndexes) {
      const wordsBetween = Math.abs(anniversaryIndex - usIndex) - 1;
      if (wordsBetween >= 0 && wordsBetween < 3) {
        errors.push(`${field}_250th_us_term_spacing_lt_3`);
        return errors;
      }
    }
  }
  return errors;
}

function normalizeCopyEditPayload(input = {}) {
  const original = input.original || {};
  const now = input.now || {};
  const synchronizeVariantSkus = list(input.synchronizeVariantSkus || input.synchronize_variant_skus);
  const rawSyncFields = list(input.synchronizeFields || input.synchronize_fields);
  return {
    entityType: 'listing',
    actionType: 'copy_edit',
    id: text(input.id || `listing::${input.productId || input.product_id || ''}::${input.sku || ''}`),
    productId: text(input.productId || input.product_id),
    sku: text(input.sku),
    asin: text(input.asin),
    endpoint: ENDPOINT,
    filedType: text(input.filedType || input.filed_type || 'A'),
    toEditorFlag: Number(input.toEditorFlag ?? input.to_editor_flag ?? 1) || 1,
    variantStatus: Number(input.variantStatus ?? input.variant_status ?? 2) || 2,
    beforeStatus: Number(input.beforeStatus ?? input.before_status ?? 0) || 0,
    languageType: text(input.languageType || input.language_type || 'us,uk,ca'),
    synchronizeFields: synchronizeVariantSkus.length ? rawSyncFields : [],
    requestedSynchronizeFields: rawSyncFields,
    synchronizeVariantSkus,
    omitParentTitle: input.omitParentTitle === true || input.omit_parent_title === true,
    remark: text(input.remark),
    reason: text(input.reason),
    original: {
      parentTitle: text(original.parentTitle || original.parent_title),
      titleEn: text(original.titleEn || original.title_en),
      bulletPoints: list(original.bulletPoints || original.bullet_points),
      productDescription: normalizeProductDescriptionText(original.productDescription || original.product_description),
      searchCoreKeywords: text(original.searchCoreKeywords || original.search_core_keywords),
    },
    now: {
      parentTitle: text(now.parentTitle || now.parent_title),
      titleEn: text(now.titleEn || now.title_en),
      bulletPoints: list(now.bulletPoints || now.bullet_points),
      productDescription: normalizeProductDescriptionText(now.productDescription || now.product_description),
      searchCoreKeywords: text(now.searchCoreKeywords || now.search_core_keywords),
    },
    productCompliance: productLabelInfo(input),
    productContext: normalizeProductContext(input),
    phraseFrequencyText: text(input.phraseFrequencyText || input.phrase_frequency_text),
    titleMaxLength: Number(input.titleMaxLength || input.title_max_length || 200) || 200,
    hypothesis: text(input.hypothesis),
    expectedEffect: input.expectedEffect || {},
    reviewPlan: input.reviewPlan || {},
    riskLevel: text(input.riskLevel || 'listing_copy_edit_reviewed'),
    confidence: Number(input.confidence ?? 0) || 0,
    decisionStage: text(input.decisionStage),
    approvedBy: text(input.approvedBy),
    actionSource: normalizeSources(input.actionSource || input.source),
    requiresAiDecision: input.requiresAiDecision === true,
    canAutoExecute: input.canAutoExecute !== false,
    source: text(input.source || 'listing_copy_edit'),
  };
}

function validateCopyEditAction(input = {}) {
  const payload = normalizeCopyEditPayload(input);
  const errors = [];
  const warnings = [];
  if (!payload.productId) errors.push('missing_productId');
  if (!payload.sku) errors.push('missing_sku');
  if (!payload.reason) errors.push('missing_reason');
  if (!payload.now.parentTitle && !payload.now.titleEn && !payload.now.bulletPoints.length && !payload.now.productDescription && !payload.now.searchCoreKeywords) {
    errors.push('missing_now_copy');
  }
  if (!['ai_approved', 'manual_approved'].includes(payload.decisionStage)) errors.push('decisionStage_not_approved');
  if (!['codex', 'claude', 'manual'].includes(payload.approvedBy)) errors.push('approvedBy_not_allowed');
  if (!payload.actionSource.some(item => ['codex', 'claude', 'manual'].includes(item))) errors.push('actionSource_missing_approved_actor');
  if (payload.requiresAiDecision) errors.push('requiresAiDecision_true');
  if (payload.canAutoExecute === false) errors.push('canAutoExecute_false');
  if (payload.requestedSynchronizeFields.length && !payload.synchronizeVariantSkus.length) warnings.push('sync_fields_omitted_without_variant_skus');
  if (!payload.original.parentTitle && payload.now.parentTitle) warnings.push('missing_original_parent_title');
  if (payload.now.searchCoreKeywords.length > SEARCH_CORE_KEYWORDS_MAX_LENGTH) errors.push('search_core_keywords_over_250');
  const clothingTitleLimit = isClothingCategoryContext(payload.productContext) ? CLOTHING_CATEGORY_TITLE_MAX_LENGTH : 0;
  if (payload.titleMaxLength <= 125 && payload.now.parentTitle.length > 125) errors.push('parent_title_over_125_conservative_limit');
  if (clothingTitleLimit && payload.now.parentTitle.length > clothingTitleLimit) errors.push('parent_title_over_125_clothing_category_limit');
  if (payload.now.parentTitle.length > 200) errors.push('parent_title_too_long');
  errors.push(...audit250thUsTermSpacing(payload.now.parentTitle, 'parent_title'));
  errors.push(...auditParentTitlePolicy(payload.now.parentTitle, { originalTitle: payload.original.parentTitle }));
  errors.push(...auditVariantTitleSpecificity(payload.now.parentTitle, { originalTitle: payload.original.parentTitle }));
  warnings.push(...auditChildTitleTerms(payload.now.parentTitle, { originalTitle: payload.original.parentTitle, productCompliance: payload.productCompliance, productContext: payload.productContext }));
  if (!payload.original.titleEn && payload.now.titleEn) warnings.push('missing_original_title_en');
  if (payload.titleMaxLength <= 125 && payload.now.titleEn.length > 125) errors.push('title_en_over_125_conservative_limit');
  if (clothingTitleLimit && payload.now.titleEn.length > clothingTitleLimit) errors.push('title_en_over_125_clothing_category_limit');
  if (payload.now.titleEn.length > 200) errors.push('title_en_too_long');
  errors.push(...audit250thUsTermSpacing(payload.now.titleEn, 'title_en'));
  errors.push(...auditParentTitlePolicy(payload.now.titleEn, { originalTitle: payload.original.titleEn }).map(item => item.replace(/^parent_title_/, 'title_en_')));
  errors.push(...auditVariantTitleSpecificity(payload.now.titleEn, { originalTitle: payload.original.titleEn }).map(item => item.replace(/^parent_title_/, 'title_en_')));
  warnings.push(...auditChildTitleTerms(payload.now.titleEn, { originalTitle: payload.original.titleEn, productCompliance: payload.productCompliance, productContext: payload.productContext }).map(item => item.replace(/^parent_title_/, 'title_en_')));
  if (payload.now.bulletPoints.length > 5) warnings.push('too_many_bullets');
  payload.now.bulletPoints.forEach((bullet, index) => {
    errors.push(...audit250thUsTermSpacing(bullet, `bullet_${index + 1}`));
  });
  errors.push(...audit250thUsTermSpacing(payload.now.productDescription, 'product_description'));
  errors.push(...audit250thUsTermSpacing(payload.now.searchCoreKeywords, 'search_core_keywords'));
  return { ok: errors.length === 0, errors, warnings, payload };
}

function extractRepeatedWordFromBackendMessage(message = '') {
  const match = String(message || '').match(/\(([^()]{1,40})\)/);
  return match ? text(match[1]).toLowerCase() : '';
}

function extractBackendTitleLengthOverflow(message = '') {
  const match = String(message || '').match(/字符数\s*(\d+)\s*超过\s*(\d+)/);
  if (!match) return null;
  const actual = Number(match[1]);
  const limit = Number(match[2]);
  if (!Number.isFinite(actual) || !Number.isFinite(limit) || actual <= limit) return null;
  return { actual, limit, overflow: actual - limit };
}

function shortenTitleForLimit(title = '', targetLength = 200) {
  let next = text(title);
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
}

function repairParentTitleForBackendMessage(title = '', message = '') {
  const word = extractRepeatedWordFromBackendMessage(message);
  let next = text(title);
  const repairs = [];
  const overflow = extractBackendTitleLengthOverflow(message);
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
  return {
    title: next,
    repairs,
    repeatedWord: word,
    overflow,
  };
}

function appendAll(params, key, values = []) {
  for (const value of values) params.append(key, value);
}

function mergeOriginCopyForSubmission(input = {}, originCopy = {}) {
  const payload = normalizeCopyEditPayload(input);
  const originBullets = list(originCopy.bulletPoints || originCopy.bullet_points);
  const original = {
    parentTitle: text(originCopy.parentTitle || originCopy.parent_title || payload.original.parentTitle),
    titleEn: text(originCopy.titleEn || originCopy.title_en || payload.original.titleEn),
    bulletPoints: originBullets.length ? originBullets : payload.original.bulletPoints,
    productDescription: normalizeProductDescriptionText(originCopy.productDescription || originCopy.product_description || payload.original.productDescription),
    searchCoreKeywords: text(originCopy.searchCoreKeywords || originCopy.search_core_keywords || payload.original.searchCoreKeywords),
  };
  return {
    ...payload,
    original,
    now: {
      parentTitle: payload.now.parentTitle || original.parentTitle,
      titleEn: payload.now.titleEn || original.titleEn,
      bulletPoints: payload.now.bulletPoints.length ? payload.now.bulletPoints : original.bulletPoints,
      productDescription: payload.now.productDescription || original.productDescription,
      searchCoreKeywords: payload.now.searchCoreKeywords || original.searchCoreKeywords,
    },
    phraseFrequencyText: payload.phraseFrequencyText || text(originCopy.phraseFrequencyText || originCopy.phrase_frequency_text),
  };
}

function plannedOriginalTitleMatchesOrigin(input = {}, originCopy = {}) {
  const payload = normalizeCopyEditPayload(input);
  const plannedTitle = text(payload.original.parentTitle).toLowerCase();
  const originTitle = text(originCopy.parentTitle || originCopy.parent_title || originCopy.title).toLowerCase();
  if (!plannedTitle || !originTitle) {
    return {
      ok: true,
      error: '',
      plannedTitle: payload.original.parentTitle,
      originTitle: text(originCopy.parentTitle || originCopy.parent_title || originCopy.title),
    };
  }
  const ok = plannedTitle === originTitle;
  return {
    ok,
    error: ok ? '' : 'origin_parent_title_mismatch',
    plannedTitle: payload.original.parentTitle,
    originTitle: text(originCopy.parentTitle || originCopy.parent_title || originCopy.title),
  };
}

function buildListingCopyEditForm(input = {}) {
  const payload = mergeOriginCopyForSubmission(input, input.originCopy || {});
  const params = new URLSearchParams();
  params.set('product_id', payload.productId);
  params.set('sku', payload.sku);
  params.set('to_editor_flag', String(payload.toEditorFlag));
  params.set('filed_type', payload.filedType);
  params.set('relation', '');
  params.set('variant_status', String(payload.variantStatus));
  params.set('before_status', String(payload.beforeStatus));
  params.set('is_simple_wa', '0');
  params.set('title_type', '1');
  params.set('language_type', payload.languageType);
  appendAll(params, 'synchronizeFields[]', payload.synchronizeFields);
  params.set('synchronizeSkus', payload.synchronizeVariantSkus.join(','));
  params.set('remark', payload.remark);
  params.set('reason', payload.reason);
  if (!payload.omitParentTitle) params.set('original[parent_title]', payload.original.parentTitle);
  params.set('original[title_en]', payload.original.titleEn);
  appendAll(params, 'original[bullet_points][]', payload.original.bulletPoints);
  params.set('original[product_description]', payload.original.productDescription);
  params.set('original[search_core_keywords]', payload.original.searchCoreKeywords);
  if (!payload.omitParentTitle) params.set('now[parent_title]', payload.now.parentTitle);
  params.set('now[title_en]', payload.now.titleEn);
  appendAll(params, 'now[bullet_points][]', payload.now.bulletPoints);
  params.set('now[product_description]', payload.now.productDescription);
  params.set('now[search_core_keywords]', payload.now.searchCoreKeywords);
  params.set('now[synchronize_variant_sku]', payload.synchronizeVariantSkus.join(','));
  params.set('exclude_simple', '');
  params.set('phrase_frequency_text', payload.phraseFrequencyText);
  params.set('origin', 'codex_listing_copy_edit');
  return params;
}

function buildListingCopyEditPreview(input = {}) {
  const validation = validateCopyEditAction(input);
  const form = buildListingCopyEditForm(validation.payload);
  return {
    dryRun: true,
    endpoint: ENDPOINT,
    sku: validation.payload.sku,
    productId: validation.payload.productId,
    asin: validation.payload.asin,
    original: validation.payload.original,
    now: validation.payload.now,
    remark: validation.payload.remark,
    reason: validation.payload.reason,
    synchronizeFields: validation.payload.synchronizeFields,
    synchronizeVariantSkus: validation.payload.synchronizeVariantSkus,
    formKeys: [...form.keys()],
    validation: {
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings,
    },
  };
}

function classifyListingCopyEditResponse(response = {}) {
  const ids = Array.isArray(response.ids) ? response.ids.map(String).filter(Boolean) : [];
  const applicationId = text(response.id || ids[0] || '');
  const message = text(response.msg || response.message || '');
  if (/同组变体.+正在修改母体标题/.test(message)) {
    return {
      apiStatus: 'covered',
      finalStatus: 'covered_by_existing_variant_application',
      success: true,
      applicationId: '',
      message,
    };
  }
  const ok = Number(response.code) === 200 && !!applicationId;
  return {
    apiStatus: ok ? 'api_success' : 'failed',
    finalStatus: ok ? 'submitted_pending_review' : 'failed',
    success: ok,
    applicationId,
    message,
  };
}

function flattenListingCopyActions(schema = {}) {
  const rootItems = Array.isArray(schema) ? schema : (schema.items || []);
  const out = [];
  for (const item of rootItems || []) {
    for (const action of item.actions || []) {
      if (action.entityType !== 'listing' || action.actionType !== 'copy_edit') continue;
      out.push(normalizeCopyEditPayload({ ...action, sku: action.sku || item.sku, asin: action.asin || item.asin }));
    }
  }
  return out;
}

function buildListingCopyDryRunReport(schemaOrActions = {}, options = {}) {
  const actions = Array.isArray(schemaOrActions) && schemaOrActions.some(item => item?.actions)
    ? flattenListingCopyActions(schemaOrActions)
    : (Array.isArray(schemaOrActions) ? schemaOrActions.map(normalizeCopyEditPayload) : flattenListingCopyActions(schemaOrActions));
  const items = actions.map(buildListingCopyEditPreview);
  return {
    generatedAt: new Date().toISOString(),
    businessDate: options.businessDate || '',
    dryRun: true,
    summary: {
      total: items.length,
      valid: items.filter(item => item.validation.ok).length,
      invalid: items.filter(item => !item.validation.ok).length,
      warnings: items.reduce((sum, item) => sum + item.validation.warnings.length, 0),
    },
    items,
  };
}

module.exports = {
  ENDPOINT,
  auditChildTitleTerms,
  auditParentTitlePolicy,
  auditVariantTitleSpecificity,
  buildListingCopyDryRunReport,
  buildListingCopyEditForm,
  buildListingCopyEditPreview,
  classifyListingCopyEditResponse,
  extractBackendTitleLengthOverflow,
  extractRepeatedWordFromBackendMessage,
  flattenListingCopyActions,
  mergeOriginCopyForSubmission,
  normalizeProductDescriptionText,
  normalizeCopyEditPayload,
  normalizeProductContext,
  plannedOriginalTitleMatchesOrigin,
  productLabelInfo,
  repairParentTitleForBackendMessage,
  shortenTitleForLimit,
  validateCopyEditAction,
};
