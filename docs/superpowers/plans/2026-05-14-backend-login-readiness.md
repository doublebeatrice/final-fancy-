# Backend Login Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stable startup readiness step that opens debug Chrome, recovers backend login through WeCom browser access when possible, and verifies ad/inventory sessions before daily workflows.

**Architecture:** Put testable page classification in a small CommonJS helper and keep CDP side effects in one executable script. Startup PowerShell scripts continue to own Chrome process/profile setup, then call the Node readiness script.

**Tech Stack:** Node.js CommonJS, Chrome DevTools Protocol over the existing `discovery/lib/cdp.js`, PowerShell startup scripts, Node assert tests.

---

### Task 1: Pure Login State Helpers

**Files:**
- Create: `scripts/execute/backend_login_lib.js`
- Test: `tests/backend_login_lib.test.js`

- [ ] Write failing tests for URL redaction and page classification.
- [ ] Run `node tests/backend_login_lib.test.js` and confirm it fails because the helper module is missing.
- [ ] Implement `redactSensitiveUrl`, `classifyBackendPage`, and `allTargetsReady`.
- [ ] Run `node tests/backend_login_lib.test.js` and confirm it passes.

### Task 2: CDP Readiness Runner

**Files:**
- Create: `scripts/execute/ensure_backend_login.js`

- [ ] Implement tab discovery/opening using `discovery/lib/cdp.js`.
- [ ] Read page state via `Runtime.evaluate`, redacting sensitive iframe URLs in output.
- [ ] Click the WeCom browser-access link first through the login iframe target when available, with a parent-frame coordinate fallback.
- [ ] Poll each backend until classified as `ready` or a timeout/failure state.
- [ ] Run ad and inventory health checks.
- [ ] Return exit code `0` only when both health checks pass.

### Task 3: Startup Wiring and Docs

**Files:**
- Modify: `scripts/execute/open_debug_browser_fixed_profile.ps1`
- Modify: `scripts/execute/open_debug_browser.ps1`
- Modify: `package.json`
- Modify: `AGENT.md`
- Modify: `README.md`
- Modify: `memory.md`

- [ ] Make both PowerShell startup scripts call `node scripts\execute\ensure_backend_login.js` after opening/reusing required tabs.
- [ ] Add `chrome:ready` and make `chrome:debug` use the stable fixed-profile flow.
- [ ] Update daily flow docs to say startup attempts WeCom browser-login automatically and only asks the operator when WeCom requires action.

### Task 4: Verification

**Commands:**
- `node tests/backend_login_lib.test.js`
- `npm test`
- `powershell -ExecutionPolicy Bypass -File scripts\execute\open_debug_browser_fixed_profile.ps1`
- `node scripts\execute\ensure_backend_login.js`

- [ ] Confirm unit tests pass.
- [ ] Confirm the full test suite passes.
- [ ] Confirm live readiness reports ad and inventory as ready on port `9222`.
