# 2026-04-20 Inventory Note Validation Run

## Scope

- Reopened/confirmed Chrome remote debugging on `127.0.0.1:9222`.
- Ran local checks.
- Ran inventory full fetch through the extension panel.
- Verified inventory note overwrite and append behavior against the real `/pm/formal/update` endpoint.
- Did not execute ad bid changes in this run.

## Local Checks

- `node --check extension\panel.js`: passed.
- `node --check auto_adjust.js`: passed.
- `node --check src\adjust_lib.js`: passed.
- `npm.cmd test`: passed, `adjust_lib tests passed`.

## Inventory Full Fetch

- Browser target: extension panel `chrome-extension://ipidenfkcdlhadnieamoocalimlnhagj/panel.html`.
- Invocation: `fetchAllInventory()`.
- Returned rows: `1013`.
- SKU count after map/dedup: `575`.
- SKU records with `aid`: `575`.
- Samples:
  - `KZ6722`, `aid=3105578`, note later restored to `U+65E0` (`%E6%97%A0`).
  - `STY6101`, `aid=3038367`.
  - `TH3353`, `aid=3029734`.
  - `TH3351`, `aid=3029733`.
  - `QUN1382`, `aid=3026628`.

## Note Overwrite Validation

- SKU: `KZ6722`.
- Function: `setInventoryNoteValue('KZ6722', '\u65e0')`.
- Endpoint: `POST https://sellerinventory.yswg.com.cn/pm/formal/update`.
- Body format: `application/x-www-form-urlencoded; charset=UTF-8`.
- Response: `HTTP 200`, `code=200`, `msg=update success`.
- Verified body shape:
  - `aid=3105578`
  - `sku=KZ6722`
  - `type=note`
  - `value=%E6%97%A0`
  - `current_value=%E6%97%A0`
  - `_token=...`

## Note Append Validation

- Old note before append: `U+65E0` (`%E6%97%A0`).
- Function: `appendInventoryNoteValue('KZ6722', appendText)`.
- Append contract verified:
  - `value` carried only the new append fragment.
  - `current_value` carried the full final note: old note plus append fragment.
- Response: `HTTP 200`, `code=200`, `msg=update success`.
- Fresh inventory fetch confirmed the note contained the appended fragment.
- The validation fragment was then removed by restoring the note to `U+65E0` (`%E6%97%A0`).

## Confirmed Risks

- The update endpoint does not accept clearing a note to an empty string. A previous empty restore attempt returned an SQL-related error containing `after_content cannot be null`.
- Do not use `/pm/formal/update` to clear notes unless the backend-supported empty value behavior is confirmed.
- PowerShell inline scripts can corrupt direct Chinese string literals into `?`. Use unicode escapes or the extension source path for Chinese note content during validation.
