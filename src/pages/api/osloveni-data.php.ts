import type { APIRoute } from 'astro';
import { PROVOZOVNY, tyden, url, indexovatDetail } from '../../lib/data';

// Seznam salonů s veřejným e-mailem pro /api/osloveni.php.
// Generuje se jako PHP soubor (`return [...]`), takže ho server při přímém otevření nevypíše
// a hromadný seznam e-mailů tak není ke stažení. Data jsou jinak veřejná na profilech salonů.
const php = (v: unknown) => `'${String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export const GET: APIRoute = () => {
  const radky = PROVOZOVNY.filter((p) => p.email && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(p.email.trim()))
    .sort((a, b) => a.mesto.localeCompare(b.mesto, 'cs') || a.nazev.localeCompare(b.nazev, 'cs'))
    .map((p) => {
      const t = tyden(p);
      return `  ${php(p.id)} => ['nazev' => ${php(p.nazev)}, 'mesto' => ${php(p.mesto)}, 'url' => ${php(url(p))}, 'email' => ${php(p.email!.trim().toLowerCase())}, 'typ' => ${php(p.typ === 'barber' ? 'barber' : 'kadernictvi')}, 'doba' => ${t && t.some((d) => d.length) ? 'true' : 'false'}, 'fotky' => ${p.fotky?.length ? 'true' : 'false'}, 'cenik' => ${p.cenik?.length ? 'true' : 'false'}, 'overeno' => ${p.overeno ? 'true' : 'false'}, 'index' => ${indexovatDetail(p) ? 'true' : 'false'}],`;
    });
  return new Response(`<?php\n// Vygenerováno při buildu webu – neupravovat ručně.\nreturn [\n${radky.join('\n')}\n];\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
