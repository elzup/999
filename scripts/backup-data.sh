#!/usr/bin/env bash
# 画像キュレーションデータ (gitignore 分) を別repo elzup/999-data へバックアップする。
set -euo pipefail

PARENT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
REPO=$(cd "$PARENT/.." && pwd -P)
SRC="$REPO/src/data"
DEST=$(cd "$REPO/.." && pwd -P)/999-data
GIT=/opt/homebrew/bin/git

if [ ! -d "$DEST/.git" ]; then
  echo "バックアップ先 $DEST がありません。先に repo を用意してください。" >&2
  exit 1
fi

mkdir -p "$DEST/data"
for f in word-images.json word-images-keep.json word-images.candidates.json \
  word-images-redo.json tags.json words.tsv; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$DEST/data/$f"
done

cd "$DEST"
"$GIT" add -A
if "$GIT" diff --cached --quiet; then
  echo "変更なし (バックアップ不要)"
  exit 0
fi
ts=$(date '+%Y-%m-%d %H:%M')
"$GIT" -c core.hooksPath=/dev/null commit -q -m "backup: $ts"
"$GIT" push -q origin main
echo "backup pushed: $ts"
