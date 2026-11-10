// Denní rotace pořadí: stejné pořadí pro všechny návštěvníky v daný den, každý den jiné.
// Používá se při buildu i v prohlížeči (pořadí se změní o půlnoci, i když se web zrovna nesestaví).

/** Dnešní datum v Praze jako YYYY-MM-DD */
export const dnesPraha = (d = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(d);

/** FNV-1a 32 bit – rychlý deterministický hash řetězce */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Zamíchá položky podle dne; klic musí být pro každou položku jedinečný a stabilní (např. URL salonu) */
export function poradiDne<T>(polozky: T[], klic: (x: T) => string, den = dnesPraha()): T[] {
  return polozky
    .map((x) => ({ x, k: hash(`${den}|${klic(x)}`) }))
    .sort((a, b) => a.k - b.k)
    .map((o) => o.x);
}
