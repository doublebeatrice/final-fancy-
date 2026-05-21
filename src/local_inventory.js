function isPresent(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function num(value, fallback = 0) {
  if (!isPresent(value)) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function firstNum(row = {}, keys = [], fallback = 0) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    if (!isPresent(row[key])) continue;
    const n = Number(row[key]);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function normalizeShipmentDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function extractLocalInventory(row = {}) {
  const purchasedTotal = firstNum(row, ['shipping_amount'], 0);
  const goodStock = firstNum(row, ['inventory_amount'], 0);
  const pendingAndTestStock = Math.max(0, purchasedTotal - goodStock);
  const lastShipmentTime = String(row.last_shipment_time || '').trim();
  const fbaPlanAir = firstNum(row, ['fbaPlan'], 0);
  const fbaPlanSea = firstNum(row, ['fba_plan_sea'], 0);
  const fbaPlanTotalAir = firstNum(row, ['fba_plan_total'], 0);
  const fbaPlanTotalSea = firstNum(row, ['fba_plan_total_sea'], 0);

  return {
    shipmentRecord: {
      lastShipmentTime,
      lastShipmentDate: normalizeShipmentDate(lastShipmentTime),
      lastShipmentQuantity: firstNum(row, ['last_shipment_quantity'], 0),
    },
    purchasedTotal,
    goodStock,
    pendingAndTestStock,
    testWarehouseStock: firstNum(row, ['unstock_in_amount'], 0),
    availableForPlan: firstNum(row, ['available_inventory'], 0),
    todayMadePlan: firstNum(row, ['today_made_plan'], 0),
    storeQtyNewPurchase: firstNum(row, ['storeQtyNew_purchase'], 0),
    purchasePlan: firstNum(row, ['purchasePlan'], 0),
    fbaPlan: fbaPlanAir + fbaPlanSea,
    fbaPlanAir,
    fbaPlanSea,
    fbaPlanTotal: fbaPlanTotalAir + fbaPlanTotalSea,
    fbaPlanTotalAir,
    fbaPlanTotalSea,
    orderAmount: firstNum(row, ['order_amount'], 0),
    sourceFields: {
      shipmentRecord: 'last_shipment_time,last_shipment_quantity',
      purchasedTotal: 'shipping_amount',
      goodStock: 'inventory_amount',
      pendingAndTestStock: 'shipping_amount-inventory_amount',
      testWarehouseStock: 'unstock_in_amount',
      availableForPlan: 'available_inventory',
      todayMadePlan: 'today_made_plan',
      fbaPlanAir: 'fbaPlan',
      fbaPlanSea: 'fba_plan_sea',
      fbaPlanTotalAir: 'fba_plan_total',
      fbaPlanTotalSea: 'fba_plan_total_sea',
    },
  };
}

function objectLocalQuantity(source = {}) {
  const keys = [
    'availableForPlan',
    'localAvailableForPlan',
    'available',
    'goodStock',
    'localGoodStock',
    'purchasedTotal',
    'localPurchasedTotal',
  ];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    if (!isPresent(source[key])) continue;
    const n = Number(source[key]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function localInventoryQuantity(card = {}, inv = {}) {
  const direct = card.localInventory ?? inv.localInventory;
  if (direct && typeof direct === 'object') return objectLocalQuantity(direct);
  if (isPresent(direct)) return num(direct);

  const aliases = [
    card.localAvailableForPlan,
    inv.localAvailableForPlan,
    card.localGoodStock,
    inv.localGoodStock,
    card.localPurchasedTotal,
    inv.localPurchasedTotal,
    inv.local,
  ];
  for (const value of aliases) {
    if (!isPresent(value)) continue;
    return num(value);
  }
  return 0;
}

module.exports = {
  extractLocalInventory,
  localInventoryQuantity,
  normalizeShipmentDate,
};
