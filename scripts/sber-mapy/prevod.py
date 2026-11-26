#!/usr/bin/env python3
"""Převod dat z Google Map do src/data/doplneno.json.

Vstup (stdin nebo soubor): řádky  id|název|telefon|web|hodiny|kategorie
  hodiny ve tvaru  Út7–18;St7–18;...;SoZavřeno;Po8–12 13–18  (dva úseky smí být slepené: 9–1213–18)
Doplní jen salony z povolených kategorií, existující záznamy přepíše novějšími.
Použití:  python3 scripts/sber-mapy/prevod.py data.txt
"""
import json, re, sys
from pathlib import Path

SOUBOR = Path(__file__).resolve().parents[2] / 'src/data/doplneno.json'
DNY = {'Po': 'Mo', 'Út': 'Tu', 'St': 'We', 'Čt': 'Th', 'Pá': 'Fr', 'So': 'Sa', 'Ne': 'Su'}
PORADI = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
# Kategorie z Google, které bereme (prázdná = neznámá, bereme)
POVOLENE = re.compile(r'^$|kadeřn|holič|barber|vlasov|salon krásy|kosmetický salon a kadeř', re.I)


def cas(s: str) -> str:
    h, _, m = s.partition(':')
    return f'{int(h):02d}:{(m or "00"):0>2}'


def prevod(radek: str):
    casti = radek.rstrip('\n').split('|')
    if len(casti) < 5:
        return None, None
    id_, _nazev, tel, web, hodiny = casti[:5]
    kat = casti[5] if len(casti) > 5 else ''
    if not POVOLENE.search(kat.strip()):
        return id_, None
    e = {}
    tel = re.sub(r'\D', '', tel)[-9:]
    if len(tel) == 9:
        e['telefon'] = f'+420 {tel[:3]} {tel[3:6]} {tel[6:]}'
    # rejstříky firem a Instagram nejsou web salonu; u facebook.com/profile.php zůstává ?id=
    if web and not re.search(r'kurzy\.cz|firmy\.cz|zlatestranky|instagram\.com', web):
        m = re.match(r'(.*profile\.php\?id=\d+)', web)
        w = m.group(1) if m else re.sub(r'\?.*$', '', web).rstrip('/')
        w = re.sub(r'^(https?://)?m\.facebook\.com', 'facebook.com', w)
        w = w if w.startswith('http') else 'https://' + w
        e['facebook' if 'facebook.com' in w else 'web'] = w
    if hodiny and '24 hodin' not in hodiny:
        dny = {}
        for cast in hodiny.split(';'):
            d, r = cast[:2], cast[2:]
            if d not in DNY:
                continue
            rs = re.findall(r'(\d{1,2}(?::\d{2})?)–(\d{1,2}(?::\d{2})?)', r)
            if rs:
                dny[DNY[d]] = ','.join(f'{cas(a)}-{cas(b)}' for a, b in rs)
        if dny:
            e['oteviraciDoba'] = '; '.join(f'{d} {dny[d]}' for d in PORADI if d in dny)
    return id_, e or None


def main():
    vstup = open(sys.argv[1], encoding='utf-8') if len(sys.argv) > 1 else sys.stdin
    data = json.loads(SOUBOR.read_text(encoding='utf-8'))
    pridano = vynechano = 0
    for radek in vstup:
        if not radek.strip():
            continue
        id_, e = prevod(radek)
        if e:
            # sloučit s dřívějšími údaji (např. rezervace a služby z webů salonů se nesmí ztratit)
            data['salony'][id_] = {**data['salony'].get(id_, {}), **e}
            pridano += 1
        else:
            vynechano += 1
    SOUBOR.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'doplněno {pridano}, vynecháno {vynechano}, celkem {len(data["salony"])}')


if __name__ == '__main__':
    main()
