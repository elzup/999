import csv, json
SRC="/Users/hiro/.ghq/github.com/elzup/999/kuku/readings.csv"
OUT="/Users/hiro/.ghq/github.com/elzup/999/app/data/kuku.json"
items=[]
for r in csv.DictReader(open(SRC)):
    if r['tier']=='ex': continue
    items.append({"tier":r['tier'],"expr":r['expr'],"label":r['label'],"yomi":r['yomi']})
json.dump(items, open(OUT,'w'), ensure_ascii=False, separators=(',',':'))
from collections import Counter
print("wrote",len(items),"->",OUT, dict(Counter(i['tier'] for i in items)))
