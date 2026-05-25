const {
  approvedActionBase,
  failure,
  finiteNumber,
  requiredFields,
  runLegacyActionAdapter,
  text,
  verifyFromLegacyArtifact,
} = require('./legacy_action_adapter');

const capabilityId = 'adv.keyword.update_bid';

function buildAction(input = {}) {
  const missing = requiredFields(input, ['sku', 'id', 'currentBid', 'suggestedBid']);
  if (missing.length) {
    return failure(capabilityId, 'build', 'INPUT_VALIDATION_FAILED', 'keyword bid adapter input is missing required fields', { missing });
  }
  if (input.entityType && text(input.entityType) !== 'keyword') {
    return failure(capabilityId, 'build', 'ENTITY_TYPE_MISMATCH', 'adv.keyword.update_bid only accepts entityType=keyword', {
      entityType: input.entityType,
    });
  }
  const currentBid = finiteNumber(input.currentBid);
  const suggestedBid = finiteNumber(input.suggestedBid);
  if (currentBid == null || suggestedBid == null || currentBid <= 0 || suggestedBid <= 0) {
    return failure(capabilityId, 'build', 'BID_VALUE_INVALID', 'currentBid and suggestedBid must be positive numbers', {
      currentBid: input.currentBid,
      suggestedBid: input.suggestedBid,
    });
  }
  return {
    ok: true,
    action: {
      ...approvedActionBase(input),
      entityType: 'keyword',
      actionType: 'bid',
      id: text(input.id),
      currentBid,
      suggestedBid,
      campaignId: text(input.campaignId),
      adGroupId: text(input.adGroupId),
      campaignName: text(input.campaignName),
      groupName: text(input.groupName),
      text: text(input.text || input.keywordText),
      label: text(input.label || input.text || input.keywordText),
      riskLevel: input.riskLevel || 'capability_adapter_keyword_bid',
      reason: input.reason || `Capability adapter keyword bid update ${currentBid} -> ${suggestedBid}.`,
    },
  };
}

async function invoke(input = {}, options = {}, mode = 'dry-run') {
  const built = buildAction(input);
  if (!built.ok) return { ...built, mode };
  return runLegacyActionAdapter({ capabilityId, mode, input, action: built.action, options });
}

function dryRun(input = {}, options = {}) {
  return invoke(input, options, 'dry-run');
}

function execute(input = {}, options = {}) {
  return invoke(input, options, 'execute');
}

function verify(input = {}, options = {}) {
  return verifyFromLegacyArtifact({ capabilityId, input, options });
}

module.exports = {
  buildAction,
  capabilityId,
  dryRun,
  execute,
  verify,
};
