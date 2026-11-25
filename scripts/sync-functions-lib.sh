#!/usr/bin/env bash
# 共有モジュールを functions/lib へ写す。
# spec: .vsdd/firestore-store/specs/spec-number-api.md
#
# Firebase は functions/ 配下しかアップロードしないので、src/ を直接 import できない。
# 手で二重管理すると必ずズレる (writeNumber の不変条件が片方だけ古くなるのが最悪) ため、
# 毎回まるごと作り直す生成物として扱う。functions/lib は gitignore 済み。
# functions/package.json が type:module なので、写した ESM はそのまま読める。
#
# 写す範囲は writeNumber の依存閉包と、シート双方向同期 (sheet-bisync*) の一式。
# 前者について:derived が rankey/scorer を、
# scorer が encoder/table を、table が data/*.tsv を読むのでそこまで含める。
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lib="$root/functions/lib"

rm -rf "$lib"
mkdir -p "$lib/firestore" "$lib/data" "$lib/images"

for name in number-doc write derived console-writes db \
  sheet-bisync sheet-bisync-run sheet-io bisync-store sync-status fingerprint tag-names app-entry; do
  cp "$root/src/firestore/$name.js" "$lib/firestore/$name.js"
done

# sheet-layout は sheet-bisync がスロットの並びを引く。kana-notation は encoder が記法 [す] を読む。
# words は app-entry が配信データの 1 件を組み立てる (/app/data に DB の語を重ねる)
# date-keys は images/targets が日付の対象を見分けるのに使う
for name in rankey scorer encoder table rule-tsv sheet-layout kana-notation words date-keys; do
  cp "$root/src/$name.js" "$lib/$name.js"
done

# web 版の画像コンソール (console-route.js / index.js が読む)。印と、その場の取り直し (検索 → DL → webp → GCS)
# targets / tag-variants / live-targets は /console/state に DB の最新の語を重ねるのに使う
# slot-moves は番号の語を並べ替え・移動したときに画像を語に付いて回らせる (/numbers/:num の slots)
for name in slot-docs slot-store uploader fetch-one search ddg bing download process query \
  targets tag-variants live-targets slot-moves; do
  cp "$root/src/images/$name.js" "$lib/images/$name.js"
done

# table.js が実行時に読む TSV だけ。words.tsv は配信データ側の経路なので含めない
for name in single_digit double_digit long_digit; do
  cp "$root/src/data/$name.tsv" "$lib/data/$name.tsv"
done

echo "functions/lib: $(find "$lib" -type f | wc -l | tr -d ' ') files"
