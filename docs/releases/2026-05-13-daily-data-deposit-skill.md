# Release: Daily Data Deposit Skill

Date: 2026-05-13

## Summary

- Added the `daily-data-deposit` Codex skill for the daily business data deposit workflow.
- Defined the required raw input set: sales core spreadsheet, inventory CSV, and ad full export CSV.
- Standardized the expected daily archive outputs: raw files, normalized JSON/snapshots, detailed HTML, analysis/learning artifacts, and a manifest or status summary.
- Added data quality guardrails for missing raw files, suspiciously small exports, mismatched date folders, and login-page artifacts.
- Documented the detailed HTML sections needed for long-term value: total business summary, account split, developer-line split, SKU pools, ad detail, inventory detail, seasonal layer, action advice, and learning notes.
- Documented automation guidance for daily reminders without embedding AI logic into extension or scripts.

## Operational Notes

- The user-level skill was installed at `C:\Users\Administrator\.codex\skills\daily-data-deposit`.
- This repo also tracks a copy under `.codex\skills\daily-data-deposit` so the workflow can be versioned and pushed.
- A Codex app heartbeat reminder was created for 09:40 Asia/Shanghai to check whether the day's deposit is complete.

## Verification

- `python C:/Users/Administrator/.codex/skills/.system/skill-creator/scripts/quick_validate.py C:/Users/Administrator/.codex/skills/daily-data-deposit`
- `python C:/Users/Administrator/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/daily-data-deposit`
