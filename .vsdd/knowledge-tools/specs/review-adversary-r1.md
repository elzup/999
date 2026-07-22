---
id: review:adversary-r1
title: Adversary Review R1
coherence:
  depends_on:
    - spec:tab-visibility
    - spec:ff-practice
    - spec:representative-console
    - spec:lyrics-generation
    - test:knowledge-tools
---

# Adversary Review R1

**Reviewers:** codex_gpt-5 × 2 (fresh context, artifacts-only)  
**Target:** `386eb07`  
**Verdict:** FAIL — 5 dimensions 中 5 FAIL

## Findings and feedback routing

- `APP-FIND-001` CRITICAL / Spec Fidelity / Phase 2b: storage schema を
  string-key/boolean-value record へ修正し、storage tests を追加。
- `APP-FIND-002` HIGH / Spec Fidelity / Phase 1: quiz が `word || kana` を使う意図を
  「語」テストとして spec/title に明記。
- `APP-FIND-003..008` HIGH-MEDIUM / Edge Cases, Correctness, Structural,
  Verification / Phase 2a-2c: count 正規化、欠損 marker guard、native sibling buttons、
  `TabId` type import、FF/tab/CEG tests で解消。
- `REP-FIND-001..007` CRITICAL-MEDIUM / 全 dimensions / Phase 2a-2c: loopback bind、
  strict request schema、16 KiB body limit、exact-one auto confirm、immutable store update、
  realpath containment、store/server/lyrics tests で解消。

## CEG impact

- `design:tab-registry` → `spec:tab-visibility` → `spec:ff-practice` → `test:knowledge-tools`
- `design:ff-data` → `spec:ff-practice`, `spec:lyrics-generation` → `test:knowledge-tools`
- `design:representative-store` → `spec:representative-console`, `spec:lyrics-generation` → `test:knowledge-tools`

## R2 gate

R2 は別 fresh-context Adversary が現 working tree を再監査し、全 finding の解消と
追加テストの存在を確認する。
