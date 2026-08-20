---
id: review:adversary-r1
title: 敵対的レビュー r1 (schema / derived / sheet-sync)
coherence:
  depends_on:
    - design:firestore-schema
    - design:derived-on-write
    - spec:sheet-to-db-sync
---

# review:adversary-r1

Builder の会話履歴を渡さない別コンテキストで実施。**OVERALL: FAIL**、26 件。
うち再現確認したものを記録する。

## 実行して再現した致命的欠陥

| ID | 内容 |
| --- | --- |
| ADV-03 | `isUnchanged` が `JSON.stringify` でキー順依存。Firestore はマップをソートして返すので、往復しただけで「変わった」と誤判定し**毎回 1000 件書き直す**。REQ-SYN-006 (冪等) が本番で偽 |
| ADV-05 | シートに同じ `num` の行が 2 つあると同一文書へ 2 書き込み。後勝ちで**片方が黙って消える**。件数の帳尻は合うので気付けない |
| ADV-06 | `buildNumberDoc` が既定で `rep: null, ratings: []` を出し、`validateNumberDoc` がそれを `{ok:true}` と認める。**消去が既定動作**で、最後の砦が消去を承認していた |
| ADV-15 | `mergeSlots` がシート行のスロットしか走査せず、DB にしか無いスロットを `imageUrl` ごと削除。**かなを空にした行が画像を吹き飛ばす** |
| ADV-16 | 「シートは画像 URL の列を持たない」というコメントが虚偽。`words.tsv` に `wh1Img` 等が実在する |
| ADV-09 | `derived` の不変条件「slots と rules のみから決まる」が実装と矛盾。`rankey` は `num` を見る。実データ 1940 件中 **20 件**で結果が変わる |

## 直したもの

- **spec の矛盾を先に解消** — derived の入力に `num` を明記 / `imageUrl` の所有者を画像パイプライン側と確定 / 「以外を削除しない」という逆さまの記述を「守るべきものの列挙」に修正
- `canonicalJson` を導入し、キー順非依存で比較 (ADV-03)
- 重複 `num` は衝突として報告し、**どちらも書かない** (ADV-05, REQ-SYN-007)
- `rep`/`ratings` は渡されたときだけ載せる。`assertPreserves` を書き込み直前の砦として追加 (ADV-06, REQ-FS-008/009)
- スロットは和集合でマージ (ADV-15)
- `computeDerived` は 3 桁の `num` が無ければ例外 (ADV-09, REQ-DRV-006)
- `validateNumberDoc` 自身が `derived` を拒否。`validateClientWrite` は分離をやめた (ADV-13)
- 配列要素の `null` で例外を投げず `error` を返す (ADV-11, REQ-FS-010)
- 値キーの区切りを制御文字にし NFC 正規化 (ADV-12)
- `slots` の形を検証 (ADV-14)
- `num` が数値でも中断しない (ADV-17, REQ-SYN-008)
- サイズ計算を `TextEncoder` + 係数に (ADV-18)
- `now` を必須に (ADV-25)
- rules: `request.auth != null` では Anonymous 認証や同プロジェクトの別利用者に辞書が渡る。`owners/{uid}` の存在確認に変更。`list` を禁止しチャンク経由を強制 (ADV-20)
- 死んだ `match /{document=**}` stanza を削除 (ADV-21)

## 未対応 (次段以降)

| ID | 内容 | 理由 |
| --- | --- | --- |
| ADV-01 | REQ-FS-007 の実装が無い | Firestore 接続そのものが 5〜7 の作業 |
| ADV-02 | `src/` のモジュールが `functions/` で読めない | ESM/CJS と TSV 読み込みの解決が必要。接続時に対処 |
| ADV-07 | 適用時の競合検出 | `expectedUpdatedAt` をプランに載せるところまで実装済み。実際の突き合わせは適用側 |
| ADV-19 | `rules/{table}` を編集しても派生値が変わらない | 規則表の読み込みを DB 経由にする改修が要る |
| ADV-22 | rules に自動検証が無い | emulator の Java 21 要件で未実行 |
| ADV-24 | property-based テストが無い | fast-check 未導入 |
