# Selection Keyword Research

This document describes the read-only keyword research capability for the agent.

## Purpose

Use this source when a SKU, product direction, developer request, or traffic recovery task needs new traffic discovery.

Keyword research is evidence generation. It must prove that a direction has external market data before any ad test. A direction without evidence is only a hypothesis.

## Command

Start or verify the debug browser first:

```powershell
npm run chrome:debug
```

Run keyword research:

```powershell
npm run ops:selection:keyword-research -- --sku GUF3129 --terms "patriotic bucket hat, 4th of july bucket hat"
```

The command can use a SKU from `data/snapshots/latest_snapshot.json` to read the product card, listing title, ASIN, and product profile. Passing `--terms` gives the front-search seed layer stronger intent.

Default output:

```text
data/snapshots/selection_keyword_research_<YYYY-MM-DD>.json
```

## Evidence Flow

1. Build seed terms from operator terms, SKU product profile, listing title, and product positioning.
2. Search Amazon front-end result pages for each seed term.
3. Extract visible result evidence: ASIN, title, price, rating, review count, position, sponsored flag, image URL, and result URL.
4. Split ASINs into direct competitors, scene competitors, traffic-bridge competitors, and excluded ASINs.
5. Output candidate keywords and next validation commands for ABA, keyword seasonality, and keyword conversion.

## Operating Rules

- Category is not a hard boundary. A different category can be a useful traffic bridge when buyer intent, use case, or scene is relevant.
- Exclude unrelated intent, not different category.
- Exclude products that only share the seasonal node but do not share buyer task, use scene, or product-bearing intent.
- High-review top products can be useful as keyword evidence even when they are not safe ASIN targets.
- Own ASINs and same-store ASINs are excluded from competitor pools.
- Price band is a competition signal, not an automatic exclusion.

## Report Shape

Top-level fields:

- `source = selection_keyword_research`
- `input`
- `seedTerms`
- `searchTermsUsed`
- `directCompetitorAsins`
- `sceneCompetitorAsins`
- `trafficBridgeAsins`
- `excludedAsins`
- `candidateKeywords`
- `nextValidationCommands`
- `crossValidationPlan`
- `opsReadiness`

`opsReadiness.readyForAutoAction` is always `false`. Keyword research cannot create keywords, raise bids, raise budgets, or change listing, price, or inventory.

## Agent Capability

The registered capability is:

```text
selection::market_evidence::keyword-research::read
```

The operating hub should call it before ABA, keyword seasonality, and keyword conversion when the task is about new products, new traffic, product-market review, developer/product inquiries, keyword expansion, or "can this product be pushed".
