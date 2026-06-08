# WeCom Codex Review Flow

This v1 flow receives WeCom messages through an isolated Hook Bridge, stores only redacted review events, and generates Codex review prompts. It does not auto-send WeCom replies and does not execute ad, listing, price, or inventory actions.

OCR/window capture is not the main message-ingestion path. It is kept only as a temporary fallback for manual inspection because it cannot reliably distinguish sender, quoted text, scroll state, or hidden messages.

## Main Architecture

Use a separate WeCom Bridge environment for the personal-account Hook provider:

```text
WeCom personal account
  -> isolated Hook Bridge
     - pinned WeCom version
     - provider API on 127.0.0.1:<apiPort>/api
     - provider callback to 127.0.0.1:<callbackPort>/msg
  -> local gateway
  -> redacted message store
  -> Codex digest/review thread
  -> approved send only
```

The Bridge may run under another Windows user, Windows Sandbox, a light VM, or another small Windows host. Do not downgrade or inject the operator's day-to-day WeCom install.

## Configuration

Copy `config/wecom_gateway.example.json` to `config/wecom_gateway.local.json` and fill only local routing values. For the WeChat-Work-Hook candidate, use `config/wecom_gateway.wechat-work-hook.example.json` as the starting point.

- `provider`: `vworkApi` or `wechat-work-hook`.
- `callbackPort`: local `/msg` port passed to `vworkApi --my_port`.
- `apiPort`: local provider `/api` port, usually `8989`.
- `supportedWecomVersion`: the provider's pinned WeCom version.
- `codexThreadId`: fixed Codex review thread id.
- `operatorAliases`: names used to detect group mentions.
- `groupWhitelist`: groups where `@operator` should trigger immediate review.
- `directSenderWhitelist`: direct senders that should trigger immediate review.

Do not store passwords, cookies, tokens, or WeCom session material in this file.

## Commands

Start the local callback receiver:

```powershell
npm run ops:wecom:gateway -- --config config\wecom_gateway.local.json
```

Check the `vworkApi` login/account endpoint without starting the server:

```powershell
npm run ops:wecom:gateway -- --config config\wecom_gateway.local.json --health
```

Probe the confirmed public provider operation codes:

```powershell
npm run ops:wecom:provider-probe -- --config config\wecom_gateway.local.json
```

Check whether a provider is healthy enough to be the main Hook Bridge:

```powershell
npm run ops:wecom:bridge-health -- --config config\wecom_gateway.local.json --require-version-match
```

Optionally send a text message to File Assistant after login is confirmed:

```powershell
npm run ops:wecom:provider-probe -- --config config\wecom_gateway.local.json --send-file-assist "probe from ad-ops-workbench"
```

For a provider migration check, override the provider name and port without changing the rest of the gateway:

```powershell
npm run ops:wecom:provider-probe -- --config config\wecom_gateway.local.json --provider wechat-work-hook --api-port 8989
```

The probe also reads the installed WeCom version from `HKCU\Software\Tencent\WXWork\Version` and reports `versionStatus` as `match`, `mismatch`, or `unknown`.

Generate a scheduled Codex review prompt:

```powershell
npm run ops:wecom:digest -- --config config\wecom_gateway.local.json --today 2026-06-04 --slot 10:00
```

Clean up expired WeCom runtime files:

```powershell
npm run ops:wecom:cleanup -- --config config\wecom_gateway.local.json --retention-days 7
```

Register a WeCom-downloaded file for Codex review:

```powershell
npm run ops:wecom:file-inbox -- --file "C:\path\to\downloaded-file.xlsx" --note "from developer"
```

Register every file in a download folder:

```powershell
npm run ops:wecom:file-inbox -- --dir "C:\path\to\WeComDownloads"
```

Fallback only: capture the current WeCom window without focusing it:

```powershell
npm run ops:wecom:window-capture -- --out-dir data\agent
```

Fallback only: run a full background scan of the current WeCom window:

```powershell
npm run ops:wecom:window-scan -- --out-dir data\agent
```

Import an actionable OCR triage result into the daily message pool:

```powershell
npm run ops:wecom:import-ocr-triage -- --triage data\agent\wecom_window_triage_2026-06-04.json --today 2026-06-04
```

The import step is conservative by default. It stores only triage results with a SKU/ASIN/keyword, P0/P1 priority, or an actionable category such as developer requests or exception watch. Re-running the same OCR triage file is deduplicated. Do not rely on OCR for unattended operation.

## Runtime Files

All generated files stay under `data/agent/` by default:

- `wecom_messages_<date>.json`: redacted events and review status.
- `wecom_digest_<date>_<slot>.json`: digest payload for the review thread.
- `wecom_codex_prompt_<date>_<slot>.md`: prompt text to send into Codex.
- `wecom_file_inbox_<date>.json`: file paths and metadata for files downloaded from WeCom.
- `wecom_file_prompt_<date>.md`: prompt text listing pending file reviews.
- `wecom_window_capture_<date>.png`: background PrintWindow capture for OCR feasibility checks.
- `wecom_window_ocr_<date>.json`: Windows OCR lines and word boxes from the capture.
- `wecom_window_triage_<date>.json`: lightweight OCR triage with category, priority, SKU/ASIN candidates, and conversation candidates.

These files are runtime artifacts and are ignored by git.

## Confirmed vworkApi Codes

The public demo confirms only these codes:

| Type | Purpose | Required Fields |
| --- | --- | --- |
| `1000` | Login status | none |
| `1002` | Current account info | none |
| `3000` | Send text message | `user_id`, `msg` |

The gateway intentionally depends only on message callbacks and these confirmed read/send primitives. Other professional features listed in ShowDoc are not wired until their operation codes and fields are verified by black-box probing or official documentation.

## Provider Migration Boundary

The Codex review flow is provider-agnostic as long as the provider exposes:

- `POST /api` for local HTTP operations.
- `type: 1000` for login status.
- `type: 1002` for account info.
- `type: 3000` for text send.
- `POST /msg` callback into this gateway for received messages.

Known pinned versions:

| Provider | Pinned WeCom Version | Notes |
| --- | --- | --- |
| `vworkApi` | `5.0.3.6005` | Matches the current public demo and ShowDoc capability list. |
| `wechat-work-hook` | `4.1.36.6012` | Same local `/api` shape for text send, but a different pinned WeCom version. |

Do not assume a provider supports the currently installed WeCom version until `ops:wecom:provider-probe` reports both `versionStatus: "match"` and successful local API checks.

`ops:wecom:bridge-health` is the main contract gate for the Bridge. A provider is not ready for the main path until it reports:

- matching pinned WeCom version when `--require-version-match` is used
- successful login status check
- successful account info check
- loopback callback endpoint
- optional send-text check when `--send-file-assist` is supplied
