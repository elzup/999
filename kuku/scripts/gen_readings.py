import json, csv
SC = "/private/tmp/claude-501/-Users-hiro--ghq-github-com-elzup-999/3ad69a3a-f482-40ec-ab35-c64cdef125ae/scratchpad"
TERMS = "/Users/hiro/.ghq/github.com/elzup/99x9/abxc/terms.csv"
DATA = "/Users/hiro/.ghq/github.com/elzup/999/public/data.json"
OUT = "/Users/hiro/.ghq/github.com/elzup/999/kuku/readings.csv"

r = json.load(open(SC + "/rules.json"))
core = {int(k): (v['core'][0] if v['core'] else '?') for k, v in r['singleByDigit'].items()}
dm = r['doubleMatrix']

# XYZ = 高スコア語 (w1 vs w2)
data = json.load(open(DATA))
word_best = {}
word_dbg = {}
for x in data['numbers']:
    n = x['num']
    cands = []
    if x.get('w1k'):
        cands.append((x.get('w1Score', 0) or 0, x['w1k']))
    if x.get('w2k'):
        cands.append((x.get('w2Score', 0) or 0, x['w2k']))
    if cands:
        cands.sort(reverse=True)
        word_best[n] = cands[0][1]
        word_dbg[n] = cands

def dbl(a, b):
    cell = dm[a][b]
    return cell[0] if cell else core[a] + core[b]

def ab_read(AB):
    A, B = divmod(AB, 10)
    return dbl(A, B)

def xyz_read(XYZ):
    n = f"{XYZ:03d}"
    if n in word_best:
        return word_best[n]
    # fallback: 先頭桁core + 下2桁2桁マッピング
    return core[XYZ // 100] + dbl((XYZ // 10) % 10, XYZ % 10)

def reading(AB, C, XYZ):
    return ab_read(AB) + 'ん' + core[C] + xyz_read(XYZ)

def classify(AB, C):
    A, B = divmod(AB, 10)
    D, E = divmod(B * C, 10)
    F, G = divmod(A * C, 10)
    plus = (D + G) >= 10
    lab = ('J' if F >= 1 else 'j') + ('I' if D >= 1 else 'i')
    if plus:
        lab += '+'
    if D >= 1 and E == 0:
        lab += '·E0'
    if F >= 1 and G == 0:
        lab += '·G0'
    # tier: ji=除外, 中=JI(両位・E≠0・非+)のみ, JI·E0 は易へ
    if D == 0 and F == 0:
        tier = 'ex'
    elif plus:
        tier = 'hard'
    elif D >= 1 and F >= 1 and G >= 1 and E != 0:
        tier = 'mid'
    else:
        tier = 'easy'
    return tier, lab

class_order = ['ji', 'Ji·G0', 'Ji', 'JI·E0·G0', 'JI·G0', 'jI·E0', 'jI',
               'JI·E0', 'JI', 'jI+·E0', 'jI+', 'JI+·E0', 'JI+']
oidx = {k: i for i, k in enumerate(class_order)}
tier_order = {'easy': 0, 'mid': 1, 'hard': 2, 'ex': 3}

rows = []
ansY_match = 0
total = 0
with open(TERMS) as f:
    for row in csv.DictReader(f):
        AB = int(row['a']); C = int(row['z']); XYZ = int(row['ansNum'])
        tier, lab = classify(AB, C)
        rows.append((tier_order[tier], oidx.get(lab, 99), XYZ,
                     tier, f"{AB}x{C}={XYZ:03d}", lab, reading(AB, C, XYZ)))
        total += 1
        if xyz_read(XYZ) == row.get('ansY'):
            ansY_match += 1

rows.sort()
with open(OUT, 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['tier', 'expr', 'label', 'yomi'])
    for _, _, _, tier, expr, lab, yomi in rows:
        w.writerow([tier, expr, lab, yomi])

print("wrote", len(rows), "->", OUT)
print(f"XYZ(高スコア語) が terms.csv ansY と一致: {ansY_match}/{total}")
from collections import Counter
print(Counter(x[3] for x in rows))
print("--- samples ---")
for want in ['12x2', '13x2', '15x2', '65x2', '25x4', '67x7']:
    for _, _, _, tier, expr, lab, yomi in rows:
        if expr.startswith(want + '='):
            xyz = int(expr.split('=')[1])
            print(f"{tier:4} {expr:11} {lab:9} {yomi:14} (XYZ={xyz:03d} cand={word_dbg.get(f'{xyz:03d}')})")
            break
