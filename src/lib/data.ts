import osmRaw from '../data/provozovny.json';
import registrRaw from '../data/registr.json';
import meta from '../data/import-meta.json';
import { KRAJE, type Kraj } from './kraje';
import { parseTyden, type Tyden } from './oteviraci-doba';
import { slugify } from './slug';

export interface Provozovna {
  id: string;
  /** Zdroj údajů: OpenStreetMap nebo živnostenský rejstřík */
  zdroj: 'osm' | 'rzp';
  /** Odkaz na záznam v OSM (jen u zdroj = osm) */
  osm?: string;
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
}

export interface Mesto {
  nazev: string;
  slug: string;
  kraj: Kraj;
  provozovny: Provozovna[];
}

interface RegistrZaznam {
  id: string;
  nazev: string | null;
  ulice?: string | null;
  cisloDomu?: string | null;
  psc?: string | null;
  mesto: string;
  cast?: string | null;
  kraj: string;
  lat: number;
  lon: number;
}

const REZERVOVANE = new Set(['blog', 'kraj', 'kraje', 'hledat', 'kontakt', 'o-webu', 'pridat-provozovnu', 'ochrana-osobnich-udaju', 'okoli', 'praha-hub', 'barbershopy', 'detska-kadernictvi', 'otevreno-v-sobotu', 'otevreno-v-nedeli', 'pro-salony']);
const OBVOD = /^Praha \d+$/;
const nn = <T,>(v: T | null | undefined) => (v == null || v === '' ? undefined : v);

function metry(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

const normAdr = (ulice?: string, cislo?: string) =>
  slugify(`${ulice ?? ''} ${(cislo ?? '').split('/').pop() ?? ''}`);

function sestav(): Provozovna[] {
  const osm: Provozovna[] = (osmRaw as Omit<Provozovna, 'zdroj'>[]).map((p) => ({ ...p, zdroj: 'osm' as const }));

  // Mřížka pro hledání blízkých bodů (~100 m)
  const mriz = new Map<string, Provozovna[]>();
  const klic = (lat: number, lon: number) => `${Math.round(lat * 1000)}:${Math.round(lon * 700)}`;
  const vOkoliBodu = (lat: number, lon: number) => {
    const out: Provozovna[] = [];
    const a = Math.round(lat * 1000);
    const b = Math.round(lon * 700);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(mriz.get(`${a + i}:${b + j}`) ?? []));
    return out;
  };
  for (const p of osm) {
    const k = klic(p.lat, p.lon);
    if (!mriz.has(k)) mriz.set(k, []);
    mriz.get(k)!.push(p);
  }

  // Záznamy z rejstříku, které nejsou duplicitou salonu z OSM
  const rzp: Provozovna[] = [];
  for (const r of registrRaw as RegistrZaznam[]) {
    const blizko = vOkoliBodu(r.lat, r.lon).filter((o) => metry(o, r) < 60);
    const adr = normAdr(nn(r.ulice), nn(r.cisloDomu));
    if (blizko.some((o) => metry(o, r) < 15 || (o.ulice && normAdr(o.ulice, o.cisloDomu) === adr))) continue;
    const adresaText = [nn(r.ulice) ?? nn(r.cast) ?? r.mesto, nn(r.cisloDomu)].filter(Boolean).join(' ');
    const nazev = nn(r.nazev) ?? `Kadeřnictví ${adresaText}`;
    rzp.push({
      id: r.id,
      zdroj: 'rzp',
      nazev,
      slug: '',
      typ: /barber|holič/i.test(nazev) ? 'barber' : 'kadernictvi',
      zamereni: [],
      ulice: nn(r.ulice),
      cisloDomu: nn(r.cisloDomu),
      psc: nn(r.psc),
      mesto: r.mesto,
      mestoSlug: '',
      cast: nn(r.cast),
      kraj: r.kraj,
      lat: r.lat,
      lon: r.lon,
    });
  }

  // Praha se dělí na obvody (Praha 1–10). Salony z OSM dostanou obvod podle nejbližší adresy z rejstříku.
  const prazske = rzp.filter((p) => p.kraj === 'praha' && p.cast && OBVOD.test(p.cast));
  for (const p of [...osm, ...rzp]) {
    if (p.kraj !== 'praha') continue;
    let obvod = p.cast && OBVOD.test(p.cast) ? p.cast : undefined;
    if (!obvod && prazske.length) {
      let best = Infinity;
      for (const r of prazske) {
        const d = Math.abs(r.lat - p.lat) + Math.abs(r.lon - p.lon);
        if (d < best) {
          best = d;
          obvod = r.cast;
        }
      }
      if (best > 0.01) obvod = undefined;
    }
    if (obvod) {
      p.mesto = obvod;
      if (p.cast === obvod) p.cast = undefined;
    }
  }

  const vse = [...osm, ...rzp];

  // Slug města: unikátní v rámci ČR
  const mestaKraje = new Map<string, Set<string>>();
  for (const p of vse) {
    const s = slugify(p.mesto);
    if (!mestaKraje.has(s)) mestaKraje.set(s, new Set());
    mestaKraje.get(s)!.add(p.kraj);
  }
  for (const p of vse) {
    const s = slugify(p.mesto);
    p.mestoSlug =
      mestaKraje.get(s)!.size > 1 || REZERVOVANE.has(s) ? `${s}-${p.kraj.replace(/-kraj$|^kraj-/, '')}` : s;
  }

  // Slug salonu: unikátní v rámci města, OSM má přednost (stabilnější názvy)
  const used = new Set<string>();
  vse.sort(
    (a, b) =>
      a.mestoSlug.localeCompare(b.mestoSlug) ||
      (a.zdroj === b.zdroj ? 0 : a.zdroj === 'osm' ? -1 : 1) ||
      a.nazev.localeCompare(b.nazev, 'cs') ||
      a.id.localeCompare(b.id),
  );
  for (const p of vse) {
    const kandidati = [slugify(p.nazev), slugify(`${p.nazev} ${p.ulice ?? ''}`), slugify(`${p.nazev} ${p.id}`)];
    p.slug = kandidati.find((c) => c && !used.has(`${p.mestoSlug}/${c}`)) ?? slugify(p.id);
    used.add(`${p.mestoSlug}/${p.slug}`);
  }
  return vse;
}

export const PROVOZOVNY = sestav();
export const IMPORT_META = meta as { zdroj: string; importovano: string; pocet: number };

/** Detail salonu jen z rejstříku je pro Google příliš chudý – neindexujeme ho, dokud nemá víc údajů */
export const indexovatDetail = (p: Provozovna) => p.zdroj === 'osm';

export const url = (p: Provozovna) => `/${p.mestoSlug}/${p.slug}/`;
export const mestoUrl = (slug: string) => `/${slug}/`;
export const krajUrl = (slug: string) => (slug === 'praha' ? '/praha/' : `/kraj/${slug}/`);

export function adresa(p: Provozovna, sMestem = true): string {
  const ulice = [p.ulice, p.cisloDomu].filter(Boolean).join(' ');
  const mesto = [p.psc, p.mesto].filter(Boolean).join(' ');
  return [ulice || p.cast, sMestem ? mesto : undefined].filter(Boolean).join(', ');
}

const tydenCache = new Map<string, Tyden | null>();
export function tyden(p: Provozovna): Tyden | null {
  if (!tydenCache.has(p.id)) tydenCache.set(p.id, parseTyden(p.oteviraciDoba, p.lat, p.lon));
  return tydenCache.get(p.id)!;
}

let _mesta: Mesto[] | undefined;
export function mesta(): Mesto[] {
  if (_mesta) return _mesta;
  const map = new Map<string, Mesto>();
  for (const p of PROVOZOVNY) {
    let m = map.get(p.mestoSlug);
    if (!m) {
      m = { nazev: p.mesto, slug: p.mestoSlug, kraj: KRAJE.find((k) => k.slug === p.kraj)!, provozovny: [] };
      map.set(p.mestoSlug, m);
    }
    m.provozovny.push(p);
  }
  for (const m of map.values()) m.provozovny.sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs'));
  _mesta = [...map.values()].sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs'));
  return _mesta;
}

export const mestaVKraji = (krajSlug: string) => mesta().filter((m) => m.kraj.slug === krajSlug);
export const pocetVKraji = (krajSlug: string) => PROVOZOVNY.filter((p) => p.kraj === krajSlug).length;

export function nejvetsiMesta(n: number): Mesto[] {
  return [...mesta()].sort((a, b) => b.provozovny.length - a.provozovny.length).slice(0, n);
}

function vzdalenostKm(a: Provozovna, b: Provozovna) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function vOkoli(p: Provozovna, n = 6): { p: Provozovna; km: number }[] {
  return PROVOZOVNY.filter((o) => o.id !== p.id && Math.abs(o.lat - p.lat) < 0.2 && Math.abs(o.lon - p.lon) < 0.3)
    .map((o) => ({ p: o, km: vzdalenostKm(p, o) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

/** Míra úplnosti údajů – salony s nejvíc informacemi zobrazujeme jako doporučené */
export function uplnost(p: Provozovna): number {
  return (
    (tyden(p) ? 3 : 0) +
    (p.telefon ? 2 : 0) +
    (p.web ? 2 : 0) +
    (p.ulice && p.cisloDomu ? 1 : 0) +
    (p.instagram || p.facebook ? 1 : 0) +
    (p.email ? 1 : 0) +
    (p.zamereni.length ? 1 : 0)
  );
}

/** Deterministický výběr (stejný při každém buildu), rozprostřený přes různá města */
export function vyber(seznam: Provozovna[], n: number): Provozovna[] {
  const serazene = [...seznam].sort((a, b) => uplnost(b) - uplnost(a) || a.id.localeCompare(b.id));
  const out: Provozovna[] = [];
  const mestaPouzita = new Set<string>();
  for (const p of serazene) {
    if (out.length >= n) break;
    if (mestaPouzita.has(p.mestoSlug) && serazene.length > n * 3) continue;
    out.push(p);
    mestaPouzita.add(p.mestoSlug);
  }
  return out.length >= n ? out : serazene.slice(0, n);
}

export const TYP_NAZEV ={ barber: 'Barbershop', kadernictvi: 'Kadeřnictví' } as const;
export const ZAMERENI_NAZEV: Record<string, string> = {
  panske: 'Pánské',
  damske: 'Dámské',
  unisex: 'Unisex',
  detske: 'Dětské',
};

export const pocetText = (n: number, jedna: string, dve: string, pet: string) =>
  `${n.toLocaleString('cs-CZ')} ${n === 1 ? jedna : n >= 2 && n <= 4 ? dve : pet}`;
