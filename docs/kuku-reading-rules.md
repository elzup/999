# 九九（ABxC=XYZ）読み・歌詞生成ルール

二桁×一桁の掛け算を語呂で丸暗記するための、**読み（語呂）と歌詞の生成ルール**。
このリポジトリの九九タブ（`app/components/KukuTab.tsx`）・歌詞（`kuku/lyrics_*.txt`）・読みテストが依存する。

> **正本の所在**
> - 記法・対象範囲・難易度分類の一次定義: `elzup/99x9` リポジトリの `abxc/RULES.md` と `abxc/terms.csv`（source of truth）。
> - かな対応表（単digit core/sub、2桁・長音）: このリポの `src/table.js`（`src/data/*.tsv` を読む）。
> - 999 側の生成物: `kuku/scripts/*.py`（読み生成）+ `kuku/scripts/gen_prob.mjs`（左辺読み付与）→ `app/data/kuku.json`。
>
> **⚠️ ルールから外れないこと。** 読みは下記の規則で機械的に決まる。個別の思いつきで
> `kuku.json` の値を書き換えず、規則側（table.js / スクリプト）を直して再生成する。

---

## 1. 記法 `ABxC=XYZ`

- `AB` = 被乗数（2桁）。十の位 `A`、一の位 `B`。
- `C` = 乗数（1桁）。
- `XYZ` = 積を 3桁ゼロ詰め（例 `12×2=024`、`99×9=891`）。

---

## 2. 読みの構成（★このアプリの正準）

九九の読みは **左辺（問題）読み** と **右辺（答え）読み** を連結して作る。

```
yomi = 左辺読み(AB,C) + xyz_read(XYZ)
     = ab_read(AB) + 「ん」 + core[C] + xyz_read(XYZ)
```

### 2-1. 左辺（問題）読み ＝ 読みテストの対象

```
prob(AB, C) = ab_read(AB) + 「ん」 + core[C]
```

形は **〇〇ん〇** または **〇ん〇**。

- `ab_read(AB)` = **2桁優先**。`AB` の2桁読みが `src/data/double_digit.tsv` にあればそれ、
  無ければ `core[A] + core[B]`。**2桁は前半の被乗数 AB にのみ適用**する（乗数 C は単digit）。
- 連結子 `「ん」` は 被乗数と乗数の固定セパレータ。
- `core[C]` = 乗数 `C` の core 単digit読み。

| 例 | AB | C | ab_read | +ん | core[C] | prob |
|---|---|---|---|---|---|---|
| `44×4` | 44 | 4 | しょ | ん | し | **しょんし** |
| `51×2` | 51 | 2 | こい(=こ+い, 2桁無し) | ん | に | **こいんに** |
| `74×6` | 74 | 6 | にょ | ん | ろ | **にょんろ** |
| `99×9` | 99 | 9 | け | ん | き | **けんき**（〇ん〇） |
| `25×4` | 25 | 4 | にこ(=に+こ) | ん | し | **にこんし** |

> `44×4` の左辺は **しょんし**（`しょ`=44 の2桁 + `し`=core[4]）。
> ※ 数字 `444` を「答え」として読む場合は 999 辞書の高スコア語（例 庄司=`しょじ`）を使い、別物。

### 2-2. 右辺（答え）読み

```
xyz_read(XYZ) = 999辞書の高スコア語(word_best[XYZ])
              ↳ 無ければ core[百] + dbl(十, 一)
```

`word_best` は `public/data.json` の `w1k/w2k` のうち `w1Score/w2Score` が高い方
（`kuku/scripts/gen_readings.py`）。歌詞の全文はこの右辺まで含んだ `yomi`。

---

## 3. かな対応表（`src/table.js`）

### core / sub 単digit

| digit | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| **core** | ん | い | に | さ | し | こ | ろ | な | は | き |
| sub | お | ひ | ふ | み | よ | ら | る | う | や | く |

- 促音「っ」は**単独分解禁止**。直後の文字とセットで1かたまり（`しっ` を `し+っ` に割らない）。

### 2桁読み（抜粋 / `src/data/double_digit.tsv`）

`12→てぃ`, `44→しょ`, `74→にょ`(第一候補), `99→け`。テーブルに無い2桁は `core[A]+core[B]`。

---

## 4. 対象範囲（暗記が必要なものだけ）

| 軸 | 条件 |
|---|---|
| 被乗数 AB | 12–99 かつ 一の位 `B ≠ 0` かつ `AB ≠ 11` |
| 乗数 C | `C ≥ 2` |

被乗数80通り × 乗数8通り = **640件**。うち繰り上がり0の `ji` 26件を除外し、**対象614件**。

**除外（丸暗記不要）**: `B=0`（末尾0）/ `AB=11`（ゾロ目）/ `C=1`（恒等）/ 1桁九九（既習）。

---

## 5. 難易度分類（筆算の繰り上がり）

`AB×C` を桁分解した部分積 `DE=B×C`、`FG=A×C` の4値で全属性が決まる。

```
 A B
×  C
-----
 D E   ← B×C
F G    ← A×C（1桁左）
-----
X Y Z
```

- `I`/`i` = 一の位 `B×C` の繰り上がり `D≥1` 有無
- `J`/`j` = 十の位 `A×C` の繰り上がり `F≥1` 有無（＝百の位が立つ）
- `+` = 足し算の繰り上がり `D+G≥10`（I パターンでのみ発生）
- `·E0` = `E=0`（答え一の位0）、`·G0` = `G=0`（`A×C` 末尾0）

ラベル = `(J/j)(I/i)[+][·E0][·G0]`（大文字=繰り上がりアリ）。

### 3ティア（歌詞の3分割と一致）

| ティア | 件数 | 内容 |
|---|---|---|
| ex（除外） | 26 | `ji`（繰り上がり0） |
| **易** | 244 | 足し算なし系 + `jI` 系 + `JI·E0`（答え一の位0で楽） |
| **中** | 242 | `JI`（両位・足し算あり・`E≠0`・非+）単一クラス |
| **難** | 128 | 足し算が繰り上がる `+` |

13分類の内訳・件数は `abxc/RULES.md` §3 を参照。
判定例: `67×7` → A×C=42(**J**)・B×C=49(**I**)・E=9≠0・D+G=6<10 → `JI`（中）。

---

## 6. 歌詞フォーマット（`kuku/scripts/gen_lyrics.py`）

- `ex`（除外群）は歌詞に含めない。
- 1行 = 4読み、全角スペース `　` 区切り。
- 出力: `lyrics_tier1_easy.txt` / `lyrics_tier2_mid.txt` / `lyrics_tier3_hard.txt`。
- 式一覧: `tier1_easy.txt` 等（クラス見出し `## <label>` 付き）。

---

## 7. 生成パイプライン（再生成手順）

| スクリプト | 役割 |
|---|---|
| `kuku/scripts/extract_rules.mjs` | `src/table.js` から `singleByDigit` / `doubleMatrix` を抽出 → `rules.json` |
| `kuku/scripts/gen_readings.py` | `terms.csv` × `data.json` × `rules.json` → `kuku/readings.csv` |
| `kuku/scripts/gen_kuku_json.py` | `readings.csv` → `app/data/kuku.json`（tier/expr/label/yomi） |
| `kuku/scripts/gen_prob.mjs` | `kuku.json` に左辺読み `prob` を付与（yomi 等は不変更・冪等） |
| `kuku/scripts/gen_lyrics.py` | `readings.csv` → 歌詞・式一覧 txt |

`app/data/kuku.json` の各項目: `{ tier, expr, label, yomi, prob }`。
`prob` が読みテストの正解（左辺読み）。

---

## 8. 読みテスト（共有コンポーネント構成）

- 出題: 左辺 `AB×C` を提示 → その読み `prob` を **4択**から選ぶ。回答で即フィードバック→自動送り。
- 誤答: 同 tier の他問の `prob` から採用（同文字数を優先）。

| 層 | 実体 | 役割 |
|---|---|---|
| 出題ロジック(特化) | `app/lib/kukuQuiz.ts` | 左辺読み・誤答生成（`app/__tests__/kukuQuiz.test.ts`） |
| クイズ画面(共有) | `app/components/ChoiceQuiz.tsx` | 4択UI・採点・自動送り・振り返り集計 |
| 記録エンジン(共有) | `app/lib/useQuizRecords.ts` | スコア履歴の永続化（`kuku999`） |
| 記録/振り返りUI(共有) | `RecordPanel` / `ReviewPanel` | 他テストと共通 |

`KukuTab` は出題(特化)を作って共有部品に渡すだけ。CSS も `.cm-*` / `.test-screen` を流用。
