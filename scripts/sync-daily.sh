#!/usr/bin/env bash
# 999 辞書 daily 同期 (launchd から実行)
# スプレッドシートを export して src/data/words.tsv を更新するだけ (deploy はしない)
set -euo pipefail

REPO="/Users/hiro/.ghq/github.com/elzup/999"
NODE="/Users/hiro/.n/bin/node"

cd "$REPO"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] sync start"
"$NODE" src/sync-sheet.js
echo "[$(date '+%Y-%m-%d %H:%M:%S')] sync done"
