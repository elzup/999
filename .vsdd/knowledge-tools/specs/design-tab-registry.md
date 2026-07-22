---
id: design:tab-registry
title: App Bar タブレジストリ
coherence:
  depends_on: []
---

# design:tab-registry

アプリの全タブは `TabId`、表示ラベル、アイコン、初期表示状態を同じ ID 集合で
管理する。設定タブ `misc` は復旧経路なので常時表示する。

## Invariants

- `VALID_TABS` の各 ID に表示ラベル、アイコン、初期表示状態が存在する。
- 保存値に新しいタブ ID が無い場合は、その ID の初期値で補完する。
- 保存値に現在存在しない ID があっても、アプリのタブ集合には混入させない。

## Implementation

- `app/data/constants.ts`
- `app/data/storage.ts`
- `app/App.tsx`
