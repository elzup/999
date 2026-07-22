---
id: test:knowledge-tools
title: Knowledge tools verification map
coherence:
  depends_on:
    - spec:tab-visibility
    - spec:ff-practice
    - spec:representative-console
    - spec:lyrics-generation
---

# test:knowledge-tools

## Traceability

| Requirements        | Verification                                                           |
| ------------------- | ---------------------------------------------------------------------- |
| REQ-TAB-001..006    | `app/__tests__/tabVisibility.test.ts`、App/Panel native-control review |
| REQ-FF-001..004,007 | `app/__tests__/ffQuiz.test.ts`、`src/__tests__/ff-reading.test.js`     |
| REQ-FF-005..006     | keypad exactly-once/summary tests、`ffCompletion.test.ts`              |
| REQ-REP-001..006    | rep-store / rep-server / rep-state tests                               |
| REQ-LYR-001..005    | lyrics shape + canonical source zero-diff tests                        |
| CEG DAG             | `.vsdd/knowledge-tools/tests/ceg-gate.test.mjs`                        |
