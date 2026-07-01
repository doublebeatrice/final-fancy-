#!/usr/bin/env node
/* Read Codex session thread(s) and emit a handoff brief (read-only).
 *
 * 双轨切换原则：线程只代表 Codex 的"意图、思路、声称动作"，不代表"已落地真相"。
 * 真相走产物链（adjustments / daily_learning / 库存便签 / GBrain），所以本脚本输出
 * 的"已声称动作"一律标注"待核实"，并在末尾给出推荐的核实命令。
 *
 * Usage:
 *   node scripts/diagnostics/read_codex_thread.js                # 当前项目最近一条 session
 *   node scripts/diagnostics/read_codex_thread.js --last 3       # 合并最近 3 条
 *   node scripts/diagnostics/read_codex_thread.js --date 2026-06-18
 *   node scripts/diagnostics/read_codex_thread.js --since 2026-06-15
 *   node scripts/diagnostics/read_codex_thread.js --session <path>
 *   node scripts/diagnostics/read_codex_thread.js --include-archived
 *   node scripts/diagnostics/read_codex_thread.js --json
 *   node scripts/diagnostics/read_codex_thread.js --cwd D:\\other-project
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const SESSIONS_DIR = path.join(CODEX_HOME, 'sessions');
const ARCHIVED_DIR = path.join(CODEX_HOME, 'archived_sessions');
const ROLLOUT_RE = /^rollout-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-([0-9a-f-]+)\.jsonl$/;

// Stop chars include both ASCII and full-width punctuation so matches don't bleed across sentences.
const ZH_STOP = '[^,.!?，。！？\\n]';

const CLAIM_PATTERNS = [
  new RegExp(`我已${ZH_STOP}{0,20}`, 'g'),
  new RegExp(`我刚[才刚]?${ZH_STOP}{0,20}`, 'g'),
  new RegExp(`已经${ZH_STOP}{0,3}(?:修复|完成|提交|写入|落地|执行|应用|改|加|删|更新|创建|替换)${ZH_STOP}{0,20}`, 'g'),
  new RegExp(`已(?:修复|提交|写入|落地|执行|应用|完成|更新|创建|替换)${ZH_STOP}{0,20}`, 'g'),
  new RegExp(`我(?:改|加|写|删|替换|补|修|更新|创建)了${ZH_STOP}{0,20}`, 'g'),
  /\bI(?:'ve| have)?\s+(?:added|changed|fixed|patched|applied|written|created|removed|updated|submitted|wrote|edited)\b[^.\n]{0,80}/gi,
];

const OPEN_LOOP_PATTERNS = [
  new RegExp(`下一步${ZH_STOP}{0,40}`, 'g'),
  new RegExp(`稍后${ZH_STOP}{0,40}`, 'g'),
  new RegExp(`等(?:你|您|用户|确认)${ZH_STOP}{0,40}`, 'g'),
  new RegExp(`等下我${ZH_STOP}{0,40}`, 'g'),
  new RegExp(`待(?:确认|核实|验证|审|你|后续)${ZH_STOP}{0,40}`, 'g'),
  new RegExp(`还(?:没|未)${ZH_STOP}{0,30}`, 'g'),
  /TODO[^.\n]{0,80}/gi,
  /\bnext\s+step[^.\n]{0,80}/gi,
];

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    session: null,
    date: null,
    last: null,
    since: null,
    cwd: PROJECT_ROOT,
    includeArchived: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    if (a === '-h' || a === '--help') out.help = true;
    else if (a === '--session') out.session = next();
    else if (a === '--date') out.date = next();
    else if (a === '--last') out.last = Math.max(1, parseInt(next() || '1', 10));
    else if (a === '--since') out.since = next();
    else if (a === '--cwd') out.cwd = path.resolve(String(next() || PROJECT_ROOT));
    else if (a === '--include-archived') out.includeArchived = true;
    else if (a === '--json') out.json = true;
    else throw new Error(`未知参数: ${a}`);
  }
  return out;
}

function printHelp() {
  console.log(`Read Codex session thread(s) and emit a handoff brief (read-only).

Usage:
  node scripts/diagnostics/read_codex_thread.js [flags]

Flags:
  --session <path>       直接指定一个 .jsonl 文件
  --date YYYY-MM-DD      取该天最新一条 session
  --last N               合并最近 N 条 session
  --since YYYY-MM-DD     合并该日期及之后的所有 session
  --cwd <path>           只筛选 cwd 匹配此路径的 session（默认当前项目）
  --include-archived     同时扫描 ~/.codex/archived_sessions/
  --json                 输出 JSON（默认 markdown）
  -h, --help             帮助
`);
}

function listAllSessionFiles({ includeArchived }) {
  const out = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && ROLLOUT_RE.test(e.name)) out.push(full);
    }
  }
  walk(SESSIONS_DIR);
  if (includeArchived) walk(ARCHIVED_DIR);
  return out;
}

function dateFromRolloutName(file) {
  const m = ROLLOUT_RE.exec(path.basename(file));
  if (!m) return null;
  return { date: m[1], time: `${m[2]}:${m[3]}:${m[4]}`, id: m[5] };
}

function readSessionMeta(file) {
  // session_meta is the first line; read just enough to get cwd without slurping the whole file.
  let buf = '';
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const chunk = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, chunk, 0, chunk.length, 0);
    buf = chunk.slice(0, n).toString('utf8');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  const firstNl = buf.indexOf('\n');
  if (firstNl < 0) return null;
  const firstLine = buf.slice(0, firstNl);
  try {
    const d = JSON.parse(firstLine);
    if (d.type === 'session_meta') return d.payload || null;
  } catch { /* skip */ }
  return null;
}

function cwdMatches(cwd, target) {
  if (!cwd || !target) return false;
  return path.resolve(cwd).toLowerCase() === path.resolve(target).toLowerCase();
}

function selectFiles(args) {
  if (args.session) {
    const p = path.resolve(args.session);
    if (!fs.existsSync(p)) throw new Error(`session 文件不存在: ${p}`);
    return [p];
  }
  let files = listAllSessionFiles({ includeArchived: args.includeArchived });
  files = files
    .map(f => ({ file: f, meta: readSessionMeta(f), nameInfo: dateFromRolloutName(f) }))
    .filter(x => x.nameInfo)
    .filter(x => cwdMatches(x.meta && x.meta.cwd, args.cwd))
    .sort((a, b) => (a.nameInfo.date + a.nameInfo.time).localeCompare(b.nameInfo.date + b.nameInfo.time));

  if (args.date) files = files.filter(x => x.nameInfo.date === args.date);
  if (args.since) files = files.filter(x => x.nameInfo.date >= args.since);

  if (args.last) files = files.slice(-args.last);
  else if (!args.date && !args.since) files = files.slice(-1);

  return files.map(x => x.file);
}

function* iterateLines(file) {
  const raw = fs.readFileSync(file, 'utf8');
  for (const line of raw.split(/\r?\n/)) yield line;
}

function safeJson(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function extractMessageText(payload) {
  if (!payload || !Array.isArray(payload.content)) return '';
  return payload.content
    .map(c => {
      if (!c || typeof c !== 'object') return '';
      if (typeof c.text === 'string') return c.text;
      if (typeof c.input_text === 'string') return c.input_text;
      return '';
    })
    .join('')
    .trim();
}

function isAgentsMdInjection(text) {
  if (!text) return false;
  const head = text.slice(0, 200);
  return /^#\s*AGENTS\.md\s+instructions\b/i.test(head)
    || /<INSTRUCTIONS>\s*\n.*Behavioral guidelines/i.test(head);
}

function isSystemInjection(text) {
  if (!text) return false;
  const head = text.slice(0, 80).trim();
  return head.startsWith('<turn_aborted>')
    || head.startsWith('<environment_context>')
    || head.startsWith('<user_instructions>');
}

function shellCommandSummary(args) {
  if (!args || typeof args !== 'object') return '';
  let cmd = String(args.command || '');
  // Codex prepends `# comment\n` lines before the actual command — strip them so the
  // command head is meaningful (otherwise everything looks like prefix `#`).
  cmd = cmd.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join(' ').replace(/\s+/g, ' ').trim();
  return cmd.length > 120 ? cmd.slice(0, 117) + '...' : cmd;
}

function applyPatchFiles(input) {
  // input is the raw apply_patch payload string; extract file paths.
  if (typeof input !== 'string') return [];
  const files = [];
  const re = /\*\*\* (?:Update|Add|Delete) File: (.+)$/gm;
  let m;
  while ((m = re.exec(input)) !== null) {
    files.push({ op: /Update/.test(m[0]) ? 'update' : /Add/.test(m[0]) ? 'add' : 'delete', file: m[1].trim() });
  }
  return files;
}

function parseSession(file) {
  const result = {
    file,
    meta: null,
    started_at: null,
    ended_at: null,
    aborted: false,
    user_messages: [],          // actual user prompts (no AGENTS.md injection)
    assistant_messages: [],     // text only
    shell_calls: [],            // {command, workdir}
    patches: [],                // {files: [...], status, output_short}
    other_tools: [],            // {name, summary}
    counts: {
      response_items: 0, message: 0, function_call: 0, custom_tool_call: 0,
      function_call_output: 0, reasoning: 0, parse_errors: 0,
    },
  };

  let pendingPatch = null;
  for (const line of iterateLines(file)) {
    if (!line.trim()) continue;
    const d = safeJson(line);
    if (!d) { result.counts.parse_errors++; continue; }

    if (d.type === 'session_meta') {
      result.meta = d.payload || null;
      result.started_at = d.timestamp || (d.payload && d.payload.timestamp) || null;
      continue;
    }

    if (d.type === 'event_msg') {
      const p = d.payload || {};
      if (p.type === 'task_complete') result.ended_at = d.timestamp || result.ended_at;
      if (p.type === 'turn_aborted') result.aborted = true;
      continue;
    }

    if (d.type !== 'response_item') continue;
    const p = d.payload || {};
    result.counts.response_items++;
    if (p.type === 'message') result.counts.message++;
    if (p.type === 'function_call') result.counts.function_call++;
    if (p.type === 'custom_tool_call') result.counts.custom_tool_call++;
    if (p.type === 'function_call_output') result.counts.function_call_output++;
    if (p.type === 'reasoning') result.counts.reasoning++;

    if (p.type === 'message') {
      const text = extractMessageText(p);
      if (!text) continue;
      if (p.role === 'user') {
        if (isAgentsMdInjection(text)) continue; // skip wholesale AGENTS.md prefix injection
        if (isSystemInjection(text)) continue;   // skip <turn_aborted>, <environment_context>, etc
        result.user_messages.push(text);
      } else if (p.role === 'assistant') {
        result.assistant_messages.push(text);
      }
      continue;
    }

    if (p.type === 'function_call' && p.name === 'shell_command') {
      let argObj = null;
      try { argObj = JSON.parse(p.arguments || '{}'); } catch { /* skip */ }
      result.shell_calls.push({
        command: shellCommandSummary(argObj),
        workdir: argObj && argObj.workdir ? argObj.workdir : null,
        call_id: p.call_id,
      });
      continue;
    }

    if (p.type === 'custom_tool_call' && p.name === 'apply_patch') {
      pendingPatch = {
        call_id: p.call_id,
        files: applyPatchFiles(p.input),
        status: p.status || 'unknown',
        output_short: '',
      };
      result.patches.push(pendingPatch);
      continue;
    }

    if (p.type === 'custom_tool_call_output' && pendingPatch && pendingPatch.call_id === p.call_id) {
      const out = String(p.output || '').trim();
      pendingPatch.output_short = out.length > 200 ? out.slice(0, 197) + '...' : out;
      pendingPatch = null;
      continue;
    }

    if (p.type === 'function_call' && p.name && p.name !== 'shell_command') {
      result.other_tools.push({ name: p.name, args_short: String(p.arguments || '').slice(0, 120) });
    }
  }

  if (!result.ended_at) result.ended_at = result.started_at;
  return result;
}

function uniq(arr) { return [...new Set(arr)]; }

function findClaims(text) {
  const hits = [];
  for (const re of CLAIM_PATTERNS) {
    re.lastIndex = 0;
    let m; while ((m = re.exec(text)) !== null) hits.push(m[0].trim());
  }
  return uniq(hits);
}

function findOpenLoops(text) {
  const hits = [];
  for (const re of OPEN_LOOP_PATTERNS) {
    re.lastIndex = 0;
    let m; while ((m = re.exec(text)) !== null) hits.push(m[0].trim());
  }
  return uniq(hits);
}

function summarizeUserIntent(sessions) {
  // First non-AGENTS user message of the EARLIEST session is the original goal.
  // Subsequent user messages across all sessions are clarifications/redirections.
  const all = [];
  for (const s of sessions) {
    for (const m of s.user_messages) all.push(m);
  }
  if (!all.length) return { goal: '', clarifications: [] };
  return { goal: all[0].slice(0, 500), clarifications: all.slice(1).map(m => m.slice(0, 300)) };
}

function summarizeClaims(sessions) {
  const out = [];
  for (const s of sessions) {
    for (const p of s.patches) {
      out.push({
        type: 'apply_patch',
        files: p.files,
        landed: /Success/i.test(p.output_short) ? '声称成功（待 git 验证）' : (p.output_short || '状态未知'),
        source: path.basename(s.file),
      });
    }
    for (const m of s.assistant_messages) {
      const claims = findClaims(m);
      for (const c of claims) out.push({ type: 'verbal_claim', text: c, source: path.basename(s.file) });
    }
  }
  return out;
}

function summarizeOpenLoops(sessions) {
  const out = [];
  for (const s of sessions) {
    if (s.aborted) {
      out.push({ kind: 'turn_aborted', detail: '回合被中断（turn_aborted），可能未走完', source: path.basename(s.file) });
    }
    // last assistant message is the strongest signal of "where it stopped"
    if (s.assistant_messages.length) {
      const last = s.assistant_messages[s.assistant_messages.length - 1];
      out.push({ kind: 'last_assistant_message', detail: last.slice(0, 400), source: path.basename(s.file) });
    }
    // Pattern-matched
    for (const m of s.assistant_messages) {
      const loops = findOpenLoops(m);
      for (const l of loops) out.push({ kind: 'pattern', detail: l, source: path.basename(s.file) });
    }
  }
  return out;
}

function summarizeShellActivity(sessions) {
  const counts = {};
  const recent = [];
  for (const s of sessions) {
    for (const c of s.shell_calls) {
      const head = (c.command || '').split(' ')[0] || '?';
      counts[head] = (counts[head] || 0) + 1;
      recent.push(c.command);
    }
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return { top, sample: recent.slice(-12) };
}

function ymdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildVerificationCommands(sessions) {
  const today = ymdLocal(new Date());
  const dates = uniq(sessions.map(s => {
    const info = dateFromRolloutName(s.file);
    return info ? info.date : null;
  }).filter(Boolean));
  const earliest = dates.sort()[0] || today;
  const days = Math.max(1, Math.ceil((Date.parse(today + 'T00:00:00') - Date.parse(earliest + 'T00:00:00')) / 86400000) + 1);

  const lines = [
    `# 落地真相在产物里，不在线程里。下面这些命令把"声称"对账成"实有"。`,
    ``,
    `# 1) 看 Codex 最近的署名动作（adjustments + daily_learning 聚合）`,
    `node scripts/diagnostics/review_recent_decisions.js --by codex --days ${days}`,
    ``,
    `# 2) 看工作树是否有未提交改动（apply_patch 是否真留在仓库里）`,
    `git status -sb`,
    `git diff --stat`,
    ``,
    `# 3) 当天的 daily_learning 与 adjustments`,
    `for d in ${dates.join(' ')}; do`,
    `  ls -la "data/learning/daily_learning_$d."* 2>/dev/null`,
    `  ls -la "data/adjustments/adjustments_$d.json" 2>/dev/null`,
    `done`,
    ``,
    `# 4) 如果 Codex 声称的是后台落地（bid/budget/listing/价格），用对应业务脚本现场回读，不要只看本地文件`,
  ];
  return lines.join('\n');
}

function renderMarkdown(sessions) {
  const intent = summarizeUserIntent(sessions);
  const claims = summarizeClaims(sessions);
  const loops = summarizeOpenLoops(sessions);
  const shell = summarizeShellActivity(sessions);

  const lines = [];
  lines.push(`# Codex 线程接手简报`);
  lines.push(``);
  lines.push(`> 来源：${sessions.length} 个 session（仅意图层；落地真相走产物链）`);
  lines.push(``);

  lines.push(`## 元信息`);
  for (const s of sessions) {
    const info = dateFromRolloutName(s.file);
    const meta = s.meta || {};
    lines.push(`- \`${path.basename(s.file)}\``);
    lines.push(`  - 起：${s.started_at || '?'}  止：${s.ended_at || '?'}${s.aborted ? '  ⚠ 中断' : ''}`);
    lines.push(`  - cwd：${meta.cwd || '?'}  originator：${meta.originator || '?'}  cli：${meta.cli_version || '?'}`);
    lines.push(`  - response_items：${s.counts.response_items}（消息 ${s.counts.message} / shell ${s.counts.function_call} / patch ${s.counts.custom_tool_call} / 解析失败 ${s.counts.parse_errors}）`);
    if (info) lines.push(`  - 日期：${info.date} ${info.time}`);
  }
  lines.push(``);

  lines.push(`## 用户意图`);
  if (intent.goal) {
    lines.push(`**初始目标：** ${intent.goal}`);
    lines.push(``);
    if (intent.clarifications.length) {
      lines.push(`**后续澄清/纠正：**`);
      for (const c of intent.clarifications) lines.push(`- ${c}`);
      lines.push(``);
    }
  } else {
    lines.push(`*（未检测到用户消息——可能是纯自动 session）*`);
    lines.push(``);
  }

  lines.push(`## 已声称动作 ⚠ 待核实`);
  lines.push(``);
  if (!claims.length) {
    lines.push(`*（线程中未识别到声称完成的动作）*`);
  } else {
    const patches = claims.filter(c => c.type === 'apply_patch');
    const verbal = claims.filter(c => c.type === 'verbal_claim');
    if (patches.length) {
      lines.push(`### apply_patch（最强信号——直接动了文件）`);
      for (const p of patches) {
        lines.push(`- 文件：`);
        for (const f of p.files) lines.push(`  - \`${f.op}\` ${f.file}`);
        lines.push(`  - 工具状态：${p.landed}`);
        lines.push(`  - 出处：${p.source}`);
      }
      lines.push(``);
      lines.push(`> 注：apply_patch "Success" 只代表补丁应用到了工作树，**不代表已 commit、已 review、已落地后端**。下面"建议核实命令"里的 \`git status\`/\`git diff\` 才是真相。`);
      lines.push(``);
    }
    if (verbal.length) {
      lines.push(`### 文字声称（意图陈述，更弱信号）`);
      for (const v of verbal.slice(0, 30)) lines.push(`- "${v.text}" — ${v.source}`);
      lines.push(``);
    }
  }

  lines.push(`## 工具动作概览`);
  if (!shell.top.length) lines.push(`*（无 shell_command 调用）*`);
  else {
    lines.push(`Top 命令前缀：`);
    for (const [cmd, n] of shell.top) lines.push(`- \`${cmd}\` × ${n}`);
    lines.push(``);
    lines.push(`最近若干 shell：`);
    for (const c of shell.sample) lines.push(`- \`${c}\``);
  }
  lines.push(``);

  lines.push(`## 未收尾的开口子`);
  const lastAssistantBlocks = loops.filter(l => l.kind === 'last_assistant_message');
  const otherLoops = loops.filter(l => l.kind !== 'last_assistant_message');
  if (lastAssistantBlocks.length) {
    lines.push(`### Codex 最后一句（最可能就是"停在这里"的位置）`);
    for (const l of lastAssistantBlocks) {
      lines.push(`> ${l.detail.replace(/\n+/g, ' ⏎ ')}`);
      lines.push(`> — ${l.source}`);
      lines.push(``);
    }
  }
  if (otherLoops.length) {
    lines.push(`### 启发式抓到的悬挂点`);
    for (const l of otherLoops.slice(0, 30)) lines.push(`- [${l.kind}] ${l.detail} — ${l.source}`);
    lines.push(``);
  }
  if (!loops.length) {
    lines.push(`*（未抓到悬挂点——但不代表一定收尾了；以产物链为准）*`);
    lines.push(``);
  }

  lines.push(`## 建议核实命令`);
  lines.push(``);
  lines.push('```bash');
  lines.push(buildVerificationCommands(sessions));
  lines.push('```');
  lines.push(``);

  return lines.join('\n');
}

function main() {
  let args;
  try { args = parseArgs(process.argv); }
  catch (e) { console.error(String(e.message || e)); process.exit(2); }

  if (args.help) { printHelp(); return; }

  let files;
  try { files = selectFiles(args); }
  catch (e) { console.error(String(e.message || e)); process.exit(2); }

  if (!files.length) {
    const hint = `cwd=${args.cwd}  date=${args.date || '*'}  since=${args.since || '*'}  archived=${args.includeArchived}`;
    console.error(`未找到匹配的 Codex session（${hint}）`);
    console.error(`提示：用 --include-archived 扫描归档；或 --cwd 指定其它项目；或确认 ${SESSIONS_DIR} 存在。`);
    process.exit(1);
  }

  const sessions = files.map(parseSession);

  if (args.json) {
    process.stdout.write(JSON.stringify({
      sessions: sessions.map(s => ({
        file: s.file,
        meta: s.meta ? { cwd: s.meta.cwd, originator: s.meta.originator, cli_version: s.meta.cli_version, id: s.meta.id, started_at: s.meta.timestamp } : null,
        started_at: s.started_at,
        ended_at: s.ended_at,
        aborted: s.aborted,
        counts: s.counts,
        user_messages: s.user_messages,
        assistant_messages_count: s.assistant_messages.length,
        last_assistant_message: s.assistant_messages[s.assistant_messages.length - 1] || null,
        shell_calls: s.shell_calls,
        patches: s.patches,
        other_tools: s.other_tools,
      })),
      intent: summarizeUserIntent(sessions),
      claims: summarizeClaims(sessions),
      open_loops: summarizeOpenLoops(sessions),
      shell_activity: summarizeShellActivity(sessions),
      verification_commands: buildVerificationCommands(sessions),
    }, null, 2));
    process.stdout.write('\n');
    return;
  }

  process.stdout.write(renderMarkdown(sessions));
}

main();
