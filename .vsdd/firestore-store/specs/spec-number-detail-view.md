---
id: spec:number-detail-view
title: 番号単位の統合ビュー
coherence:
  depends_on:
    - spec:number-api
    - spec:app-data-source
---

# spec:number-detail-view

`docs/num-actions.md` の C (統合ビュー) / A (優先順位の変更) / B (語単位の移動) /
E (答え合わせ中の評価) / F (ラベルの付与) をアプリに入れる。

操作が 4 つの面に分散し、面ごとに保存先が違うのが現状の問題だった。
`numbers/{num}` が全部を持つようになったので、**1 番号の全情報を 1 画面に出し、
操作の口をそこに集める**。

## 入り口

999 タブで番号を選んでいる状態から入る。詳細パネルの**語そのものをタップ**すると、
その語の編集に入る (UI 案 D-2)。番号を打ち直させない。編集画面が単独で番号を
選べる必要はあるが、それは補助であって主たる導線ではない。

## Invariants

- 1 番号の全情報は 1 回の取得で揃う。面ごとに別の取得をしない。
- 候補の編集・並べ替え・追加・削除は `rep` と `ratings` を変えない。語を消しても
  評価は値 (`{k,w}`) として残り、その語を戻せばまた効く。
- 並べ替えは «語ごと別のスロットへ移す» ことである。画像 (`imageUrl`) と
  確定時点の語 (`confirmedFor`) は語に付いて回る。
- 保存が成功したときだけ画面 state を更新する (`console/rep-state.js` と同じ規約)。
  失敗した保存が画面上で成功したように見えてはならない。
- 語の移動で `rep` は移動先に付いてこない。かな・画像・主観評価は付いてくる。
  評価が付いてくるのは `{k,w}` の値で保存しているため (`docs/num-actions.md` §4 B)。
- 機械判定できるラベルは推薦として提示するだけで、自動では付けない。
- 未評価と `0` (普通) は別状態。答え合わせで何も押さなければ未評価のまま。
- 学習中の画面に `rankey` / `pt` を出さない。内訳が見えると出題の答えになる。

## Requirements

- REQ-NDV-001: WHEN 番号が選ばれる THE SYSTEM SHALL 語・かな・`rankey`・`pt`・代表・確定状態・主観評価・画像を 1 画面に表示する
- REQ-NDV-002: WHEN 候補をドラッグして並べ替える THE SYSTEM SHALL 語とかなを打ち直させずに順序を入れ替え、画像と確定時点の語を語に伴わせる
- REQ-NDV-003: WHEN 語 1 つを別の番号へ移す THE SYSTEM SHALL かな・画像・主観評価を伴って移し、移動元と移動先の `rep` を未設定にする
- REQ-NDV-004: IF 移動先の番号に空き枠が無い THEN THE SYSTEM SHALL 移動せず理由を示す
- REQ-NDV-005: WHEN 答え合わせで評価が押される THE SYSTEM SHALL `ratings` のみを更新し `rep` と確定状態を変更しない
- REQ-NDV-006: WHEN ラベルが機械判定できる THE SYSTEM SHALL 推薦として提示し、採用は人の操作を要求する
- REQ-NDV-007: IF 保存が失敗した THEN THE SYSTEM SHALL 画面 state を変更せず失敗を表示する
- REQ-NDV-008: WHILE 出題中である THE SYSTEM SHALL `rankey` と `pt` を表示しない
- REQ-NDV-009: WHEN 候補の語またはかなが編集される THE SYSTEM SHALL その場で保存し、`rep` と `ratings` を変更しない
- REQ-NDV-010: WHEN 候補が追加される THE SYSTEM SHALL 空きスロットに割り当て、空きが無ければ理由を示す
- REQ-NDV-011: WHEN 候補が削除される THE SYSTEM SHALL その枠だけを消し、当該語の主観評価を値として残す
- REQ-NDV-012: WHEN 999 タブで語がタップされる THE SYSTEM SHALL その番号の編集をその語にあわせて開き、番号の再入力を要求しない
