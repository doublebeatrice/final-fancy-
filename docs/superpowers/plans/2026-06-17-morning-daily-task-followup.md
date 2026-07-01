# Morning Daily Task Followup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the morning unattended run into the existing daily automation path and add a task-followup section to the daily result paper.

**Architecture:** Keep `ops:today` as the daily business engine and `ops:agent:unattended-supervisor` as the scheduled production wrapper. Add one small task-followup summary module consumed by `run_agent_boss_daily_paper.js`, then have the supervisor optionally generate the boss daily paper after closed-loop completion.

**Tech Stack:** Node.js CommonJS, existing `scripts/run_agent_boss_daily_paper.js`, existing `scripts/run_agent_unattended_supervisor.js`, Node assertion tests.

---

### Task 1: Task Followup Summary

**Files:**
- Create: `src/task_followup_dashboard.js`
- Test: `tests/task_followup_dashboard.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
const dashboard = buildTaskFollowupDashboard({ today, report, weeklyTaskFile });
assert.ok(dashboard.sections.some(item => item.id === 'sql_recovery'));
assert.ok(dashboard.sections.some(item => item.id === 'goal_progress'));
assert.ok(dashboard.sections.some(item => item.id === 'weekly_team_tasks'));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests\task_followup_dashboard.test.js`
Expected: FAIL with missing module or missing exported function.

- [ ] **Step 3: Write minimal implementation**

Create `buildTaskFollowupDashboard` to normalize progress from report fields and optional weekly task files. Create `renderTaskFollowupMarkdown` to output a short Chinese section for the result paper.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests\task_followup_dashboard.test.js`
Expected: PASS.

### Task 2: Boss Daily Paper Integration

**Files:**
- Modify: `scripts/run_agent_boss_daily_paper.js`
- Test: `tests/agent_boss_daily_paper.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
assert.ok(markdown.includes('## 5. 任务跟进装置'));
assert.ok(markdown.includes('SQL/数据恢复'));
assert.ok(markdown.includes('目标完成度'));
assert.ok(markdown.includes('小组本周任务'));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests\agent_boss_daily_paper.test.js`
Expected: FAIL because the new section is absent.

- [ ] **Step 3: Write minimal integration**

Import the task-followup module, build `report.taskFollowup`, and render it after GOAL-FINAL evidence.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests\agent_boss_daily_paper.test.js`
Expected: PASS.

### Task 3: Unattended Supervisor Integration

**Files:**
- Modify: `scripts/run_agent_unattended_supervisor.js`
- Test: `tests/agent_unattended_supervisor.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
const report = runAgentUnattendedSupervisor({ generateBossDailyPaper: true, runBossDailyPaper });
assert.ok(report.files.bossDailyPaperFile);
assert.strictEqual(report.bossDailyPaper.generated, true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests\agent_unattended_supervisor.test.js`
Expected: FAIL because supervisor does not generate boss paper.

- [ ] **Step 3: Write minimal integration**

Add `--skip-boss-paper` parsing and run the boss paper generator only when `generateBossDailyPaper === true`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests\agent_unattended_supervisor.test.js`
Expected: PASS.

### Task 4: Verification

**Files:**
- Test only.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
node tests\task_followup_dashboard.test.js
node tests\agent_boss_daily_paper.test.js
node tests\agent_unattended_supervisor.test.js
```

Expected: all PASS.

- [ ] **Step 2: Update durable business memory**

Update GBrain with the final routing: morning automation is the scheduled mode of existing daily automation, not a parallel chain; daily paper must include task followup.
