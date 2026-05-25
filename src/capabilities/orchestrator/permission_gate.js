const { routeAction } = require('./capability_router');

const ALLOWED_ACTION_KINDS = Object.freeze([
  'price_action',
  'bid_action',
  'budget_action',
  'placement_action',
  'listing_action',
  'inventory_action',
  'review_action',
]);

function assertActionTerminology(action = {}) {
  const route = routeAction(action);
  if (!ALLOWED_ACTION_KINDS.includes(route.actionKind)) {
    return {
      ok: false,
      actionKind: route.actionKind,
      reason: `unsupported actionKind: ${route.actionKind}`,
      route,
    };
  }
  if (route.actionKind === 'price_action' && action.actionType && action.actionType !== 'price') {
    return {
      ok: false,
      actionKind: route.actionKind,
      reason: 'price_action must use actionType=price and must not be encoded as bid/budget',
      route,
    };
  }
  if (route.actionKind === 'bid_action' && action.actionType && !['bid', 'create', 'enable', 'pause'].includes(action.actionType)) {
    return {
      ok: false,
      actionKind: route.actionKind,
      reason: 'bid_action must stay separate from price/budget/placement actions',
      route,
    };
  }
  return {
    ok: route.routed,
    actionKind: route.actionKind,
    reason: route.routed ? '' : `no capability route for actionKind=${route.actionKind}`,
    route,
  };
}

function permissionForAction(action = {}, options = {}) {
  const terminology = assertActionTerminology(action);
  if (!terminology.ok) {
    return {
      allowed: false,
      reason: terminology.reason,
      actionKind: terminology.actionKind,
      capabilityId: terminology.route.capabilityId,
    };
  }
  const capability = terminology.route.capability;
  if (options.dryRun === true && capability.supportsDryRun) {
    return {
      allowed: true,
      mode: 'dry-run',
      actionKind: terminology.actionKind,
      capabilityId: capability.capabilityId,
    };
  }
  if (capability.requiresApproval && !options.approved) {
    return {
      allowed: false,
      reason: 'approval_required',
      actionKind: terminology.actionKind,
      capabilityId: capability.capabilityId,
    };
  }
  if (!capability.autoExecutable && !options.forceManualBoundary) {
    return {
      allowed: false,
      reason: 'manual_boundary_required',
      actionKind: terminology.actionKind,
      capabilityId: capability.capabilityId,
    };
  }
  return {
    allowed: true,
    mode: 'execute',
    actionKind: terminology.actionKind,
    capabilityId: capability.capabilityId,
  };
}

module.exports = {
  ALLOWED_ACTION_KINDS,
  assertActionTerminology,
  permissionForAction,
};
