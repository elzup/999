# 公開 app 編集 API

公開 app の編集機能は Firebase Auth を使わず、長い bearer token を使う。

## 初期設定

```bash
openssl rand -hex 32
firebase functions:secrets:set EDIT_TOKEN
firebase functions:secrets:set GOOGLE_SERVICE_ACCOUNT_JSON
```

`GOOGLE_SERVICE_ACCOUNT_JSON` には Google Sheets API を実行する service account JSON 全体を入れる。
対象スプレッドシートには、その service account の `client_email` を編集者として追加する。

必要なら対象 Sheet を function の環境変数で変える。`functions/.env` は commit しない。

```bash
echo 'SHEET_URL=https://docs.google.com/spreadsheets/d/.../edit?gid=0#gid=0' >> functions/.env
```

現状の function は `SHEET_URL` 環境変数、未指定なら既定の 999 Sheet を使う。

## デプロイ

```bash
cd functions
ni
cd ..
nr deploy:api
```

`/api/**` は Firebase Hosting から `api` function に rewrite される。

## 使い方

初回だけ管理用 URL で開く。

```txt
https://<hosting-domain>/index.html?edit_token=<EDIT_TOKEN>
```

app は token を `localStorage` に保存し、URL から `edit_token` を削除する。
以降の保存リクエストは `Authorization: Bearer <token>` を付けて `/api/editor/words/:num` を呼ぶ。

token を持つブラウザでは、起動時に `/api/editor/words` から Sheet 最新値を読み、静的な
`data.json` の `numbers` に merge する。保存後も同じブラウザの画面状態は即時更新する。

token を持たない通常閲覧では、従来どおり deploy 時に生成された `data.json` を読む。
全員向けの静的データを更新したい場合は `nr deploy` または `nr deploy:api` で再 build/deploy する。

token が漏れた場合は `EDIT_TOKEN` secret を差し替えて function を再デプロイする。

## スキーマ共有メモ

このアプリでは、Sheet の列スキーマはアプリ全体で共有する契約として扱う。

- 列名を変えるときは、読み込み・保存・生成・可視化の全経路を同時に直す
- 派生列は Sheet の正準データとは分ける
- `w1` / `w2` のような生成列を編集対象に混ぜない
- 概念は `mono` 列へ寄せ、対象語には `#g` を付けて区別する
- `wh` / `wm` の候補列はそれぞれ 3 つまでに統一する
- `w1` は `wh1`、`w2` は `wm1` のように、左右を意味する接頭辞で統一する
- 列追加や統合は、移行スクリプトとバックフィルを前提にする
- UI の都合で列の意味を勝手に再解釈しない
- `pt` は物理削除ではなく、Sheet 上の自動入力式だけを消して空列として残す
