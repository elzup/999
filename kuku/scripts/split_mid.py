SRC="/Users/hiro/.ghq/github.com/elzup/999/kuku/lyrics_tier2_mid.txt"
OUTDIR="/private/tmp/claude-501/-Users-hiro--ghq-github-com-elzup-999/3ad69a3a-f482-40ec-ab35-c64cdef125ae/scratchpad"
LINES_PER=13  # 13行 x 4読み = 52読み ≒ 50
lines=[l for l in open(SRC).read().splitlines() if l.strip()]
parts=[lines[i:i+LINES_PER] for i in range(0,len(lines),LINES_PER)]
for i,p in enumerate(parts,1):
    n=sum(len(l.split('　')) for l in p)
    path=f"{OUTDIR}/mid_p{i}.txt"
    open(path,'w').write('\n'.join(p)+'\n')
    print(f"mid_p{i}.txt : {len(p)}行 / {n}読み")
