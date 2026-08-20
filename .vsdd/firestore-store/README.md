# firestore-store — 正本を Firestore に移す

現状の問題（この作業中に実際に踏んだもの）と、第 1 段階で何を解決するか。

| 問題 | 現状 | 第1段階後 |
| --- | --- | --- |
| `word-rep.json` の喪失 | ローカル 1 箇所のみ。git 操作で数件失い復元不可だった | DB にあり、写しが増える |
| 変更にビルドが要る | 語を 1 つ直すたび `sync:all` → `deploy` | DB 直読みで再デプロイ不要 |
| 派生値の作り直し忘れ | `lyrics` / シートの `rankey` が何度も古くなった | 書き込みトリガで自動再計算 |
| `push` が列を消す | 21 列で全上書きし `rankey`/`check` が消える | 同期を片方向にし、DB 側項目を保持 |

**第 1 段階のスコープ外**（第 2 段階以降）:
DB → シートの書き戻し、競合解決、削除の伝播、ローカル JSON の廃止。

## 実装順（`ceg.mjs topo` の出力そのまま）

1. `design:firestore-schema` — スキーマとセキュリティルール
2. `design:derived-on-write` — pt / rankey の自動再計算
3. `spec:sheet-to-db-sync` — シート → DB 片方向同期
4. `design:read-bundles` — 読み込み用チャンク
5. `spec:console-writes` — コンソールの書き込み先を DB に
6. `spec:rep-migration` — `word-rep.json` の移行
7. `spec:app-data-source` — アプリの取得経路を DB に

## 実接続の手順

コード側は揃っている。残るのはクラウドリソースの作成だけ。

```bash
# 1. Firestore データベースを作る
#    ロケーションは asia-northeast1 (Functions と同じ)。後から変更できない
firebase firestore:databases:create "(default)" --location asia-northeast1

# 2. 認証 (どちらか)
gcloud auth application-default login
# または FIRESTORE_KEY=<service account json>

# 3. セキュリティルールを反映
nr db:rules

# 4. owners/<uid> を作る (rules が参照する所有者名簿)
#    これが無いと誰も読めない

# 5. 差分を見てから書く
nr db:offline  # DB に繋がずプランだけ出す (認証前に確認できる)
nr db:plan     # dry-run。既存 DB と突き合わせて差分を出す
nr db:push     # 実際に書き込む
```

`db:plan` / `db:push` は 3 段を順に実行する。`--only sync|migrate|bundles` で個別に。

| 段 | 内容 |
| --- | --- |
| sync | シート (words.tsv) -> `numbers/{num}`。rep/ratings/imageUrl は保持 |
| migrate | `word-rep.json` -> `numbers/{num}`。件数が合わなければ中止 |
| bundles | `numbers/*` -> `bundles/chunk_0..9`。全件ロードを 10 read に |

実データでの `nr db:offline` の結果 (2026-08-21):

```
[sync]     書込対象 1000 / 変更なし 0
[migrate]  書込対象 29 / 件数照合 OK
[bundles]  10 個 / 最大 35 KB
```

**既定は dry-run。** この移行の目的が「失うと復元できないデータを守ること」なので、
書き込む前に必ず件数を目視できるようにしている。

## 踏んだ罠

**`firebase deploy --only firestore:rules` は DB を勝手に作る。**
API 有効化のつもりで打つと、`--location` を渡す前に**既定ロケーション (nam5) で
データベースが作られる**。ロケーションは後から変更できないので、作り直すには
一度削除するしかない。削除後は **290 秒のクールダウン**があり、その間は同じ
データベース ID を再作成できない。

順序は必ず「作成 → rules デプロイ」にすること。

**ADC は gcloud のログインアカウントを指す。**
別プロジェクトのアカウントでログインしていると、API が有効でも
`PERMISSION_DENIED` になる。`FIRESTORE_KEY` に `roles/datastore.user` を持つ
サービスアカウント鍵を渡すか、対象プロジェクトの権限があるアカウントで
`gcloud auth application-default login` し直す。

## コマンド

```bash
CEG=.vsdd/knowledge-tools/ceg.mjs
SPECS=.vsdd/firestore-store/specs

node $CEG validate --specs $SPECS   # 循環・欠落依存の検査
node $CEG topo     --specs $SPECS   # 実装順
node $CEG impact design:firestore-schema --specs $SPECS   # 変更時の波及
node --test .vsdd/firestore-store/tests/                  # CEG ゲート
```

## 前提（実測）

- 配信データ 807 KB / 1000 件（1 件あたり 826 B）
- 100 件チャンク 1 個あたり 80 KB（Firestore のドキュメント上限 1 MiB に対し余裕）
- 全件ロード 10 read → 無料枠 50,000 read/日 で 1 日 5,000 ロードまで
