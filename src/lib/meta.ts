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
      if (!out) return v.length > max ? `${v.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : v;
      continue;
    }
    out = dalsi;
  }
  return out;
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
const bezTecky = (t: string) => t.replace(/\.+$/, '');

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
  const doba = dobaKratce(p);
  // Název salonu často obsahuje typ i ulici („Kadeřnictví Sadová 344“) – neopakovat
  const nazevLower = p.nazev.toLowerCase();
  const sUlici = ulice && !nazevLower.includes((p.ulice ?? '').toLowerCase()) ? `, ${ulice}` : '';
  const title = `${bezTecky(p.nazev)}${sUlici}, ${p.mesto}${doba ? ' – otevírací doba a kontakt' : ' – adresa a kontakt'}`;
  const adr = adresa(p);
  const description = slozit([
    `${nazevLower.startsWith(typ.toLowerCase()) ? p.nazev : `${typ} ${p.nazev}`}${adr ? `, ${adr}` : ` (${p.mesto})`}.`,
    doba && `Otevřeno ${doba}.`,
    p.telefon && `Tel. ${p.telefon}.`,
    p.rezervace && 'Online rezervace.',
    p.google && `Google ${p.google.h.toLocaleString('cs-CZ')} ★ (${p.google.n}).`,
    doba ? 'Podívejte se, jestli má právě otevřeno.' : 'Mapa, navigace a kontakt.',
    vOkoli > 0 && `Další salony v okolí.`,
  ]);
  return { title, description };
}

// ---------------------------------------------------------------- stránka obce / části obce
export function metaMesta(misto: string, salony: Provozovna[], st: Statistiky, kraj?: string) {
  const n = salony.length;
  const s = nejlepsi(salony);
  const kde = kraj ? `${misto} (${kraj})` : misto;

  if (n === 1) {
    const p = salony[0];
    const doba = dobaKratce(p, 2);
    const gen = generovany(p);
    const adr = adresa(p);
    return {
      title: gen
        ? `Kadeřnictví ${misto} – adresa${doba ? ', otevírací doba' : ''} a salony v okolí`
        : `Kadeřnictví ${misto}: ${bezTecky(p.nazev)}${doba ? ', otevírací doba' : ''}`,
      description: slozit([
        gen
          ? `${TYP_NAZEV[p.typ]} na adrese ${p.ulice ? `${p.ulice} ${p.cisloDomu ?? ''}`.trim() : `${p.cast ?? p.mesto} ${p.cisloDomu ?? ''}`.trim()}, ${kde}.`
          : `${bezTecky(p.nazev)} – ${TYP_NAZEV[p.typ].toLowerCase()}${adr ? `, ${adr}` : ''}, ${kde}.`,
        doba && `Otevřeno ${doba}.`,
        p.telefon && `Objednání na tel. ${p.telefon}.`,
        'Kontakt, mapa s navigací a další kadeřnictví v okolí.',
      ]),
    };
  }

  const pocet = pocetText(n, 'salon', 'salony', 'salonů');
  const jmena = vyjmenuj(s, n <= 4 ? 4 : 2);
  const title =
    n <= 4
      ? jmena && !jmena.includes(' a ')
        ? `Kadeřnictví ${misto}: ${jmena} a další (${n})`
        : `Kadeřnictví ${misto}: ${pocet}, adresy a otevírací doba`
      : `Kadeřnictví ${misto} (${n}) – kdo má teď otevřeno`;
  const ul = ulice(s, 3);

  const typy = st.barberu
    ? st.barberu === n
      ? pocetText(n, 'barbershop', 'barbershopy', 'barbershopů')
      : `${pocetText(n - st.barberu, 'kadeřnictví', 'kadeřnictví', 'kadeřnictví')} a ${pocetText(st.barberu, 'barbershop', 'barbershopy', 'barbershopů')}`
    : pocet;
  const description = slozit([
    `${typy}, ${kde}.`,
    n <= 4 && jmena ? `${jmena}.` : n <= 4 && ul ? `Najdete je v ulicích ${ul}.` : false,
    st.vSobotu.length > 0 && `V sobotu ${st.vSobotu.length === n ? 'mají otevřeno všechny' : `má otevřeno ${pocetText(st.vSobotu.length, 'salon', 'salony', 'salonů')}`}.`,
    'Otevírací doba, telefony a mapa: kdo má teď otevřeno.',
    n > 4 && jmena && `Např. ${jmena}.`,
    st.nejdrive && n > 2 && `Nejdřív otevírá ${bezTecky(st.nejdrive.p.nazev)} (${hhmm(st.nejdrive.od)}).`,
  ]);
  return { title, description };
}

// ---------------------------------------------------------------- cílené podstránky (barbershopy, otevřeno v sobotu…)
export function metaZameru(nazev: string, misto: string, popis: string, salony: Provozovna[], st: Statistiky) {
  const n = salony.length;
  return {
    title: `${nazev} (${n})`,
    description: slozit([
      `${misto}: ${pocetText(n, 'salon', 'salony', 'salonů')} – ${popis}.`,
      vyjmenuj(nejlepsi(salony), 3) && `Např. ${vyjmenuj(nejlepsi(salony), 3)}.`,
      st.nejdrive && `Nejdřív otevírá ${bezTecky(st.nejdrive.p.nazev)} (${hhmm(st.nejdrive.od)}).`,
      'Otevírací doba, telefon a mapa.',
    ]),
  };
}

// ---------------------------------------------------------------- kraj
export function metaKraje(vNazev: string, pocet: number, obci: number, nejvetsi: string[]) {
  return {
    title: `Kadeřnictví a barbershopy ${vNazev} – ${pocetText(pocet, 'salon', 'salony', 'salonů')}`,
    description: slozit([
      `${pocetText(pocet, 'salon', 'salony', 'salonů')} v ${pocetText(obci, 'obci', 'obcích', 'obcích')} ${vNazev}.`,
      nejvetsi.length > 0 && `Nejvíc v obcích ${nejvetsi.join(', ')}.`,
      'Vyberte obec a zjistěte, kdo má otevřeno, včetně telefonu a mapy.',
    ]),
  };
}
