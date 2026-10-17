# 画面レイアウト規約 (親指ファースト)

片手持ちで **画面の上半分に指を伸ばさなくてよい** ことを最優先にする。
触るものは全部下、読むだけのものが上。

## 枠: `Screen` (app/components/Screen.tsx)

全画面 (タブの中身・テスト画面) は必ず `Screen` を root にする。

```
┌ main   読むだけ。中身は下端に寄り、はみ出したら上へスクロール (初期位置は下端)
├ panel  Detail Panel (NumDetailPanel / CardDetailPanel) + 閉じる
├ dock   操作: DockBar (タイトル・終了) / DockRow (設定・切り替え) /
│        TestFeatureList (テスト開始) / TestPad・TestNavBar (入力)
├ サブタブ切り替え (SubTabGroup が描く)
└ Tab Bar (.bottom-bar)
```

```tsx
<Screen
  isTest={mode !== 'view'}       // テスト中は Tab Bar ごと覆う全画面
  main={<div class="num-grid grid-up">…</div>}
  panel={selected ? <><NumDetailPanel d={selected} /><div class="panel-foot">…閉じる…</div></> : null}
  dock={<>
    <DockBar title="π" sub="1000桁"><QuitButton onClick={quit} /></DockBar>
    <DockRow>…切り替えボタン…</DockRow>
    <TestFeatureList features={…} />
  </>}
/>
```

## MUST

- **位置は DOM 順で決める。CSS の `order` で動かさない。** 以前 `order` で個別クラスを
  下へ送ったら、列挙漏れや flex でない親で上に残るものが出た (f594f15 の失敗)。
- ボタン・トグル・入力欄・切り替えは `panel` か `dock` に入れる。`main` に置いてよいのは
  一覧の要素そのもの (セルのタップ、行の ○/×) だけ。
- **左上・右上にボタンを置かない。** 終了・閉じる・戻る は `DockBar` の右端 (`QuitButton`)
  か `panel-foot` の `btn-wide`。
- テスト開始ボタンは `TestFeatureList` だけで描く (見た目は 1 種類)。独自の開始ボタンを作らない。
  見出しで分けたいときは `TestFeatureSection`。
- 一覧・グリッドは **下から上へ** 並べる。先頭要素が下端 (親指側)。
  - 縦の一覧・節の並び: `.stack-up` (間隔は `--stack-gap`)
  - 列数固定のグリッド: 既存のグリッドクラスに `.grid-up` を足す (列数 `--cols`、間隔 `--gap`)。
    行を占有する見出しは `.grid-full` (`.num-band` / `.card-suit-header` は自動)。
- Detail Panel の ★ / 編集 は NumDetailPanel が自分で出す (NumberContext から取る)。
  呼び出し側で `bookmarks` / `onToggleBm` / `onEdit` を渡す必要は無い (挙動を変えたいときだけ渡す)。
- ボトムシート (RecordPanel / ReviewPanel) は見出しと 閉じる を **シートの最下段** に置く。
- サブタブは `SubTabGroup` を使う。`.sub-tab-switch` を自前で書かない。
- root にインラインの `display:flex; flexDirection:column; flex:1; …` を書かない (`Screen` が持つ)。
