---
id: design:read-bundles
title: 読み込み用チャンク
coherence:
  depends_on:
    - design:firestore-schema
    - design:derived-on-write
---

# design:read-bundles

1 番号 1 ドキュメントのままアプリが全件読むと 1000 read/ロードになり、
無料枠 (50,000 read/日) を 50 ロードで使い切る。読みと書きを分ける。

100 件ずつ 10 個のチャンクに集約する。1 チャンク約 80 KB (上限 1 MiB に対し余裕)。
全件ロードが **10 read** で済み、1 日 5,000 ロードまで無料枠に収まる。

## Invariants

- チャンクは `numbers/*` からのみ生成される派生物である。
- `chunk_i` は `num` が `i*100` 以上 `(i+1)*100` 未満の番号だけを含む。
- 10 チャンクの和集合は `numbers/*` と一致する (欠落・重複なし)。

## Requirements

- REQ-BND-001: WHEN `numbers/{num}` が変更される THE SYSTEM SHALL 該当する `chunk_{floor(num/100)}` のみを再構築する
- REQ-BND-002: THE SYSTEM SHALL 各チャンクに `builtAt` を持たせる
- REQ-BND-003: IF チャンクが 1 MiB を超える THEN THE SYSTEM SHALL 書き込みを中止しエラーを記録する
- REQ-BND-004: WHEN アプリが全件を要求する THE SYSTEM SHALL 10 ドキュメントの読み取りだけで応答する
