import type { APIRoute } from 'astro';
import { PROVOZOVNY, url, adresa, tyden } from '../lib/data';

// Kompaktní index pro „V mém okolí“ a mapu: [lat, lon, název, url, adresa, barber(1/0), otevírací týden | 0, dětské(1/0), id, bezbariérové(1/0), karta(1/0)]
export const GET: APIRoute = () => {
  const s = PROVOZOVNY.map((p) => [
    Math.round(p.lat * 1e4) / 1e4,
    Math.round(p.lon * 1e4) / 1e4,
    p.nazev,
    url(p),
    adresa(p, true) || p.mesto,
    p.typ === 'barber' ? 1 : 0,
    tyden(p) ?? 0,
    p.zamereni.includes('detske') ? 1 : 0,
    p.id,
    p.bezbarierove === 'yes' || p.bezbarierove === 'limited' ? 1 : 0,
    p.platbaKartou === 'yes' ? 1 : 0,
  ]);
  return new Response(JSON.stringify(s), { headers: { 'Content-Type': 'application/json' } });
};
