# Knowledge tools VCSDD

2026-07 に追加したタブ表示設定、FF 練習、代表語選択コンソール、歌詞生成を
Lean VCSDD で監査するための成果物です。

R5 で 5 dimensions PASS、material finding 0 件へ収束済みです。

- `specs/`: EARS 要件と CEG ノード
- `tests/`: CEG consistency gate
- `ceg.mjs`: 依存グラフ検証ツール

## Commands

```bash
node .vsdd/knowledge-tools/ceg.mjs validate --specs .vsdd/knowledge-tools/specs
node .vsdd/knowledge-tools/ceg.mjs graph --specs .vsdd/knowledge-tools/specs
node .vsdd/knowledge-tools/ceg.mjs topo --specs .vsdd/knowledge-tools/specs
nr test
nr build
nlx tsc --noEmit
```
