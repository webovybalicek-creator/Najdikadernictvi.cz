import type { APIRoute } from 'astro';
import { dlazdice, zaznam } from '../../../lib/dlazdice';
import type { Provozovna } from '../../../lib/data';

export function getStaticPaths() {
  return [...dlazdice().entries()].map(([d, s]) => ({ params: { d }, props: { s } }));
}

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify((props.s as Provozovna[]).map(zaznam)), { headers: { 'Content-Type': 'application/json' } });
