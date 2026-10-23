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

/** Související: nejdřív stejná kategorie, pak nejnovější ostatní */
export function souvisejici(vse: Clanek[], c: Clanek, n = 3): Clanek[] {
  const ostatni = vse.filter((x) => x.id !== c.id);
  return [
    ...ostatni.filter((x) => x.data.kategorie === c.data.kategorie),
    ...ostatni.filter((x) => x.data.kategorie !== c.data.kategorie),
  ].slice(0, n);
}
