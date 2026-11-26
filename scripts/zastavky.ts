/**
 * Nejbližší zastávky MHD ke každému salonu z OpenStreetMap (Overpass API).
 * Data © přispěvatelé OpenStreetMap, licence ODbL.
 *
 * Pro každý salon uloží nejbližší zastávku do 600 m a navíc nejbližší stanici metra / vlaku do 900 m,
 * pokud je jiná než ta nejbližší (v Praze se lidé řídí hlavně metrem).
 *
 * Spuštění: npx tsx scripts/zastavky.ts [--kraje CZ-10,CZ-64]
 * Výstup:   src/data/zastavky.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { PROVOZOVNY, type Zastavka } from '../src/lib/data.ts';
import { KRAJE } from '../src/lib/kraje.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOUBOR = path.join(ROOT, 'src/data/zastavky.json');
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const JEN = (arg('--kraje') ?? process.env.IMPORT_KRAJE ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const MAX_M = 600;
const MAX_KOLEJ_M = 900;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface El {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}
interface Bod {
  n: string;
  t: Zastavka['t'];
  lat: number;
  lon: number;
}

async function overpass(query: string): Promise<El[]> {
  let chyba: unknown;
  for (let pokus = 0; pokus < 9; pokus++) {
    const url = ENDPOINTS[pokus % ENDPOINTS.length];
    try {
      const r = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(300_000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'najdikadernictvi.cz zastavky (https://najdikadernictvi.cz)' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
      const j = (await r.json()) as { elements: El[]; remark?: string };
      if (j.remark && /runtime error|timed out/i.test(j.remark)) throw new Error(j.remark);
      return j.elements;
    } catch (e) {
      chyba = e;
      console.warn(`  pokus ${pokus + 1} selhal: ${(e as Error).message}`);
      await sleep(Math.min(15_000 * (pokus + 1), 90_000));
    }
  }
  throw chyba;
}

/** Druh zastávky z OSM tagů */
export function druh(t: Record<string, string>): Zastavka['t'] | null {
  if (t.station === 'subway' || t.subway === 'yes' || t.railway === 'subway_entrance' || t.railway === 'subway') return 'metro';
  if (t.railway === 'station' || t.railway === 'halt' || t.train === 'yes') return 'vlak';
  if (t.railway === 'tram_stop' || t.tram === 'yes') return 'tram';
  if (t.highway === 'bus_stop' || t.bus === 'yes' || t.trolleybus === 'yes' || t.public_transport === 'platform') return 'bus';
  return null;
}

/** Název bez technických přípon („Anděl - A“, „Karlovo náměstí (Ječná)“ ponecháme, jen ořízneme mezery) */
const jmeno = (s: string) => s.trim().replace(/\s+/g, ' ');

async function zastavkyKraje(iso: string): Promise<Bod[]> {
  const q = `[out:json][timeout:240];
area["ISO3166-2"="${iso}"]["boundary"="administrative"]->.k;
(
  node["highway"="bus_stop"]["name"](area.k);
  node["public_transport"="platform"]["name"](area.k);
  node["railway"~"^(tram_stop|station|halt)$"]["name"](area.k);
  nwr["station"="subway"]["name"](area.k);
);
out center tags;`;
  const out: Bod[] = [];
  for (const e of await overpass(q)) {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const t = e.tags ?? {};
    const d = druh(t);
    if (lat == null || lon == null || !t.name || !d) continue;
    out.push({ n: jmeno(t.name), t: d, lat, lon });
  }
  return out;
}

const vzd = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const k = Math.cos((a.lat * Math.PI) / 180);
  return Math.round(Math.hypot((a.lat - b.lat) * 111_320, (a.lon - b.lon) * 111_320 * k));
};

/** Mřížka ~0,01° (cca 1 km) pro rychlé hledání sousedů */
function mrizka(body: Bod[]) {
  const g = new Map<string, Bod[]>();
  for (const b of body) {
    const k = `${Math.floor(b.lat * 100)}_${Math.floor(b.lon * 100)}`;
    if (!g.has(k)) g.set(k, []);
    g.get(k)!.push(b);
  }
  return (lat: number, lon: number) => {
    const r: Bod[] = [];
    const a = Math.floor(lat * 100), o = Math.floor(lon * 100);
    for (let i = -1; i <= 1; i++) for (let j = -2; j <= 2; j++) r.push(...(g.get(`${a + i}_${o + j}`) ?? []));
    return r;
  };
}

export function nejblizsi(p: { lat: number; lon: number }, kandidati: Bod[]): Zastavka[] {
  const serazene = kandidati.map((b) => ({ b, m: vzd(p, b) })).sort((x, y) => x.m - y.m);
  const out: Zastavka[] = [];
  const prvni = serazene.find((x) => x.m <= MAX_M);
  if (prvni) out.push({ n: prvni.b.n, m: prvni.m, t: prvni.b.t });
  const kolej = serazene.find((x) => (x.b.t === 'metro' || x.b.t === 'vlak') && x.m <= MAX_KOLEJ_M);
  if (kolej && !(out[0] && out[0].n === kolej.b.n && out[0].t === kolej.b.t)) out.push({ n: kolej.b.n, m: kolej.m, t: kolej.b.t });
  // stejný název u metra a nástupiště tramvaje/busu („Anděl“) → stačí jednou, s „lepším“ druhem
  if (out.length === 2 && out[0].n === out[1].n) return [out[1].m <= out[0].m + 150 ? out[1] : out[0]];
  return out;
}

/** Zápis souboru (volá se po každém kraji, ať se při přerušení běhu neztratí hotová práce) */
function uloz(data: { _popis: string; salony: Record<string, Zastavka[]> }) {
  // salony, které z katalogu zmizely
  const ids = new Set(PROVOZOVNY.map((p) => p.id));
  for (const id of Object.keys(data.salony)) if (!ids.has(id)) delete data.salony[id];
  const serazeno = Object.entries(data.salony).sort(([a], [b]) => a.localeCompare(b));
  // jeden salon na řádek: čitelné rozdíly v gitu, malý soubor
  const radky = serazeno.map(([id, z]) => `    ${JSON.stringify(id)}: ${JSON.stringify(z)}`);
  fs.writeFileSync(SOUBOR, `{\n  "_popis": ${JSON.stringify(data._popis)},\n  "salony": {\n${radky.join(',\n')}\n  }\n}\n`);
}

async function main() {
  const data = JSON.parse(fs.readFileSync(SOUBOR, 'utf8')) as { _popis: string; salony: Record<string, Zastavka[]> };
  const kraje = KRAJE.filter((k) => !JEN.length || JEN.includes(k.iso));
  let celkem = 0;
  for (const kraj of kraje) {
    const salony = PROVOZOVNY.filter((p) => p.kraj === kraj.slug && !p.test);
    if (!salony.length) continue;
    console.log(`${kraj.nazev}: ${salony.length} salonů…`);
    let body: Bod[];
    try {
      body = await zastavkyKraje(kraj.iso);
    } catch (e) {
      console.log(`::warning::${kraj.nazev}: zastávky se nepodařilo stáhnout (${(e as Error).message}), ponechávám stará data`);
      continue;
    }
    console.log(`  zastávek: ${body.length}`);
    if (body.length < 50) {
      console.log(`::warning::${kraj.nazev}: podezřele málo zastávek, ponechávám stará data`);
      continue;
    }
    const okoli = mrizka(body);
    let s = 0;
    for (const p of salony) {
      const z = nejblizsi(p, okoli(p.lat, p.lon));
      if (z.length) {
        data.salony[p.id] = z;
        s++;
      } else delete data.salony[p.id];
    }
    celkem += s;
    console.log(`  se zastávkou: ${s}`);
    uloz(data);
    await sleep(5000);
  }
  uloz(data);
  console.log(`výsledek: ${celkem} salonů se zastávkou (celkem v souboru ${Object.keys(data.salony).length})`);
}

if (process.argv[1]?.endsWith('zastavky.ts')) await main();
