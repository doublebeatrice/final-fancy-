# Weixin ClawBot Reminder + Codex Gateway

This flow sends SKU review reminders to Weixin through the Tencent ClawBot/iLink HTTP protocol without OpenClaw. The bot display name in copy is `小哆`, and it addresses the operator as `哆布`. Weixin replies can also be handed to local Codex through a guarded remote-operation gateway.

## Scope

- Allowed: send a daily reminder built from `data/tasks/sku_watchlist.json` and `data/agent/review_queue_<date>.json`.
- Allowed: capture Weixin replies into a local inbox and send a short acknowledgement.
- Allowed: hand read-only Weixin requests to `codex exec` and send the final Codex reply back to Weixin.
- Allowed: treat clear low-risk Weixin business-operation requests as remote authorization for Codex to execute and verify them.
- Allowed: require Weixin-side second confirmation for high-risk business operations before Codex submits or writes them.
- Allowed: use the probe script once to get login/send identifiers.
- Not allowed: let Weixin trigger shell, secret, arbitrary filesystem deletion, git commits, or unrelated system writes.
- Not stored: token, cookies, raw API responses, or command logs in GBrain.

## Setup

Create the local config and keep it untracked:

```powershell
npm run ops:weixin:setup -- --action init
```

Start login. The command prints `qrcodeUrl`, waits for scanning, and writes `token/baseUrl/accountId` when connected:

```powershell
npm run ops:weixin:setup -- --action login --max-polls 24 --poll-interval-ms 5000
```

Send any short Weixin message to the bot account, then capture the recipient fields:

```powershell
npm run ops:weixin:setup -- --action capture-recipient --max-polls 12 --poll-interval-ms 5000
```

Check readiness:

```powershell
npm run ops:weixin:setup -- --action status
```

Run the doctor before the first live send. It does not send Weixin messages; it checks config readiness, reminder dry-run, Node path, and schedule preview:

```powershell
npm run ops:weixin:doctor -- --config config\weixin_clawbot.local.json
```

`doctor`, `setup status`, and scheduled-task install all treat `"dryRun": true` as not ready for live send.

### Manual Fallback

If the auto setup flow is awkward, use the lower-level probe commands and import their JSON output:

```powershell
npm --silent run ops:weixin:probe -- --action login-start > data\tmp_tests\weixin_login_start.json
npm --silent run ops:weixin:probe -- --action login-poll --qrcode "<qrcode>" > data\tmp_tests\weixin_login_poll.json
npm run ops:weixin:setup -- --action apply-login --from-json data\tmp_tests\weixin_login_poll.json
npm --silent run ops:weixin:probe -- --action get-updates --config config\weixin_clawbot.local.json > data\tmp_tests\weixin_updates.json
npm run ops:weixin:setup -- --action apply-recipient --from-json data\tmp_tests\weixin_updates.json
```

## Dry Run

Dry-run writes the reminder JSON and text, but does not send and does not mark state:

```powershell
npm run ops:weixin:reminders -- --config config\weixin_clawbot.local.json --today 2026-06-08 --dry-run
```

## Send

Set `"dryRun": false` in local config, then run:

```powershell
npm run ops:weixin:reminders -- --config config\weixin_clawbot.local.json
```

The runner writes a stable reminder key to `data/agent/weixin_clawbot_reminders_state.json` after a successful send. Re-running the same reminder skips with `skipReason=already_sent`. Use `--force` only for a manual resend.

## Replies

Capture replies from 哆布 into a local inbox:

```powershell
npm run ops:weixin:replies -- --config config\weixin_clawbot.local.json --ack
```

Replies are saved to:

```text
data/agent/weixin_clawbot_replies_inbox.json
```

The acknowledgement says 小哆 received the reply and stored it for handling. It does not execute ad, listing, price, or inventory changes.

The reply runner stores a cursor in `data/agent/weixin_clawbot_replies_cursor.txt`, so regular polling only reads newer Weixin messages.

## Codex Gateway

Run the gateway manually after replies are captured:

```powershell
npm run ops:weixin:codex -- --config config\weixin_clawbot.local.json --send-result
```

The gateway reads unhandled messages from:

```text
data/agent/weixin_clawbot_replies_inbox.json
```

Safe examples that are handed to Codex in read-only mode:

```text
先看 QQ1764
总结今天 SKU 复查
查一下 CAS4030 为什么到期了
```

Business-operation examples that are handed to Codex as direct remote authorization:

```text
把 QQ1764 广告预算调到 30
把 CAS4030 调价
暂停 QQ1764 某个无效广告词
```

High-risk examples that first return a full proposal and a confirmation code in Weixin:

```text
提交 CAS4030 listing 修改
批量修改 20 个 SKU 的进价
给 QQ1764 创建广告
```

For those, 小哆 asks Codex to draft the complete proposed version without submitting backend changes. To execute, reply in Weixin with the exact confirmation code:

```text
确认执行 XD-ABC123
取消 XD-ABC123
```

Examples that 小哆 still blocks:

```text
cmd /c del ...
把 token 发我
```

Read-only requests are invoked with `--sandbox read-only`. Direct business-operation requests are invoked with `--sandbox workspace-write`; the prompt treats the Weixin message as 哆布's remote authorization, requires the action to stay within the requested SKU/action, and requires landed readback verification. Listing submissions, batch purchase-cost/cost changes, and ad creation requests are also handed to Codex with `--sandbox workspace-write`, but only to prepare a complete proposal; the gateway stores the pending confirmation and only executes after a Weixin reply like `确认执行 XD-ABC123`. On Windows scheduled tasks the gateway starts Codex through the installed `@openai/codex/bin/codex.js` file with Node, because direct `codex.cmd` spawning is unreliable from Node. The gateway writes audit files to:

```text
data/agent/weixin_codex_requests.json
data/agent/weixin_codex_results.json
data/agent/weixin_codex_last_messages/
data/agent/weixin_codex_pending_confirmations.json
```

The gateway intentionally does not set a separate `CODEX_HOME`. 小哆 follows the current default Codex login/config for the Windows user. If you switch the local Codex account or API key, 小哆 follows that switch.

### Codex Account/API Switch Check

To pin the model used by Weixin-triggered Codex runs, set `codexModel` in `config\weixin_clawbot.local.json`, pass `--model <model>`, or set `WEIXIN_CODEX_MODEL`. Keep it aligned with the active Codex automation model after changing account, API key, provider, or model.

After changing the Codex account, API key, provider, or model, run:

```powershell
codex doctor
npm run ops:codex:health -- --probe --probe-model gpt-5.5
```

The health gate checks the default Codex model/provider, requires custom providers to use the Responses wire API, rejects active automations still pinned to deprecated Codex models such as `gpt-5.3-codex`, and can run a minimal `codex exec` probe. If it reports `blocked`, fix the reported model/provider/automation before waiting for the next scheduled run.

## Schedule

Preview the Windows Task Scheduler plan:

```powershell
npm run ops:weixin:schedule -- --config config\weixin_clawbot.local.json --time 09:30
```

Install the daily task only after one real reminder send succeeds:

```powershell
npm run ops:weixin:schedule -- --config config\weixin_clawbot.local.json --time 09:30 --install
```

Install creates two Windows tasks:

- `AdOpsWeixinClawbotReminders`: runs `ops:weixin:reminders` daily at the configured time.
- `AdOpsWeixinClawbotReplies`: runs `ops:weixin:replies -- --ack`, then `ops:weixin:codex -- --send-result` every 1 minute.

The Codex gateway keeps a local lock at `data/agent/weixin_codex_gateway.lock.json` while one run is active. This keeps the 1-minute schedule responsive without letting overlapping Codex runs process the same Weixin message twice.

Both append output to:

```text
data/logs/weixin_clawbot_reminders_task.log
```

The installed tasks call short PowerShell wrappers at:

```text
data/agent/weixin_clawbot_reminders_task.ps1
data/agent/weixin_clawbot_replies_task.ps1
```

Task Scheduler calls hidden VBS launchers, which then run the PowerShell wrappers with `-WindowStyle Hidden`:

```text
data/agent/weixin_clawbot_reminders_task.vbs
data/agent/weixin_clawbot_replies_task.vbs
```

This avoids both the Windows `schtasks /TR` 261-character limit and visible PowerShell windows every minute. Manual task verification:

```powershell
schtasks /Run /TN AdOpsWeixinClawbotReminders
schtasks /Query /TN AdOpsWeixinClawbotReminders /V /FO LIST
schtasks /Query /TN AdOpsWeixinClawbotReplies /V /FO LIST
Get-Content data\logs\weixin_clawbot_reminders_task.log -Tail 40
```

## Outputs

- `data/agent/weixin_clawbot_sku_review_<date>.json`
- `data/agent/weixin_clawbot_sku_review_<date>.md`
- `data/agent/weixin_clawbot_reminders_state.json`
- `data/agent/weixin_clawbot_replies_inbox.json`
- `data/agent/weixin_clawbot_replies_cursor.txt`
- `data/agent/weixin_codex_requests.json`
- `data/agent/weixin_codex_results.json`
- `data/agent/weixin_codex_last_messages/`
- `data/agent/weixin_codex_pending_confirmations.json`
- `data/agent/weixin_codex_gateway.lock.json`

All generated files are ignored by git.
