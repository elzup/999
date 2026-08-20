---
id: design:firestore-schema
title: Firestore ドキュメント構造
coherence:
  depends_on: []
---

# design:firestore-schema

正本を Firestore に置く。1 番号 1 ドキュメントを書き込みの単位とし、
シートに存在しない情報 (代表語・主観評価) もここに含める。

現状 807 KB / 1000 件 (1 件あたり 826 B)。ドキュメント上限 1 MiB に対し十分小さい。

## コレクション

| パス | 件数 | 役割 |
| --- | --- | --- |
| `numbers/{num}` | 1000 | 書き込みの単位。全項目を持つ |
| `rules/{table}` | 3 | `single_digit` / `double_digit` / `long_digit` |
| `bundles/chunk_{0..9}` | 10 | 読み込み用の集約 (design:read-bundles) |

## `numbers/{num}` のフィールド

- `num` — `/^\d{3}$/`。ドキュメント ID と一致する
- `hito` / `mono` / `gainen` — 語 (`#tag` 記法を保持)
- `slots` — `{ wh1..wh3, wm1..wm3 }`。各 `{ word, kana, imageUrl }`
- `rep` — `{ picks: [{k,w}], confirmed }`。最大 2 件 (design:representative-store と同形)
- `ratings` — `[{ k, w, v }]`。`v` は `-1 | 0 | 1 | 2`
- `derived` — `{ ptBySlot, rankeyBySlot }` (design:derived-on-write が書く)
- `updatedAt` — サーバータイムスタンプ
- `source` — `'sheet' | 'app' | 'console'`。最後に書いた面

## Invariants

- ドキュメント ID は `num` と一致する。
- `rep.picks` は重複なし、最大 2 件である。
- `ratings` の同じ `{k,w}` に対するエントリは 1 件以下である。
- `derived` はいかなる書き込み元からも直接書かれない (書き込み経路が計算し直す)。
- 1 ドキュメントは 1 MiB を超えない。

## 書き込み口を 1 つに絞る

クライアントから Firestore に直接書かせない。すべて Function 経由にする。

**理由**: rules 言語はリストの要素を走査できないため、`ratings[].v` が
`-1 | 0 | 1 | 2` であること (REQ-FS-003) を rules では強制できない。
`hasOnly` はリストの要素が map の場合には使えず、`map()` 相当も無い。
書き込み口を 1 箇所にすれば、`validateNumberDoc` を必ず通せる。

rules は「読み取りは認証済みのみ、書き込みは全面拒否」だけを担う
(Admin SDK は rules を迂回するので Function からは書ける)。

副作用として Firestore のオフライン書き込みキューは使えなくなるが、
書き込みは編集時のみで頻度が低いため許容する。読み取りは
`bundles/*` を直接読むのでオフラインキャッシュが効く。

## Requirements

- REQ-FS-001: WHEN 任意の面が `numbers/{num}` を書く THE SYSTEM SHALL `updatedAt` と `source` を同時に更新する
- REQ-FS-002: IF ドキュメント ID と `num` フィールドが一致しない THEN THE SYSTEM SHALL 書き込みを拒否する
- REQ-FS-003: IF `ratings[].v` が `-1 | 0 | 1 | 2` 以外 THEN THE SYSTEM SHALL 書き込みを拒否する
- REQ-FS-004: IF `rep.picks` が 3 件以上 THEN THE SYSTEM SHALL 書き込みを拒否する
- REQ-FS-005: IF クライアントが `derived` を含む書き込みを行う THEN THE SYSTEM SHALL その書き込みを拒否する
- REQ-FS-006: THE SYSTEM SHALL クライアントからの `numbers/*` への直接書き込みを拒否する
- REQ-FS-007: WHEN Function が書き込みを受ける THE SYSTEM SHALL `validateNumberDoc` を通してから永続化する
- REQ-FS-008: IF 既存文書が `rep` または `ratings` を持ち、書き込み後にそれが失われる THEN THE SYSTEM SHALL 書き込みを拒否する
- REQ-FS-009: THE SYSTEM SHALL `rep` / `ratings` を省略した文書と、明示的に空にした文書を区別する
- REQ-FS-010: IF 検証対象が配列要素に `null` や非オブジェクトを含む THEN THE SYSTEM SHALL 例外を投げず `error` を返す
