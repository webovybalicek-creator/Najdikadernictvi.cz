// Vypočtené srovnání salonu s ostatními v obci a v okolí.
// Dává každému detailu unikátní obsah z našich dat (žádné šablonové fráze bez čísel).
import { PROVOZOVNY, tyden, vOkoli, url, pocetText, indexovatDetail, vzdalenostKm, type Provozovna } from './data';
import { hhmm, type Tyden } from './oteviraci-doba';

const MIN_SROVNANI = 5;
const VECER = 19 * 60;

const hodinTydne = (t: Tyden) => t.reduce((s, d) => s + d.reduce((a, [od, do_]) => a + Math.max(0, Math.min(do_, 1440) - od), 0), 0) / 60;
const zaviraVsedni = (t: Tyden) => Math.max(0, ...t.slice(0, 5).flatMap((d) => d.map(([, b]) => Math.min(b, 1440))));
const oteviraVsedni = (t: Tyden) => Math.min(1440, ...t.slice(0, 5).flatMap((d) => d.map(([a]) => a)));
const sobota = (t: Tyden) => t[5]?.length > 0;
const nedele = (t: Tyden) => t[6]?.length > 0;
const vecer = (t: Tyden) => zaviraVsedni(t) >= VECER;

interface StatMesta {
  tydny: Tyden[];
  hodiny: number[];
  zavira: number[];
}
const _mesta = new Map<string, StatMesta>();
function statMesta(slug: string): StatMesta {
  let s = _mesta.get(slug);
  if (!s) {
    const tydny = PROVOZOVNY.filter((p) => p.mestoSlug === slug)
      .map((p) => tyden(p))
      .filter((t): t is Tyden => !!t && t.some((d) => d.length));
    s = { tydny, hodiny: tydny.map(hodinTydne), zavira: tydny.map(zaviraVsedni) };
    _mesta.set(slug, s);
  }
  return s;
}

/** Podíl ostatních hodnot, které jsou ostře menší (v %), zaokrouhleno na 5 */
const podilMensich = (hodnota: number, vse: number[]) => {
  const ostatni = vse.length - 1;
  if (ostatni < 1) return 0;
  return Math.round(((vse.filter((v) => v < hodnota).length / ostatni) * 100) / 5) * 5;
};

const km = (n: number) => (n < 1 ? `${Math.round(n * 1000 / 10) * 10} m` : `${n.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} km`);

export interface Alternativa {
  popis: string;
  nazev: string;
  href: string;
  vzdalenost: string;
}

export interface Srovnani {
  fakta: string[];
  alternativy: Alternativa[];
}

export function srovnani(p: Provozovna): Srovnani {
  const fakta: string[] = [];
  const t = tyden(p);
  const ma = !!t && t.some((d) => d.length);
  const m = statMesta(p.mestoSlug);
  const praha = /^Praha (\d+)$/.exec(p.mesto);
  const vObci = praha ? `v Praze ${praha[1]}` : `v obci ${p.mesto}`;

  if (t && ma) {
    const hod = Math.round(hodinTydne(t));
    if (m.tydny.length >= MIN_SROVNANI) {
      const pod = podilMensich(hodinTydne(t), m.hodiny);
      if (pod >= 60) fakta.push(`Má otevřeno zhruba ${hod} hodin týdně, déle než ${pod} % salonů ${vObci} se známou otevírací dobou.`);
      else if (pod <= 25) fakta.push(`Má otevřeno zhruba ${hod} hodin týdně, méně než většina salonů ${vObci}. Před návštěvou se vyplatí ověřit, kdy má otevřeno.`);
      else fakta.push(`Má otevřeno zhruba ${hod} hodin týdně, podobně jako běžný salon ${vObci}.`);
    } else {
      fakta.push(`Má otevřeno zhruba ${hod} hodin týdně.`);
    }

    const zav = zaviraVsedni(t);
    if (zav >= VECER) {
      const pocetVecer = m.zavira.filter((z) => z >= VECER).length;
      fakta.push(
        m.tydny.length >= MIN_SROVNANI
          ? `Aspoň jeden všední den má otevřeno do ${hhmm(zav)}. Do 19:00 nebo déle to ${vObci} nabízí ${pocetText(pocetVecer, 'salon', 'salony', 'salonů')} z ${m.tydny.length} se známou otevírací dobou.`
          : `Aspoň jeden všední den má otevřeno do ${hhmm(zav)}, takže to stihnete i po práci.`,
      );
    }
    const otv = oteviraVsedni(t);
    if (otv <= 7 * 60 + 30) fakta.push(`Ve všední dny otevírá už v ${hhmm(otv)}, ostříhat se dá ještě před prací.`);

    if (sobota(t) || nedele(t)) {
      const dny = [sobota(t) && 'v sobotu', nedele(t) && 'v neděli'].filter(Boolean).join(' i ');
      const vikend = m.tydny.filter((x) => (sobota(t) ? sobota(x) : true) && (nedele(t) ? nedele(x) : true)).length;
      fakta.push(
        m.tydny.length >= MIN_SROVNANI
          ? `Má otevřeno ${dny}. ${vObci.charAt(0).toUpperCase() + vObci.slice(1)} to platí pro ${pocetText(vikend, 'salon', 'salony', 'salonů')} z ${m.tydny.length} se známou otevírací dobou.`
          : `Má otevřeno ${dny}.`,
      );
    } else {
      fakta.push('O víkendu má zavřeno.');
    }
  }

  // Okolí: hustota a alternativy
  const blizko = vOkoli(p, 80).filter((o) => o.km <= 15);
  const do1km = PROVOZOVNY.filter((o) => o.id !== p.id && Math.abs(o.lat - p.lat) < 0.012 && Math.abs(o.lon - p.lon) < 0.018 && vzdalenostKm(p, o) <= 1).length;
  if (do1km >= 2) fakta.push(`Do 1 km odsud evidujeme ${pocetText(do1km, 'další salon', 'další salony', 'dalších salonů')}.`);
  else if (blizko.length && blizko[0].km > 2) fakta.push(`Nejbližší další salon je až ${km(blizko[0].km)} daleko.`);

  const alternativy: Alternativa[] = [];
  const pouzite = new Set<string>();
  const najdi = (popis: string, test: (t: Tyden | null, o: Provozovna) => boolean) => {
    const hit = blizko.find(({ p: o }) => !pouzite.has(o.id) && test(tyden(o), o));
    if (!hit) return;
    pouzite.add(hit.p.id);
    alternativy.push({ popis, nazev: hit.p.nazev, href: url(hit.p), vzdalenost: km(hit.km) });
  };
  if (!t || !ma || !sobota(t)) najdi('Otevřeno v sobotu', (x) => !!x && sobota(x));
  if (!t || !ma || !nedele(t)) najdi('Otevřeno v neděli', (x) => !!x && nedele(x));
  if (!t || !ma || !vecer(t)) najdi('Otevřeno večer', (x) => !!x && vecer(x));
  if (p.typ !== 'barber') najdi('Nejbližší barbershop', (_x, o) => o.typ === 'barber' && indexovatDetail(o));
  else najdi('Nejbližší kadeřnictví', (_x, o) => o.typ !== 'barber' && indexovatDetail(o));

  return { fakta, alternativy };
}
