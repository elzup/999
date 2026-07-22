---
id: design:representative-store
title: 代表語選択ストア
coherence:
  depends_on: []
---

# design:representative-store

各番号の代表語は候補スロット名ではなく、読みと語の値 `{k,w}` で最大 2 件保存する。
原本の候補順が変わっても値が一致する現在スロットへ再解決し、消えた値は stale とする。

## Invariants

- 選択順は重複なし、最大 2 件である。
- 未保存時は `wh1, wm1, wh2, wm2, wh3, wm3` の優先順から最大 2 件を選ぶ。
- 保存済みの値と一致しない候補を別の語へ黙って置換しない。
- 候補がちょうど 1 件の場合だけ自動確定する。
- 保存更新は既存の store オブジェクトを破壊的変更しない。

## Implementation

- `src/rep-store.js`
- `src/data/word-rep.json`
