import csv
BASE="/private/tmp/claude-501/-Users-hiro--ghq-github-com-elzup-999/3ad69a3a-f482-40ec-ab35-c64cdef125ae/scratchpad"
rows=list(csv.DictReader(open("/Users/hiro/.ghq/github.com/elzup/999/kuku/readings.csv")))
ZW="　"
def y(labels):
    return [r['yomi'] for r in rows if r['label'] in labels]
def write(name, yomis):
    lines=[ZW.join(yomis[i:i+4]) for i in range(0,len(yomis),4)]
    open(f"{BASE}/{name}.txt",'w').write('\n'.join(lines)+'\n')
    print(f"{name}.txt : {len(yomis)}読み / {len(lines)}行")
write("easy_Ji", y({'Ji'}))
write("easy_G0", y({'Ji·G0','JI·E0·G0','JI·G0'}))
write("easy_other", y({'jI·E0','jI','JI·E0'}))
write("hard_JIplus", y({'JI+·E0','JI+'}))
write("hard_other", y({'jI+·E0','jI+'}))
