# タスク仕様: w1 / w2 画像の取得・アップロード

外部タスク（別スクリプト / 別エージェント）が、各数字 (000–999) の語 `w1` / `w2` に対応する
画像を取得し、**公開ストレージにアップロードして、永続公開 URL を repo に書き戻す**ための契約。

このアプリ本体は画像を「URL で参照するだけ」。画像バイトは repo に置かない。

---

## 1. ストレージ（アップロード先）

| 項目          | 値                                                                           |
| ------------- | ---------------------------------------------------------------------------- |
| バックエンド  | Google Cloud Storage（Firebase プロジェクト `anoz-memosupo` 配下）           |
| バケット      | `anoz-memosupo-words`                                                        |
| リージョン    | `asia-northeast1`（東京）                                                    |
| アクセス      | uniform bucket-level access / **public read**（`allUsers` = `objectViewer`） |
| 公開 URL 形式 | `https://storage.googleapis.com/anoz-memosupo-words/<object-path>`           |

> 注: バケット・SA の払い出しは別途インフラ手順（リポジトリ管理者が `gcloud` で実行）。
> 本タスクはバケットが存在し、書き込み権限が付与済みであることを前提とする。

---

## 2. アップロード権限

- **read = 公開**（誰でも GET 可、トークン不要）
- **write = 専用サービスアカウントのみ**
  - SA: `words-uploader@anoz-memosupo.iam.gserviceaccount.com`
  - 権限スコープ: **このバケットにだけ** `roles/storage.objectAdmin`（他リソースには触れない）
  - クライアント / ブラウザからの直接書き込みは不可
- 認証方法: SA の鍵（JSON）を環境変数で渡す
  - `GOOGLE_APPLICATION_CREDENTIALS=/path/to/words-uploader-key.json`
  - 鍵は **repo にコミットしない**（`.gitignore` 済みの場所 or 環境変数のみ）

---

## 3. パスルール（content-addressed hash・情報なし）

```
words/<hash>.webp
```

- `hash` = `sha256(画像バイト列)` の **先頭 20 hex 文字**
- content-addressed なので:
  - 同一画像は同一キー → **自動 dedup**
  - 再実行は同じパスへ上書き → **冪等**（重複アップロードが起きない）
  - 中身が変われば別キーになるだけ。num / 語などの情報はパスに含めない
- 拡張子は常に `.webp`（取得画像は webp に変換してからアップロード）

### アップロード時メタデータ

| ヘッダ          | 値                                    |
| --------------- | ------------------------------------- |
| `Content-Type`  | `image/webp`                          |
| `Cache-Control` | `public, max-age=31536000, immutable` |

content-hash で不変なので恒久キャッシュにできる。

---

## 4. 結果の書き込み先（永続公開 URL）

`src/data/word-images.json` に **num をキー**として書き込む。

```jsonc
{
  "042": {
    "w1": "https://storage.googleapis.com/anoz-memosupo-words/words/3f9a1c0b8e2d4a6f5b71.webp",
    "w2": "https://storage.googleapis.com/anoz-memosupo-words/words/a18c77de90b3f201cc54.webp"
  },
  "137": {
    "w1": "https://storage.googleapis.com/anoz-memosupo-words/words/0b2e...c9.webp"
  }
}
```

ルール:

- キーは 3 桁ゼロ埋め文字列（`"042"`）。slot は `"w1"` / `"w2"`。
- 値は **完全な公開 URL**（`https://storage.googleapis.com/...`）。
- 画像が無い num / slot はキーごと省略（`null` を入れない）。
- 既存エントリは **マージ更新**（全消ししない）。再実行で URL が変わらなければ no-op。
- このファイルは `words.tsv` とは独立（words.tsv は daily sync でシートから上書きされるため、
  画像メタはここに分離して保持する）。

> アプリ側は `app/data/parse.ts` でこの JSON を num マージして view 機能に渡す（別 PR で実装）。

---

## 5. 1 件あたりの処理フロー

入力: `num`, `slot`(`w1`|`w2`), 語の文字列（`words.tsv` の該当列）

1. 語から画像を取得（取得元・生成方法はタスク実装側の責務）
2. webp に変換
3. `hash = sha256(bytes)[:20hex]` を計算
4. `gs://anoz-memosupo-words/words/<hash>.webp` に存在しなければアップロード
   （Content-Type / Cache-Control を付与。存在すれば skip = 冪等）
5. 公開 URL `https://storage.googleapis.com/anoz-memosupo-words/words/<hash>.webp` を組み立て
6. `src/data/word-images.json` の `[num][slot]` に URL を書き込み（マージ保存）

---

## 6. 冪等性・再実行

- 同じ画像 → 同じ hash → 同じパス → 上書き or skip。何度実行しても安全。
- `word-images.json` は常にマージ。途中失敗しても既存分は壊れない。
- 全体再生成も、部分更新（特定 num だけ）も両対応にする。
