import type { APIRoute } from 'astro';
import { mesta, mestaSloucena, PROVOZOVNY, url, mestoUrl } from '../lib/data';

export const GET: APIRoute = () => {
  const praha = mestaSloucena().find((x) => x.obvody);
  const m = [
    ...(praha ? [[praha.nazev, mestoUrl(praha.slug), praha.provozovny.length, praha.kraj.nazev]] : []),
    ...mesta()
      .filter((x) => x.slug !== 'praha')
      .map((x) => [x.nazev, mestoUrl(x.slug), x.provozovny.length, x.kraj.nazev]),
  ];
  const s = PROVOZOVNY.map((p) => [p.nazev, url(p), p.cast && p.mesto === 'Praha' ? `${p.mesto}, ${p.cast}` : p.mesto]);
  return new Response(JSON.stringify({ m, s }), { headers: { 'Content-Type': 'application/json' } });
};
