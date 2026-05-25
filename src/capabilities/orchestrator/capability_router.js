const fs = require('fs');
const path = require('path');
const { adapterCapabilityIds, getCapabilityAdapter } = require('../adapters');

const DEFAULT_REGISTRY_FILE = path.join(__dirname, '..', 'registry', 'capabilities.json');

function readCapabilities(file = DEFAULT_REGISTRY_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function capabilityList(file = DEFAULT_REGISTRY_FILE) {
  return readCapabilities(file).map(item => ({
    capabilityId: item.capabilityId,
    domain: item.domain,
    type: item.type,
    riskLevel: item.riskLevel,
    supportsDryRun: item.supportsDryRun === true,
    requiresApproval: item.requiresApproval === true,
    autoExecutable: item.autoExecutable === true,
    adapterRegistered: adapterCapabilityIds().includes(item.capabilityId),
  }));
}

function actionKindFor(action = {}) {
  if (action.actionKind) return String(action.actionKind);
  if (action.actionType === 'review' || action.actionType === 'structure_fix') return 'review_action';
  if (action.actionType === 'price' || action.entityType === 'sku') return 'price_action';
  if (action.actionType === 'budget') return 'budget_action';
  if (action.actionType === 'placement') return 'placement_action';
  if (action.actionType === 'copy_edit' || action.entityType === 'listing') return 'listing_action';
  if (action.actionType === 'note') return 'inventory_action';
  if (action.actionType === 'bid' || ['keyword', 'autoTarget', 'manualTarget', 'sbKeyword', 'sbTarget'].includes(action.entityType)) return 'bid_action';
  if (action.actionType === 'create') return 'bid_action';
  return 'review_action';
}

function routeAction(action = {}, registry = readCapabilities()) {
  const kind = actionKindFor(action);
  const entityType = String(action.entityType || '');
  const actionType = String(action.actionType || '');
  let capabilityId = '';

  if (kind === 'price_action') capabilityId = 'inventory.price.submit_application';
  else if (kind === 'budget_action') capabilityId = 'adv.campaign.update_budget';
  else if (kind === 'placement_action') capabilityId = 'adv.campaign.update_placement';
  else if (actionType === 'create') capabilityId = 'adv.sp_campaign.create';
  else if (kind === 'inventory_action') capabilityId = 'inventory.note.append';
  else if (kind === 'review_action') capabilityId = 'review.landing_verify';
  else if (entityType === 'keyword') capabilityId = 'adv.keyword.update_bid';
  else if (entityType === 'autoTarget') capabilityId = 'adv.auto_target.update_bid';
  else if (entityType === 'manualTarget') capabilityId = 'adv.manual_target.update_bid';
  else if (entityType === 'sbKeyword') capabilityId = 'adv.sb_keyword.update_bid';
  else if (entityType === 'sbTarget') capabilityId = 'adv.sb_target.update_bid';

  const capability = registry.find(item => item.capabilityId === capabilityId) || null;
  return {
    actionKind: kind,
    capabilityId,
    capability,
    routed: !!capability,
  };
}

function printCapabilityList(file = DEFAULT_REGISTRY_FILE) {
  const rows = capabilityList(file);
  return rows.map(item => [
    item.capabilityId,
    item.domain,
    item.type,
    item.riskLevel,
    item.supportsDryRun ? 'dry-run' : 'no-dry-run',
    item.autoExecutable ? 'auto' : 'manual',
  ].join('\t')).join('\n');
}

module.exports = {
  DEFAULT_REGISTRY_FILE,
  actionKindFor,
  adapterCapabilityIds,
  capabilityList,
  getCapabilityAdapter,
  printCapabilityList,
  readCapabilities,
  routeAction,
};

if (require.main === module) {
  console.log(printCapabilityList(process.argv[2] || DEFAULT_REGISTRY_FILE));
}
