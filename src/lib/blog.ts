import { getCollection, type CollectionEntry } from 'astro:content';
import { KATEGORIE } from '../content.config';
import { slugify } from './slug';

export type Clanek = CollectionEntry<'blog'>;

export async function clanky(): Promise<Clanek[]> {
  return (await getCollection('blog')).sort((a, b) => b.data.datum.getTime() - a.data.datum.getTime());
}

export const kategorieSlug = (k: string) => slugify(k);
export const kategorieUrl = (k: string) => `/blog/kategorie/${kategorieSlug(k)}/`;
export const clanekUrl = (c: Clanek) => `/blog/${c.id}/`;
export { KATEGORIE };

/** Odhad doby čtení v minutách (200 slov za minutu) */
import { readFileSync } from 'node:fs';
const slovaCache = new Map<string, number>();
function slova(c: Clanek): number {
  if (!slovaCache.has(c.id)) {
    const text = c.body || (c.filePath ? readFileSync(c.filePath, 'utf8') : '');
    slovaCache.set(c.id, text.split(/\s+/).filter(Boolean).length);
  }
  return slovaCache.get(c.id)!;
}
export const casCteni = (c: Clanek) => Math.max(2, Math.round(slova(c) / 180));

export const datumText = (d: Date) => d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });

/** Kořeny významových slov (bez diakritiky, prvních 5 znaků) pro hledání příbuzných článků */
const STOP = new Set(['jak', 'pro', 'kdy', 'nebo', 'jake', 'jaky', 'jaka', 'proc', 'kolik', 'vlasy', 'vlasu', 'vlasech', 'clanek', 'tipy', 'rady', 'doma', 'nejl', 'vase', 'vas', 'ktere', 'ktery', 'tak', 'aby', 'pri', 'podle', 'mezi', 'jsou', 'neni', 'muze', 'take']);
const koreny = (c: Clanek) =>
  new Set(
    `${c.data.title} ${c.data.description}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOP.has(w))
      .map((w) => w.slice(0, 5)),
  );

/** Související články: podle společných slov v titulku a popisu, stejná kategorie má bonus */
export function souvisejici(vse: Clanek[], c: Clanek, n = 3): Clanek[] {
  const k = koreny(c);
  return vse
    .filter((x) => x.id !== c.id)
    .map((x) => {
      let skore = x.data.kategorie === c.data.kategorie ? 1.5 : 0;
      for (const w of koreny(x)) if (k.has(w)) skore += 1;
      return { x, skore };
    })
    .sort((a, b) => b.skore - a.skore || b.x.data.datum.getTime() - a.x.data.datum.getTime())
    .slice(0, n)
    .map((v) => v.x);
}
