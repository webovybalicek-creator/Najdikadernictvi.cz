// Titulky a meta popisky pro výsledky vyhledávání: konkrétní údaje (názvy, otevírací doba, telefon),
// ne šablona s počtem. Popisek max. ~158 znaků, aby ho Google neusekl uprostřed věty.
import { tyden, adresa, pocetText, TYP_NAZEV, type Provozovna } from './data';
import { souhrn, hhmm } from './oteviraci-doba';
import type { Statistiky } from './seo-mesto';

const MAX = 158;

/** Poskládá věty, dokud se vejdou do limitu (vždy aspoň první) */
function slozit(vety: (string | false | undefined | null)[], max = MAX): string {
  let out = '';
  for (const v of vety) {
    if (!v) continue;
    const dalsi = out ? `${out} ${v}` : v;
    if (dalsi.length > max) {
      if (!out) return (v.length > max ? `${v.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : v).replace(/\.\./g, '.');
      continue;
    }
    out = dalsi;
  }
  return out.replace(/\.\./g, '.');
}

/** „Po–Pá 9:00–18:00, So 8:00–12:00“ (bez zavřených dnů) */
export function dobaKratce(p: Provozovna, max = 3): string {
  const t = tyden(p);
  if (!t) return '';
  const s = souhrn(t).filter((x) => x.cas !== 'Zavřeno');
  if (!s.length) return '';
  return s
    .slice(0, max)
    .map((x) => `${x.dny} ${x.cas}`)
    .join(', ');
}

/** Salony z živnostenského rejstříku mají jen vygenerovaný název „Kadeřnictví + adresa“ */
const generovany = (p: Provozovna) => p.zdroj === 'rzp' && !p.overeno;
const bezTecky = (t: string) => t;

const vyjmenuj = (s: Provozovna[], n: number) => {
  const v = [...new Set(s.filter((p) => !generovany(p)).map((p) => bezTecky(p.nazev)))].slice(0, n);
  return v.length > 1 ? `${v.slice(0, -1).join(', ')} a ${v[v.length - 1]}` : (v[0] ?? '');
};

/** Salony s nejvíc údaji napřed (do výčtu jmen) */
const nejlepsi = (s: Provozovna[]) =>
  [...s].sort(
    (a, b) =>
      Number(!generovany(b)) - Number(!generovany(a)) ||
      Number(!!tyden(b)) - Number(!!tyden(a)) ||
      Number(!!b.telefon) - Number(!!a.telefon),
  );

/** Ulice, kde salony jsou (pro obce, kde známe jen adresy) */
const ulice = (s: Provozovna[], n: number) => {
  const u = [...new Set(s.map((p) => p.ulice).filter(Boolean) as string[])].slice(0, n);
  return u.length > 1 ? `${u.slice(0, -1).join(', ')} a ${u[u.length - 1]}` : (u[0] ?? '');
};

// ---------------------------------------------------------------- detail salonu
export function metaSalonu(p: Provozovna, vOkoli: number) {
  const typ = TYP_NAZEV[p.typ];
  const ulice = [p.ulice, p.cisloDomu].filter(Boolean).join(' ');
  const doba = dobaKratce(p, 2);
  const nazev = bezTecky(p.nazev);
  // Název salonu často obsahuje typ i ulici („Kadeřnictví Sadová 344“) – neopakovat
  const nazevLower = p.nazev.toLowerCase();
  const sUlici = ulice && !nazevLower.includes((p.ulice ?? '').toLowerCase()) ? ` (${ulice})` : '';
  const co = [doba && 'otevírací doba', p.telefon && 'telefon', p.cenik?.length && 'ceník'].filter(Boolean) as string[];
  const title = `${nazev}${sUlici}, ${p.mesto} – ${co.length ? co.slice(0, 2).join(' a ') : 'adresa a mapa'}`;
  const jeTyp = nazevLower.startsWith(typ.toLowerCase()) || nazevLower.includes('barber');
  const description = slozit([
    doba ? `✂ ${jeTyp ? nazev : `${typ} ${nazev}`}, ${p.mesto}: otevřeno ${doba}.` : `✂ ${jeTyp ? nazev : `${typ} ${nazev}`}${ulice ? ` na ${ulice}` : ''}, ${p.mesto}.`,
    p.google && `Google ${p.google.h.toLocaleString('cs-CZ')} ★ (${p.google.n} recenzí).`,
    doba && 'Podívejte se, jestli má právě otevřeno.',
    p.rezervace
      ? 'Rezervujte si termín online.'
      : p.telefon
        ? `Objednejte se na ${p.telefon}.`
        : vOkoli > 0
          ? 'Navigace jedním klikem a další salony kousek odsud.'
          : 'Navigace jedním klikem.',
    p.cenik?.length && 'Ceník služeb na jednom místě.',
  ]);
  return { title, description };
}

// ---------------------------------------------------------------- stránka obce / části obce
export function metaMesta(misto: string, salony: Provozovna[], st: Statistiky, kraj?: string) {
  const n = salony.length;
  const s = nejlepsi(salony);

  if (n === 1) {
    const p = salony[0];
    const doba = dobaKratce(p, 2);
    const gen = generovany(p);
    const kde = p.ulice ? `${p.ulice} ${p.cisloDomu ?? ''}`.trim() : `č. p. ${p.cisloDomu ?? ''}`.trim();
    return {
      title: gen
        ? `Kadeřnictví ${misto}: adresa${doba ? ', otevírací doba' : ''} + salony v okolí`
        : `${bezTecky(p.nazev)} – kadeřnictví ${misto}${doba ? ', otevírací doba' : ''}`,
      description: slozit([
        `Hledáte kadeřnictví – ${misto}${kraj ? ` (${kraj})` : ''}?`,
        gen ? `Místní salon najdete na adrese ${kde}.` : `${bezTecky(p.nazev)} najdete na adrese ${kde}.`,
        doba && `Otevřeno ${doba}.`,
        p.telefon && `Objednejte se na ${p.telefon}.`,
        'Ukážeme vám i nejbližší další salony v okolí.',
      ]),
    };
  }

  const jmena = vyjmenuj(s, n <= 4 ? 3 : 2);
  const ul = ulice(s, 3);
  const typy = st.barberu
    ? st.barberu === n
      ? pocetText(n, 'barbershop', 'barbershopy', 'barbershopů')
      : `${pocetText(n - st.barberu, 'kadeřnictví', 'kadeřnictví', 'kadeřnictví')} a ${pocetText(st.barberu, 'barbershop', 'barbershopy', 'barbershopů')}`
    : pocetText(n, 'salon', 'salony', 'salonů');

  const title =
    n <= 4
      ? `Kadeřnictví ${misto}: ${pocetText(n, 'salon', 'salony', 'salonů')}, kontakty a otevírací doba`
      : n >= 30
        ? `Kadeřnictví ${misto}: ${n} salonů – kdo má otevřeno právě teď`
        : `Kadeřnictví ${misto} (${n}) – otevírací doba a telefony`;

  const sobota =
    st.vSobotu.length > 0 &&
    (st.vSobotu.length === n ? 'Všechny mají otevřeno i v sobotu.' : `${pocetText(st.vSobotu.length, 'salon má', 'salony mají', 'salonů má')} otevřeno i v sobotu.`);
  const description = slozit([
    `${misto}${kraj && n <= 30 ? ` (${kraj})` : ''}: ${typy}.`,
    n <= 4 && (jmena ? `${jmena}.` : ul ? `Najdete je v ulicích ${ul}.` : false),
    sobota,
    'Porovnejte otevírací dobu a objednejte se ještě dnes.',
    st.nejdrive && n > 4 && `Nejdřív otevírá ${bezTecky(st.nejdrive.p.nazev)} už v ${hhmm(st.nejdrive.od)}.`,
    n > 4 && jmena && `Např. ${jmena}.`,
  ]);
  return { title, description };
}

// ---------------------------------------------------------------- cílené podstránky (barbershopy, otevřeno v sobotu…)
const HACKY: Record<string, string> = {
  barbershopy: 'Fade, vousy nebo klasický pánský střih?',
  'panska-kadernictvi': 'Potřebujete rychlý pánský střih?',
  'damska-kadernictvi': 'Hledáte dámské kadeřnictví?',
  'detska-kadernictvi': 'Potřebujete ostříhat děti?',
  'otevreno-v-sobotu': 'Přes týden to nestíháte?',
  'otevreno-v-nedeli': 'Potřebujete se ostříhat v neděli?',
  'otevreno-vecer': 'Stříhání až po práci?',
  'otevreno-rano': 'Ostříhat ještě před prací?',
  'bezbarierova-kadernictvi': 'Potřebujete bezbariérový vstup?',
  'kadernictvi-platba-kartou': 'Nemáte u sebe hotovost?',
};
export function metaZameru(slug: string, nazev: string, misto: string, popis: string, salony: Provozovna[], st: Statistiky) {
  const n = salony.length;
  const jmena = vyjmenuj(nejlepsi(salony), 2);
  return {
    title: `${nazev} – ${pocetText(n, 'salon', 'salony', 'salonů')}`,
    description: slozit([
      HACKY[slug],
      `${misto}: ${pocetText(n, 'salon', 'salony', 'salonů')}${popis.startsWith('salony, ') ? popis.slice(6) : popis.startsWith('salony ') ? popis.slice(6) : ` – ${popis}`}.`,
      slug === 'otevreno-vecer' && st.nejdele
        ? `Nejdéle má otevřeno ${bezTecky(st.nejdele.p.nazev)} (do ${hhmm(st.nejdele.do)}).`
        : st.nejdrive && `Nejdřív otevírá ${bezTecky(st.nejdrive.p.nazev)} (${hhmm(st.nejdrive.od)}).`,
      jmena && `Např. ${jmena}.`,
      'Telefon a mapa u každého.',
    ]),
  };
}

// ---------------------------------------------------------------- kraj
export function metaKraje(vNazev: string, pocet: number, obci: number, nejvetsi: string[]) {
  return {
    title: `Kadeřnictví ${vNazev}: ${pocetText(pocet, 'salon', 'salony', 'salonů')} podle obcí`,
    description: slozit([
      `${pocetText(pocet, 'kadeřnictví a barbershop', 'kadeřnictví a barbershopy', 'kadeřnictví a barbershopů')} v ${pocetText(obci, 'obci', 'obcích', 'obcích')} ${vNazev}.`,
      'Vyberte svou obec a hned uvidíte, kdo má otevřeno, telefon i cestu na mapě.',
      nejvetsi.length > 0 && `Nejvíc salonů: ${nejvetsi.join(', ')}.`,
    ]),
  };
}
