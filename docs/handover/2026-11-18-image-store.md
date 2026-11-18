# 引き継ぎ: 画像データの Firestore 化と web 版 console (2026-11-18)

Mac が使えなくなるため、クラウドの Claude Code (claude.ai/code) で続けるためのメモ。
Mac の `.metarc/` (作業ログ・決定) と Claude のメモリはクラウドに無いので、要点をここに写す。

## 済んだこと (main に入っている)

- 画像データ (採用画像・確定・撮り直しの印・検索候補) の正本は Firestore `imageSlots` (1 枠 1 文書、2210 件)。
  spec: `.vsdd/firestore-store/specs/spec-image-store.md`。PR #50 / #51
- Mac の `src/data/word-images*.json` は cache。`src/images/image-sync.js` が前後で同期する
- web 版 console (`https://anoz-memosupo.web.app/console/`) は `functions/console-route.js` が `imageSlots` を直接読み書き。確定と撮り直しの印は付けられる。本番にデプロイ済み

## 段階 5: web 版 console から取り直しまで (web-redo ブランチ。済み)

スマホの web 版 console から、取り直し (画像の取得) まで完結させる。

- `src/images/uploader.js` (バケットを渡すとアップロード) と `src/images/fetch-one.js` (検索 → DL → webp → アップロード) を Mac と Function で共用
- `slot-docs.js` に `applyImage` (history を残し、redo を消し、updatedAt を付ける。ロック中は断る) と `rejectedUrlsOf`、`slot-store.js` に `update(id, slot, fn)` (transaction)
- `functions/console-route.js` に `redo-now` / `search-custom` / `recrop` / `set-image`。取得は transaction の外で済ませ、書くときにロックを見直す。`set-image` は今の画像か history にある画像だけに戻せる
- `functions/index.js`: `firebase-admin/storage` のバケットで uploader を作る。`api` に `memory: '1GiB'`, `timeoutSeconds: 120`。`functions/package.json` に `sharp`
- `console/app.js`: 取り直しの呼び出しを `postJson` で `${API}/...` に送る (web では認証ヘッダが要る)。web でも Mac と同じボタン (確定・切り抜き・取り直し・自由検索) を出す。Function が `canFetch` を返さない間は今までの印だけの画面
- テスト: `functions/__tests__/console-route.test.js` (fetcher はモック)

**本番に効かせるには Mac で `nr deploy` が要る** (Function はクラウドから出せない)。あわせて Function の実行用サービスアカウントに、バケット `anoz-memosupo-words` への書き込み権限 (Storage オブジェクト作成者) があるか確かめる。
Hosting から Function への転送は 60 秒で切れるので、検索と DL が遅い語では失敗しうる (失敗は画面のボタンに理由が出る)。

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
