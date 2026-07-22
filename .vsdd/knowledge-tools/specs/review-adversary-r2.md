---
id: review:adversary-r2
title: Adversary Review R2
coherence:
  depends_on:
    - review:adversary-r1
    - spec:tab-visibility
    - spec:ff-practice
    - spec:representative-console
    - spec:lyrics-generation
    - test:knowledge-tools
---

# Adversary Review R2

**Reviewers:** codex_gpt-5 × 2 (fresh context, artifacts-only)  
**Target:** R1 remediation working tree  
**Initial verdict:** FAIL — app/representative 双方で追加反例あり

## App findings and feedback routing

- `FIND-R2-001` CRITICAL / Spec Fidelity / Phase 2b: 混在した保存値が全体 fallback し、
  `misc:false` も復元できた。値ごとの採用へ変更し、`misc` を常時 true に固定。
- `FIND-R2-002` HIGH / Correctness / Phase 2b: 欠損 marker が `—` と `＿` のみだった。
  spreadsheet error marker を含む全 quiz face の guard と有限集合テストを追加。
- `FIND-R2-003` MEDIUM / Edge Cases / Phase 2a: Infinity の count が API 間で不一致。
  非有限 count を 0 へ正規化し、NaN/±Infinity tests を追加。
- `FIND-R2-004` HIGH / Verification / Phase 2a: 語面、欠損 marker、設定復旧の
  requirement tests を追加。
- `FIND-R2-005` MEDIUM / Correctness / Phase 2b: state commit 前の連打で二重採点可能。
  synchronous ref guard と exactly-once test を追加。
- `FIND-R2-006` HIGH / Verification / Phase 2b: `NumberEntry` の computed Zod shape が
  TypeScript へ候補 key を伝播していなかった。typed mapped shape、dynamic rank の限定、
  nullable tile narrowing、score error 正規化を行い、`tsc --noEmit` を green 化。

## Representative / lyrics findings and feedback routing

- `REP-R2-001` HIGH / Spec Fidelity / Phase 2b: host override を除去し、loopback bind を固定。
- `REP-R2-002` HIGH / Correctness / Phase 2b: 明示的な空 `picks` を default と区別して保持。
- `LYR-R2-003` MEDIUM / Edge Cases / Phase 2b: 代表語生成前に ordered 000-999 を検証。
- `LYR-R2-004` MEDIUM / Edge Cases / Phase 2b: FF 生成前に ordered 00-FF、binary、type を検証。
- `TEST-R2-005` HIGH / Verification / Phase 2a: immutable write、空/重複 order、拒否時 no-write、
  strict extra key、body boundary、symlink escape tests を追加。
- `TEST-R2-006` HIGH / Verification / Phase 2a: GET state、成功時だけの immutable client state、
  placeholder、generator source completeness tests を追加。

## R3 gate

R3 は新しい fresh-context Adversary が現 working tree と検証結果だけを監査し、
5 dimensions の PASS/FAIL と未解消 finding を返す。
