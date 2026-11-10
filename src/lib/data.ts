import osmRaw from '../data/provozovny.json';
import registrRaw from '../data/registr.json';
// Dočasné testovací salony (end-to-end test oslovení a správy profilu) – nikdy se neindexují; po testu soubor vyprázdnit na []
import testovaciRaw from '../data/testovaci.json';
import meta from '../data/import-meta.json';
import vyrazene from '../data/vyrazene.json';
import overeneRaw from '../data/overene.json';
import majiteleRaw from '../data/majitele.json';
import googleRaw from '../data/google-hodnoceni.json';
import fotkyRaw from '../data/fotky.json';
import hodnoceniRaw from '../data/hodnoceni.json';
import doplnenoRaw from '../data/doplneno.json';
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
  /** Platba kartou: yes | no */
  platbaKartou?: string;
  /** Datum ověření profilu majitelem (ISO) */
  overeno?: string;
  popis?: string;
  cenik?: { polozka: string; cena: string }[];
  rezervace?: string;
  /** Testovací záznam (nikdy se neindexuje) */
  test?: boolean;
  /** Otevírací doba o svátcích od majitele (volný text) */
  svatky?: string;
  /** Fotky salonu (URL): od majitele, nebo vybrané redakcí z veřejných profilů */
  fotky?: string[];
  /** Fotky vybrala redakce (ne majitel) */
  fotkyRedakce?: boolean;
  /** Hodnocení na Googlu od majitele (zobrazuje se odděleně od našich hodnocení) */
  google?: GoogleHodnoceni;
  /** Hodnocení návštěvníků našeho webu (synchronizované při buildu) */
  hodnoceni?: Hodnoceni;
}

export interface Recenze {
  /** hvězdy 1–5 */
  h: number;
  /** schválený text */
  t: string;
  /** jméno nebo přezdívka */
  j: string | null;
  /** datum YYYY-MM-DD */
  d: string;
}
export interface Hodnoceni {
  prumer: number;
  pocet: number;
  recenze: Recenze[];
}

export interface GoogleHodnoceni {
  h: number;
  n: number;
  datum: string;
  url?: string;
}

interface FotkyRedakce {
  salony: Record<string, { fotky: string[]; nazev?: string; slug?: string; web?: string }>;
}

type Overeni = Partial<Pick<Provozovna, 'nazev' | 'platbaKartou' | 'bezbarierove' | 'telefon' | 'email' | 'web' | 'instagram' | 'facebook' | 'rezervace' | 'oteviraciDoba' | 'popis' | 'cenik' | 'zamereni' | 'fotky' | 'google'>> & {
  overeno: string;
};

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

const REZERVOVANE = new Set(['blog', 'kraj', 'kraje', 'hledat', 'kontakt', 'o-webu', 'pridat-provozovnu', 'ochrana-osobnich-udaju', 'okoli', 'praha-hub', 'barbershopy', 'detska-kadernictvi', 'otevreno-v-sobotu', 'otevreno-v-nedeli', 'pro-salony', 'podminky-uziti', 'oblibene', 'mapa', 'panska-kadernictvi', 'damska-kadernictvi', 'otevreno-vecer', 'otevreno-rano', 'bezbarierova-kadernictvi', 'kadernictvi-platba-kartou', 'porovnat', 'ceny-kadernictvi', 'sprava', 'naposledy-prohlizene', 'nemerit', 'navstenost']);
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
  const osmVse: Provozovna[] = [...(osmRaw as Omit<Provozovna, 'zdroj'>[]), ...(testovaciRaw as Omit<Provozovna, 'zdroj'>[])].map((p) => ({ ...p, zdroj: 'osm' as const }));
  // Stejný salon zapsaný v OSM dvakrát (bod i budova, nebo dva body do 100 m se stejným názvem):
  // ponecháme záznam s víc údaji a doplníme do něj chybějící pole z druhého. Pobočky na jiných adresách zůstávají.
  const jadroNazvu = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(kadernictvi|kadernicky salon|salon|studio)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, '');
  const bohatost = (p: Provozovna) => Object.values(p).filter((v) => v !== undefined && v !== null && v !== '').length;
  const osm: Provozovna[] = [];
  const podleNazvu = new Map<string, number[]>();
  for (const p of osmVse) {
    const k = `${p.mestoSlug}|${jadroNazvu(p.nazev)}`;
    const idx = k.endsWith('|') ? undefined : (podleNazvu.get(k) ?? []).find((i) => metry(osm[i], p) < 100);
    if (idx === undefined) {
      podleNazvu.set(k, [...(podleNazvu.get(k) ?? []), osm.length]);
      osm.push(p);
      continue;
    }
    const [hlavni, druhy] = bohatost(p) > bohatost(osm[idx]) ? [p, osm[idx]] : [osm[idx], p];
    osm[idx] = { ...druhy, ...Object.fromEntries(Object.entries(hlavni).filter(([, v]) => v !== undefined && v !== null && v !== '')) } as Provozovna;
  }

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
  // Fotky (a případně veřejný název) vybrané redakcí z veřejných profilů. Po přidělení slugu, aby se URL neměnila.
  // Fotky od majitele (níže) je přepíšou.
  const redakce = (fotkyRaw as unknown as FotkyRedakce).salony;
  for (const p of vse) {
    const f = redakce[p.id];
    if (!f?.fotky?.length) continue;
    p.fotky = f.fotky;
    p.fotkyRedakce = true;
    if (f.nazev) p.nazev = f.nazev;
    if (f.web && !p.web) p.web = f.web;
    // Hezčí URL podle veřejného názvu (stará adresa se 301 přesměruje v public/.htaccess)
    if (f.slug && f.slug !== p.slug && !used.has(`${p.mestoSlug}/${f.slug}`)) {
      used.delete(`${p.mestoSlug}/${p.slug}`);
      p.slug = f.slug;
      used.add(`${p.mestoSlug}/${p.slug}`);
    }
  }
  // Údaje doplněné redakcí z veřejných profilů: jen chybějící pole (majitel a ruční opravy níže mají přednost)
  const dopl = (doplnenoRaw as { salony: Record<string, Partial<Pick<Provozovna, 'telefon' | 'web' | 'facebook' | 'oteviraciDoba'>>> }).salony;
  for (const p of vse) {
    const d = dopl[p.id];
    if (!d) continue;
    for (const k of ['telefon', 'web', 'facebook', 'oteviraciDoba'] as const) if (d[k] && !p[k]) p[k] = d[k];
  }
  // Údaje ověřené majitelem (po přidělení slugu, aby se URL neměnila)
  // Nejdřív údaje, které majitel upravil sám (/sprava/), pak ruční opravy redakce (mají přednost)
  for (const zdroj of [majiteleRaw.salony, overeneRaw.salony] as Record<string, Overeni>[]) {
    for (const p of vse) {
      const o = zdroj[p.id];
      if (!o?.overeno) continue;
      for (const [k, v] of Object.entries(o)) {
        if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)) (p as unknown as Record<string, unknown>)[k] = v;
      }
      if (o.fotky?.length) p.fotkyRedakce = undefined;
    }
  }
  // Hodnocení na Googlu zadané redakcí (podle id nebo URL salonu)
  const g = (googleRaw as { salony: Record<string, GoogleHodnoceni> }).salony;
  if (Object.keys(g).length) {
    for (const p of vse) {
      const z = g[p.id] ?? g[`/${p.mestoSlug}/${p.slug}/`];
      if (z && z.h >= 1 && z.h <= 5 && z.n > 0) p.google = z;
    }
  }
  // Hodnocení návštěvníků (souhrn hvězdiček + schválené texty) z workflow Synchronizace profilů
  const hod = hodnoceniRaw as unknown as { souhrn: Record<string, [number, number]>; recenze: Record<string, Recenze[]> };
  for (const p of vse) {
    const s = hod.souhrn[p.id];
    if (s && s[1] > 0) p.hodnoceni = { prumer: s[0], pocet: s[1], recenze: hod.recenze[p.id] ?? [] };
  }
  // Salony vyřazené na žádost (id nebo URL)
  const blok = new Set<string>(vyrazene.polozky);
  return blok.size ? vse.filter((p) => !blok.has(p.id) && !blok.has(`/${p.mestoSlug}/${p.slug}/`)) : vse;
}

export const PROVOZOVNY = sestav();
export const IMPORT_META = meta as { zdroj: string; importovano: string; pocet: number };

/** Detail salonu jde do vyhledávačů, jen když nabízí víc než název a adresu (ty má každá mapa):
 *  otevírací dobu, kontakt nebo údaje od majitele. Ostatní detaily zůstávají dostupné, ale noindex a bez reklam. */
export const maObsah = (p: Provozovna) =>
  !!(p.overeno || p.oteviraciDoba || p.telefon || p.web || p.facebook || p.instagram || p.popis || p.cenik?.length || p.fotky?.length || p.hodnoceni?.recenze.length);
export const indexovatDetail = (p: Provozovna) => !p.test && maObsah(p);
/** Stránka obce / čtvrti jde do vyhledávačů, jen když má aspoň 3 salony s obsahem (otevírací doba, kontakt…).
 *  Obec s jedním salonem nic nepřidá oproti jeho detailu a výpis samotných adres z rejstříku je málo hodnotný. */
export const MIN_MESTO = 3;
export const indexovatMesto = (m: { provozovny: Provozovna[] }) => m.provozovny.filter(indexovatDetail).length >= MIN_MESTO;

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
  // Nejdřív salony s víc údaji (telefon, otevírací doba, web), pak abecedně
  for (const m of map.values())
    m.provozovny.sort((a, b) => uplnost(b) - uplnost(a) || a.nazev.localeCompare(b.nazev, 'cs'));
  _mesta = [...map.values()].sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs'));
  return _mesta;
}

export const mestaVKraji = (krajSlug: string) => mesta().filter((m) => m.kraj.slug === krajSlug);
export const pocetVKraji = (krajSlug: string) => PROVOZOVNY.filter((p) => p.kraj === krajSlug).length;

export interface MestoVypis extends Mesto {
  /** U Prahy: jednotlivé obvody (Praha 1–10) pro rozbalení */
  obvody?: Mesto[];
}

/** Města pro přehledy: pražské obvody sloučené do jedné položky „Praha“ s rozbalením */
export function mestaSloucena(): MestoVypis[] {
  const vse = mesta();
  const prazske = vse.filter((m) => m.kraj.slug === 'praha');
  const ostatni = vse.filter((m) => m.kraj.slug !== 'praha');
  if (!prazske.length) return ostatni;
  const obvody = prazske
    .filter((m) => m.slug !== 'praha')
    .sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs', { numeric: true }));
  const praha: MestoVypis = {
    nazev: 'Praha',
    slug: 'praha',
    kraj: prazske[0].kraj,
    provozovny: prazske.flatMap((m) => m.provozovny),
    obvody,
  };
  return [praha, ...ostatni];
}

export function nejvetsiMesta(n: number): MestoVypis[] {
  return [...mestaSloucena()].sort((a, b) => b.provozovny.length - a.provozovny.length).slice(0, n);
}

export function vzdalenostKm(a: Provozovna, b: Provozovna) {
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
    (p.zamereni.length ? 1 : 0) +
    (p.fotky?.length ? 2 : 0) +
    (p.hodnoceni?.recenze.length ? 2 : 0) +
    (p.overeno ? 2 : 0)
  );
}

/** Zmenšenina fotky pro karty a galerii (jen fotky redakce v /foto/, ostatní beze změny) */
export const nahled = (url: string) => (/^\/foto\/[^/]+\/\d+\.webp$/.test(url) ? url.replace(/\.webp$/, '-m.webp') : url);

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

// ---------------------------------------------------------------- čtvrti (části obcí) velkých měst
export interface Ctvrt {
  nazev: string;
  slug: string;
  mesto: Mesto;
  provozovny: Provozovna[];
}
const MIN_CTVRT = 3;
const _ctvrti = new Map<string, Ctvrt[]>();

/** Hezčí název části: „Liberec III-Jeřáb“ → „Jeřáb“ */
const nazevCasti = (cast: string, mesto: string) =>
  cast.replace(new RegExp(`^${mesto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} [IVXL]+-`), '').trim();

/** Části obce s aspoň 3 salony (jen obce s 30+ salony). Salonům bez části se přiřadí nejbližší soused. */
export function ctvrti(m: Mesto): Ctvrt[] {
  if (_ctvrti.has(m.slug)) return _ctvrti.get(m.slug)!;
  let out: Ctvrt[] = [];
  if (m.provozovny.length >= 30) {
    const sCasti = m.provozovny.filter((p) => p.cast && p.cast !== m.nazev);
    const prirazeni = new Map<Provozovna, string>();
    for (const p of m.provozovny) {
      if (p.cast && p.cast !== m.nazev) {
        prirazeni.set(p, p.cast);
        continue;
      }
      let best = Infinity;
      let cast: string | undefined;
      for (const o of sCasti) {
        const d = (o.lat - p.lat) ** 2 + ((o.lon - p.lon) * 0.64) ** 2;
        if (d < best) {
          best = d;
          cast = o.cast;
        }
      }
      if (cast && best < 0.006 ** 2) prirazeni.set(p, cast);
    }
    const skup = new Map<string, Provozovna[]>();
    for (const [p, c] of prirazeni) {
      if (!skup.has(c)) skup.set(c, []);
      skup.get(c)!.push(p);
    }
    const pouzite = new Set<string>();
    out = [...skup.entries()]
      .filter(([, s]) => s.length >= MIN_CTVRT)
      .map(([c, s]) => {
        const nazev = nazevCasti(c, m.nazev);
        let slug = slugify(nazev);
        if (pouzite.has(slug)) slug = slugify(c);
        pouzite.add(slug);
        return { nazev, slug, mesto: m, provozovny: m.provozovny.filter((p) => s.includes(p)) };
      })
      .sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs', { numeric: true }));
    if (out.length < 2) out = [];
  }
  _ctvrti.set(m.slug, out);
  return out;
}
export const ctvrtUrl = (c: Ctvrt) => `/${c.mesto.slug}/ctvrt/${c.slug}/`;
export const vsechnyCtvrti = () => mesta().flatMap((m) => ctvrti(m));

let _ctvrtSalonu: Map<string, Ctvrt> | undefined;
/** Čtvrť, do které salon patří (jen u měst s rozdělením na čtvrti) */
export function ctvrtSalonu(p: Provozovna): Ctvrt | undefined {
  if (!_ctvrtSalonu) {
    _ctvrtSalonu = new Map();
    for (const c of vsechnyCtvrti()) for (const s of c.provozovny) _ctvrtSalonu.set(s.id, c);
  }
  return _ctvrtSalonu.get(p.id);
}
