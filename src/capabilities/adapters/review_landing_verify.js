const {
  failure,
  text,
  verifyFromLegacyArtifact,
} = require('./legacy_action_adapter');

const capabilityId = 'review.landing_verify';

function dryRun(input = {}, options = {}) {
  const executionEvents = Array.isArray(input.executionEvents) ? input.executionEvents : [];
  const snapshotFile = text(input.snapshotFile || options.snapshotFile);
  return {
    ok: true,
    capabilityId,
    mode: 'dry-run',
    dryRun: true,
    verifyMethod: 'post-write readback comparison',
    planned: {
      executionEventCount: executionEvents.length,
      snapshotFile,
      verifyFile: text(input.verifyFile || options.verifyFile),
    },
    error: null,
  };
}

function verify(input = {}, options = {}) {
  const artifactResult = verifyFromLegacyArtifact({ capabilityId, input, options });
  if (artifactResult.ok) return artifactResult;

  const executionEvents = Array.isArray(input.executionEvents) ? input.executionEvents : [];
  if (!executionEvents.length) return artifactResult;
  const finalCounts = executionEvents.reduce((acc, event) => {
    const status = text(event.finalStatus || event.apiStatus || 'unknown') || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  return {
    ok: true,
    capabilityId,
    mode: 'verify',
    verifyFile: '',
    finalCounts,
    events: executionEvents,
    noteResults: [],
    warning: artifactResult.error,
    error: null,
  };
}

function execute(input = {}, options = {}) {
  const snapshotFile = text(input.snapshotFile || options.snapshotFile);
  if (!snapshotFile && !input.verifyFile && !options.verifyFile && !Array.isArray(input.executionEvents)) {
    return failure(capabilityId, 'execute', 'VERIFY_INPUT_REQUIRED', 'snapshotFile, verifyFile, or executionEvents is required for landing verification');
  }
  return {
    ...verify(input, options),
    mode: 'execute',
  };
}

module.exports = {
  capabilityId,
  dryRun,
  execute,
  verify,
};
