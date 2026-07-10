import csv
SRC = "/Users/hiro/.ghq/github.com/elzup/999/kuku/readings.csv"
OUTDIR = "/Users/hiro/.ghq/github.com/elzup/999/kuku"
ZW = "　"  # 全角スペース

rows = list(csv.DictReader(open(SRC)))
names = {'easy': '1_easy', 'mid': '2_mid', 'hard': '3_hard'}

# 歌詞: 4読み/行, 全角スペース区切り, ex(ji)除外
lyr = {'easy': [], 'mid': [], 'hard': []}
# 式リスト: クラス見出し付き, ex除外
lst = {'easy': [], 'mid': [], 'hard': []}
for r in rows:
    if r['tier'] == 'ex':
        continue
    lyr[r['tier']].append(r['yomi'])
    lst[r['tier']].append((r['label'], r['expr']))

for tier, yomis in lyr.items():
    p = f"{OUTDIR}/lyrics_tier{names[tier]}.txt"
    lines = [ZW.join(yomis[i:i + 4]) for i in range(0, len(yomis), 4)]
    open(p, 'w').write('\n'.join(lines) + '\n')
    print(f"lyrics_tier{names[tier]}.txt : {len(yomis)}読み / {len(lines)}行")

for tier, items in lst.items():
    p = f"{OUTDIR}/tier{names[tier]}.txt"
    out = [f"# Tier {names[tier]} ({len(items)}件)"]
    cur = None
    for lab, expr in items:
        if lab != cur:
            out.append(f"\n## {lab}")
            cur = lab
        out.append(expr)
    open(p, 'w').write('\n'.join(out) + '\n')
    print(f"tier{names[tier]}.txt : {len(items)}件")
