# SKU Lessons

Reusable SKU-level lessons live here when they can affect future SKU decisions. Daily facts stay in `data/learning/daily_learning_<date>.json/md`; only promote a lesson here when it has a clear scope, evidence, transfer boundary, and conflict status.

Use `docs/SKU_LESSON_SYSTEM.md` as the contract.

Minimum record shape:

```json
{
  "id": "sku_lesson_<date>_<slug>",
  "status": "active",
  "scope": {
    "level": "sku|variant|parent|keyword|match_type|product_type|season_node|account",
    "skus": [],
    "keyword": "",
    "matchType": "",
    "node": "",
    "conditions": []
  },
  "sourceDate": "YYYY-MM-DD",
  "evidenceFiles": [],
  "lesson": "",
  "transferableTo": [],
  "doNotApplyWhen": [],
  "riskOfMisuse": "",
  "conflictsWith": [],
  "resolution": "",
  "confidence": "low|medium|high",
  "nextValidation": ""
}
```

Do not promote a lesson from one variant to a whole parent group unless fresh variant-level evidence supports that transfer.
