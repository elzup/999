#!/usr/bin/env bash
# 共有モジュールを functions/lib へ写す。
# spec: .vsdd/firestore-store/specs/spec-number-api.md
#
# Firebase は functions/ 配下しかアップロードしないので、src/ を直接 import できない。
# 手で二重管理すると必ずズレる (writeNumber の不変条件が片方だけ古くなるのが最悪) ため、
# 毎回まるごと作り直す生成物として扱う。functions/lib は gitignore 済み。
# functions/package.json が type:module なので、写した ESM はそのまま読める。
#
# 写す範囲は writeNumber の依存閉包そのもの。derived が rankey/scorer を、
# scorer が encoder/table を、table が data/*.tsv を読むのでそこまで含める。
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lib="$root/functions/lib"

rm -rf "$lib"
mkdir -p "$lib/firestore" "$lib/data"

for name in number-doc write derived console-writes db; do
  cp "$root/src/firestore/$name.js" "$lib/firestore/$name.js"
done

for name in rankey scorer encoder table; do
  cp "$root/src/$name.js" "$lib/$name.js"
done

# table.js が実行時に読む TSV だけ。words.tsv は配信データ側の経路なので含めない
for name in single_digit double_digit long_digit; do
  cp "$root/src/data/$name.tsv" "$lib/data/$name.tsv"
done

echo "functions/lib: $(find "$lib" -type f | wc -l | tr -d ' ') files"
