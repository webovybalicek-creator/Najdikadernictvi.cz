// Unikátní obsah stránek měst a cílených podstránek generovaný z dat (žádný šablonový text bez čísel)
import { tyden, url, mestoUrl, pocetText, type Mesto, type Provozovna } from './data';
import { hhmm } from './oteviraci-doba';
import { SITE } from './config';

export interface Zamer {
  slug: string;
  /** Nadpis/titulek: „Barbershopy Brno“ */
  nazev: (mesto: string) => string;
  /** Krátký popis do úvodu */
  popis: string;
  filtr: (p: Provozovna) => boolean;
}

export const ZAMERY: Zamer[] = [
  {
    slug: 'barbershopy',
    nazev: (m) => `Barbershopy ${m}`,
    popis: 'pánské střihy, fade a úprava vousů',
    filtr: (p) => p.typ === 'barber',
  },
  {
    slug: 'detska-kadernictvi',
    nazev: (m) => `Dětská kadeřnictví ${m}`,
    popis: 'salony, které uvádějí dětské střihy',
    filtr: (p) => p.zamereni.includes('detske'),
  },
  {
    slug: 'otevreno-v-sobotu',
    nazev: (m) => `Kadeřnictví otevřená v sobotu: ${m}`,
    popis: 'salony s otevírací dobou v sobotu',
    filtr: (p) => !!tyden(p)?.[5]?.length,
  },
  {
    slug: 'otevreno-v-nedeli',
    nazev: (m) => `Kadeřnictví otevřená v neděli: ${m}`,
    popis: 'salony s otevírací dobou v neděli',
    filtr: (p) => !!tyden(p)?.[6]?.length,
  },
  {
    slug: 'panska-kadernictvi',
    nazev: (m) => `Pánská kadeřnictví ${m}`,
    popis: 'kadeřnictví a holičství, která uvádějí pánské střihy',
    filtr: (p) => p.typ !== 'barber' && p.zamereni.includes('panske'),
  },
  {
    slug: 'damska-kadernictvi',
    nazev: (m) => `Dámská kadeřnictví ${m}`,
    popis: 'salony, které uvádějí dámské střihy a účesy',
    filtr: (p) => p.zamereni.includes('damske'),
  },
  {
    slug: 'otevreno-vecer',
    nazev: (m) => `Kadeřnictví otevřená večer: ${m}`,
    popis: 'salony otevřené aspoň jeden všední den do 19:00 nebo déle',
    filtr: (p) => !!tyden(p)?.slice(0, 5).some((d) => d.some(([, b]) => b >= 19 * 60)),
  },
  {
    slug: 'otevreno-rano',
    nazev: (m) => `Kadeřnictví otevřená brzy ráno: ${m}`,
    popis: 'salony, které aspoň jeden všední den otevírají v 7:30 nebo dříve',
    filtr: (p) => !!tyden(p)?.slice(0, 5).some((d) => d.some(([a]) => a <= 7 * 60 + 30)),
  },
  {
    slug: 'bezbarierova-kadernictvi',
    nazev: (m) => `Bezbariérová kadeřnictví ${m}`,
    popis: 'salony s bezbariérovým nebo částečně bezbariérovým přístupem',
    filtr: (p) => p.bezbarierove === 'yes' || p.bezbarierove === 'limited',
  },
  {
    slug: 'kadernictvi-platba-kartou',
    nazev: (m) => `Kadeřnictví s platbou kartou: ${m}`,
    popis: 'salony, které uvádějí možnost platby kartou',
    filtr: (p) => p.platbaKartou === 'yes',
  },
];

/** Cílené podstránky vznikají jen tam, kde mají aspoň tolik výsledků */
/** Výběr (barbershopy, otevřeno v sobotu…) se generuje až od 5 salonů, menší výpis je tenká stránka */
export const MIN_ZAMER = 5;
export const zamerUrl = (z: Zamer, mestoSlug: string) => `/${z.slug}/${mestoSlug}/`;
const _zamery = new Map<string, { z: Zamer; salony: Provozovna[]; ids: Set<string> }[]>();
export const zameryMesta = (m: Mesto) => {
  const k = `${m.slug}:${m.provozovny.length}`;
  if (!_zamery.has(k)) {
    _zamery.set(
      k,
      ZAMERY.map((z) => {
        const salony = m.provozovny.filter(z.filtr);
        return { z, salony, ids: new Set(salony.map((p) => p.id)) };
      }).filter((x) => x.salony.length >= MIN_ZAMER),
    );
  }
  return _zamery.get(k)!;
};

const jmena = (s: Provozovna[], n = 4) => {
  const v = s.slice(0, n).map((p) => p.nazev);
  return v.length > 1 ? `${v.slice(0, -1).join(', ')} a ${v[v.length - 1]}` : (v[0] ?? '');
};

export interface Statistiky {
  pocet: number;
  barberu: number;
  sDobou: number;
  vSobotu: Provozovna[];
  vNedeli: Provozovna[];
  nejdrive?: { p: Provozovna; od: number };
  nejdele?: { p: Provozovna; do: number };
  sTelefonem: number;
  casti: [string, number][];
}

export function statistiky(salony: Provozovna[]): Statistiky {
  let nejdrive: Statistiky['nejdrive'];
  let nejdele: Statistiky['nejdele'];
  for (const p of salony) {
    const t = tyden(p);
    if (!t) continue;
    for (let d = 0; d < 5; d++) {
      for (const [a, b] of t[d]) {
        if (a >= 300 && (!nejdrive || a < nejdrive.od)) nejdrive = { p, od: a };
        if (b <= 1440 && (!nejdele || b > nejdele.do)) nejdele = { p, do: b };
      }
    }
  }
  const castiMap = new Map<string, number>();
  for (const p of salony) if (p.cast) castiMap.set(p.cast, (castiMap.get(p.cast) ?? 0) + 1);
  return {
    pocet: salony.length,
    barberu: salony.filter((p) => p.typ === 'barber').length,
    sDobou: salony.filter((p) => tyden(p)).length,
    vSobotu: salony.filter((p) => tyden(p)?.[5]?.length),
    vNedeli: salony.filter((p) => tyden(p)?.[6]?.length),
    nejdrive,
    nejdele,
    sTelefonem: salony.filter((p) => p.telefon).length,
    casti: [...castiMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

/** Odstavce úvodního textu stránky města */
export function textMesta(m: Mesto, s: Statistiky): string[] {
  const out: string[] = [];
  out.push(
    `${m.nazev} (${m.kraj.nazev}): v katalogu je ${pocetText(s.pocet, 'salon', 'salony', 'salonů')}` +
      (s.barberu ? `, z toho ${pocetText(s.barberu, 'barbershop', 'barbershopy', 'barbershopů')}` : '') +
      `. Telefon máme u ${pocetText(s.sTelefonem, 'salonu', 'salonů', 'salonů')}, otevírací dobu u ${pocetText(s.sDobou, 'salonu', 'salonů', 'salonů')}.`,
  );
  if (s.sDobou) {
    const v: string[] = [];
    if (s.vSobotu.length) v.push(`v sobotu má otevřeno ${pocetText(s.vSobotu.length, 'salon', 'salony', 'salonů')}`);
    if (s.vNedeli.length) v.push(`v neděli ${pocetText(s.vNedeli.length, 'salon', 'salony', 'salonů')}`);
    else v.push('v neděli podle našich údajů žádný');
    let t = `O víkendu ${v.join(', ')}.`;
    if (s.nejdrive) t += ` Ve všední dny nejdříve otevírá ${s.nejdrive.p.nazev} (od ${hhmm(s.nejdrive.od)})`;
    if (s.nejdele && s.nejdele.p.id !== s.nejdrive?.p.id) t += `, nejdéle má otevřeno ${s.nejdele.p.nazev} (do ${hhmm(s.nejdele.do)})`;
    if (s.nejdrive) t += '.';
    out.push(t);
  }
  if (s.casti.length > 1) {
    out.push(`Nejvíc salonů je v těchto částech: ${s.casti.map(([c, n]) => `${c} (${n})`).join(', ')}.`);
  }
  return out;
}

export interface Faq {
  q: string;
  a: string;
}

export function faqMesta(m: Mesto, s: Statistiky): Faq[] {
  const f: Faq[] = [];
  f.push({
    q: `Kolik kadeřnictví je v katalogu pro ${m.nazev}?`,
    a: `Evidujeme ${pocetText(s.pocet, 'salon', 'salony', 'salonů')}${s.barberu ? `, z toho ${pocetText(s.barberu, 'barbershop', 'barbershopy', 'barbershopů')}` : ''}. Seznam průběžně aktualizujeme.`,
  });
  if (s.vNedeli.length) {
    f.push({
      q: `Které kadeřnictví (${m.nazev}) má otevřeno v neděli?`,
      a: `Podle dostupných údajů v neděli otevírá ${jmena(s.vNedeli)}${s.vNedeli.length > 4 ? ` a další (celkem ${s.vNedeli.length})` : ''}. Před návštěvou doporučujeme otevírací dobu ověřit telefonicky.`,
    });
  }
  if (s.vSobotu.length) {
    f.push({
      q: `Které kadeřnictví (${m.nazev}) má otevřeno v sobotu?`,
      a: `V sobotu má otevřeno ${pocetText(s.vSobotu.length, 'salon', 'salony', 'salonů')}, například ${jmena(s.vSobotu, 3)}.`,
    });
  }
  if (s.nejdrive) {
    f.push({
      q: `Které kadeřnictví (${m.nazev}) otevírá nejdříve?`,
      a: `Ve všední dny nejdříve otevírá ${s.nejdrive.p.nazev}, a to v ${hhmm(s.nejdrive.od)}.`,
    });
  }
  if (s.barberu) {
    const b = m.provozovny.filter((p) => p.typ === 'barber');
    f.push({
      q: `Je v katalogu pro ${m.nazev} barbershop?`,
      a: `Ano, ${pocetText(b.length, 'barbershop', 'barbershopy', 'barbershopů')}: ${jmena(b)}${b.length > 4 ? ' a další' : ''}.`,
    });
  }
  return f;
}

export const faqJsonLd = (faq: Faq[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
});

export const itemListJsonLd = (nazev: string, salony: Provozovna[]) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: nazev,
  numberOfItems: salony.length,
  itemListElement: salony.slice(0, 100).map((p, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: new URL(url(p), SITE.url).href,
    name: p.nazev,
  })),
});

export { mestoUrl };
