---
id: review:adversary-r3
title: Adversary Review R3
coherence:
  depends_on:
    - review:adversary-r2
    - spec:tab-visibility
    - spec:ff-practice
    - spec:representative-console
    - spec:lyrics-generation
    - test:knowledge-tools
---

# Adversary Review R3

**Reviewers:** codex_gpt-5 × 2 (fresh context, artifacts-only)  
**Target:** R2 remediation working tree  
**Initial verdict:** FAIL — real-data semantic collision and stale generated artifact

## App findings and feedback routing

- `APP-R3-001` HIGH / Spec Fidelity / Phase 1: `word || kana` が複数 hex に対応する場合の
  逆引き policy が未定義だった。`語→hex` は出題可能集合内で一意な語だけを採用すると明記。
- `APP-R3-002` HIGH / Edge Cases / Phase 2a: real FF dataset の語衝突を列挙し、全 reverse
  prompt の対応 hex 数が 1 であることを検証。
- `APP-R3-003` HIGH / Correctness / Phase 2b: `read2hex` の出題行を unique label rows に限定。
- `APP-R3-004` MEDIUM / Verification / Phase 2a: final summary pure test と run ID ごとの
  record sink integration test を追加し、exactly-once guard から履歴保存まで追跡。

## Lyrics findings and feedback routing

- `R3-LYR-001` HIGH / Spec Fidelity / Phase 2b: review 時の一時的な `051.picks: []` に対し
  checked-in lyrics が stale だった。canonical zero-diff gate を追加後、監査中に生じた store
  mutation を復元し、現 canonical store から再生成。
- `R3-TEST-002` HIGH / Edge Cases / Phase 2a: canonical store から 000-999 の期待読みを計算し、
  `words_all.txt` と全件一致させる zero-diff test を追加。
- `R3-LYR-003` HIGH / Correctness / Phase 2b: current store から全 lyrics を再生成。
- `R3-VER-004` HIGH / Verification / Phase 2a: shape/連結だけでなく canonical content equality
  を必須 gate 化。

## R4 gate

R4 は新しい fresh-context Adversary が現 working tree と green gate を再監査し、
material finding が 0 件かを判定する。
