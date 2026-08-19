---
id: spec:app-data-source
title: アプリのデータ取得
coherence:
  depends_on:
    - design:read-bundles
---

# spec:app-data-source

現状アプリは、ビルド時に焼き込んだ `private/data.json` を認証付き Function 経由で読む。
そのため**語を 1 つ直すたびに `sync:all` → `deploy` が必要**だった。
チャンクを直接読むことでこの往復を無くす。

辞書は私的データなので、認証は現行と同じく必須。

## Invariants

- 未認証では 1 バイトも辞書データを返さない。
- 表示に使うスキーマは現行 `AppDataSchema` と互換である。
- オフラインでも、直前に読んだ内容で起動できる。

## Requirements

- REQ-APP-001: WHEN アプリが起動する THE SYSTEM SHALL チャンク 10 件を読んで辞書を組み立てる
- REQ-APP-002: IF 認証トークンが無効 THEN THE SYSTEM SHALL 辞書を返さず Locked 画面に倒す
- REQ-APP-003: WHILE オフライン THE SYSTEM SHALL 最後に取得した内容で起動する
- REQ-APP-004: WHEN DB のチャンクが更新される THE SYSTEM SHALL 再デプロイ無しで次回起動時に反映する
- REQ-APP-005: IF チャンクの一部が欠落している THEN THE SYSTEM SHALL 欠落を報告し、取得できた範囲では動作を継続する
