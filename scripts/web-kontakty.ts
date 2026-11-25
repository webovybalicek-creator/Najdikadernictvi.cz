/**
 * Doplnění telefonu a otevírací doby z webů salonů.
 *
 * Projde salony, které mají web, ale chybí jim telefon nebo otevírací doba. Stáhne úvodní stránku
 * a pár podstránek (kontakt, o nás…). Údaje převezme jen tehdy, když web uvádí ADRESU SALONU
 * (ulice + číslo domu, u obcí bez ulic obec + číslo), aby se nepřevzaly údaje jiné provozovny.
 *  - telefon: z JSON-LD (schema.org), odkazů tel: nebo textu; jen když web uvádí právě jedno číslo
 *  - otevírací doba: z JSON-LD (openingHours / openingHoursSpecification) nebo z textu za „Otevírací doba“
 *    (např. „Po–Pá 7–18, So 8–12“); když text nejde celý přečíst, nebere se nic
 *  - online rezervace: odkaz nebo iframe na rezervační systém (Reservio, MyFox, Fresha, Booksy…) s adresou konkrétního
 *    salonu; převezme se, když web uvádí adresu salonu NEBO ho v katalogu nepoužívá žádný jiný salon (u řetězců by
 *    odkaz mohl vést na jinou pobočku). Víc různých rezervačních odkazů = nic (nejde poznat, který patří salonu).
 * Výsledek se zapíše do src/data/doplneno.json – jen pole, která tam ani v katalogu nejsou.
 *
 * Použití:  npx tsx scripts/web-kontakty.ts [--zkouska] [--id r123,n456] [--max 300]
 *   --zkouska  nic nezapisuje, jen vypíše nálezy
 */
import fs from 'node:fs';
import path from 'node:path';
import { PROVOZOVNY, jeRezervace } from '../src/lib/data.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOUBOR = path.join(ROOT, 'src/data/doplneno.json');
const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const ZKOUSKA = process.argv.includes('--zkouska');
const IDS = arg('--id')?.split(',');
const MAX = Number(arg('--max') ?? 1000);
const UA = 'Mozilla/5.0 (compatible; najdikadernictvi.cz-kontakty; +https://najdikadernictvi.cz/o-webu/)';
const PRESKOCIT = /facebook\.com|instagram\.com|google\.|goo\.gl|firmy\.cz|tiktok\.com|youtube\.com/i;

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

function text(html: string) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|td|h\d|span|a|strong|b)>/gi, (m) => (/br|p|div|li|tr|h\d/i.test(m) ? '\n' : ' '))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&ndash;|&#8211;/g, '–')
    .replace(/&mdash;|&#8212;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*/g, '\n');
}

async function stahni(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'cs' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    if (!r.ok || !/html/i.test(r.headers.get('content-type') ?? '')) return null;
    const t = await r.text();
    return t.length > 3_000_000 ? null : t;
  } catch {
    return null;
  }
}

// ---------- adresa ----------
export function adresaSedi(p: any, t: string) {
  const n = norm(t);
  const cisla = String(p.cisloDomu ?? '').toLowerCase().split('/').filter(Boolean);
  if (!cisla.length) return false;
  const misto = p.ulice ? norm(p.ulice).replace(/^(ulice|nam\.?|namesti|tr\.?|trida) /, '') : norm(p.mesto ?? '');
  if (!misto) return false;
  // název ulice (bez koncovky, kvůli skloňování) a v blízkosti číslo domu
  const koren = misto.length > 6 ? misto.slice(0, misto.length - 2) : misto;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return cisla.some((c) => new RegExp(`${esc(koren)}[a-z]{0,4}\\.?,? (c\\. ?p\\. ?)?(\\d+[a-z]?/)?${esc(c)}(?![0-9])`).test(n));
}

// ---------- telefon ----------
function telefony(html: string, t: string, ld: any[]) {
  const set = new Set<string>();
  const pridej = (s: string) => {
    const d = s.replace(/\D/g, '').replace(/^00420|^420/, '');
    if (/^[2-9]\d{8}$/.test(d)) set.add(d);
  };
  for (const o of ld) if (o.telephone) pridej(String(o.telephone));
  for (const m of html.matchAll(/href=["']tel:([^"']+)/gi)) pridej(m[1]);
  for (const m of t.matchAll(/(?:\+420|00420)?[  ]?\b([2-9]\d{2}[  .-]?\d{3}[  .-]?\d{3})\b/g)) {
    const okoli = t.slice(Math.max(0, m.index! - 25), m.index!);
    if (/(tel|mob|telefon|volejte|☎|📞|kontakt)/i.test(okoli) || /^\+|^00/.test(m[0])) pridej(m[1]);
  }
  return [...set];
}
const formatTel = (d: string) => `+420 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;

// ---------- otevírací doba ----------
const DEN: Record<string, number> = { po: 0, pon: 0, pondeli: 0, ut: 1, ute: 1, utery: 1, st: 2, str: 2, streda: 2, ct: 3, ctv: 3, ctvrtek: 3, pa: 4, pat: 4, patek: 4, so: 5, sob: 5, sobota: 5, ne: 6, ned: 6, nedele: 6 };
const OSM = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const cas = (s: string) => {
  const [h, m = '00'] = s.split(/[:.]/);
  const hh = Number(h);
  return hh <= 24 && Number(m) < 60 ? `${String(hh).padStart(2, '0')}:${m.padEnd(2, '0')}` : null;
};

/** „Po–Pá 7–18, So 8–12“ → { Mo: '07:00-18:00', … }; při čemkoli nečitelném vrací null */
export function hodinyZTextu(t: string): string | null {
  const i = norm(t).search(/oteviraci (doba|hodiny)|otevreno:/);
  if (i < 0) return null;
  let s = norm(t.slice(i, i + 400)).replace(/^(oteviraci (doba|hodiny)|otevreno)\s*:?\s*/, '');
  s = s.replace(/[—−]/g, '–').replace(/ ?- ?/g, '–').replace(/ ?– ?/g, '–').replace(/\bhod\.?|\bh\b/g, '').replace(/ do /g, '–').replace(/\bod /g, '');
  const D = '(pondeli|utery|streda|ctvrtek|patek|sobota|nedele|pon|ute|str|ctv|pat|sob|ned|po|ut|st|ct|pa|so|ne)\\.?';
  const T = '(\\d{1,2}(?:[:.]\\d{2})?)–(\\d{1,2}(?:[:.]\\d{2})?)';
  const re = new RegExp(`^\\s*[,;\\n|]*\\s*${D}(?:–${D}|((?:\\s*,\\s*${D})+))?\\s*:?\\s*(zavreno|${T}(?:\\s*(?:,|a|\\+|/)\\s*${T})?)`);
  const dny: (string | null)[] = Array(7).fill(null);
  let n = 0;
  while (true) {
    const m = s.match(re);
    if (!m) break;
    // skupiny: 1 den, 2 den „do“, 3 výčet „, So, Ne“, 5 zavreno|časy, 6–9 časy
    const a = DEN[m[1]], b = m[2] ? DEN[m[2]] : a;
    if (a === undefined || b === undefined || b < a) return null;
    const vycet = m[3] ? m[3].split(',').map((x) => DEN[x.trim().replace(/\.$/, '')]).filter((x) => x !== undefined) : [];
    let v: string | null = null;
    if (m[5] !== 'zavreno') {
      const u = [[m[6], m[7]], [m[8], m[9]]].filter(([x, y]) => x && y).map(([x, y]) => [cas(x), cas(y)]);
      if (u.some(([x, y]) => !x || !y || x >= y)) return null;
      v = u.map(([x, y]) => `${x}-${y}`).join(',');
    }
    for (let d = a; d <= b; d++) dny[d] = v;
    for (const d of vycet) dny[d] = v;
    n++;
    s = s.slice(m[0].length);
  }
  if (!n || dny.every((x) => !x)) return null;
  // zbytek musí být konec bloku (jiný nadpis), ne další nepřečtený řádek s dnem
  if (new RegExp(`^\\s*[,;\\n|]*\\s*${D}\\b`).test(s)) return null;
  if (new RegExp(`\\b${D}\\b[^\\n]{0,15}\\d{1,2}(?:[:.]\\d{2})?–\\d`).test(s.slice(0, 80))) return null;
  return OSM.map((d, k) => (dny[k] ? `${d} ${dny[k]}` : null)).filter(Boolean).join('; ');
}

function hodinyZLd(ld: any[]): string | null {
  for (const o of ld) {
    const spec = [o.openingHoursSpecification].flat().filter(Boolean);
    if (spec.length) {
      const dny: Record<string, string[]> = {};
      for (const sp of spec) {
        if (!sp.opens || !sp.closes) continue;
        const o1 = cas(String(sp.opens).slice(0, 5)), c1 = cas(String(sp.closes).slice(0, 5));
        if (!o1 || !c1 || o1 >= c1) return null;
        for (const d of [sp.dayOfWeek].flat()) {
          const k = OSM.find((x, i) => String(d).toLowerCase().includes(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][i]));
          if (k) (dny[k] ??= []).push(`${o1}-${c1}`);
        }
      }
      const r = OSM.filter((d) => dny[d]).map((d) => `${d} ${dny[d].join(',')}`).join('; ');
      if (r) return r;
    }
    const oh = [o.openingHours].flat().filter(Boolean).join('; ');
    if (/^[A-Z][a-z]/.test(oh) && /\d{2}:\d{2}-\d{2}:\d{2}/.test(oh)) return oh;
  }
  return null;
}

function jsonLd(html: string): any[] {
  const out: any[] = [];
  const projdi = (o: any) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(projdi);
    out.push(o);
    if (o['@graph']) projdi(o['@graph']);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      projdi(JSON.parse(m[1]));
    } catch {}
  }
  return out;
}

// ---------- online rezervace ----------
export function rezervace(html: string): string | null {
  const nalezy = new Map<string, string>();
  for (const m of html.matchAll(/(?:href|src|data-url|data-href)=["']([^"']+)["']/gi)) {
    const u = m[1].replace(/&amp;/g, '&').trim();
    if (!/^https?:/i.test(u) || !jeRezervace(u)) continue;
    // klíč = salon v rezervačním systému (subdoména nebo první část cesty), ať se různé podstránky téhož salonu nesčítají
    const x = new URL(u);
    const klic = x.host.split('.').length > 2 && !/^www\./.test(x.host) ? x.host : `${x.host}/${x.pathname.split('/').filter(Boolean).slice(0, 3).join('/')}`;
    if (!nalezy.has(klic)) nalezy.set(klic, `${x.origin}${x.pathname}`.replace(/\/(booking|embed|widget)\/?$/i, '/'));
  }
  return nalezy.size === 1 ? [...nalezy.values()][0] : null;
}

function podstranky(html: string, base: string) {
  const host = new URL(base).host;
  const r = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      if (u.host === host && /kontakt|contact|oteviraci|otevirac|o-nas|onas|about|cenik|provozovna|rezervac|objedn|booking/i.test(u.pathname)) r.add(u.href);
    } catch {}
  }
  return [...r].slice(0, 3);
}

const hostWebu = (w: string) => {
  try {
    return new URL(/^https?:/.test(w) ? w : 'https://' + w).host.replace(/^www\./, '');
  } catch {
    return w;
  }
};
const SDILENE = new Map<string, number>();
for (const p of PROVOZOVNY as any[]) if (p.web) SDILENE.set(hostWebu(p.web), (SDILENE.get(hostWebu(p.web)) ?? 0) + 1);

async function zpracuj(p: any) {
  let web = String(p.web);
  if (!/^https?:/.test(web)) web = 'https://' + web;
  const html0 = await stahni(web);
  if (!html0) return { stav: 'nedostupny' };
  const stranky = [html0];
  for (const u of podstranky(html0, web)) {
    const h = await stahni(u);
    if (h) stranky.push(h);
  }
  const html = stranky.join('\n');
  const t = stranky.map(text).join('\n');
  const ld = jsonLd(html);
  const ldAdresa = ld.map((o) => [o.address?.streetAddress, o.address?.addressLocality].filter(Boolean).join(' ')).join('\n');
  const sedi = adresaSedi(p, t + '\n' + ldAdresa);
  const e: Record<string, string> = {};
  if (!p.rezervace && (sedi || SDILENE.get(hostWebu(web)) === 1)) {
    const r = rezervace(html);
    if (r) e.rezervace = r;
  }
  if (!sedi) return { stav: Object.keys(e).length ? 'ok' : 'adresa nesedi', e };
  if (!p.telefon) {
    const tel = telefony(html, t, ld);
    if (tel.length === 1) e.telefon = formatTel(tel[0]);
  }
  if (!p.oteviraciDoba) {
    const h = hodinyZLd(ld) ?? stranky.map((x) => hodinyZTextu(text(x))).find(Boolean) ?? null;
    if (h && !/00:00-24:00/.test(h)) e.oteviraciDoba = h;
  }
  return { stav: Object.keys(e).length ? 'ok' : 'nic', e };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(SOUBOR, 'utf8'));
  const kandidati = (PROVOZOVNY as any[])
    .filter((p) => (IDS ? IDS.includes(p.id) : true))
    .filter((p) => p.web && !PRESKOCIT.test(p.web) && !jeRezervace(p.web) && (!p.telefon || !p.oteviraciDoba || !p.rezervace))
    .slice(0, MAX);
  console.log(`kandidátů: ${kandidati.length}`);
  const stat: Record<string, number> = {};
  let i = 0;
  const fronta = [...kandidati];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let p; (p = fronta.shift()); ) {
        const r = await zpracuj(p);
        stat[r.stav] = (stat[r.stav] ?? 0) + 1;
        if (r.stav === 'ok') {
          const cil = (data.salony[p.id] ??= {});
          for (const [k, v] of Object.entries(r.e!)) if (!cil[k]) cil[k] = v;
          console.log(`ok ${p.id} ${p.web} ${JSON.stringify(r.e)}`);
        }
        if (++i % 50 === 0) console.log(`… ${i}/${kandidati.length}`);
      }
    }),
  );
  console.log('výsledek:', JSON.stringify(stat));
  if (!ZKOUSKA && stat.ok) {
    fs.writeFileSync(SOUBOR, JSON.stringify(data, null, 2) + '\n');
    console.log(`zapsáno do ${path.relative(ROOT, SOUBOR)}`);
  }
}

if (process.argv[1]?.endsWith('web-kontakty.ts')) await main();
