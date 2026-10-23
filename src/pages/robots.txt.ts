import type { APIRoute } from 'astro';
import { SITE } from '../lib/config';

export const GET: APIRoute = () => {
  const body = SITE.indexovat
    ? `User-agent: *\nDisallow: /api/\nDisallow: /okoli/\n\nSitemap: ${SITE.url}/sitemap.xml\n`
    : `# Web je ve vývoji – zatím neindexovat.\nUser-agent: *\nDisallow: /\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
