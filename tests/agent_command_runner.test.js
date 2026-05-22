const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  collectRunnableCommands,
  parseNpmRunCommand,
  runAgentCommandRunner,
} = require('../scripts/run_agent_command_runner');

const timeContext = {
  runAt: '2026-05-19T11:30:00.000Z',
  businessDate: '2026-05-19',
  sourceRunId: 'command-runner-test',
};

{
  const parsed = parseNpmRunCommand('npm run ops:selection:keyword-conversion -- --keywords "nurse gifts"');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.script, 'ops:selection:keyword-conversion');
  assert.strictEqual(parsed.bin, process.execPath);
  assert.ok(parsed.args[0].endsWith(path.join('scripts', 'execute', 'fetch_selection_keyword_conversion_rate.js')));
  assert.deepStrictEqual(parsed.args.slice(1, 3), ['--keywords', 'nurse gifts']);
  assert.deepStrictEqual(parsed.originalArgs.slice(0, 5), ['run', 'ops:selection:keyword-conversion', '--', '--keywords', 'nurse gifts']);

  const keywordResearch = parseNpmRunCommand('npm run ops:selection:keyword-research -- --sku DEC1234 --terms "patriotic table decorations"');
  assert.strictEqual(keywordResearch.ok, true);
  assert.strictEqual(keywordResearch.script, 'ops:selection:keyword-research');
  assert.ok(keywordResearch.args[0].endsWith(path.join('scripts', 'execute', 'fetch_selection_keyword_research.js')));
  assert.deepStrictEqual(keywordResearch.args.slice(1, 5), ['--sku', 'DEC1234', '--terms', 'patriotic table decorations']);

  const seasonality = parseNpmRunCommand('npm run ops:selection:keyword-seasonality -- --search-terms "cowboy hat" --u-time 2026-04-30');
  assert.strictEqual(seasonality.ok, true);
  assert.strictEqual(seasonality.script, 'ops:selection:keyword-seasonality');
  assert.ok(seasonality.args[0].endsWith(path.join('scripts', 'execute', 'fetch_selection_keyword_seasonality.js')));
  assert.deepStrictEqual(seasonality.args.slice(1, 5), ['--search-terms', 'cowboy hat', '--u-time', '2026-04-30']);

  const productTimeMachine = parseNpmRunCommand('npm run ops:selection:product-time-machine -- --search-keywords "cowboy hat"');
  assert.strictEqual(productTimeMachine.ok, true);
  assert.strictEqual(productTimeMachine.script, 'ops:selection:product-time-machine');
  assert.ok(productTimeMachine.args[0].endsWith(path.join('scripts', 'execute', 'fetch_selection_product_time_machine.js')));
  assert.deepStrictEqual(productTimeMachine.args.slice(1, 3), ['--search-keywords', 'cowboy hat']);

  const denied = parseNpmRunCommand('npm run ops:today -- --execute');
  assert.strictEqual(denied.ok, false);
  assert.ok(denied.reason.includes('not_allowlisted'));
}

{
  const hub = {
    todayQueue: [{
      taskId: 'ext-1',
      executionPlan: {
        safeToAutoRun: true,
        commands: [{
          label: '拉选品关键词转化证据',
          command: 'npm run ops:selection:keyword-conversion -- --keywords "nurse gifts"',
          output: 'data\\snapshots\\selection_keyword_conversion_rate_2026-05-19.json',
          riskLevel: 'read_only',
        }],
      },
    }, {
      taskId: 'daily-1',
      executionPlan: {
        safeToAutoRun: false,
        commands: [{
          label: '运行每日运营闭环',
          command: 'npm run ops:today -- --mode full-snapshot --actor codex',
          riskLevel: 'read_then_schema_gated',
        }],
      },
    }, {
      taskId: 'ext-2',
      executionPlan: {
        safeToAutoRun: true,
        commands: [{
          label: '缺关键词',
          command: 'npm run ops:selection:aba-search-terms -- --search-terms <关键词或搜索词>',
          riskLevel: 'read_only',
        }],
      },
    }],
  };

  const collected = collectRunnableCommands(hub);
  assert.strictEqual(collected.runnable.length, 1);
  assert.strictEqual(collected.skipped.length, 2);
  assert.strictEqual(collected.runnable[0].taskId, 'ext-1');
  assert.ok(collected.skipped.some(item => item.reason === 'unsafe_execution_plan'));
  assert.ok(collected.skipped.some(item => item.reason === 'placeholder_argument'));
}

{
  const hub = {
    todayQueue: [{
      taskId: 'review-1',
      executionPlan: {
        safeToAutoRun: true,
        commands: [{
          label: 'review',
          command: 'npm run ops:agent:review-effect -- --queue data\\agent\\review_queue_2026-05-20.json --today 2026-05-20 --out data\\agent\\effect_review_2026-05-20.json',
          output: 'data\\agent\\effect_review_2026-05-20.json',
          riskLevel: 'read_only',
        }],
      },
    }, {
      taskId: 'review-2',
      executionPlan: {
        safeToAutoRun: true,
        commands: [{
          label: 'review',
          command: 'npm run ops:agent:review-effect -- --queue data\\agent\\review_queue_2026-05-20.json --today 2026-05-20 --out data\\agent\\effect_review_2026-05-20.json',
          output: 'data\\agent\\effect_review_2026-05-20.json',
          riskLevel: 'read_only',
        }],
      },
    }],
  };
  const collected = collectRunnableCommands(hub);
  assert.strictEqual(collected.runnable.length, 1);
  assert.strictEqual(collected.skipped.length, 1);
  assert.strictEqual(collected.skipped[0].reason, 'duplicate_command');
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-command-runner-'));
  const outFile = path.join(tmpDir, 'command_results.json');
  const hub = {
    businessDate: '2026-05-19',
    todayQueue: [{
      taskId: 'ext-1',
      title: '开发问 SE5608',
      executionPlan: {
        safeToAutoRun: true,
        commands: [{
          label: '拉选品关键词转化证据',
          command: 'npm run ops:selection:keyword-conversion -- --keywords "nurse gifts"',
          output: path.join(tmpDir, 'selection_keyword_conversion_rate_2026-05-19.json'),
          riskLevel: 'read_only',
        }],
      },
    }],
  };
  const calls = [];
  const result = runAgentCommandRunner({
    hub,
    outFile,
    timeContext,
    execFileSync: (bin, args) => {
      calls.push({ bin, args });
      const outputFile = path.join(tmpDir, 'selection_keyword_conversion_rate_2026-05-19.json');
      fs.writeFileSync(outputFile, JSON.stringify({ ok: true, rows: [] }), 'utf8');
      return JSON.stringify({ ok: true, outputFile });
    },
  });

  assert.strictEqual(result.summary.planned, 1);
  assert.strictEqual(result.summary.executed, 1);
  assert.strictEqual(result.summary.failed, 0);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].bin, process.execPath);
  assert.ok(calls[0].args[0].endsWith(path.join('scripts', 'execute', 'fetch_selection_keyword_conversion_rate.js')));
  assert.strictEqual(result.results[0].taskId, 'ext-1');
  assert.strictEqual(result.results[0].ok, true);
  assert.ok(result.results[0].outputFiles.some(file => file.includes('selection_keyword_conversion_rate_2026-05-19.json')));
  assert.ok(fs.existsSync(outFile));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-command-runner-missing-output-'));
  const missingFile = path.join(tmpDir, 'missing_selection_keyword_conversion_rate_2026-05-19.json');
  const hub = {
    businessDate: '2026-05-19',
    todayQueue: [{
      taskId: 'ext-missing-output',
      title: '开发问 SE5608',
      executionPlan: {
        safeToAutoRun: true,
        commands: [{
          label: '拉选品关键词转化证据',
          command: 'npm run ops:selection:keyword-conversion -- --keywords "nurse gifts"',
          output: missingFile,
          riskLevel: 'read_only',
        }],
      },
    }],
  };
  const result = runAgentCommandRunner({
    hub,
    timeContext,
    execFileSync: () => JSON.stringify({ ok: true, outputFile: missingFile }),
  });

  assert.strictEqual(result.summary.executed, 0);
  assert.strictEqual(result.summary.failed, 1);
  assert.strictEqual(result.results[0].ok, false);
  assert.ok(result.results[0].summary.includes('没有生成预期输出'));
}

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-command-runner-review-'));
  const reportFile = path.join(tmpDir, 'effect_review_2026-05-19.json');
  const hub = {
    businessDate: '2026-05-19',
    todayQueue: [{
      taskId: 'review-1',
      title: 'SE5608 复查',
      executionPlan: {
        safeToAutoRun: true,
        commands: [{
          label: '采集证据并执行效果复查',
          command: `npm run ops:agent:review-effect -- --queue ${path.join(tmpDir, 'review_queue.json')} --collect-evidence --today 2026-05-19 --out ${reportFile}`,
          output: reportFile,
          riskLevel: 'read_only',
        }],
      },
    }],
  };

  const result = runAgentCommandRunner({
    hub,
    timeContext,
    execFileSync: () => {
      fs.writeFileSync(reportFile, JSON.stringify({
        results: [{
          taskId: 'review-1',
          verdict: 'close_success',
          nextStep: '记录为有效动作，关闭本次复查。',
        }],
      }), 'utf8');
      return JSON.stringify({ ok: true, outFile: reportFile });
    },
  });

  assert.strictEqual(result.summary.executed, 1);
  assert.strictEqual(result.results[0].report.verdict, 'close_success');
  assert.strictEqual(result.results[0].summary, '记录为有效动作，关闭本次复查。');
}

console.log('agent_command_runner tests passed');
