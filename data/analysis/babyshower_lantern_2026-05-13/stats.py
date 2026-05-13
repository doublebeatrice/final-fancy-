import json, statistics
with open(r'D:\ad-ops-workbench\data\analysis\babyshower_lantern_2026-05-13\samples.json','r',encoding='utf-8') as f:
    d = json.load(f)
samples = d['samples']
prices = [s['price'] for s in samples]
ratings = [s['rating'] for s in samples if s['rating'] is not None]

print(f'N = {len(samples)}')
print(f'price mean=${statistics.mean(prices):.2f}  median=${statistics.median(prices):.2f}  stdev=${statistics.stdev(prices):.2f}  min=${min(prices):.2f}  max=${max(prices):.2f}')
print(f'rating mean={statistics.mean(ratings):.2f}  median={statistics.median(ratings):.2f}')

bins = [(0,10),(10,15),(15,20),(20,25),(25,30),(30,40),(40,50),(50,70)]
print('\n[price distribution]')
for lo,hi in bins:
    n = sum(1 for p in prices if lo<=p<hi)
    bar = '#' * n
    print(f'  USD {lo:>2}-{hi:<2}: {n:>2}  {bar}')

color_pool = {}
for s in samples:
    for c in s['color']:
        color_pool[c] = color_pool.get(c,0)+1
print('\n[color top]')
for c,n in sorted(color_pool.items(), key=lambda x:-x[1])[:20]:
    print(f'  {c:<14} {n}')

mat_pool = {}
for s in samples:
    for m in s['material']:
        mat_pool[m] = mat_pool.get(m,0)+1
print('\n[material]')
for m,n in sorted(mat_pool.items(), key=lambda x:-x[1]):
    print(f'  {m:<24} {n}')

theme_pool = {}
for s in samples:
    for t in s['theme']:
        theme_pool[t] = theme_pool.get(t,0)+1
print('\n[theme]')
for t,n in sorted(theme_pool.items(), key=lambda x:-x[1]):
    print(f'  {t:<20} {n}')

form_pool = {}
for s in samples:
    form_pool[s['form']] = form_pool.get(s['form'],0)+1
print('\n[form]')
for k,v in sorted(form_pool.items(), key=lambda x:-x[1]):
    print(f'  {k:<14} {v}')

# 正态性观察：mean +/- 1 sigma 区间
mu, sd = statistics.mean(prices), statistics.stdev(prices)
in1 = sum(1 for p in prices if mu-sd<=p<=mu+sd)
in2 = sum(1 for p in prices if mu-2*sd<=p<=mu+2*sd)
print(f'\n[normal fit] within 1 sigma: {in1}/{len(prices)} = {in1/len(prices):.0%} (theory 68%)')
print(f'             within 2 sigma: {in2}/{len(prices)} = {in2/len(prices):.0%} (theory 95%)')
