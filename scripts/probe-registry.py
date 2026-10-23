"""Průzkum registrů: kolik subjektů s kadeřnickou činností je v RES a jak vypadá záznam v RŽP (ARES).
Výstup do složky probe/ (jen pro analýzu, ne pro web)."""
import csv, gzip, io, json, os, random, sys, time, urllib.request, collections

os.makedirs('probe', exist_ok=True)
UA = {'User-Agent': 'najdikadernictvi.cz probe', 'Accept-Encoding': 'gzip'}

def get(url, timeout=600):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
        if r.headers.get('Content-Encoding') == 'gzip':
            data = gzip.decompress(data)
        return data

print('Stahuji res_data.csv …', flush=True)
raw = get('https://opendata.csu.gov.cz/soubory/od/od_org03/res_data.csv')
print(f'  {len(raw)/1e6:.0f} MB', flush=True)
rows = csv.DictReader(io.StringIO(raw.decode('utf-8')))
header = rows.fieldnames
nace_vals = collections.Counter()
hits = []
for r in rows:
    n25 = (r.get('NACE2025') or '').strip()
    n = (r.get('NACE') or '').strip()
    if n.startswith('9602') or n25.startswith('962'):
        nace_vals[(n, n25)] += 1
    if n25.startswith('9621') and not (r.get('DDATZAN') or '').strip():
        hits.append(r)

stats = {
    'header': header,
    'nace_kombinace': {f'{a}|{b}': c for (a, b), c in nace_vals.most_common(40)},
    'aktivni_9621': len(hits),
    'forma': collections.Counter(h.get('FORMA') for h in hits).most_common(20),
    'rosforma': collections.Counter(h.get('ROSFORMA') for h in hits).most_common(20),
    'obce_top': collections.Counter(h.get('OBEC_TEXT') for h in hits).most_common(30),
    'vzorek_res': random.Random(1).sample(hits, min(15, len(hits))),
}
json.dump(stats, open('probe/res-stats.json', 'w'), ensure_ascii=False, indent=1)
print(f'Aktivních s NACE2025 9621*: {len(hits)}', flush=True)

# Vzorek RŽP z ARES
vzorek = random.Random(2).sample(hits, min(25, len(hits)))
out = []
for h in vzorek:
    ico = h['ICO'].zfill(8)
    try:
        d = json.loads(get(f'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-rzp/{ico}', 60))
        out.append({'ico': ico, 'forma': h.get('FORMA'), 'rzp': d})
    except Exception as e:
        out.append({'ico': ico, 'chyba': str(e)})
    time.sleep(0.3)
json.dump(out, open('probe/rzp-vzorek.json', 'w'), ensure_ascii=False, indent=1)
print('Hotovo', flush=True)
print(f'::notice::RES: aktivních subjektů s CZ-NACE 2025 96.21 = {len(hits)}')
