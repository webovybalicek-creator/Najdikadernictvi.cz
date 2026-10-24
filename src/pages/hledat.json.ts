import type { APIRoute } from 'astro';
import { mesta, mestaSloucena, PROVOZOVNY } from '../lib/data';

// Index pro našeptávač. Salony odkazují na město indexem, ať se neopakuje název a URL obce:
// m: [název, url, počet, kraj], s: [název salonu, slug, index města v m]
export const GET: APIRoute = () => {
  const praha = mestaSloucena().find((x) => x.obvody);
  const seznam = mesta().filter((x) => x.slug !== 'praha');
  const m = [
    ...seznam.map((x) => [x.nazev, `/${x.slug}/`, x.provozovny.length, x.kraj.nazev]),
    ...(praha ? [[praha.nazev, `/${praha.slug}/`, praha.provozovny.length, praha.kraj.nazev]] : []),
  ];
  const poradi = new Map(seznam.map((x, i) => [x.slug, i]));
  const s = PROVOZOVNY.filter((p) => poradi.has(p.mestoSlug)).map((p) => [p.nazev, p.slug, poradi.get(p.mestoSlug)]);
  return new Response(JSON.stringify({ m, s }), { headers: { 'Content-Type': 'application/json' } });
};
