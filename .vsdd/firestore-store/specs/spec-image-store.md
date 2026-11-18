---
id: spec:image-store
title: 画像データの正本を Firestore に移す
coherence:
  depends_on:
    - spec:source-of-truth-switch
---

# spec:image-store

`spec:source-of-truth-switch` で «別途» とした 3 番目 (画像) の切替。D-0084。

今の画像データは Mac の 4 ファイルが正本で、ほかに写しが無い。

| ファイル                      | 中身                                 | 件数 (2026-11-18) |
| ----------------------------- | ------------------------------------ | ----------------- |
| `word-images.json`            | 枠ごとの採用画像 (url / hash / 出典) | 2203 枠           |
| `word-images-keep.json`       | 確定 (ロック)                        | 1477              |
| `word-images-redo.json`       | 撮り直しの印                         | 5                 |
| `word-images.candidates.json` | 検索に使った語・クエリ・状態         | 2209              |

消えると作り直せず、控えは手動の `999-data` (2026-07 で停止) だけ。2026-11-18 の
一括撮り直しでは差し替え前に戻せなかった。web 版 console は Firestore の `imageMarks`
に印を置き、Mac が取り込むという二重の経路になっている。

## 切替後

- 正本: Firestore `imageSlots/{id}:{slot}`。1 枠 1 文書 (manifest は 1MB を超えうるので 1 文書にまとめない)。
  `{ id, slot, image?: {url, hash, sourcePage, sourceImageUrl, uploadedAt}, keep: boolean, redo: {flaggedAt, reason} | null, candidate?: {word, query, status, error?}, history: image[], updatedAt }`
- `history` に差し替え前の image を直近 N 件残す。撮り直しを巻き戻せるようにするため。
- Mac の 4 ファイルは cache。`nr images:pull` で Firestore から作り直す。手で書かない。
- 書き込みは Mac の console / スクリプトも web 版 / Function も Firestore に直接行う。
- `imageMarks` と `pull-marks` は廃止する (正本が 1 つになるので重ねる差分が要らない)。
- 画像の取得 (検索 → DL → webp → GCS) は Function でも動く。web 版から 1 枠に複数の候補を出して選べる (UI は別途 ui-option-preview で決める)。

## 段階

1. **投入**: 4 ファイルを `imageSlots` に写す (`nr images:migrate`、dry-run が既定)。件数一致を確認。
2. **読みの切替**: `store.js` の load\* を «Firestore → cache JSON» に。cache が無い / 古いときは pull。
3. **書きの切替**: console/server.js と search/fetch/direct の書き込みを Firestore へ。cache は書いた後に更新。
4. **web 版**: `functions/console-route.js` を `imageSlots` 直読み・直書きに。`imageMarks` を止める。
5. **Function で取得**: 候補を複数取って GCS に上げ、選んだものを採用する経路。
6. **UI**: 複数候補のチューザー (`showChooser` の拡張)。

## Invariants

- 切替の前後で枠数・確定数・撮り直し数が一致する。一致しなければ切り替えない (REQ-SOT-002)。
- 旧 4 ファイルは切替後もしばらく削除しない (REQ-SOT-006)。
- 採用画像を差し替えるときは、前の image を `history` に残してから書く。
- ロック中の枠は一括処理で上書きしない (今の挙動を保つ)。

## Requirements

- REQ-IMG-001: WHEN 枠の採用画像が差し替わる THE SYSTEM SHALL 差し替え前の image を `history` に追記する
- REQ-IMG-002: WHEN Mac で画像データを読む THE SYSTEM SHALL Firestore を正とし、手元 JSON は cache として扱う
- REQ-IMG-003: IF 投入前後で件数が一致しない THEN THE SYSTEM SHALL 切替を中止し旧ファイルを正本のまま保つ
- REQ-IMG-004: WHEN web 版で撮り直しが求められる THE SYSTEM SHALL Mac を介さず Function で候補を取得する
- REQ-IMG-005: WHILE 枠がロック中である THE SYSTEM SHALL 一括処理でその枠の採用画像を変更しない
