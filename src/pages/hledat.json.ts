import type { APIRoute } from 'astro';
import { mesta, PROVOZOVNY, url, mestoUrl } from '../lib/data';

export const GET: APIRoute = () => {
  const m = mesta().map((x) => [x.nazev, mestoUrl(x.slug), x.provozovny.length, x.kraj.nazev]);
  const s = PROVOZOVNY.map((p) => [p.nazev, url(p), p.cast && p.mesto === 'Praha' ? `${p.mesto}, ${p.cast}` : p.mesto]);
  return new Response(JSON.stringify({ m, s }), { headers: { 'Content-Type': 'application/json' } });
};
