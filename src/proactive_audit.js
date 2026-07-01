const KPI_FINAL_TARGET = {
  sales: 680000,
  units: 4600,
  netProfitRate: 0.205,
  estimatedNetProfit: 139000,
  adCostShare: 0.105,
  acos: 0.18,
  refundRate: 0.038,
  unitYoy: -0.15,
};

const KPI_TRAJECTORY = [
  { date: '2026-05-19', sales: 610000, units: 4150, netProfitRate: 0.195, adCostShare: 0.11, acos: 0.188, refundRate: 0.045 },
  { date: '2026-05-26', sales: 635000, units: 4300, netProfitRate: 0.198, adCostShare: 0.108, acos: 0.185, refundRate: 0.042 },
  { date: '2026-06-02', sales: 660000, units: 4450, netProfitRate: 0.201, adCostShare: 0.107, acos: 0.183, refundRate: 0.04 },
  { date: '2026-06-09', sales: 675000, units: 4550, netProfitRate: 0.203, adCostShare: 0.106, acos: 0.181, refundRate: 0.039 },
  { date: '2026-06-12', sales: 680000, units: 4600, netProfitRate: 0.205, adCostShare: 0.105, acos: 0.18, refundRate: 0.038 },
];

const { assessRemovalInventoryEconomics } = require('./inventory_economics');
const { replenishmentCoverage7d } = require('./local_inventory');

const EXPIRED_SEASON_PATTERNS = [
  {
    key: 'teacher_appreciation',
    label: 'Teacher Appreciation tail/expired',
    re: /teacher|teachers|educator|end of year student gifts|school office/i,
  },
  {
    key: 'nurse_week',
    label: 'Nurse Week tail/expired',
    re: /nurse|nurses|nursing|rn\b/i,
  },
  {
    key: 'mothers_day',
    label: "Mother's Day tail/expired",
    re: /mother|mothers|mom\b|mama|grandma|godmother|god mother|madrina/i,
  },
  {
    key: 'cinco_de_mayo',
    label: 'Cinco de Mayo expired',
    re: /cinco|fiesta|mexican|pinata|piñata|taco/i,
  },
  {
    key: 'easter',
    label: 'Easter expired',
    re: /easter|bunny|rabbit egg|egg hunt/i,
  },
  {
    key: 'lab_week',
    label: 'Lab Week expired',
    re: /lab week|laboratory|medical lab/i,
  },
];

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function text(value) {
  return String(value || '').trim();
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((num(value) + Number.EPSILON) * factor) / factor;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function daysBetweenDateStrings(from, to) {
  if (!from || !to) return null;
  const a = new Date(`${String(from).slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${String(to).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function adWindow(card = {}, key) {
  const sp = card.adStats?.[key] || {};
  const sb = card.sbStats?.[key] || {};
  const spend = num(sp.spend ?? sp.Spend) + num(sb.spend ?? sb.Spend);
  const orders = num(sp.orders ?? sp.Orders) + num(sb.orders ?? sb.Orders);
  const sales = num(sp.sales ?? sp.Sales) + num(sb.sales ?? sb.Sales);
  const clicks = num(sp.clicks ?? sp.Clicks) + num(sb.clicks ?? sb.Clicks);
  const impressions = num(sp.impressions ?? sp.Impressions) + num(sb.impressions ?? sb.Impressions);
  return {
    hasData: !!card.adStats?.[key] || !!card.sbStats?.[key],
    spend,
    orders,
    sales,
    clicks,
    impressions,
    acos: sales > 0 ? spend / sales : 0,
  };
}

function inventoryReady(card = {}) {
  const fulfillable = num(card.fulFillable ?? card.fulfillable ?? card.stockFul);
  const reserved = num(card.reservedQty ?? card.reserved ?? card.stockRes);
  const inbound = num(card.inboundQty ?? card.stockInb ?? card.stockInbAir);
  return fulfillable + reserved > 0 || num(card.invDays) >= 14 || inbound > 0;
}

function fulResUnits(card = {}) {
  return num(card.fulFillable ?? card.fulfillable ?? card.stockFul) +
    num(card.reservedQty ?? card.reserved ?? card.stockRes);
}

function sellableDaysFrom7dVelocity(card = {}) {
  const units7d = num(card.unitsSold_7d);
  if (units7d <= 0) return null;
  return round(fulResUnits(card) / (units7d / 7), 1);
}

function offAdState(card = {}) {
  const state = text(card.advState ?? card.adState ?? card.ad_status ?? card.adStatus).toLowerCase();
  return state === 'off' || state === 'closed' || state === 'disabled' || state.includes('关');
}

function canSalesDays(card = {}, days) {
  return num(
    card[`can_sales_${days}_first`] ??
      card[`can_sales_${days}_second`] ??
      card[`can_sales_${days}_third`] ??
      card[`sellableDays_${days}d`] ??
      card[`dynamic_saleday${days}`],
    null,
  );
}

function adPoint(card = {}) {
  for (const key of ['adv_point', 'adPoint', 'adCostShare']) {
    if (Object.prototype.hasOwnProperty.call(card, key)) return num(card[key], null);
  }
  return null;
}

function shouldRoutePriceCandidateToAdRecovery(card = {}, replenishment = {}) {
  const d7 = adWindow(card, '7d');
  const point = adPoint(card);
  const lowAdShare = point !== null && point <= 0.01;
  const noEffectiveDelivery = d7.hasData && d7.impressions < 100 && d7.clicks < 3 && d7.orders === 0;
  const adSuppressed = offAdState(card) || lowAdShare || noEffectiveDelivery;
  if (!adSuppressed) return false;
  const can7 = canSalesDays(card, 7);
  const can30 = canSalesDays(card, 30);
  const inventoryCanConnect =
    (replenishment.totalSellableDays7d !== null && replenishment.totalSellableDays7d >= 15) ||
    can7 >= 15 ||
    can30 >= 15 ||
    replenishment.units > 0;
  return inventoryCanConnect;
}

function variantLinePriceReview(card = {}, parentGroups = new Map()) {
  const parent = text(card.parent_asin || card.parentAsin);
  if (!parent) return null;
  const siblings = (parentGroups.get(parent) || []).filter(item => text(item.sku).toUpperCase() !== text(card.sku).toUpperCase());
  if (!siblings.length) return null;
  const siblingIssues = [];
  for (const sibling of siblings) {
    const status = text(sibling.saleStatus || sibling.sale_status);
    const siblingFulRes = fulResUnits(sibling);
    const siblingCan30 = canSalesDays(sibling, 30);
    const siblingPoint = adPoint(sibling);
    const siblingUnits30 = num(sibling.unitsSold_30d ?? sibling.qty_30);
    const siblingProfit = num(sibling.netProfit ?? sibling.net_profit ?? sibling.profitRate, null);
    const hasInventoryRoom = siblingFulRes >= 15 || siblingCan30 >= 30;
    if (status && status !== 'normal_sale' && status !== '正常销售') {
      siblingIssues.push(`${text(sibling.sku)}:status=${status}`);
      continue;
    }
    if (hasInventoryRoom && siblingUnits30 > 0 && (offAdState(sibling) || (siblingPoint !== null && siblingPoint <= 0.01))) {
      siblingIssues.push(`${text(sibling.sku)}:ad_recovery`);
      continue;
    }
    if (siblingPoint !== null && siblingPoint >= 0.15 && (siblingProfit === null || siblingProfit <= 0.1)) {
      siblingIssues.push(`${text(sibling.sku)}:ad_cost_pressure`);
    }
  }
  if (!siblingIssues.length) return null;
  return {
    parentAsin: parent,
    siblingCount: siblings.length,
    siblingIssues,
  };
}

function recentDays(card = {}, businessDate) {
  const candidates = [card.fuldate, card.fulfillmentDate, card.opendate, card.openDate]
    .map(value => daysBetweenDateStrings(value, businessDate))
    .filter(value => value !== null && value >= 0);
  return candidates.length ? Math.min(...candidates) : null;
}

function coverage(card = {}) {
  return card.createContext?.coverage || {};
}

function hasBasicAdStructure(card = {}) {
  const c = coverage(card);
  return c.hasSpAuto === true && c.hasSpKeyword === true && c.hasSpManual === true;
}

function isNewProduct(card = {}, businessDate) {
  const age = recentDays(card, businessDate);
  return age !== null && age <= 45;
}

function rowSkuFromCampaign(row = {}) {
  const source = `${row.campaignName || ''} ${row.groupName || ''}`;
  const match = source.match(/[a-z]{2,5}\d{3,5}/i);
  return match ? match[0].toUpperCase() : '';
}

function isSpEnabled(row = {}) {
  return num(row.state) === 1 &&
    num(row.campaignState) === 1 &&
    (row.groupState === undefined || row.groupState === null || num(row.groupState) === 1);
}

function isSbEnabled(row = {}) {
  const campaignEnabled = String(row.campaignState || '').toUpperCase() === 'ENABLED';
  const state = String(row.state || '').toUpperCase();
  return campaignEnabled && (num(row.state) === 2 || num(row.state) === 1 || state === 'ENABLED');
}

function extractKeywordRows(snapshot = {}) {
  const rows = [];
  for (const row of snapshot.kwRows || []) {
    rows.push({
      ...row,
      source: 'SP',
      entityType: 'keyword',
      enabled: isSpEnabled(row),
      searchText: [row.keywordText, row.campaignName, row.groupName].filter(Boolean).join(' '),
      entityId: text(row.keywordId),
    });
  }
  for (const row of snapshot.sbRows || []) {
    rows.push({
      ...row,
      source: 'SB',
      entityType: 'sbKeyword',
      enabled: isSbEnabled(row),
      searchText: [row.keywordText, row.campaignName].filter(Boolean).join(' '),
      entityId: text(row.keywordId),
    });
  }
  return rows;
}

function findSummarySellerRow(snapshot = {}) {
  const rows = (snapshot.sellerSalesRows || []).filter(row => num(row.order_sales) > 0);
  if (!rows.length) return null;
  return rows.slice().sort((a, b) => num(b.order_sales) - num(a.order_sales))[0];
}

function gapAtLeastZero(target, current) {
  return round(Math.max(0, target - current), 4);
}

function gapForMax(current, target) {
  return round(Math.max(0, current - target), 4);
}

function buildKpiAudit(snapshot = {}, timeContext = {}) {
  const row = findSummarySellerRow(snapshot);
  const current = {
    sales: round(row?.order_sales || 0),
    units: round(row?.sale_num || 0, 0),
    netProfitRate: round(row?.net_profit || 0, 4),
    estimatedNetProfit: round(num(row?.order_sales) * num(row?.net_profit)),
    adCostShare: round(row?.advCost || 0, 4),
    acos: round(row?.ACOS || 0, 4),
    roas: round(row?.ROAS || 0, 4),
    cpc: round(row?.CPC || 0, 4),
    refundRate: round(row?.refund_percent || 0, 4),
    unitYoy: round(row?.qty_yoy_over_1_year || 0, 4),
  };
  const finalTarget = {
    target: KPI_FINAL_TARGET,
    salesGap: gapAtLeastZero(KPI_FINAL_TARGET.sales, current.sales),
    unitsGap: gapAtLeastZero(KPI_FINAL_TARGET.units, current.units),
    netProfitRateGap: gapAtLeastZero(KPI_FINAL_TARGET.netProfitRate, current.netProfitRate),
    estimatedNetProfitGap: gapAtLeastZero(KPI_FINAL_TARGET.estimatedNetProfit, current.estimatedNetProfit),
    adCostShareGap: gapForMax(current.adCostShare, KPI_FINAL_TARGET.adCostShare),
    acosGap: gapForMax(current.acos, KPI_FINAL_TARGET.acos),
    refundRateGap: gapForMax(current.refundRate, KPI_FINAL_TARGET.refundRate),
    unitYoyGap: gapAtLeastZero(KPI_FINAL_TARGET.unitYoy, current.unitYoy),
  };
  const nextTarget = KPI_TRAJECTORY.find(item => item.date >= String(timeContext.businessDate || '')) || KPI_TRAJECTORY[KPI_TRAJECTORY.length - 1];
  const nextCheckpoint = {
    target: nextTarget,
    salesGap: gapAtLeastZero(nextTarget.sales, current.sales),
    unitsGap: gapAtLeastZero(nextTarget.units, current.units),
    netProfitRateGap: gapAtLeastZero(nextTarget.netProfitRate, current.netProfitRate),
    adCostShareGap: gapForMax(current.adCostShare, nextTarget.adCostShare),
    acosGap: gapForMax(current.acos, nextTarget.acos),
    refundRateGap: gapForMax(current.refundRate, nextTarget.refundRate),
  };
  const blockingGaps = [
    finalTarget.salesGap,
    finalTarget.unitsGap,
    finalTarget.netProfitRateGap,
    finalTarget.adCostShareGap,
    finalTarget.acosGap,
    finalTarget.refundRateGap,
  ].filter(value => value > 0);
  return {
    sourceSellerTitle: row?.seller_title || '',
    current,
    nextCheckpoint,
    finalTarget,
    status: blockingGaps.length ? 'off_track' : 'on_track',
    requiredMode: blockingGaps.length ? 'active_recovery_with_profit_guardrails' : 'protect_and_extend',
  };
}

function buildNewProductLaunchAudit(snapshot = {}, timeContext = {}) {
  const items = [];
  for (const card of snapshot.productCards || []) {
    if (!isNewProduct(card, timeContext.businessDate) || !inventoryReady(card)) continue;
    const d7 = adWindow(card, '7d');
    const ageDays = recentDays(card, timeContext.businessDate);
    if (!hasBasicAdStructure(card)) {
      items.push({
        sku: text(card.sku),
        asin: text(card.asin),
        issue: 'new_product_missing_basic_ad_structure',
        ageDays,
        profitRate: num(card.profitRate),
        invDays: num(card.invDays),
        units7d: num(card.unitsSold_7d),
        impressions7d: d7.impressions,
        clicks7d: d7.clicks,
        spend7d: round(d7.spend),
        requiredAction: 'build_basic_sp_auto_keyword_manual_ads',
        why: 'New inventory cannot wait for natural orders in a listing-heavy operating model.',
      });
    } else if (d7.impressions < 200 || d7.clicks < 5 || d7.spend < 2) {
      items.push({
        sku: text(card.sku),
        asin: text(card.asin),
        issue: 'new_product_existing_structure_low_delivery',
        ageDays,
        profitRate: num(card.profitRate),
        invDays: num(card.invDays),
        units7d: num(card.unitsSold_7d),
        impressions7d: d7.impressions,
        clicks7d: d7.clicks,
        spend7d: round(d7.spend),
        requiredAction: 'increase_delivery_or_repair_new_product_structure',
        why: 'Existing structure without delivery is not a launched product.',
      });
    }
  }
  return {
    summary: { total: items.length, missingStructure: items.filter(item => item.issue.includes('missing')).length, lowDelivery: items.filter(item => item.issue.includes('low_delivery')).length },
    items: items.sort((a, b) => a.ageDays - b.ageDays || b.invDays - a.invDays),
  };
}

const AD_RECOVERY_DIAGNOSTIC_RULE_SOURCE = 'GBrain:04-standard-playbooks/ad-recovery-full-diagnostic-structure';
const AD_RECOVERY_EVIDENCE_REQUIRED = [
  'operating_goal',
  'current_ad_breakpoint',
  'close_reason',
  'historical_effective_lanes',
  'receiver_layer',
  'current_capacity',
  'action_intensity',
  'readback_plan',
];

function arrivalAdRecoveryDiagnosticItem(card, ageDays, d7, subIssue) {
  return {
    sku: text(card.sku),
    asin: text(card.asin),
    ageDays,
    invDays: num(card.invDays),
    fulfillable: num(card.fulFillable ?? card.fulfillable ?? card.stockFul),
    impressions7d: d7.impressions,
    clicks7d: d7.clicks,
    requiredAction: 'diagnose_ad_recovery_before_action',
    issue: 'ad_recovery_diagnosis_required',
    subIssue,
    diagnosticStructureRequired: true,
    ruleSource: AD_RECOVERY_DIAGNOSTIC_RULE_SOURCE,
    evidenceRequired: AD_RECOVERY_EVIDENCE_REQUIRED.join('|'),
    actionIntensityRule: 'size_from_market_product_inventory_profit_and_historical_lane_evidence',
    why: 'Arrival ad recovery must classify the real breakpoint before enable, scale, or build decisions.',
  };
}

function buildArrivalAdRecoveryAudit(snapshot = {}, timeContext = {}) {
  const items = [];
  for (const card of snapshot.productCards || []) {
    if (!inventoryReady(card)) continue;
    const ageDays = recentDays(card, timeContext.businessDate);
    if (ageDays === null || ageDays > 21) continue;
    const d7 = adWindow(card, '7d');
    if (!hasBasicAdStructure(card)) {
      items.push(arrivalAdRecoveryDiagnosticItem(card, ageDays, d7, 'arrived_inventory_without_basic_ads'));
    } else if (d7.impressions < 200 || d7.clicks < 5) {
      items.push(arrivalAdRecoveryDiagnosticItem(card, ageDays, d7, 'arrived_inventory_ads_have_no_effective_delivery'));
    }
  }
  return {
    summary: { total: items.length, diagnosticRequired: items.length },
    items: items.sort((a, b) => a.ageDays - b.ageDays || a.impressions7d - b.impressions7d),
  };
}

function buildPriceActionsAudit(snapshot = {}) {
  const items = [];
  const routedOut = [];
  const parentGroups = new Map();
  for (const card of snapshot.productCards || []) {
    const parent = text(card.parent_asin || card.parentAsin);
    if (!parent) continue;
    if (!parentGroups.has(parent)) parentGroups.set(parent, []);
    parentGroups.get(parent).push(card);
  }
  for (const card of snapshot.productCards || []) {
    const invDays = num(card.invDays);
    const units7d = num(card.unitsSold_7d);
    const profitRate = num(card.profitRate);
    const available = fulResUnits(card);
    const sellableDays7d = sellableDaysFrom7dVelocity(card);
    const replenishment = replenishmentCoverage7d(card, { units7d, fulResUnits: available });
    if (sellableDays7d !== null && sellableDays7d < 15) {
      const baseItem = {
        sku: text(card.sku),
        asin: text(card.asin),
        parentAsin: text(card.parent_asin || card.parentAsin),
        issue: 'ful_res_7d_sellable_days_short_price_gate',
        invDays,
        units7d,
        fulResUnits: available,
        sellableDays7d,
        replenishmentUnits: replenishment.units,
        replenishmentDays7d: replenishment.days,
        totalSellableDays7d: replenishment.totalSellableDays7d,
        profitRate,
        price: num(card.price),
        saleStatus: text(card.saleStatus),
        advState: text(card.advState ?? card.adState),
        advPoint: adPoint(card),
      };
      if (shouldRoutePriceCandidateToAdRecovery(card, replenishment)) {
        routedOut.push({
          ...baseItem,
          issue: 'price_pool_routed_to_ad_recovery',
          requiredAction: 'restore_historical_ad_lanes_before_price_raise',
          why: 'Ad delivery/share is suppressed while inventory or replenishment can connect; restore historical converting lanes before treating the SKU as a price-raise candidate.',
        });
        continue;
      }
      if (replenishment.totalSellableDays7d !== null && replenishment.totalSellableDays7d >= 15) {
        routedOut.push({
          ...baseItem,
          issue: 'price_pool_replenishment_pipeline_available',
          requiredAction: 'hold_price_watch_inventory_and_ad_pressure',
          why: 'Ful+Res is below 15 days, but inbound/planned/local replenishment can connect the next stock window.',
        });
        continue;
      }
      const variantReview = variantLinePriceReview(card, parentGroups);
      if (variantReview) {
        routedOut.push({
          ...baseItem,
          issue: 'price_pool_variant_line_review_required',
          requiredAction: 'review_parent_variant_line_before_price_raise',
          variantParentAsin: variantReview.parentAsin,
          variantSiblingCount: variantReview.siblingCount,
          variantSiblingIssues: variantReview.siblingIssues.join('; '),
          why: 'A sibling variation has ad recovery, ad cost pressure, or sale-status issues that can change the price decision for this child SKU.',
        });
        continue;
      }
      items.push({
        ...baseItem,
        requiredAction: 'review_price_raise_or_recover_price',
        why: 'Ful+Res inventory cannot cover 15 days at current 7d sales velocity and replenishment cannot connect the next stock window; review controlled price raise before adding traffic.',
      });
    }
  }
  return {
    summary: {
      total: items.length,
      shortSellableDays: items.filter(item => item.issue.includes('sellable_days_short')).length,
      tightInventory: items.filter(item => item.issue.includes('sellable_days_short')).length,
      lowProfit: 0,
      routedOut: routedOut.length,
      routedToAdRecovery: routedOut.filter(item => item.issue === 'price_pool_routed_to_ad_recovery').length,
      routedToVariantReview: routedOut.filter(item => item.issue === 'price_pool_variant_line_review_required').length,
      routedToReplenishmentWatch: routedOut.filter(item => item.issue === 'price_pool_replenishment_pipeline_available').length,
    },
    items: items.sort((a, b) => a.sellableDays7d - b.sellableDays7d || b.units7d - a.units7d),
    routedOut: routedOut.sort((a, b) => a.sellableDays7d - b.sellableDays7d || b.units7d - a.units7d),
  };
}

function hasRemovalEconomicsPressure(card = {}, timeContext = {}) {
  const invDays = num(card.sellableDays_30d || card.invDays);
  const units30 = num(card.unitsSold_30d);
  const available = fulResUnits(card);
  const ageDays = recentDays(card, timeContext.businessDate);
  const matureEnough = ageDays === null || ageDays > 60;
  if (!matureEnough) return false;
  return (invDays >= 120 && units30 <= 3) || (available >= 70 && invDays >= 90 && units30 <= 3);
}

function removalEconomicsIssue(economics = {}) {
  if (economics.status !== 'available') return 'removal_economics_missing_for_inventory_pressure';
  if (economics.bestRecoveryPath === 'current_sale') return 'current_sale_recovery_beats_removal_paths';
  if (economics.bestRecoveryPath === 'batch_clearance') return 'batch_clearance_recovery_beats_current_sale';
  if (economics.bestRecoveryPath === 'offline_service_provider') return 'offline_service_provider_recovery_beats_current_sale';
  if (economics.bestRecoveryPath === 'disposal') return 'disposal_or_destroy_recovery_best';
  return 'removal_economics_manual_review';
}

function buildRemovalEconomicsAudit(snapshot = {}, timeContext = {}) {
  const items = [];
  for (const card of snapshot.productCards || []) {
    const economics = assessRemovalInventoryEconomics(card);
    const hasEconomics = economics.status === 'available';
    const pressure = hasRemovalEconomicsPressure(card, timeContext);
    if (!hasEconomics && !pressure) continue;
    const sku = text(card.sku);
    const item = {
      sku,
      asin: text(card.asin),
      issue: removalEconomicsIssue(economics),
      invDays: num(card.sellableDays_30d || card.invDays),
      fulResUnits: fulResUnits(card),
      units30d: num(card.unitsSold_30d),
      currentSaleRecoveryUsd: economics.currentSaleRecoveryUsd,
      offlineServiceProviderRecoveryUsd: economics.offlineServiceProviderRecoveryUsd,
      batchClearanceRecoveryUsd: economics.batchClearanceRecoveryUsd,
      disposalRecoveryUsd: economics.disposalRecoveryUsd,
      bestRecoveryPath: economics.bestRecoveryPath,
      sellerinventorySuggestion: economics.sellerinventorySuggestion || '',
      recommendation: economics.recommendation,
      requiredAction: economics.requiredAction,
      readOnlyProbeCommand: economics.status === 'available' ? '' : `npm run ops:removal-inventory:add-view -- --sku ${sku}`,
      why: economics.status === 'available'
        ? economics.operatingMeaning
        : 'High or stale inventory needs sellerinventory add-view read-only recovery values before choosing discount, service provider, batch clearance, or disposal.',
    };
    items.push(item);
  }
  const summary = {
    total: items.length,
    missingEconomics: items.filter(item => item.requiredAction === 'fetch_removal_inventory_add_view_readonly').length,
    discountOrSellThrough: items.filter(item => item.requiredAction === 'discount_or_sell_through_before_removal').length,
    serviceProviderCandidates: items.filter(item => item.requiredAction === 'review_offline_service_provider').length,
    batchClearanceCandidates: items.filter(item => item.requiredAction === 'review_batch_clearance_plan').length,
    disposalReview: items.filter(item => item.requiredAction === 'manual_disposal_review').length,
  };
  return {
    summary,
    items: items.sort((a, b) => {
      const aMissing = a.requiredAction === 'fetch_removal_inventory_add_view_readonly' ? 1 : 0;
      const bMissing = b.requiredAction === 'fetch_removal_inventory_add_view_readonly' ? 1 : 0;
      return aMissing - bMissing || b.invDays - a.invDays || b.fulResUnits - a.fulResUnits;
    }),
  };
}

function buildListingRepairAudit(snapshot = {}) {
  const items = [];
  for (const card of snapshot.productCards || []) {
    const d7 = adWindow(card, '7d');
    const d3 = adWindow(card, '3d');
    const profile = card.productProfile || {};
    const listingMissing = !card.listing && !text(profile.listingTitle);
    const trafficNoConversion = d7.clicks >= 30 && d7.orders === 0;
    const highAcos = d7.sales > 0 && d7.acos >= 0.35;
    if (trafficNoConversion || highAcos || (listingMissing && d7.clicks >= 10)) {
      items.push({
        sku: text(card.sku),
        asin: text(card.asin),
        issue: trafficNoConversion ? 'traffic_without_conversion_listing_repair' : 'high_acos_listing_or_offer_repair',
        listingMissing,
        clicks3d: d3.clicks,
        spend3d: round(d3.spend),
        orders3d: d3.orders,
        clicks7d: d7.clicks,
        spend7d: round(d7.spend),
        orders7d: d7.orders,
        acos7d: d7.sales > 0 ? round(d7.acos, 4) : null,
        requiredAction: 'inspect_listing_price_reviews_and_search_term_fit',
      });
    }
  }
  return {
    summary: { total: items.length, trafficNoConversion: items.filter(item => item.issue === 'traffic_without_conversion_listing_repair').length },
    items: items.sort((a, b) => b.spend7d - a.spend7d || b.clicks7d - a.clicks7d),
  };
}

function buildExpiredSeasonKeywordWasteAudit(snapshot = {}) {
  const seen = new Set();
  const items = [];
  for (const row of extractKeywordRows(snapshot)) {
    if (!row.enabled) continue;
    const theme = EXPIRED_SEASON_PATTERNS.find(item => item.re.test(row.searchText || ''));
    if (!theme) continue;
    const key = `${row.source}|${row.entityId || row.campaignId || ''}|${row.keywordText || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const spend3 = num(row.spend3 ?? row.Spend3);
    const orders3 = num(row.orders3 ?? row.Orders3);
    const sales3 = num(row.sales3 ?? row.Sales3);
    const spend7 = num(row.spend7 ?? row.Spend7);
    const orders7 = num(row.orders7 ?? row.Orders7);
    const sales7 = num(row.sales7 ?? row.Sales7);
    const acos3 = sales3 > 0 ? spend3 / sales3 : null;
    const acos7 = sales7 > 0 ? spend7 / sales7 : null;
    if (spend3 <= 0 && spend7 <= 0) continue;
    const waste3 = spend3 > 0 && (orders3 === 0 || (acos3 !== null && acos3 > 0.25));
    const waste7 = spend7 > 0 && (orders7 === 0 || (acos7 !== null && acos7 > 0.25));
    if (!waste3 && !waste7) continue;
    items.push({
      theme: theme.key,
      themeLabel: theme.label,
      source: row.source,
      entityType: row.entityType,
      entityId: row.entityId,
      sku: rowSkuFromCampaign(row),
      keywordText: text(row.keywordText),
      campaignName: text(row.campaignName),
      groupName: text(row.groupName),
      bid: num(row.bid),
      spend3: round(spend3),
      orders3,
      sales3: round(sales3),
      acos3: acos3 === null ? null : round(acos3, 4),
      clicks3: num(row.clicks3),
      impressions3: num(row.impressions3),
      spend7: round(spend7),
      orders7,
      sales7: round(sales7),
      acos7: acos7 === null ? null : round(acos7, 4),
      clicks7: num(row.clicks7),
      impressions7: num(row.impressions7),
      requiredAction: 'pause_or_bid_down_expired_season_keyword',
      why: 'Expired or tail-season traffic must justify itself with recent efficient orders.',
    });
  }
  const summary = items.reduce((acc, item) => {
    acc.totalEnabledRows += 1;
    acc.spend3 += item.spend3;
    acc.sales3 += item.sales3;
    acc.orders3 += item.orders3;
    acc.noOrderSpend3 += item.spend3 > 0 && item.orders3 === 0 ? item.spend3 : 0;
    acc.highAcosSpend3 += item.spend3 > 0 && item.orders3 > 0 && item.acos3 > 0.25 ? item.spend3 : 0;
    acc.spend7 += item.spend7;
    acc.sales7 += item.sales7;
    acc.orders7 += item.orders7;
    acc.noOrderSpend7 += item.spend7 > 0 && item.orders7 === 0 ? item.spend7 : 0;
    return acc;
  }, { totalEnabledRows: 0, spend3: 0, sales3: 0, orders3: 0, noOrderSpend3: 0, highAcosSpend3: 0, spend7: 0, sales7: 0, orders7: 0, noOrderSpend7: 0 });
  summary.spend3 = round(summary.spend3);
  summary.sales3 = round(summary.sales3);
  summary.noOrderSpend3 = round(summary.noOrderSpend3);
  summary.highAcosSpend3 = round(summary.highAcosSpend3);
  summary.spend7 = round(summary.spend7);
  summary.sales7 = round(summary.sales7);
  summary.noOrderSpend7 = round(summary.noOrderSpend7);
  summary.acos3 = summary.sales3 > 0 ? round(summary.spend3 / summary.sales3, 4) : null;
  summary.acos7 = summary.sales7 > 0 ? round(summary.spend7 / summary.sales7, 4) : null;
  return {
    summary,
    items: items.sort((a, b) => b.spend3 - a.spend3 || b.spend7 - a.spend7),
  };
}

function buildProactiveOperatingAudit(input = {}) {
  const snapshot = input.snapshot || {};
  const timeContext = input.timeContext || {};
  const kpi = buildKpiAudit(snapshot, timeContext);
  const newProductLaunch = buildNewProductLaunchAudit(snapshot, timeContext);
  const arrivalAdRecovery = buildArrivalAdRecoveryAudit(snapshot, timeContext);
  const priceActions = buildPriceActionsAudit(snapshot);
  const removalEconomics = buildRemovalEconomicsAudit(snapshot, timeContext);
  const expiredSeasonKeywordWaste = buildExpiredSeasonKeywordWasteAudit(snapshot);
  const listingRepair = buildListingRepairAudit(snapshot);
  const requiredModules = [
    ['kpi', kpi.status],
    ['newProductLaunch', newProductLaunch.summary.total],
    ['arrivalAdRecovery', arrivalAdRecovery.summary.total],
    ['priceActions', priceActions.summary.total],
    ['removalEconomics', removalEconomics.summary.total],
    ['expiredSeasonKeywordWaste', expiredSeasonKeywordWaste.summary.totalEnabledRows],
    ['listingRepair', listingRepair.summary.total],
  ].map(([name, result]) => ({ name, status: 'checked', result }));
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    time: timeContext,
    requiredModules,
    kpi,
    newProductLaunch,
    arrivalAdRecovery,
    priceActions,
    removalEconomics,
    expiredSeasonKeywordWaste,
    listingRepair,
    closureGate: {
      complete: true,
      rule: 'Daily loop is not complete until every required module is checked and each item is classified into execute, manual repair, or no-action.',
    },
  };
}

function renderItemsTable(items = [], columns = []) {
  if (!items.length) return '<p class="empty">No items.</p>';
  const rows = items.map(item => `<tr>${columns.map(column => `<td>${escapeHtml(item[column] ?? '')}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderProactiveOperatingAuditHtml(audit = {}) {
  const kpi = audit.kpi || {};
  const current = kpi.current || {};
  const finalTarget = kpi.finalTarget || {};
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Proactive Operating Audit ${escapeHtml(audit.time?.businessDate || '')}</title>
  <style>
    body { font-family: Arial, "Microsoft YaHei", sans-serif; margin: 24px; color: #17212b; background: #f6f7f9; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    h2 { margin: 26px 0 10px; font-size: 18px; }
    .meta, .note { color: #52616b; line-height: 1.6; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 14px 0; }
    .card { background: #fff; border: 1px solid #d7dde3; border-radius: 6px; padding: 10px; }
    .label { font-size: 12px; color: #52616b; }
    .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; background: #fff; }
    th, td { border-bottom: 1px solid #e3e8ee; padding: 7px; text-align: left; vertical-align: top; }
    th { background: #edf2f7; position: sticky; top: 0; }
    .empty { background: #fff; border: 1px solid #d7dde3; border-radius: 6px; padding: 10px; color: #52616b; }
  </style>
</head>
<body>
  <h1>Proactive Operating Audit</h1>
  <div class="meta">businessDate: ${escapeHtml(audit.time?.businessDate || '')} | dataDate: ${escapeHtml(audit.time?.dataDate || '')} | generatedAt: ${escapeHtml(audit.generatedAt || '')}</div>
  <div class="grid">
    <div class="card"><div class="label">KPI status</div><div class="value">${escapeHtml(kpi.status || '')}</div></div>
    <div class="card"><div class="label">Sales</div><div class="value">${escapeHtml(current.sales)}</div></div>
    <div class="card"><div class="label">Sales gap to 6/12</div><div class="value">${escapeHtml(finalTarget.salesGap)}</div></div>
    <div class="card"><div class="label">Units gap to 6/12</div><div class="value">${escapeHtml(finalTarget.unitsGap)}</div></div>
    <div class="card"><div class="label">ACOS gap</div><div class="value">${escapeHtml(finalTarget.acosGap)}</div></div>
    <div class="card"><div class="label">Refund gap</div><div class="value">${escapeHtml(finalTarget.refundRateGap)}</div></div>
  </div>
  <h2>New Product Launch</h2>
  ${renderItemsTable(audit.newProductLaunch?.items || [], ['sku', 'asin', 'issue', 'ageDays', 'invDays', 'impressions7d', 'clicks7d', 'spend7d', 'requiredAction'])}
  <h2>Arrival Ad Recovery</h2>
  ${renderItemsTable(audit.arrivalAdRecovery?.items || [], ['sku', 'asin', 'issue', 'subIssue', 'ageDays', 'invDays', 'fulfillable', 'impressions7d', 'clicks7d', 'requiredAction', 'diagnosticStructureRequired', 'ruleSource'])}
  <h2>Price Actions</h2>
  ${renderItemsTable(audit.priceActions?.items || [], ['sku', 'asin', 'issue', 'invDays', 'units7d', 'profitRate', 'price', 'requiredAction'])}
  <h3>Price Pool Routed Out</h3>
  <div class="note">Rows removed from price execution because the better route is ad recovery, variant-line review, or another non-price action.</div>
  ${renderItemsTable(audit.priceActions?.routedOut || [], ['sku', 'asin', 'issue', 'parentAsin', 'units7d', 'fulResUnits', 'sellableDays7d', 'advState', 'advPoint', 'requiredAction', 'variantSiblingIssues'])}
  <h2>Removal Economics</h2>
  <div class="note">Read-only sellerinventory recovery values compare current sale, offline service provider, batch clearance, and disposal before any removal application.</div>
  ${renderItemsTable(audit.removalEconomics?.items || [], ['sku', 'asin', 'issue', 'invDays', 'fulResUnits', 'units30d', 'currentSaleRecoveryUsd', 'offlineServiceProviderRecoveryUsd', 'batchClearanceRecoveryUsd', 'disposalRecoveryUsd', 'bestRecoveryPath', 'requiredAction'])}
  <h2>Expired Season Keyword Waste</h2>
  <div class="note">Rows are enabled season-tail or expired keywords with recent waste or high ACOS.</div>
  ${renderItemsTable(audit.expiredSeasonKeywordWaste?.items || [], ['theme', 'source', 'sku', 'keywordText', 'campaignName', 'bid', 'spend3', 'orders3', 'sales3', 'acos3', 'spend7', 'orders7', 'sales7', 'requiredAction'])}
  <h2>Listing Repair</h2>
  ${renderItemsTable(audit.listingRepair?.items || [], ['sku', 'asin', 'issue', 'listingMissing', 'clicks7d', 'spend7d', 'orders7d', 'acos7d', 'requiredAction'])}
</body>
</html>`;
}

module.exports = {
  EXPIRED_SEASON_PATTERNS,
  KPI_FINAL_TARGET,
  KPI_TRAJECTORY,
  buildArrivalAdRecoveryAudit,
  buildExpiredSeasonKeywordWasteAudit,
  buildKpiAudit,
  buildListingRepairAudit,
  buildNewProductLaunchAudit,
  buildPriceActionsAudit,
  buildRemovalEconomicsAudit,
  buildProactiveOperatingAudit,
  renderProactiveOperatingAuditHtml,
};
