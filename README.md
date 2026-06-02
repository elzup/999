# 999

メモリースポーツ（数字記憶競技）のための、かな → 3 桁数字 (000-999) 変換表作成支援ツール。

3 桁の数字それぞれに覚えやすい日本語の単語を割り当て、数字列を物語として記憶する「ナンバーシステム」の構築を効率化します。Google Spreadsheet をデータベースとして使い、単語のエンコード品質スコアリング・完成度トラッキング・可視化を提供します。

## Scoring Rules

### Digit Mapping

Single / Double / Long の各テーブルとティア分類。

![Digit Mapping](docs/rules-map.png)

### Rule Type Analysis

Token Classification Flow と Position × Token Type マトリクス。

![Rule Type Analysis](docs/rules-sp.png)

### Decomposition Patterns

3 桁を作る代表的なかな構成パターンとスコアレンジ。

![Decomposition Patterns](docs/rules-decomposite.png)

## Scripts

```bash
nr sync        # Google Sheet からデータ同期
nr push        # src/data/words.tsv を Google Sheet に書き戻す
nr push:tags   # BCD列の #tag 一覧を tags シートへ書き出す
nr score       # 単語スコアリング
nr check:kana  # かなカバレッジチェック
nr check:digits # 桁数チェック
nr check:errors # エラーチェック
nr viz         # 単語ダッシュボード可視化HTML生成
nr test        # テスト実行
```

## Google Sheet Read/Write

読み取りは公開シートなら `nr sync` で動きます。

書き込みは Google Sheets API を使います。認証は次のどちらかです。

1. 推奨: `gcloud auth application-default login`
2. または Google Cloud で service account を作成し、JSON を `.config/google-service-account.json` に置く
3. service account を使う場合は `client_email` を対象スプレッドシートの編集者に追加する
4. `nr push` を実行する

必要に応じて `SHEET_URL` で対象シート URL を上書きできます。URL には `gid` を含めてください。認証ファイルは `GOOGLE_APPLICATION_CREDENTIALS` / `GOOGLE_SERVICE_ACCOUNT_PATH` / `GOOGLE_SERVICE_ACCOUNT_JSON` でも指定できます。

タグ一覧を別シートに出したい場合は `nr push:tags` を使います。`tags` シートがなければ自動作成し、`hito / mono / gainen` の各セルに含まれる `#tag` を集計して書き込みます。

列構成は `tag / title / count / hito / mono / gainen / nums / labels` です。B 列の `title` は複数人が手で編集する列のため、書き込み前に既存シートの `tag → title` を読み取って引き継ぎます（新規 tag は空欄、上書きしない）。

## Docs

- [かな数字対応表](docs/kana-number-table.md) - 対応表・桁数判定ルール・スコア計算
