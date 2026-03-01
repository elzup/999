# 999

かな → 3桁数字 (100-999) エンコーディングシステム

## Scoring Rules

### Digit Mapping

Single / Double / Long の各テーブルとティア分類。

![Digit Mapping](docs/rules-map.png)

### Rule Type Analysis

Token Classification Flow と Position × Token Type マトリクス。

![Rule Type Analysis](docs/rules-sp.png)

### Decomposition Patterns

3桁を作る代表的なかな構成パターンとスコアレンジ。

![Decomposition Patterns](docs/rules-decomposite.png)

## Scripts

```bash
nr sync        # Google Sheet からデータ同期
nr score       # 単語スコアリング
nr check:kana  # かなカバレッジチェック
nr check:digits # 桁数チェック
nr check:errors # エラーチェック
nr viz         # スコアリングルール可視化HTML生成
nr test        # テスト実行
```

## Docs

- [LLM プロンプト](docs/llm-prompt.md) - LLM 用の桁数判定プロンプト
