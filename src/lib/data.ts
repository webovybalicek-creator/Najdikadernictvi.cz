import raw from '../data/provozovny.json';
import meta from '../data/import-meta.json';
import { KRAJE, type Kraj } from './kraje';
import { parseTyden, type Tyden } from './oteviraci-doba';

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
}

export interface Mesto {
  nazev: string;
  slug: string;
  kraj: Kraj;
  provozovny: Provozovna[];
}

export const PROVOZOVNY = raw as Provozovna[];
export const IMPORT_META = meta as { zdroj: string; importovano: string; pocet: number };

export const url = (p: Provozovna) => `/${p.mestoSlug}/${p.slug}/`;
export const mestoUrl = (slug: string) => `/${slug}/`;
export const krajUrl = (slug: string) => `/kraj/${slug}/`;

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
