const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runAgentClosedLoop } = require('../scripts/run_agent_closed_loop');

const timeContext = {
  runAt: '2026-05-19T13:20:00.000Z',
  businessDate: '2026-05-19',
  dataDate: '2026-05-18',
  sourceRunId: 'agent-closed-loop-light-test',
};

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-closed-loop-light-closure-'));
  const result = runAgentClosedLoop({
    disableTrendAnomalyCheck: true,
    timeContext,
    outDir: tmpDir,
    generateDashboard: false,
    generateAutonomyAudit: false,
    closureVerification: { ok: true, errors: [] },
    snapshot: {
      businessDate: '2026-05-19',
      dataDate: '2026-05-18',
      productCards: [{ sku: 'SKU1' }],
      sellerSalesRows: [{ seller_title: 'total', order_sales: '10', sale_num: '1' }],
    },
    execFileSync: () => '',
  });

  assert.strictEqual(result.summary.artifactVerificationOk, true);
  assert.deepStrictEqual(result.summary.artifactVerificationErrors, []);
  assert.ok(fs.existsSync(result.files.closureVerificationFile));
}

console.log('run_agent_closed_loop tests passed');
