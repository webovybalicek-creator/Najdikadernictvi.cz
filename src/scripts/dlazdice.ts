// Načítání dlaždic se salony (/data/dlazdice/<klíč>.json) a lehkého přehledu bodů (/data/body.json)
export type Zaznam = [number, number, string, string, string, 0 | 1, [number, number][][] | 0, 0 | 1, string, 0 | 1, 0 | 1, string?];

export const klic = (lat: number, lon: number) => `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;
const cache = new Map<string, Promise<Zaznam[]>>();

export function dlazdice(k: string): Promise<Zaznam[]> {
  if (!cache.has(k)) {
    cache.set(
      k,
      fetch(`/data/dlazdice/${k}.json`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    );
  }
  return cache.get(k)!;
}

/** Klíče dlaždic v obdélníku */
export function kliceVObdelniku(s: number, w: number, n: number, e: number): string[] {
  const out: string[] = [];
  for (let a = Math.floor(s * 2); a <= Math.floor(n * 2); a++) for (let b = Math.floor(w * 2); b <= Math.floor(e * 2); b++) out.push(`${a}_${b}`);
  return out;
}

export async function nactiObdelnik(s: number, w: number, n: number, e: number): Promise<Zaznam[]> {
  return (await Promise.all(kliceVObdelniku(s, w, n, e).map(dlazdice))).flat();
}

/** Plochý přehled bodů: [lat, lon, příznaky, …] */
let _body: Promise<number[]> | null = null;
export const body = () => (_body ??= fetch('/data/body.json').then((r) => r.json()));

export const P = { barber: 1, detske: 2, bezbar: 4, karta: 8, sobota: 16, nedele: 32, doba: 64 };
