import type { APIRoute } from 'astro';
import { PROVOZOVNY } from '../lib/data';
import { zaznam } from '../lib/dlazdice';

// Celý index salonů. Prohlížeč ho nestahuje (používá /data/dlazdice/), čte ho jen serverová rozesílka upozornění.
export const GET: APIRoute = () =>
  new Response(JSON.stringify(PROVOZOVNY.map(zaznam)), { headers: { 'Content-Type': 'application/json' } });
