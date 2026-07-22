---
id: spec:tab-visibility
title: App Bar タブ表示設定
coherence:
  depends_on:
    - design:tab-registry
---

# spec:tab-visibility

## Requirements

- **REQ-TAB-001 (Ubiquitous):** THE SYSTEM SHALL App Bar に初期表示が有効なタブと
  現在選択中のタブを表示する。
- **REQ-TAB-002 (Event):** WHEN ユーザーが設定画面のトグルを操作する THE SYSTEM
  SHALL 新しい表示状態を不変更新し、`tabVisibility999` に永続化する。
- **REQ-TAB-003 (Unwanted):** IF 保存値が欠損、破損、または一部の ID のみを含む
  THEN THE SYSTEM SHALL 有効な boolean 値だけを採用し、残りを初期値で補完する。
- **REQ-TAB-004 (State):** WHILE `misc` がタブ表示設定に表示される THE SYSTEM SHALL
  そのトグルを無効化し、常に表示する。
- **REQ-TAB-005 (Event):** WHEN ユーザーが設定行をクリックするか Enter/Space を押す
  THE SYSTEM SHALL 対応するタブへ移動する。
- **REQ-TAB-006 (Event):** WHEN ユーザーが設定行内のトグルを操作する THE SYSTEM
  SHALL 表示状態だけを変更し、行のタブ移動を発火しない。

## Boundaries

- タブ ID は `VALID_TABS` に含まれる値だけを扱う。
- 非表示の現在タブは、別タブへ移動するまで App Bar に残して脱出経路を維持する。
