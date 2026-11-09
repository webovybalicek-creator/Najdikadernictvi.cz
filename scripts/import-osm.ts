/**
 * Import kadeřnictví a barbershopů z OpenStreetMap (Overpass API) pro celou ČR.
 * Data © přispěvatelé OpenStreetMap, licence ODbL.
 *
 * Spuštění: node scripts/import-osm.ts
 * Výstup:   src/data/provozovny.json, src/data/import-meta.json
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { KRAJE } from '../src/lib/kraje.ts';
import { slugify } from '../src/lib/slug.ts';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

type Tags = Record<string, string>;
interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Tags;
}

export interface Provozovna {
  id: string;
  osm: string;
  nazev: string;
  slug: string;
  typ: 'barber' | 'kadernictvi';
  zamereni: string[];
  ulice?: string;
  cisloDomu?: string;
  psc?: string;
  mesto: string;
  mestoSlug: string;
  cast?: string;
  kraj: string;
  lat: number;
  lon: number;
  telefon?: string;
  email?: string;
  web?: string;
  facebook?: string;
  instagram?: string;
  oteviraciDoba?: string;
  bezbarierove?: string;
  /** Platba kartou: yes | no (z tagů payment:*) */
  platbaKartou?: string;
}

const gh = (level: 'notice' | 'warning' | 'error', msg: string) =>
  console.log(process.env.GITHUB_ACTIONS ? `::${level}::${msg}` : `[${level}] ${msg}`);

/** Platba kartou z OSM tagů payment:* (yes/no), jinak neznámo */
function platba(t: Record<string, string>): string | undefined {
  const k = ['payment:cards', 'payment:credit_cards', 'payment:debit_cards', 'payment:contactless', 'payment:visa', 'payment:mastercard'];
  if (k.some((x) => t[x] === 'yes')) return 'yes';
  if (t['payment:cash_only'] === 'yes' || k.filter((x) => t[x]).every((x) => t[x] === 'no') && k.some((x) => t[x])) return 'no';
  return undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass(query: string): Promise<OsmElement[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 9; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(300_000),
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'najdikadernictvi.cz data import (https://najdikadernictvi.cz)',
        },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      const json = (await res.json()) as { elements: OsmElement[]; remark?: string };
      if (json.remark && /runtime error|timed out/i.test(json.remark)) throw new Error(json.remark);
      return json.elements;
    } catch (err) {
      lastErr = err;
      console.warn(`  pokus ${attempt + 1} selhal: ${(err as Error).message}`);
      await sleep(Math.min(15_000 * (attempt + 1), 90_000));
    }
  }
  throw lastErr;
}

const clean = (v?: string) => v?.trim().replace(/\s+/g, ' ') || undefined;

function normWeb(v?: string): string | undefined {
  const s = clean(v);
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return 'https://' + s;
  return undefined;
}

function normSocial(v: string | undefined, base: string): string | undefined {
  const s = clean(v);
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  return `${base}/${s.replace(/^@/, '')}`;
}

function normPhone(v?: string): string | undefined {
  const s = clean(v?.split(/[;,]/)[0]);
  if (!s) return undefined;
  const digits = s.replace(/[^\d+]/g, '');
  const m = digits.match(/^(?:\+?420|00420)?(\d{9})$/);
  if (m) return `+420 ${m[1].slice(0, 3)} ${m[1].slice(3, 6)} ${m[1].slice(6)}`;
  return s;
}

function zamereni(t: Tags): string[] {
  const z = new Set<string>();
  for (const v of (t.hairdresser ?? '').split(';').map((s) => s.trim())) {
    if (v === 'male' || v === 'barber') z.add('panske');
    if (v === 'female') z.add('damske');
    if (v === 'unisex') z.add('unisex');
    if (v === 'children') z.add('detske');
  }
  if (t['male'] === 'yes') z.add('panske');
  if (t['female'] === 'yes') z.add('damske');
  return [...z];
}

function nearestPlace(lat: number, lon: number, places: { name: string; lat: number; lon: number }[]) {
  let best: { name: string; d: number } | undefined;
  const cos = Math.cos((lat * Math.PI) / 180);
  for (const p of places) {
    const d = (p.lat - lat) ** 2 + ((p.lon - lon) * cos) ** 2;
    if (!best || d < best.d) best = { name: p.name, d };
  }
  // ~3 km
  return best && best.d < 0.0007 ? best.name : undefined;
}

async function main() {
  const all: Provozovna[] = [];
  const seen = new Set<string>();

  // Předchozí data – použijí se pro kraje, které se tentokrát nepodaří stáhnout
  let predchozi: Provozovna[] = [];
  try {
    predchozi = JSON.parse(await readFile('src/data/provozovny.json', 'utf8'));
  } catch {}
  const selhaly: string[] = [];

  // IMPORT_KRAJE=CZ-64,CZ-80 → stáhnout jen vybrané kraje, ostatní převzít z předchozích dat
  const jen = (process.env.IMPORT_KRAJE ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  for (const kraj of KRAJE) {
    if (jen.length && !jen.includes(kraj.iso)) {
      for (const p of predchozi.filter((p) => p.kraj === kraj.slug)) {
        seen.add(p.id);
        all.push(p);
      }
      continue;
    }
    console.log(`▶ ${kraj.nazev} (${kraj.iso})`);
    const area = `area["ISO3166-2"="${kraj.iso}"]["boundary"="administrative"]->.k;`;
    const qSalony = `[out:json][timeout:180];
${area}
(
  nwr["shop"="hairdresser"](area.k);
  nwr["shop"="barber"](area.k);
  nwr["craft"="hairdresser"](area.k);
);
out center tags;`;
    const qObce = `[out:json][timeout:180];
${area}
node["place"~"^(city|town|village)$"]["name"](area.k);
out;`;
    let shops: OsmElement[];
    try {
      shops = (await overpass(qSalony)).filter((e) => e.tags);
    } catch (err) {
      const stara = predchozi.filter((p) => p.kraj === kraj.slug);
      gh('warning', `${kraj.nazev}: stažení selhalo (${(err as Error).message}), ponechávám ${stara.length} předchozích záznamů`);
      selhaly.push(kraj.nazev);
      for (const p of stara) {
        seen.add(p.id);
        all.push(p);
      }
      continue;
    }
    // Overpass občas vrátí prázdný nebo neúplný výsledek bez chyby (listopad 2026: Olomoucký kraj 0, Jihomoravský polovina).
    // Výrazný propad oproti minulému importu proto bereme jako selhání a ponecháme předchozí data.
    {
      const stara = predchozi.filter((p) => p.kraj === kraj.slug);
      if (stara.length >= 20 && shops.length < stara.length * 0.8) {
        gh('warning', `${kraj.nazev}: podezřele málo výsledků (${shops.length} oproti ${stara.length} minule), ponechávám předchozí data`);
        selhaly.push(kraj.nazev);
        for (const p of stara) {
          seen.add(p.id);
          all.push(p);
        }
        continue;
      }
    }
    // Obce slouží jen k doplnění chybějícího addr:city, jejich selhání import nezastaví
    let places: { name: string; lat: number; lon: number }[] = [];
    if (kraj.iso !== 'CZ-10') {
      await sleep(3_000);
      try {
        places = (await overpass(qObce)).map((e) => ({ name: e.tags!.name, lat: e.lat!, lon: e.lon! }));
      } catch (err) {
        gh('warning', `${kraj.nazev}: seznam obcí se nepodařilo stáhnout, salony bez addr:city budou vynechány`);
      }
    }

    let n = 0;
    for (const e of shops) {
      const t = e.tags!;
      const osm = `${e.type[0]}${e.id}`;
      if (seen.has(osm)) continue;
      const nazev = clean(t.name);
      if (!nazev) continue;
      if (t['disused:shop'] || t['was:shop'] || t.opening_hours === 'closed') continue;
      // Ukončený provoz (end_date v minulosti) nebo označení „zavřeno natrvalo“
      if (t.end_date && t.end_date.slice(0, 10) < new Date().toISOString().slice(0, 10)) continue;
      if (/^(yes|permanently)$/.test(t['closed'] ?? '') || t['abandoned:shop'] || t['demolished:shop']) continue;
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      if (lat == null || lon == null) continue;

      const mesto =
        kraj.iso === 'CZ-10' ? 'Praha' : clean(t['addr:city']) ?? nearestPlace(lat, lon, places);
      if (!mesto) continue;

      const barber =
        t.shop === 'barber' || /barber/.test(t.hairdresser ?? '') || /barber|holič|holic/i.test(nazev);

      seen.add(osm);
      n++;
      all.push({
        id: osm,
        osm: `https://www.openstreetmap.org/${e.type}/${e.id}`,
        nazev,
        slug: '',
        typ: barber ? 'barber' : 'kadernictvi',
        zamereni: zamereni(t),
        ulice: clean(t['addr:street']) ?? clean(t['addr:place']),
        cisloDomu:
          clean(t['addr:housenumber']) ??
          ([clean(t['addr:conscriptionnumber']), clean(t['addr:streetnumber'])].filter(Boolean).join('/') ||
            undefined),
        psc: clean(t['addr:postcode']),
        mesto,
        mestoSlug: '',
        cast: clean(t['addr:suburb']) ?? clean(t['addr:district']),
        kraj: kraj.slug,
        lat: Math.round(lat * 1e6) / 1e6,
        lon: Math.round(lon * 1e6) / 1e6,
        telefon: normPhone(t.phone ?? t['contact:phone'] ?? t.mobile ?? t['contact:mobile']),
        email: clean(t.email ?? t['contact:email']),
        web: normWeb(t.website ?? t['contact:website'] ?? t.url),
        facebook: normSocial(t['contact:facebook'] ?? t.facebook, 'https://www.facebook.com'),
        instagram: normSocial(t['contact:instagram'] ?? t.instagram, 'https://www.instagram.com'),
        oteviraciDoba: clean(t.opening_hours),
        bezbarierove: clean(t.wheelchair),
        platbaKartou: platba(t),
      });
    }
    gh('notice', `${kraj.nazev}: ${n} provozoven`);
    await sleep(5_000);
  }

  // Slug města: unikátní v rámci ČR (stejně pojmenovaná obec v jiném kraji dostane příponu)
  const mestaKraje = new Map<string, Set<string>>();
  for (const p of all) {
    const s = slugify(p.mesto);
    if (!mestaKraje.has(s)) mestaKraje.set(s, new Set());
    mestaKraje.get(s)!.add(p.kraj);
  }
  // Slugy rezervované pro jiné stránky webu
  const REZERVOVANE = new Set(['blog', 'kraj', 'kraje', 'hledat', 'kontakt', 'o-webu', 'pridat-provozovnu', 'ochrana-osobnich-udaju', 'okoli', 'praha-hub', 'barbershopy', 'detska-kadernictvi', 'otevreno-v-sobotu', 'otevreno-v-nedeli', 'pro-salony', 'podminky-uziti', 'oblibene', 'mapa', 'panska-kadernictvi', 'damska-kadernictvi', 'otevreno-vecer', 'otevreno-rano', 'bezbarierova-kadernictvi', 'kadernictvi-platba-kartou', 'porovnat', 'ceny-kadernictvi', 'sprava', 'naposledy-prohlizene', 'nemerit', 'navstenost', 'kadernictvi-v-cislech', 'kdy-se-ostriham', 'kadernictvi-o-svatcich', 'ceny-strihu', 'plakat']);
  for (const p of all) {
    const s = slugify(p.mesto);
    p.mestoSlug =
      mestaKraje.get(s)!.size > 1 || REZERVOVANE.has(s) ? `${s}-${p.kraj.replace(/-kraj$|^kraj-/, '')}` : s;
  }

  // Slug provozovny: unikátní v rámci města
  const used = new Set<string>();
  all.sort((a, b) => a.mestoSlug.localeCompare(b.mestoSlug) || a.nazev.localeCompare(b.nazev, 'cs') || a.id.localeCompare(b.id));
  for (const p of all) {
    const candidates = [slugify(p.nazev), slugify(`${p.nazev} ${p.ulice ?? ''}`), slugify(`${p.nazev} ${p.id}`)];
    p.slug = candidates.find((c) => c && !used.has(`${p.mestoSlug}/${c}`)) ?? slugify(p.id);
    used.add(`${p.mestoSlug}/${p.slug}`);
  }

  if (selhaly.length && selhaly.length === (jen.length || KRAJE.length)) throw new Error('Nepodařilo se stáhnout žádný kraj');
  if (all.length === 0) throw new Error('Žádná data');

  await mkdir('src/data', { recursive: true });
  await writeFile('src/data/provozovny.json', JSON.stringify(all, null, 1) + '\n');
  await writeFile(
    'src/data/import-meta.json',
    JSON.stringify({ zdroj: 'OpenStreetMap', importovano: new Date().toISOString(), pocet: all.length }, null, 2) + '\n',
  );
  gh('notice', `Celkem ${all.length} provozoven${selhaly.length ? `, nestaženo: ${selhaly.join(', ')}` : ''}`);
}

main().catch((err) => {
  gh('error', `Import selhal: ${(err as Error).message}`);
  console.error(err);
  process.exit(1);
});
