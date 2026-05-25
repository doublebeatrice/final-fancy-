const {
  approvedActionBase,
  failure,
  finiteNumber,
  requiredFields,
  runLegacyActionAdapter,
  text,
  verifyFromLegacyArtifact,
} = require('./legacy_action_adapter');

const capabilityId = 'adv.campaign.update_budget';

function buildAction(input = {}) {
  const missing = requiredFields(input, ['sku', 'id', 'currentBudget', 'suggestedBudget']);
  if (missing.length) {
    return failure(capabilityId, 'build', 'INPUT_VALIDATION_FAILED', 'campaign budget adapter input is missing required fields', { missing });
  }
  if (input.entityType && text(input.entityType) !== 'campaign') {
    return failure(capabilityId, 'build', 'ENTITY_TYPE_MISMATCH', 'adv.campaign.update_budget only accepts entityType=campaign', {
      entityType: input.entityType,
    });
  }
  const currentBudget = finiteNumber(input.currentBudget);
  const suggestedBudget = finiteNumber(input.suggestedBudget);
  if (currentBudget == null || suggestedBudget == null || currentBudget <= 0 || suggestedBudget <= 0) {
    return failure(capabilityId, 'build', 'BUDGET_VALUE_INVALID', 'currentBudget and suggestedBudget must be positive numbers', {
      currentBudget: input.currentBudget,
      suggestedBudget: input.suggestedBudget,
    });
  }
  return {
    ok: true,
    action: {
      ...approvedActionBase(input),
      entityType: 'campaign',
      actionType: 'budget',
      id: text(input.id),
      currentBudget,
      suggestedBudget,
      campaignId: text(input.campaignId || input.id),
      campaignName: text(input.campaignName),
      riskLevel: input.riskLevel || 'capability_adapter_campaign_budget',
      reason: input.reason || `Capability adapter campaign budget update ${currentBudget} -> ${suggestedBudget}.`,
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
