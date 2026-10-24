import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { PROVOZOVNY } from '../lib/data';

// Otisky (SHA-256) e-mailů salonů z katalogu: majitel, který zná e-mail salonu, dostane přístup ke správě profilu hned.
export const GET: APIRoute = () => {
  const out: Record<string, string> = {};
  for (const p of PROVOZOVNY) {
    if (p.email) out[p.id] = createHash('sha256').update(p.email.trim().toLowerCase()).digest('hex');
  }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
};
