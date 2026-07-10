import csv, math
from collections import Counter, defaultdict
rows=list(csv.DictReader(open("/Users/hiro/.ghq/github.com/elzup/999/kuku/readings.csv")))
byt=defaultdict(list)
for r in rows:
    byt[r['tier']].append(r)
order=['ji','Ji·G0','Ji','JI·E0·G0','JI·G0','jI·E0','jI','JI·E0','JI','jI+·E0','jI+','JI+·E0','JI+']
for t in ['easy','hard']:
    items=byt[t]; n=len(items)
    c=Counter(r['label'] for r in items)
    print(f"=== {t} : {n}読み ===")
    for lab in order:
        if c.get(lab): print(f"  {lab:9} {c[lab]}")
    # 約50分割(13行=52読み単位)
    lines=math.ceil(n/4); parts=math.ceil(lines/13)
    print(f"  → 4読み/行={lines}行, 13行(52読み)単位で {parts}分割")
