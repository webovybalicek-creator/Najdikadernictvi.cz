import type { APIRoute } from 'astro';
import { CASTI, polozky, xml, type Cast } from '../lib/sitemap';

export function getStaticPaths() {
  return CASTI.map((cast) => ({ params: { cast } }));
}

export const GET: APIRoute = async ({ params }) =>
  new Response(xml(await polozky(params.cast as Cast)), { headers: { 'Content-Type': 'application/xml' } });
