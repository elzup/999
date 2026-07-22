---
id: review:adversary-r4
title: Adversary Review R4
coherence:
  depends_on:
    - review:adversary-r3
    - spec:tab-visibility
    - spec:ff-practice
    - spec:representative-console
    - spec:lyrics-generation
    - test:knowledge-tools
---

# Adversary Review R4

**Reviewers:** codex_gpt-5 × 2 (fresh context, artifacts-only)  
**Target:** R3 remediation working tree  
**Verdict:** representative/lyrics は 5 dimensions PASS、app は Verification Readiness のみ FAIL

## Finding and feedback routing

- `APP-R4-001` MEDIUM / Verification / Phase 2a: per-ID history test が `read2hex` と `b2h`
  だけで、カテゴリ内の誤固定を検出できなかった。FF 4 方向 + nibble 2 方向を全列挙し、
  target sink の 1 回呼出しと全 non-target sink の未呼出しを検証。

## R5 gate

R5 は app verification 差分を fresh-context Adversary が再監査する。
