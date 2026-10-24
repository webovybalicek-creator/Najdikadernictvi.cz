import type { APIRoute } from 'astro';
import { PROVOZOVNY } from '../../lib/data';
import { priznaky } from '../../lib/dlazdice';

// Lehký přehled všech salonů pro mapu: ploché pole [lat, lon, příznaky, lat, lon, příznaky, …]
export const GET: APIRoute = () => {
  const out: number[] = [];
  for (const p of PROVOZOVNY) out.push(Math.round(p.lat * 1e4) / 1e4, Math.round(p.lon * 1e4) / 1e4, priznaky(p));
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
};
