const { addDays } = require('./ops_time');
const { listingProtectionForCard, listingProtectionForSku, normalizeProtectedListingSkus } = require('./listing_copy_protection');
const { scoreTermRelevance } = require('./product_profile');

function text(value) {
  return String(value || '').trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function ymd(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function slugKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function titleCaseWords(value) {
  return String(value || '')
    .toLowerCase()
    .split(' ')
    .map(word => word ? `${word[0].toUpperCase()}${word.slice(1)}` : word)
    .join(' ');
}

function cleanTerm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const BUYER_FACING_EVENT_TERMS = {
  summer_product_season: {
    name: 'Summer',
    coreTerm: 'summer party supplies',
    titleTerms: ['summer party supplies', 'pool party decorations', 'summer outdoor party decorations', 'summer pool party'],
  },
};

function buyerFacingEventTerms(event = {}) {
  const key = slugKey(event.key || event.name);
  return BUYER_FACING_EVENT_TERMS[key] || null;
}

function isInternalBuyerTerm(value = '') {
  return /^summer product season$/i.test(text(value));
}

function alternativeTitleTerms(event = {}) {
  const seed = cleanTerm([
    event.name,
    event.coreTerm,
    ...(Array.isArray(event.titleTerms) ? event.titleTerms : []),
  ].join(' '));
  const terms = [];
  if (/\b(wedding|bridal|bride|bridesmaid|bachelorette)\b/.test(seed)) {
    terms.push('wedding favor gifts', 'bridal shower gifts', 'wedding gifts');
  }
  return terms;
}

function wordCountMap(value = '') {
  const counts = new Map();
  const words = cleanTerm(value).match(/[a-z0-9]+/g) || [];
  for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  return counts;
}

function riskyOverlapWithCurrentTitle(currentTitle = '', term = '') {
  const currentCounts = wordCountMap(currentTitle);
  const termCounts = wordCountMap(term);
  const risky = new Set(['party']);
  for (const word of risky) {
    if (currentCounts.has(word) && termCounts.has(word)) return true;
  }
  return false;
}

function titleTermChoices(event = {}) {
  return [...new Set([
    event.coreTerm,
    ...(Array.isArray(event.titleTerms) ? event.titleTerms : []),
    event.name,
    ...alternativeTitleTerms(event),
  ].map(text).filter(term => term && !isInternalBuyerTerm(term)))];
}

function chooseTitleTermFor(currentTitle = '', event = {}) {
  const choices = titleTermChoices(event);
  const preferred = choices.find(term => !riskyOverlapWithCurrentTitle(currentTitle, term));
  return titleCaseWords(preferred || choices[0] || event.coreTerm || event.name);
}

function rankTopSalesSkus(productCards = [], limit = 50) {
  return new Set(productCards
    .filter(card => text(card.sku))
    .slice()
    .sort((a, b) => {
      const bSales = num(b.unitsSold_30d) || num(b.unitsSold_7d) || num(b.unitsSold_3d);
      const aSales = num(a.unitsSold_30d) || num(a.unitsSold_7d) || num(a.unitsSold_3d);
      return bSales - aSales || text(a.sku).localeCompare(text(b.sku));
    })
    .slice(0, limit)
    .map(card => text(card.sku).toUpperCase()));
}

function normalizeEvent(event = {}) {
  const rawName = text(event.name || event.label || event.key);
  const buyerTerms = buyerFacingEventTerms({ ...event, name: rawName });
  const name = text(buyerTerms?.name || rawName);
  const coreTerm = cleanTerm(buyerTerms?.coreTerm || event.coreTerm || event.searchTerm || `${name} gifts`);
  const titleTerms = [
    ...(buyerTerms?.titleTerms || []),
    ...(Array.isArray(event.titleTerms) ? event.titleTerms : []),
    ...alternativeTitleTerms(event),
    name,
    coreTerm,
  ].map(text).filter(term => term && !isInternalBuyerTerm(term));
  return {
    ...event,
    key: text(event.key) || slugKey(name),
    name,
    coreTerm,
    titleTerms: [...new Set(titleTerms)],
    nodeStart: ymd(event.nodeStart || event.peakStart),
    nodeEnd: ymd(event.nodeEnd || event.peakEnd || event.nodeStart || event.peakStart),
    firstStart: ymd(event.firstStart || event.preheatStart),
    firstEnd: ymd(event.firstEnd),
    secondStart: ymd(event.secondStart),
    secondEnd: ymd(event.secondEnd),
    highFrequencyStart: ymd(event.highFrequencyStart || event.tailStart),
    highFrequencyEnd: ymd(event.highFrequencyEnd || event.tailEnd),
  };
}

function inRange(date, start, end) {
  return start && end && date >= start && date <= end;
}

function seasonStatus(event = {}, businessDate = '') {
  if (inRange(businessDate, event.nodeStart, event.nodeEnd)) return 'node_active';
  if (inRange(businessDate, event.highFrequencyStart, event.highFrequencyEnd)) return 'high_frequency';
  if (inRange(businessDate, event.secondStart, event.secondEnd)) return 'second_check';
  if (inRange(businessDate, event.firstStart, event.firstEnd)) return 'first_check';
  if (event.nodeStart && businessDate < event.nodeStart) return 'upcoming';
  return 'expired';
}

function withinOpportunityWindow(event = {}, businessDate = '', horizonDays = 60) {
  const horizon = addDays(businessDate, horizonDays);
  const status = seasonStatus(event, businessDate);
  if (['node_active', 'high_frequency', 'second_check', 'first_check'].includes(status)) return true;
  return event.nodeStart >= businessDate && event.nodeStart <= horizon;
}

function titleContainsEvent(title = '', event = {}) {
  const haystack = cleanTerm(title).replace(/['’]/g, '');
  return (event.titleTerms || []).some(term => {
    const needle = cleanTerm(term).replace(/['’]/g, '');
    return needle.length >= 4 && haystack.includes(needle);
  });
}

function eventNameParts(event = {}) {
  return text(event.name)
    .split(/\s*\/\s*|\s+\|\s+|[()]/)
    .map(cleanTerm)
    .filter(part => part.length >= 4 && !/^(day|week|month|season)$/i.test(part));
}

function hasEventSpecificToken(value = '') {
  return /\b(day|week|month|season|easter|christmas|halloween|thanksgiving|valentine|mothers?|fathers?|patrick|cinco|mayo|mardi|graduation|lab week|nurse week|vbs|vacation bible school|pride)\b/i.test(value || '');
}

function eventSpecificTitleTerms(event = {}) {
  const parts = eventNameParts(event);
  const terms = [
    event.name,
    ...parts,
    ...parts.map(part => `${part} gifts`),
    ...parts.map(part => `${part} gift`),
    ...(event.titleTerms || []),
  ];
  return [...new Set(terms.map(text).filter(term => {
    const cleaned = cleanTerm(term);
    if (cleaned.length < 4) return false;
    if (hasEventSpecificToken(cleaned)) return true;
    return parts.some(part => part.length >= 4 && cleaned.includes(part) && hasEventSpecificToken(part));
  }))].sort((a, b) => b.length - a.length);
}

function titleContainsExpiredEvent(title = '', event = {}) {
  const haystack = cleanTerm(title).replace(/['’]/g, '');
  return eventSpecificTitleTerms(event).some(term => {
    const needle = cleanTerm(term).replace(/['’]/g, '');
    return needle.length >= 4 && haystack.includes(needle);
  });
}

function expiredTitleEvents(title = '', events = [], businessDate = '') {
  return events.filter(event => {
    if (!event.nodeEnd || businessDate <= event.nodeEnd) return false;
    return titleContainsExpiredEvent(title, event);
  });
}

function isExistingAutoCovered(card = {}) {
  if (card.createContext?.coverage?.hasSpAuto === true) return true;
  return (card.campaigns || []).some(campaign =>
    /auto/i.test(campaign.name || campaign.campaignName || '') ||
    (campaign.autoTargets || []).length > 0
  );
}

function isNewProduct(card = {}, businessDate = '') {
  const openDate = ymd(card.opendate || card.openDate || card.fuldate || card.fulfillmentDate);
  if (!openDate) return false;
  return openDate >= addDays(businessDate, -45);
}

function defaultBidFor(card = {}, businessDate = '') {
  if (isNewProduct(card, businessDate)) {
    const priceBid = num(card.price) * 0.03;
    return round(Math.max(0.12, Math.min(0.3, priceBid || 0.25)));
  }
  const d30 = card.adStats?.['30d'] || {};
  const cpc = num(d30.clicks) > 0 ? num(d30.spend) / num(d30.clicks) : 0;
  if (cpc > 0) return round(Math.max(0.12, cpc * 0.85));
  return 0.25;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
}

function campaignNameFor(mode, coreTerm, sku) {
  return `${cleanTerm(mode)} - ${cleanTerm(coreTerm)} - ${text(sku)}`.slice(0, 120);
}

function keywordSetFor(event = {}, card = {}) {
  const profile = card.productProfile || {};
  const eventTerm = chooseTitleTermFor(card.listing?.title || profile.listingTitle || '', event);
  const audience = cleanTerm(profile.targetAudience?.[0] || '');
  const productType = cleanTerm(profile.productType || '');
  const base = [
    event.coreTerm,
    audience && audience !== 'unknown' ? `${event.coreTerm} for ${audience}` : '',
    `${eventTerm} gift`,
    `${eventTerm} gifts`,
    audience && audience !== 'unknown' ? `${audience} gifts` : '',
    audience && audience !== 'unknown' && productType && productType !== 'unknown' ? `${audience} ${productType}` : '',
    productType && productType !== 'unknown' ? `${event.coreTerm} ${productType}` : '',
    ...(card.createContext?.keywordSeeds || []),
  ];
  return [...new Set(base.map(cleanTerm).filter(term =>
    term.length >= 4 &&
    term.length <= 80 &&
    !/\bunknown\b/.test(term) &&
    !/\bfor$/.test(term)
  ))].slice(0, 10);
}

function buildAdActions(card = {}, event = {}, businessDate = '') {
  const bid = defaultBidFor(card, businessDate);
  const actions = [];
  if (!isExistingAutoCovered(card)) {
    actions.push({
      mode: 'auto',
      campaignName: campaignNameFor('auto', event.coreTerm, card.sku),
      groupName: campaignNameFor('auto', event.coreTerm, card.sku),
      dailyBudget: 3,
      defaultBid: bid,
      keywords: [],
    });
  }
  actions.push({
    mode: 'broad',
    matchType: 'BROAD',
    campaignName: campaignNameFor('broad', event.coreTerm, card.sku),
    groupName: campaignNameFor('broad', event.coreTerm, card.sku),
    dailyBudget: 3,
    defaultBid: bid,
    keywords: keywordSetFor(event, card),
  });
  return actions;
}

function scoreEventForCard(event = {}, card = {}) {
  const profile = card.productProfile || {};
  if (event.key === 'summer_product_season' && !hasSummerProductContext(card)) {
    return { score: 0.12, level: 'conflict', matched: [], conflicts: ['missing_summer_context'] };
  }
  if (!hasSpecificEventContext(card, event)) {
    return { score: 0.12, level: 'conflict', matched: [], conflicts: ['missing_specific_event_context'] };
  }
  const score = scoreTermRelevance(event.coreTerm, profile);
  const title = card.listing?.title || profile.listingTitle || '';
  const titleBonus = titleContainsEvent(title, event) ? 0.15 : 0;
  return {
    score: Math.min(1, num(score.score, 0.18) + titleBonus),
    level: score.level,
    matched: score.matched || [],
    conflicts: score.conflicts || [],
  };
}

function hasSummerProductContext(card = {}) {
  const profile = card.productProfile || {};
  const value = cleanTerm([
    card.listing?.title,
    profile.listingTitle,
    profile.productType,
    ...(profile.productTypes || []),
    ...(profile.targetAudience || []),
    ...(profile.occasion || []),
    ...(profile.visualTheme || []),
    profile.positioning,
    profile.categoryPath,
  ].join(' '));
  return /\b(summer|pool|beach|swim|luau|tropical|hawaiian)\b/.test(value);
}

const SENSITIVE_EVENT_STOP_WORDS = new Set([
  'awareness',
  'appreciation',
  'day',
  'decor',
  'decorations',
  'gift',
  'gifts',
  'month',
  'party',
  'season',
  'supplies',
  'week',
]);

function eventRequiresSpecificContext(event = {}) {
  const seed = cleanTerm([
    event.name,
    event.coreTerm,
    ...(event.titleTerms || []),
  ].join(' '));
  return /\b(awareness|history|heritage|mental health|juneteenth|pride)\b/.test(seed);
}

function eventSpecificContextWords(event = {}) {
  const seed = cleanTerm([
    event.name,
    event.coreTerm,
    ...(event.titleTerms || []),
  ].join(' '));
  return [...new Set((seed.match(/[a-z0-9]+/g) || [])
    .filter(word => word.length >= 4 && !SENSITIVE_EVENT_STOP_WORDS.has(word)))];
}

function hasSpecificEventContext(card = {}, event = {}) {
  if (!eventRequiresSpecificContext(event)) return true;
  const profile = card.productProfile || {};
  const value = cleanTerm([
    card.listing?.title,
    profile.listingTitle,
    profile.productType,
    ...(profile.productTypes || []),
    ...(profile.targetAudience || []),
    ...(profile.occasion || []),
    ...(profile.visualTheme || []),
    profile.positioning,
    profile.categoryPath,
    ...(card.createContext?.keywordSeeds || []),
  ].join(' '));
  const requiredWords = eventSpecificContextWords(event);
  return requiredWords.length > 0 && requiredWords.some(word => value.includes(word));
}

function chooseBestEvent(card = {}, events = [], businessDate = '', horizonDays = 60) {
  const candidates = events
    .filter(event => withinOpportunityWindow(event, businessDate, horizonDays))
    .map(event => ({ event, relevance: scoreEventForCard(event, card), status: seasonStatus(event, businessDate) }))
    .filter(item => item.relevance.score >= 0.25 && !item.relevance.conflicts.length)
    .sort((a, b) => {
      const rank = { node_active: 5, high_frequency: 4, second_check: 3, first_check: 2, upcoming: 1, expired: 0 };
      return b.relevance.score - a.relevance.score ||
        (rank[b.status] || 0) - (rank[a.status] || 0) ||
        text(a.event.nodeStart).localeCompare(text(b.event.nodeStart));
    });
  return candidates[0] || null;
}

function hasStrongSeasonFit(selected = null) {
  const relevance = selected?.relevance || {};
  return num(relevance.score) >= 0.4;
}

function fitTitleWithSuffix(title = '', suffix = '', maxLength = 200) {
  const cleanSuffix = titleCaseWords(suffix);
  const normalizedTitle = text(title).replace(/\s+/g, ' ');
  if (!cleanSuffix) return normalizedTitle.slice(0, maxLength).trim();
  const reserved = cleanSuffix.length + 1;
  if (normalizedTitle.length + reserved <= maxLength) return `${normalizedTitle} ${cleanSuffix}`.trim();
  const baseLimit = Math.max(0, maxLength - reserved);
  let base = normalizedTitle.slice(0, baseLimit).trim();
  const lastSpace = base.lastIndexOf(' ');
  if (lastSpace > 60) base = base.slice(0, lastSpace).trim();
  return `${base} ${cleanSuffix}`.trim().slice(0, maxLength).trim();
}

const EXPIRED_EVENT_REPLACEMENTS = {
  mothers_day: ['mom gifts', 'gifts for mom'],
  mother_s_day: ['mom gifts', 'gifts for mom'],
  fathers_day: ['dad gifts', 'gifts for dad'],
  father_s_day: ['dad gifts', 'gifts for dad'],
  cinco_de_mayo: ['fiesta decorations', 'fiesta party supplies', 'mexican party supplies'],
  st_patrick_s_day: ['shamrock decorations', 'irish party favors', 'shamrock'],
  medical_laboratory_professionals_week_lab_week: ['lab tech gifts', 'medical laboratory gifts'],
  teacher_appreciation_week: ['teacher gifts', 'staff appreciation gifts'],
  teacher_appreciation_day_national_teacher_day: ['teacher gifts', 'staff appreciation gifts'],
  nurse_week_national_nurses_week: ['nurse appreciation gifts', 'nurse gifts'],
  dispatcher_week_public_safety_telecommunicators_week: ['911 dispatcher gifts', 'dispatcher appreciation gifts'],
  telecommunicator_week: ['911 dispatcher gifts', 'dispatcher appreciation gifts'],
  national_school_counseling_week: ['school counselor gifts', 'counselor appreciation gifts'],
  national_counselor_recognition_day: ['school counselor gifts', 'counselor appreciation gifts'],
  national_volunteer_week: ['volunteer appreciation gifts'],
  earth_day: ['volunteer appreciation gifts'],
};

function replacementTermsForExpiredEvent(event = {}) {
  const key = slugKey(event.key || event.name);
  const mapped = EXPIRED_EVENT_REPLACEMENTS[key] || [];
  const coreTerm = cleanTerm(event.coreTerm);
  const derived = coreTerm && !hasEventSpecificToken(coreTerm) ? [coreTerm] : [];
  return [...new Set([...mapped, ...derived].map(text).filter(Boolean))];
}

function chooseExpiredReplacement(title = '', event = {}) {
  const cleanedTitle = cleanTerm(title);
  const candidates = replacementTermsForExpiredEvent(event);
  return candidates.find(term => !cleanedTitle.includes(cleanTerm(term))) || candidates[0] || '';
}

function cleanupTitleWhitespace(title = '') {
  return text(title)
    .replace(/\s+([,;:])/g, '$1')
    .replace(/([-–—])\s*([-–—])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/\s+-\s*$/g, '')
    .trim();
}

function replaceExpiredEventTerms(title = '', event = {}, replacementTerm = '') {
  let next = text(title);
  const replacement = titleCaseWords(replacementTerm);
  for (const term of eventSpecificTitleTerms(event)) {
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
    next = next.replace(re, (match, offset, whole) => {
      if (!replacement) return '';
      const before = whole.slice(0, offset);
      const after = whole.slice(offset + match.length);
      const surrounding = cleanTerm(`${before} ${after}`);
      return surrounding.includes(cleanTerm(replacement)) ? '' : replacement;
    });
  }
  return cleanupTitleWhitespace(next);
}

function suggestExpiredOnlyTitle(currentTitle = '', expiredEvents = []) {
  let title = text(currentTitle);
  for (const event of expiredEvents) {
    const replacementTerm = chooseExpiredReplacement(title, event);
    if (!replacementTerm) continue;
    title = replaceExpiredEventTerms(title, event, replacementTerm);
  }
  return title;
}

const CONTEXT_STOP_WORDS = new Set([
  'gift',
  'gifts',
  'for',
  'and',
  'with',
  'the',
  'set',
  'sets',
  'pcs',
  'party',
  'supplies',
  'decor',
  'decorations',
  'appreciation',
]);

function meaningfulTermWords(value = '') {
  return (cleanTerm(value).match(/[a-z0-9]+/g) || [])
    .filter(word => word.length >= 3 && !CONTEXT_STOP_WORDS.has(word));
}

function productContextText(card = {}) {
  const profile = card.productProfile || {};
  return cleanTerm([
    profile.productType,
    ...(profile.productTypes || []),
    ...(profile.targetAudience || []),
    ...(profile.occasion || []),
    ...(profile.visualTheme || []),
    profile.positioning,
    profile.categoryPath,
  ].join(' '));
}

function expiredCleanupHasContext(card = {}, currentTitle = '', expiredEvents = []) {
  let strippedTitle = text(currentTitle);
  const supportWords = [];
  for (const event of expiredEvents) {
    const replacementTerm = chooseExpiredReplacement(strippedTitle, event);
    if (!replacementTerm) continue;
    supportWords.push(...meaningfulTermWords(replacementTerm));
    strippedTitle = replaceExpiredEventTerms(strippedTitle, event, '');
  }
  if (!supportWords.length) return false;
  const context = cleanTerm(`${strippedTitle} ${productContextText(card)}`);
  return [...new Set(supportWords)].some(word => context.includes(word));
}

function suggestTitle(currentTitle = '', selectedEvent = {}, expiredEvents = []) {
  let title = text(currentTitle);
  const replacementTerm = chooseTitleTermFor(title, selectedEvent);
  for (const event of expiredEvents) {
    for (const term of (event.titleTerms || []).slice().sort((a, b) => b.length - a.length)) {
      if (!term || cleanTerm(term) === cleanTerm(selectedEvent.coreTerm)) continue;
      const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
      title = title.replace(re, replacementTerm);
    }
  }
  if (!titleContainsEvent(title, selectedEvent)) {
    title = fitTitleWithSuffix(title, chooseTitleTermFor(title, selectedEvent), 200);
  }
  return title;
}

function buildSeasonTitleDryRun(input = {}) {
  const snapshot = input.snapshot || {};
  const businessDate = input.businessDate;
  if (!businessDate) throw new Error('businessDate is required');
  const horizonDays = Number(input.horizonDays || 60);
  const events = (input.events || []).map(normalizeEvent).filter(event => event.nodeStart && event.nodeEnd);
  const topSalesSkus = rankTopSalesSkus(snapshot.productCards || [], input.topSalesLimit ?? 50);
  const protectedListingSkus = normalizeProtectedListingSkus(input.protectedListingSkus || input.listingProtection || []);
  const items = [];

  for (const card of snapshot.productCards || []) {
    const sku = text(card.sku);
    if (!sku) continue;
    const selected = chooseBestEvent(card, events, businessDate, horizonDays);
    const title = text(card.listing?.title || card.productProfile?.listingTitle);
    const expired = expiredTitleEvents(title, events, businessDate);
    if (!selected && !expired.length) continue;

    const highSales = topSalesSkus.has(sku.toUpperCase());
    const listingProtection = listingProtectionForCard(card) || listingProtectionForSku(sku, protectedListingSkus);
    const selectedEvent = selected?.event || null;
    const expiredOnlyTitle = suggestExpiredOnlyTitle(title, expired);
    const strongSeasonFit = hasStrongSeasonFit(selected);
    const expiredCleanupSupported = expiredCleanupHasContext(card, title, expired);
    const preferExpiredCleanup = !!selectedEvent && expired.length > 0 && !strongSeasonFit && expiredCleanupSupported && cleanTerm(expiredOnlyTitle) !== cleanTerm(title);
    const suggestedTitle = preferExpiredCleanup ? expiredOnlyTitle : (selectedEvent ? suggestTitle(title, selectedEvent, expired) : expiredOnlyTitle);
    const hasTitleChange = !!title && suggestedTitle && cleanTerm(suggestedTitle) !== cleanTerm(title);
    const rawTitleDecision = !title
      ? 'review_missing_current_title'
      : (!selectedEvent
        ? (hasTitleChange && expiredCleanupSupported ? (highSales ? 'operator_approval_required' : 'auto_execute') : 'review_expired_title_no_replacement')
        : (!hasTitleChange
          ? 'no_title_change_required'
          : (!strongSeasonFit && !preferExpiredCleanup ? 'review_low_relevance_title_change' : (highSales ? 'operator_approval_required' : 'auto_execute'))));
    const titleDecision = listingProtection ? 'protected_listing_hold' : rawTitleDecision;
    const adDecision = !title
      ? 'review_missing_current_title'
      : highSales
      ? 'operator_approval_required'
      : (selectedEvent ? (strongSeasonFit ? 'auto_execute' : 'review_low_relevance') : 'no_action');
    items.push({
      sku,
      asin: text(card.asin),
      highSales,
      currentTitle: title,
      selectedEvent,
      selectedStatus: selected?.status || '',
      relevance: selected?.relevance || null,
      expiredTitleEvents: expired,
      suggestedTitle: listingProtection ? title : suggestedTitle,
      titleDecision,
      adDecision,
      listingProtection,
      adActions: !title || highSales || !selectedEvent || !strongSeasonFit ? [] : buildAdActions(card, selectedEvent, businessDate),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    businessDate,
    horizonDays,
    summary: {
      productsScanned: (snapshot.productCards || []).length,
      eventsLoaded: events.length,
      items: items.length,
      highSalesReminders: items.filter(item => item.highSales).length,
      autoExecutable: items.filter(item => item.titleDecision === 'auto_execute').length,
      missingTitleReview: items.filter(item => item.titleDecision === 'review_missing_current_title').length,
      protectedListingHolds: items.filter(item => item.titleDecision === 'protected_listing_hold').length,
      autoAdCandidates: items.filter(item => item.adDecision === 'auto_execute' && item.adActions.length > 0).length,
    },
    items,
  };
}

module.exports = {
  buildSeasonTitleDryRun,
  campaignNameFor,
  chooseTitleTermFor,
  chooseBestEvent,
  defaultBidFor,
  eventSpecificTitleTerms,
  expiredTitleEvents,
  fitTitleWithSuffix,
  hasStrongSeasonFit,
  normalizeEvent,
  rankTopSalesSkus,
  seasonStatus,
  suggestExpiredOnlyTitle,
  suggestTitle,
};
