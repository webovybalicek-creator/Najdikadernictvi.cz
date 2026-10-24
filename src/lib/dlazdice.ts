// Rozdělení salonů do dlaždic 0,5° × 0,5° (cca 55 × 35 km), ať klient stahuje jen data z okolí.
import { PROVOZOVNY, url, adresa, tyden, type Provozovna } from './data';

export const klicDlazdice = (lat: number, lon: number) => `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;

/** Záznam: [lat, lon, název, url, adresa, barber, týden | 0, dětské, id, bezbariérové, karta] */
export const zaznam = (p: Provozovna) => [
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
];

/** Bitové příznaky pro lehký přehled všech bodů na mapě */
export function priznaky(p: Provozovna): number {
  const t = tyden(p);
  return (
    (p.typ === 'barber' ? 1 : 0) |
    (p.zamereni.includes('detske') ? 2 : 0) |
    (p.bezbarierove === 'yes' || p.bezbarierove === 'limited' ? 4 : 0) |
    (p.platbaKartou === 'yes' ? 8 : 0) |
    (t?.[5]?.length ? 16 : 0) |
    (t?.[6]?.length ? 32 : 0) |
    (t ? 64 : 0)
  );
}

let _d: Map<string, Provozovna[]> | undefined;
export function dlazdice(): Map<string, Provozovna[]> {
  if (_d) return _d;
  _d = new Map();
  for (const p of PROVOZOVNY) {
    const k = klicDlazdice(p.lat, p.lon);
    if (!_d.has(k)) _d.set(k, []);
    _d.get(k)!.push(p);
  }
  return _d;
}
