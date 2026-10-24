import { getCollection } from 'astro:content';
import { KRAJE } from './kraje';
import { PROVOZOVNY, IMPORT_META, mesta, url, mestoUrl, krajUrl, indexovatDetail, indexovatMesto, vsechnyCtvrti, ctvrtUrl } from './data';
import { SITE } from './config';
import { KATEGORIE, kategorieUrl } from './blog';
import { zameryMesta, zamerUrl } from './seo-mesto';

export type Polozka = { loc: string; lastmod?: string };
const den = (d: string | Date) => new Date(d).toISOString().slice(0, 10);
const dataZmena = den(IMPORT_META.importovano);

export const CASTI = ['stranky', 'mesta', 'ctvrti', 'salony'] as const;
export type Cast = (typeof CASTI)[number];

export async function polozky(cast: Cast): Promise<Polozka[]> {
  if (cast === 'stranky') {
    const blog = await getCollection('blog');
    const nejnovejsi = blog.reduce((m, c) => (c.data.datum > m ? c.data.datum : m), new Date(0));
    return [
      { loc: '/', lastmod: dataZmena },
      ...['/kraje/', '/mapa/'].map((loc) => ({ loc, lastmod: dataZmena })),
      ...KRAJE.map((k) => ({ loc: krajUrl(k.slug), lastmod: dataZmena })),
      { loc: '/blog/', lastmod: den(nejnovejsi) },
      ...KATEGORIE.map((k) => ({ loc: kategorieUrl(k), lastmod: den(nejnovejsi) })),
      ...blog.map((c) => ({ loc: `/blog/${c.id}/`, lastmod: den(c.data.datum) })),
      ...['/o-webu/', '/kontakt/', '/pridat-provozovnu/', '/pro-salony/', '/ochrana-osobnich-udaju/', '/podminky-uziti/'].map((loc) => ({ loc })),
    ];
  }
  if (cast === 'mesta') {
    const out: Polozka[] = [];
    for (const m of mesta()) {
      if (!indexovatMesto(m)) continue;
      out.push({ loc: mestoUrl(m.slug), lastmod: dataZmena });
      for (const { z } of zameryMesta(m)) out.push({ loc: zamerUrl(z, m.slug), lastmod: dataZmena });
    }
    return out;
  }
  if (cast === 'ctvrti') return vsechnyCtvrti().map((c) => ({ loc: ctvrtUrl(c), lastmod: dataZmena }));
  return PROVOZOVNY.filter(indexovatDetail).map((p) => ({ loc: url(p), lastmod: p.overeno ? den(p.overeno) : dataZmena }));
}

export const xml = (p: Polozka[]) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  p.map((x) => `<url><loc>${new URL(x.loc, SITE.url).href}</loc>${x.lastmod ? `<lastmod>${x.lastmod}</lastmod>` : ''}</url>`).join('\n') +
  '\n</urlset>\n';
