---
id: spec:lyrics-generation
title: FF・代表語歌詞生成
coherence:
  depends_on:
    - design:ff-data
    - design:representative-store
---

# spec:lyrics-generation

## Requirements

- **REQ-LYR-001 (Event):** WHEN 代表語歌詞を生成する THE SYSTEM SHALL 000-999 を昇順に
  100 件ずつ 10 ファイルへ分割し、全件版も生成する。
- **REQ-LYR-002 (Ubiquitous):** THE SYSTEM SHALL 各番号の解決済み代表 ① の読みを使い、
  読みが無い場合は `＿` を出力する。
- **REQ-LYR-003 (Ubiquitous):** THE SYSTEM SHALL 1 行を最大 4 読み、全角スペース区切りで
  出力する。
- **REQ-LYR-004 (Event):** WHEN FF 歌詞を生成する THE SYSTEM SHALL 256 読みを
  `NN+CC` と `NC+CN` の 2 ファイルへ重複なく分割する。
- **REQ-LYR-005 (Ubiquitous):** THE SYSTEM SHALL FF 一覧の合成読みと歌詞で同じ
  FF 読み生成ロジックを使用する。

## Outputs

- `lyrics/words_sheet00.txt` ... `lyrics/words_sheet09.txt`
- `lyrics/words_all.txt`
- `lyrics/ff_nn-cc.txt`
- `lyrics/ff_nc-cn.txt`
