const assert = require('assert');
const { parseCliArgs } = require('../scripts/execute/run_actions');

{
  const parsed = parseCliArgs(['data/snapshots/action_schema.json'], {});
  assert.strictEqual(parsed.actionSchemaFile, 'data/snapshots/action_schema.json');
  assert.strictEqual(parsed.dryRun, true, 'default CLI mode must be dry-run');
}

{
  const parsed = parseCliArgs(['data/snapshots/action_schema.json', '--execute'], {});
  assert.strictEqual(parsed.dryRun, false, '--execute is the only live-write CLI mode');
}

{
  const parsed = parseCliArgs(['data/snapshots/action_schema.json', '--dry-run'], {});
  assert.strictEqual(parsed.dryRun, true);
}

{
  assert.throws(
    () => parseCliArgs(['data/snapshots/action_schema.json', '--dry-run', '--execute'], {}),
    /choose either --dry-run or --execute/
  );
}

{
  const parsed = parseCliArgs(['--snapshot=latest.json'], {
    ACTION_SCHEMA_FILE: 'schema-from-env.json',
  });
  assert.strictEqual(parsed.actionSchemaFile, 'schema-from-env.json');
  assert.strictEqual(parsed.snapshotFile, 'latest.json');
  assert.strictEqual(parsed.dryRun, true);
}

console.log('run_actions_cli tests passed');
