# Backend Login Readiness Design

## Goal

Make debug Chrome startup a stable first step for every workflow by automatically recovering the `adv.yswg.com.cn` and `sellerinventory.yswg.com.cn` browser sessions when the local WeCom desktop login can authorize browser access.

## Current Behavior

The existing startup scripts open debug Chrome on port `9222` with the ad backend, inventory backend, and extension panel. They assume the operator manually confirms both backend pages are visibly logged in. When sessions expire, downstream snapshot and fetch scripts only discover the problem later through HTML/login-page responses.

## New Behavior

Startup should run a repeatable readiness check after opening debug Chrome:

- Ensure the three required tabs exist: ad backend, inventory backend, extension panel.
- Inspect each backend page through CDP and classify it as `ready`, `browser_login_available`, `manual_login_required`, or `missing`.
- When the page is on a WeCom login iframe and the browser-access link is available, click "continue/login in browser" automatically.
- Poll after the click until the page leaves `/login` and shows logged-in application content.
- Run health checks that prove the session is usable:
  - ad backend: call `/product/adSkuSummary` with one-row payload and require JSON `code=200`.
  - inventory backend: call the extension panel's `ensureInventoryListPage` and require `ok=true`.
- Never persist cookies, CSRF values, JWTs, Inventory-Token values, or raw headers.

## Failure Modes

The readiness script should return a clear non-zero failure when:

- Chrome debug port is unavailable.
- A required tab cannot be opened.
- WeCom is not logged in on the computer or requires manual confirmation.
- The browser-access link is not present.
- A backend returns HTML/login content during health checks.

The final message should tell the operator what to fix: open WeCom desktop, approve WeCom if prompted, or manually complete login.

## Files

- `scripts/execute/backend_login_lib.js`: pure classification, redaction, and summary helpers.
- `scripts/execute/ensure_backend_login.js`: CDP runner that opens tabs, clicks WeCom browser access, and runs health checks.
- `tests/backend_login_lib.test.js`: regression tests for classification and redaction.
- `scripts/execute/open_debug_browser_fixed_profile.ps1`: invoke readiness after starting or reusing debug Chrome.
- `scripts/execute/open_debug_browser.ps1`: keep parity with fixed-profile startup.
- `package.json`: add `chrome:ready` and route `chrome:debug` through the stable startup.
- `AGENT.md`, `README.md`, `memory.md`: update daily flow to use automatic readiness before snapshot export.

## Safety

The script only clicks the browser-access login continuation for the existing enterprise identity shown by WeCom. It does not enter credentials, bypass MFA, store tokens, or make write API calls. If the site asks for additional user action, it stops and reports `manual_login_required`.
