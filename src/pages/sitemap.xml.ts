import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { KRAJE } from '../lib/kraje';
import { PROVOZOVNY, mesta, url, mestoUrl, krajUrl, indexovatDetail } from '../lib/data';
import { SITE } from '../lib/config';

// Vlastní sitemap: obsahuje jen stránky, které chceme indexovat (bez detailů salonů jen z rejstříku)
export const GET: APIRoute = async () => {
  const cesty = new Set<string>(['/', '/kraje/', '/blog/', '/o-webu/', '/kontakt/', '/pridat-provozovnu/']);
  for (const k of KRAJE) cesty.add(krajUrl(k.slug));
  for (const m of mesta()) cesty.add(mestoUrl(m.slug));
  for (const p of PROVOZOVNY) if (indexovatDetail(p)) cesty.add(url(p));
  for (const c of await getCollection('blog')) cesty.add(`/blog/${c.id}/`);
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [...cesty].map((c) => `<url><loc>${new URL(c, SITE.url).href}</loc></url>`).join('\n') +
    '\n</urlset>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
