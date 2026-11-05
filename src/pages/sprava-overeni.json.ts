import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { PROVOZOVNY } from '../lib/data';

// Podklady pro automatické ověření majitele v /api/sprava.php:
// e = otisk (SHA-256) e-mailu salonu z katalogu, w = web salonu (e-mail na jeho doméně nebo uvedený na něm = majitel).
export const GET: APIRoute = () => {
  const out: Record<string, { e?: string; w?: string }> = {};
  for (const p of PROVOZOVNY) {
    const z: { e?: string; w?: string } = {};
    if (p.email) z.e = createHash('sha256').update(p.email.trim().toLowerCase()).digest('hex');
    if (p.web) z.w = p.web.trim();
    if (z.e || z.w) out[p.id] = z;
  }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
};
