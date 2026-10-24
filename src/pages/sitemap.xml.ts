import type { APIRoute } from 'astro';
import { SITE } from '../lib/config';
import { IMPORT_META } from '../lib/data';
import { CASTI } from '../lib/sitemap';

// Index sitemap: jednotlivé části zvlášť, ať je v Search Console vidět indexace podle typu stránek
export const GET: APIRoute = () => {
  const lastmod = new Date(IMPORT_META.importovano).toISOString().slice(0, 10);
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    CASTI.map((c) => `<sitemap><loc>${SITE.url}/sitemap-${c}.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`).join('\n') +
    '\n</sitemapindex>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
