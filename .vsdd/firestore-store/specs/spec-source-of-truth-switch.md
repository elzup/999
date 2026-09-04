---
id: spec:source-of-truth-switch
title: 正本を Firestore に切り替える
coherence:
  depends_on:
    - spec:console-writes
    - spec:rep-migration
    - design:sheet-projection
---

# spec:source-of-truth-switch

第 1 段階を終えた時点で、Firestore は **どの項目についても正本ではない**。

| 項目                   | 正本                     | Firestore                  |
| ---------------------- | ------------------------ | -------------------------- |
| 語・かな・タグ・ラベル | Google Sheet             | `db:push` sync 段の写し    |
| 代表語・主観評価       | `src/data/word-rep.json` | `db:push` migrate 段の写し |
| 画像                   | `word-images.json` + GCS | sync 段の写し              |

この状態で編集の入り口を増やすと、**写しに書いた分が次の `db:push` で消える**。
`spec:console-writes` が実装済みでありながら `console/rep-server.js` が今も
`src/rep-store.js` (= `word-rep.json`) に書いているのも、切り替えが宣言されて
いないため。まずどの項目がいつ Firestore を正本にするかを決める。

## 切替の順序

依存の少ない順に 1 項目ずつ。項目ごとに「DB が正本」と「投入をやめる」が対になる。

1. **代表語・主観評価** — `rep-server` の書き込み先を `console-writes` に移し、
   `db:push` の migrate 段を止める。`word-rep.json` は消さず読み取り専用で残す。
2. **語・かな・ラベル** — 編集を `spec:number-api` に一本化し、シートへは
   `design:sheet-projection` で投影する。`db:push` の sync 段を止める。
3. **画像** — `word-images.json` の扱いは別途。ここでは対象外。

## Invariants

- 切替は項目単位で行う。ある項目が切り替わっても、他の項目の経路は変わらない。
- 切替の前後で件数が一致する。一致しなければ切り替えない。
- 切替済み項目について、旧経路からの投入は行わない。写しの上書きで新しい値を潰さないため。
- 旧正本のファイル (`word-rep.json` ほか) は削除しない。読み取り専用のバックアップとして残す。
- 切替は巻き戻せる。旧経路を消すのは、切替後に一定期間 DB が正本として動いた後。

## Requirements

- REQ-SOT-001: WHEN ある項目が Firestore を正本に切り替わる THE SYSTEM SHALL その項目に対する旧経路からの投入を停止する
- REQ-SOT-002: IF 切替前後で件数が一致しない THEN THE SYSTEM SHALL 切替を中止し旧経路を維持する
- REQ-SOT-003: WHILE 切替が完了していない項目がある THE SYSTEM SHALL その項目については旧正本を優先する
- REQ-SOT-004: WHEN 代表語と主観評価が切り替わる THE SYSTEM SHALL `word-rep.json` を変更せず読み取り専用として残す
- REQ-SOT-005: WHEN 語とかなが切り替わる THE SYSTEM SHALL シートへの反映を `design:sheet-projection` に委ね、シートを編集面として使い続けられるようにする
- REQ-SOT-006: IF 切替後に不整合が見つかった THEN THE SYSTEM SHALL 旧経路へ戻せる状態を保持する
