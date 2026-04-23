Current architecture decision:

Codex is the only AI decision entry point. The operator runs the workflow in Codex. The extension panel does not contain an AI provider or AI runtime.

Boundaries:

1. The panel only:
   - captures page data
   - exports structured data
   - visualizes data
   - displays execution results
   - provides manual confirmation entry points when needed

2. Codex owns the main workflow:
   - read exported panel data
   - understand inventory, ads, historical actions, product stage, and Q2 priorities
   - output a unified action schema
   - call local scripts or interfaces to execute
   - verify after execution
   - write inventory notes
   - generate summary

3. Code only keeps:
   - data collection
   - data export
   - schema validation
   - API execution
   - result persistence
   - visualization

4. No plugin-side or execution-layer second strategy logic.
   Codex is the only action decision entry. If Codex cannot judge, output review.

5. Current minimal loop:
   capture -> snapshot -> Codex decision -> schema -> dry-run -> execution -> verification -> note -> summary

Do not expand unrelated modules until this boundary is stable.
