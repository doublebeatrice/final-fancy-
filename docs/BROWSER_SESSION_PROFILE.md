# Browser Session Profile

The ad backend and sellerinventory can invalidate each other's login state when the same account is opened from two different Chrome profiles. Because of that, the default operating rule is:

```text
Business systems have one browser only.
```

Use the collaboration browser for ad, sellerinventory, selection, and the project extension. Use normal personal Chrome for ChatGPT, browsing, and personal tools, but do not open ad or sellerinventory there during operations.

## Default Business Entry

On this operator machine, the desktop shortcut `广告运营协作浏览器` points to:

```text
D:\ad-ops-workbench\scripts\launch_ad_ops_browser.cmd
```

That launcher calls:

```powershell
scripts\launch_ad_ops_collaboration_browser.ps1
```

Equivalent command:

```powershell
npm run chrome:operator
```

Default behavior:

- Opens or reuses the collaboration Chrome profile at `C:\chrome-debug-profile`.
- Exposes the same browser on `127.0.0.1:9222` for Codex and local scripts.
- Brings that collaboration browser window to the front for the operator.
- Runs backend readiness checks against ad, sellerinventory, selection, and the project extension panel.

This is the shared business session. The operator and Codex should both use this same browser for ad/inventory work so the systems do not kick one session offline.

## Extensions And Logins

Do not clone personal Chrome and expect extensions or logins to survive. Chrome can scrub copied Web Store extension state, and protected cookies/passwords may not move to a different user-data directory.

If the operator needs a Chrome extension while operating ad/inventory, install it directly inside the collaboration browser once. That profile is persistent, so direct installs and logins should remain in `C:\chrome-debug-profile`.

If ChatGPT or another AI tool must be used next to the business systems, the safest split is:

- Collaboration browser: ad, sellerinventory, selection, project extension.
- Personal Chrome: ChatGPT and personal plugins, with no ad/sellerinventory tabs open.

## Personal Chrome Entry

Personal Chrome can still be opened explicitly:

```powershell
npm run chrome:personal
```

Use it for non-business browsing. If ad or sellerinventory is opened in personal Chrome while the collaboration browser is logged in, one side may get logged out.

## Automation-Only Entry

Scripts that only need the CDP browser can still run:

```powershell
npm run chrome:debug
```

By default this opens or reuses the same persistent, non-default profile:

```text
C:\chrome-debug-profile
```

It starts with `about:blank` and loads the project extension from `extension/`. The readiness script then reuses or creates the needed business tabs.

Check what would happen without starting a browser:

```powershell
npm run chrome:debug:dry
```

Useful environment variables:

```text
AD_OPS_CHROME_PROFILE_MODE       ops | custom | personal
AD_OPS_CHROME_USER_DATA_DIR      Non-default Chrome user data directory
AD_OPS_CHROME_PROFILE_DIRECTORY  Optional Chrome profile name inside the user data dir
AD_OPS_CHROME_DEBUG_PORT         Defaults to 9222
AD_OPS_CHROME_PATH               Optional chrome.exe path
```

## Personal Profile Boundary

Do not point CDP directly at the default personal Chrome profile for routine work. Chrome 136+ does not honor remote debugging against the default data directory, and CDP access to a personal browser profile is too broad for daily operations. Google documents the custom-directory requirement here: https://developer.chrome.com/blog/remote-debugging-port

`npm run chrome:debug:personal` is intentionally guarded. It refuses unless the PowerShell script is run with `-AllowDefaultChromeProfile`, and even then the current Chrome version may still decline to expose `9222`.

## Clone Command Is Recovery Only

The clone command remains available for manual recovery:

```powershell
npm run chrome:profile:clone-default
```

It copies from `%LOCALAPPDATA%\Google\Chrome\User Data` into `C:\chrome-debug-profile` after moving the old target to `C:\chrome-debug-profile.backup-<timestamp>`.

Important limitation: this is not the default path and is not reliable for extensions or login carryover. Use direct installs and direct logins in the collaboration browser instead.

## Operator Window Etiquette

Do not scatter evidence pages into the operator's active browser while they are working.

Default rules for scripts and agents:

- Reuse existing business tabs whenever possible.
- Use CDP background targets for temporary evidence pages.
- Use one reusable worker tab for iterative front searches instead of one tab per keyword.
- Close temporary worker tabs in `finally` blocks.
- Keep visible tabs to the operational set unless the operator explicitly asks to inspect a page.

Current collaboration operational set:

```text
https://adv.yswg.com.cn/
https://sellerinventory.yswg.com.cn/
https://selection.yswg.com.cn/dashboard/analysis
chrome-extension://ipidenfkcdlhadnieamoocalimlnhagj/panel.html
```
