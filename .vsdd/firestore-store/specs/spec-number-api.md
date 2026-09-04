---
id: spec:number-api
title: アプリからの番号読み書き API
coherence:
  depends_on:
    - design:firestore-schema
    - spec:console-writes
---

# spec:number-api

アプリに編集を戻すための口。`numbers/{num}` を 1 件読み、1 件部分更新する。

## なぜ Functions を挟むか

`spec:app-data-source` の「未解決」の通り、アプリは Firebase Auth を使っておらず
`editToken999` を Bearer で渡す独自方式なので、`firestore.rules` の `isOwner()` が
見る `request.auth.uid` が存在しない。**Firestore 直読みは Auth 導入が要る**。

Auth 導入を待つと編集がいつまでも入らないので、既存のトークンで Functions を挟む。
Functions は Admin SDK で rules を迂回するため、不変条件を守るのは
`writeNumber` と `validateNumberDoc` の責任になる (`design:firestore-schema` と同じ前提)。

Auth を入れた後にこの口を畳むかどうかは、そのとき決める。読み取りだけ直読みに移し、
書き込みは Functions に残す形もありうる。

## Invariants

- 未認証では 1 バイトも辞書データを返さない。判定は既存の `EDIT_TOKEN` の定数時間比較と同じ。
- 書き込みは必ず `writeNumber` を通す。`intent` で宣言していないフィールドが変われば拒否される。
- 1 リクエストは 1 番号だけを対象にする。
- `derived` はサーバが計算する。リクエストで受け取っても無視する。
- 応答は `cache-control: no-store`。

## Requirements

- REQ-NAPI-001: WHEN 認証済みで番号が要求される THE SYSTEM SHALL `numbers/{num}` を 1 回の取得で返す
- REQ-NAPI-002: IF トークンが不正または欠落している THEN THE SYSTEM SHALL 401 を返しデータを含めない
- REQ-NAPI-003: WHEN 部分更新が要求される THE SYSTEM SHALL `intent` で宣言されたフィールドだけを更新する
- REQ-NAPI-004: IF 宣言されていない保護対象 (`rep` / `ratings`) が変化する THEN THE SYSTEM SHALL 書き込みを拒否し 4xx を返す
- REQ-NAPI-005: IF `num` が 3 桁数字でない、または本文が上限を超える THEN THE SYSTEM SHALL 4xx と機械可読な error を返しストアを書き換えない
- REQ-NAPI-006: IF リクエストが読み取り時点より新しい `updatedAt` を持つ文書に当たる THEN THE SYSTEM SHALL 衝突として拒否する
- REQ-NAPI-007: WHEN 更新が成功する THE SYSTEM SHALL 更新後の番号文書を返し、画面がそれだけで再描画できるようにする
