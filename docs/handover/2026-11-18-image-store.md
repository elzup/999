# 引き継ぎ: 画像データの Firestore 化と web 版 console (2026-11-18)

Mac が使えなくなるため、クラウドの Claude Code (claude.ai/code) で続けるためのメモ。
Mac の `.metarc/` (作業ログ・決定) と Claude のメモリはクラウドに無いので、要点をここに写す。

## 済んだこと (main に入っている)

- 画像データ (採用画像・確定・撮り直しの印・検索候補) の正本は Firestore `imageSlots` (1 枠 1 文書、2210 件)。
  spec: `.vsdd/firestore-store/specs/spec-image-store.md`。PR #50 / #51
- Mac の `src/data/word-images*.json` は cache。`src/images/image-sync.js` が前後で同期する
- web 版 console (`https://anoz-memosupo.web.app/console/`) は `functions/console-route.js` が `imageSlots` を直接読み書き。確定と撮り直しの印は付けられる。本番にデプロイ済み

## このブランチ `web-redo` でやりかけのこと (段階 5)

目的: **スマホの web 版 console から撮り直し (画像の取得) まで完結させる**。

済み (テスト 781 件は通る):

- `src/images/uploader.js`: バケットを渡すとアップロードできる部品 (`createUploader(getBucket)`)。`upload.js` はこれを使う
- `src/images/fetch-one.js`: 検索 → DL → webp → アップロードを 1 つに (`fetchBySearch` / `recropTop` / `rejectedUrlsOf`)。`direct.js` も使う

残り:

1. `src/images/slot-docs.js` に `applyImage(doc, {id, slot, image, candidate, now})` (replaceImage で history を残し、redo を消し、updatedAt を付ける)
2. `src/images/slot-store.js` の `setMark` を一般化した `update(id, slot, fn)` を足す (transaction)
3. `functions/console-route.js` に経路を足す。取得は `fetcher` を引数で受け取る (テストのため)
   - `POST /console/redo-now {id,slot}`: 語は焼いた state の `target[slot]`。ロック中は 409。避ける URL は `rejectedUrlsOf(doc)`。クエリは `buildSearchWord(word)` (`src/images/query.js`)。応答は `{ok, image}` (Mac の server.js と同じ形)
   - `POST /console/search-custom {id,slot,query}`
   - `POST /console/set-image {id,slot,image}`: 2 択で «今までの方» に戻す用。**image.hash が今の画像か history にあるときだけ**受け付ける
   - `POST /console/recrop {id,slot}`
4. `functions/index.js`: `firebase-admin/storage` の `getStorage().bucket(BUCKET)` で uploader を作って渡す。`api` に `memory: '1GiB'`, `timeoutSeconds: 120` (sharp と DL 待ちのため)
5. `scripts/sync-functions-lib.sh` で `functions/lib/images/` に search / ddg / bing / download / process / query / uploader / fetch-one も写す。`functions/package.json` に `sharp` (`^0.35.1`) を足す (`cd functions && npm install`)
6. `console/app.js`: `redoNow` / `customSearch` / `showChooser` の `fetch('/api/...')` を `postJson(\`${API}/...\`)` に (web では認証ヘッダが要る)。`webActionsEl`に取り直し (refresh) と自由検索 (pencil) のボタンを足す (Mac 版の`actionsEl` と同じ並び)
7. テスト: `functions/__tests__/console-route.test.js` に redo-now / set-image を足す (fetcher はモック)

その後 (段階 6): 1 枠に候補を複数出して選ぶチューザー。**UI は先に ui-option-preview で案を出して選んでもらってから作る** (`showChooser` / `.slot.is-choosing` / `.choose-opt` の拡張)。

## クラウドでできないこと

- **デプロイ** (`nr deploy` は Firebase の認証が手元の Mac にしか無い)。Function の変更は main に入れても本番には出ない。画面 (`console/`) は main に入れれば CI が Hosting に出す
- Firestore・GCS・シートへの接続 (鍵と `.envrc` が無い)。確認はテスト (モック) で行う
- `src/data/` の私的データ (words.tsv など) が無い

## 決まっていること (ユーザーの方針)

- 方針が決まった作業は段階ごとに y/n を聞かずに最後まで進める。聞くのは答えで作るものが変わる設計判断だけ
- UI の見た目を変えるときは先に案を出して選んでもらう (ui-option-preview)
- 999 は PR を作ったら自分でマージしてよい。DB / シートへの書き込みは別 (確認を取る)
- 画像 console は web 版 1 つに寄せる。Mac の `console/server.js` は web で同じことができ次第退役 (D-0087)。一括で設定する画面そのものは残す (アプリに混ぜない)
- 画像系スクリプトを «挙動確認» で実行しない (未知のフラグでも本処理が走る)
- JS はセミコロン無し・シングルクォート (prettier)。応答は日本語
