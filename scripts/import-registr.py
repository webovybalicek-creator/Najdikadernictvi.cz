"""
Import kadeřnictví z veřejných registrů.

1. RES (ČSÚ, otevřená data): aktivní subjekty s CZ-NACE 2025 96.21 → seznam IČO.
2. ARES – živnostenský rejstřík (RŽP): u každého IČO aktivní živnost „Holičství, kadeřnictví“
   a její aktivní provozovny (adresa + kód adresního místa RÚIAN). Výsledky se cachují
   v data-raw/rzp-cache.json.gz, aby se dalo pokračovat v dalším běhu.
3. RÚIAN (ČÚZK): souřadnice adresních míst → WGS84.
4. Výstup src/data/registr.json – jedna položka na adresu provozovny.

Ochrana osobních údajů: neukládají se jména fyzických osob, data narození ani adresy sídel/bydliště.
U fyzických osob se salon jmenuje „Kadeřnictví <adresa>“.
"""
from __future__ import annotations

import csv, datetime as dt, gzip, io, json, os, sys, threading, time, urllib.error, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'data-raw', 'rzp-cache.json.gz')
OUT = os.path.join(ROOT, 'src', 'data', 'registr.json')
MAX_MINUT = float(os.environ.get('MAX_MINUT', '300'))
OBNOVA_DNU = int(os.environ.get('OBNOVA_DNU', '45'))
VLAKNA = int(os.environ.get('VLAKNA', '6'))
ZA_SEKUNDU = float(os.environ.get('ZA_SEKUNDU', '8'))
UA = {'User-Agent': 'najdikadernictvi.cz import (+https://najdikadernictvi.cz)', 'Accept-Encoding': 'gzip'}
START = time.time()

KRAJE = {
    'Hlavní město Praha': 'praha', 'Středočeský kraj': 'stredocesky-kraj', 'Jihočeský kraj': 'jihocesky-kraj',
    'Plzeňský kraj': 'plzensky-kraj', 'Karlovarský kraj': 'karlovarsky-kraj', 'Ústecký kraj': 'ustecky-kraj',
    'Liberecký kraj': 'liberecky-kraj', 'Královéhradecký kraj': 'kralovehradecky-kraj',
    'Pardubický kraj': 'pardubicky-kraj', 'Kraj Vysočina': 'kraj-vysocina', 'Jihomoravský kraj': 'jihomoravsky-kraj',
    'Olomoucký kraj': 'olomoucky-kraj', 'Zlínský kraj': 'zlinsky-kraj', 'Moravskoslezský kraj': 'moravskoslezsky-kraj',
}


def gh(level: str, msg: str):
    print(f'::{level}::{msg}' if os.environ.get('GITHUB_ACTIONS') else f'[{level}] {msg}', flush=True)


def get(url: str, timeout: int = 900) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
        return gzip.decompress(data) if r.headers.get('Content-Encoding') == 'gzip' else data


# ---------------------------------------------------------------- 1. RES
def ica_z_res() -> dict[str, str]:
    print('RES: stahuji res_data.csv …', flush=True)
    raw = get('https://opendata.csu.gov.cz/soubory/od/od_org03/res_data.csv')
    out = {}
    for r in csv.DictReader(io.StringIO(raw.decode('utf-8'))):
        if (r.get('NACE2025') or '').startswith('9621') and not (r.get('DDATZAN') or '').strip():
            out[r['ICO'].strip().zfill(8)] = (r.get('FORMA') or '').strip()
    print(f'RES: {len(out)} aktivních subjektů s CZ-NACE 96.21', flush=True)
    return out


# ---------------------------------------------------------------- 2. RŽP
class Limiter:
    def __init__(self, per_sec: float):
        self.interval = 1 / per_sec
        self.lock = threading.Lock()
        self.next = time.monotonic()

    def wait(self):
        with self.lock:
            now = time.monotonic()
            if self.next > now:
                time.sleep(self.next - now)
            self.next = max(self.next, now) + self.interval


limiter = Limiter(ZA_SEKUNDU)


def je_kadernicka(zivnost: dict) -> bool:
    p = (zivnost.get('predmetPodnikani') or '').lower()
    return ('kadeřnictví' in p or 'holičství' in p) and not zivnost.get('datumZaniku') and not zivnost.get('platnostDo')


def prerusena(zivnost: dict) -> bool:
    dnes = dt.date.today().isoformat()
    for p in zivnost.get('preruseniZivnosti') or []:
        od, do = p.get('datumOd') or p.get('platnostOd'), p.get('datumDo') or p.get('platnostDo')
        if od and od <= dnes and (not do or do >= dnes):
            return True
    return False


def adresa(a: dict) -> dict | None:
    if not a.get('kodAdresnihoMista') or a.get('kodStatu', 'CZ') != 'CZ':
        return None
    cd, co = a.get('cisloDomovni'), a.get('cisloOrientacni')
    cislo = f"{cd}/{co}{a.get('cisloOrientacniPismeno', '')}" if cd and co else (str(cd) if cd else None)
    if a.get('typCisloDomovni') == 2 and cd:  # číslo evidenční
        cislo = f'ev. č. {cd}' if not co else cislo
    return {
        'kodAdm': a['kodAdresnihoMista'],
        'ulice': a.get('nazevUlice'),
        'cislo': cislo,
        'psc': f"{str(a['psc'])[:3]} {str(a['psc'])[3:]}" if a.get('psc') else None,
        'obec': a.get('nazevObce'),
        'castObce': a.get('nazevCastiObce'),
        'obvod': a.get('nazevMestskehoObvodu') or a.get('nazevSpravnihoObvodu'),
        'kraj': KRAJE.get(a.get('nazevKraje') or ''),
    }


def zpracuj_rzp(ico: str, d: dict) -> dict:
    """Z odpovědi RŽP vytáhne jen to, co potřebujeme. Žádná jména osob ani data narození."""
    provozovny = []
    pravnicka = False
    firma = None
    for z in d.get('zaznamy') or []:
        if not z.get('primarniZaznam', True):
            continue
        pravnicka = z.get('typSubjektu') == 'P'
        if pravnicka:
            firma = z.get('obchodniJmeno')
        for zv in z.get('zivnosti') or []:
            if not je_kadernicka(zv) or prerusena(zv):
                continue
            for p in zv.get('provozovny') or []:
                if p.get('datumZaniku') or p.get('platnostDo'):
                    continue
                a = adresa(p.get('sidloProvozovny') or {})
                if not a:
                    continue
                if pravnicka and p.get('nazev'):
                    a['nazev'] = p['nazev']
                a['icp'] = p.get('icp')
                provozovny.append(a)
    return {'t': dt.date.today().isoformat(), 'p': provozovny, **({'firma': firma} if pravnicka and firma else {})}


def stahni_rzp(ico: str):
    url = f'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-rzp/{ico}'
    for pokus in range(6):
        limiter.wait()
        try:
            return ico, zpracuj_rzp(ico, json.loads(get(url, 60)))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return ico, {'t': dt.date.today().isoformat(), 'p': []}
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(min(60, 5 * 2 ** pokus))
                continue
            return ico, None
        except Exception:
            time.sleep(min(60, 5 * 2 ** pokus))
    return ico, None


# ---------------------------------------------------------------- 3. RÚIAN
def souradnice(kody: set[int]) -> dict[int, tuple[float, float]]:
    from pyproj import Transformer

    tr = Transformer.from_crs('EPSG:5514', 'EPSG:4326', always_xy=True)
    den = dt.date.today().replace(day=1) - dt.timedelta(days=1)
    data = None
    for _ in range(3):
        url = f'https://vdp.cuzk.cz/vymenny_format/csv/{den:%Y%m%d}_OB_ADR_csv.zip'
        try:
            print(f'RÚIAN: stahuji {url}', flush=True)
            data = get(url, 1800)
            break
        except Exception as e:
            print(f'  nedostupné ({e})', flush=True)
            den = den.replace(day=1) - dt.timedelta(days=1)
    if data is None:
        gh('warning', 'RÚIAN se nepodařilo stáhnout, salony bez souřadnic budou vynechány')
        return {}
    out = {}
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for name in zf.namelist():
            if not name.endswith('.csv'):
                continue
            with zf.open(name) as f:
                rd = csv.reader(io.TextIOWrapper(f, encoding='cp1250'), delimiter=';')
                head = next(rd)
                iK = head.index('Kód ADM')
                iY = head.index('Souřadnice Y')
                iX = head.index('Souřadnice X')
                for row in rd:
                    try:
                        k = int(row[iK])
                    except ValueError:
                        continue
                    if k in kody and row[iY] and row[iX]:
                        lon, lat = tr.transform(-float(row[iY].replace(',', '.')), -float(row[iX].replace(',', '.')))
                        out[k] = (round(lat, 6), round(lon, 6))
    print(f'RÚIAN: souřadnice pro {len(out)} z {len(kody)} adres', flush=True)
    return out


# ---------------------------------------------------------------- hlavní běh
def main():
    cache: dict = {}
    if os.path.exists(CACHE):
        cache = json.loads(gzip.decompress(open(CACHE, 'rb').read()))
    ica = ica_z_res()

    # zaniklé subjekty z cache vyhodit
    for ico in [i for i in cache if i not in ica]:
        del cache[ico]

    hranice = (dt.date.today() - dt.timedelta(days=OBNOVA_DNU)).isoformat()
    fronta = [i for i in ica if i not in cache] + sorted(
        (i for i in ica if i in cache and cache[i]['t'] < hranice), key=lambda i: cache[i]['t']
    )
    print(f'RŽP: ve frontě {len(fronta)} subjektů (v cache {len(cache)})', flush=True)

    hotovo = chyby = 0
    with ThreadPoolExecutor(VLAKNA) as ex:
        it = iter(fronta)
        bezi = set()
        for _ in range(VLAKNA * 2):
            i = next(it, None)
            if i:
                bezi.add(ex.submit(stahni_rzp, i))
        while bezi:
            done = next(as_completed(bezi))
            bezi.remove(done)
            ico, res = done.result()
            if res is None:
                chyby += 1
            else:
                cache[ico] = res
                hotovo += 1
            if hotovo % 1000 == 0 and hotovo:
                print(f'  {hotovo} hotovo, {chyby} chyb, {(time.time() - START) / 60:.0f} min', flush=True)
            if (time.time() - START) / 60 < MAX_MINUT:
                i = next(it, None)
                if i:
                    bezi.add(ex.submit(stahni_rzp, i))
    zbyva = len([i for i in ica if i not in cache])
    gh('notice', f'RŽP: zpracováno {hotovo}, chyb {chyby}, v cache {len(cache)}, nezpracováno {zbyva}')

    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, 'wb') as f:
        f.write(gzip.compress(json.dumps(cache, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode(), 9, mtime=0))

    # Seskupení podle adresního místa (víc živnostníků v jednom salonu = jeden salon)
    mista: dict[int, dict] = {}
    for ico, c in cache.items():
        for p in c['p']:
            m = mista.setdefault(p['kodAdm'], {**p, 'icp': p.get('icp'), 'nazvy': set(), 'pocet': 0})
            m['pocet'] += 1
            if p.get('nazev'):
                m['nazvy'].add(p['nazev'])
            elif c.get('firma'):
                m['nazvy'].add(c['firma'])

    gps = souradnice(set(mista))
    vystup = []
    for kod, m in mista.items():
        if kod not in gps or not m.get('kraj') or not m.get('obec'):
            continue
        lat, lon = gps[kod]
        praha = m['obec'] == 'Praha'
        vystup.append({
            'id': f'r{kod}',
            'kodAdm': kod,
            'nazev': sorted(m['nazvy'])[0] if len(m['nazvy']) == 1 else None,
            'ulice': m.get('ulice') or (m.get('castObce') if m.get('castObce') != m['obec'] else None),
            'cisloDomu': m.get('cislo'),
            'psc': m.get('psc'),
            'mesto': m['obec'],
            'cast': (m.get('obvod') if praha else m.get('castObce') if m.get('castObce') != m['obec'] else None),
            'kraj': m['kraj'],
            'lat': lat,
            'lon': lon,
        })
    vystup.sort(key=lambda x: x['id'])
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(vystup, f, ensure_ascii=False, indent=0)
        f.write('\n')
    gh('notice', f'Výstup: {len(vystup)} salonů (adres) z {len(mista)} provozoven s kadeřnickou živností')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        import traceback
        tb = traceback.format_exc().strip().splitlines()
        gh('error', 'Import selhal: ' + ' | '.join(tb[-6:]).replace('%', '%25'))
        sys.exit(1)
