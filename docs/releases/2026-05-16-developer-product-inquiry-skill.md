# Release: Developer Product Inquiry Skill

Date: 2026-05-16

## Summary

- Added the `developer-product-inquiry` Codex skill for operator-forwarded developer/product requests.
- Defined the operator boundary: Codex does not read WeCom/WeChat directly; the operator forwards screenshots, text, SKU, ASIN, or product context.
- Defined short trigger words: `开发诉求` and `开发`.
- Required every handling pass to start with product-level diagnosis before ad or listing actions.
- Required replies to include product type, node/season/window judgement, evidence, action status, follow-up checkpoint, and a human-ready reply draft.
- Required durable request records under `data/developer_requests/` when a forwarded request needs follow-up.

## Operating Notes

- Use this skill when a developer asks whether a product can be pushed, adjusted, renamed, supplemented with keywords, aligned to a seasonal node, or followed up later.
- Do not answer only with ad delivery metrics. Advertising metrics support the judgement, but they do not replace product analysis.
- If evidence is missing, say what is missing and use a reversible low-risk test or review path instead of inventing search heat or node timing.
- For each follow-up checkpoint, produce a fresh operator-style reply; do not treat the first reply as the end of the workflow.

## Verification

- `node tests/developer_product_inquiry_skill.test.js`
- `PYTHONUTF8=1 python C:/Users/Administrator/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/developer-product-inquiry`
