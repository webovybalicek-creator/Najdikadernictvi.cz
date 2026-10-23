import type { APIRoute } from 'astro';
import { SITE } from '../lib/config';

// ads.txt pro Google AdSense (f08c47fec0942fa0 je pevné ID Googlu v ads.txt)
export const GET: APIRoute = () => {
  const pub = SITE.adsense.replace(/^ca-/, '');
  const body = pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : '# Reklama zatím není nasazena.\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
