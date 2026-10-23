export interface Kraj {
  /** Kód podle ISO 3166-2 */
  iso: string;
  slug: string;
  nazev: string;
  /** Tvar pro „v …“ (lokál) */
  vNazev: string;
}

export const KRAJE: Kraj[] = [
  { iso: 'CZ-10', slug: 'praha', nazev: 'Praha', vNazev: 'v Praze' },
  { iso: 'CZ-20', slug: 'stredocesky-kraj', nazev: 'Středočeský kraj', vNazev: 've Středočeském kraji' },
  { iso: 'CZ-31', slug: 'jihocesky-kraj', nazev: 'Jihočeský kraj', vNazev: 'v Jihočeském kraji' },
  { iso: 'CZ-32', slug: 'plzensky-kraj', nazev: 'Plzeňský kraj', vNazev: 'v Plzeňském kraji' },
  { iso: 'CZ-41', slug: 'karlovarsky-kraj', nazev: 'Karlovarský kraj', vNazev: 'v Karlovarském kraji' },
  { iso: 'CZ-42', slug: 'ustecky-kraj', nazev: 'Ústecký kraj', vNazev: 'v Ústeckém kraji' },
  { iso: 'CZ-51', slug: 'liberecky-kraj', nazev: 'Liberecký kraj', vNazev: 'v Libereckém kraji' },
  { iso: 'CZ-52', slug: 'kralovehradecky-kraj', nazev: 'Královéhradecký kraj', vNazev: 'v Královéhradeckém kraji' },
  { iso: 'CZ-53', slug: 'pardubicky-kraj', nazev: 'Pardubický kraj', vNazev: 'v Pardubickém kraji' },
  { iso: 'CZ-63', slug: 'kraj-vysocina', nazev: 'Kraj Vysočina', vNazev: 'v Kraji Vysočina' },
  { iso: 'CZ-64', slug: 'jihomoravsky-kraj', nazev: 'Jihomoravský kraj', vNazev: 'v Jihomoravském kraji' },
  { iso: 'CZ-71', slug: 'olomoucky-kraj', nazev: 'Olomoucký kraj', vNazev: 'v Olomouckém kraji' },
  { iso: 'CZ-72', slug: 'zlinsky-kraj', nazev: 'Zlínský kraj', vNazev: 've Zlínském kraji' },
  { iso: 'CZ-80', slug: 'moravskoslezsky-kraj', nazev: 'Moravskoslezský kraj', vNazev: 'v Moravskoslezském kraji' },
];

export const krajBySlug = (slug: string) => KRAJE.find((k) => k.slug === slug);
