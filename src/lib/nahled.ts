import type { ImageMetadata } from 'astro';

/**
 * Náhledové fotky pro výpisy (města, čtvrti, kraje, kategorie). Google bere náhled ve výsledcích
 * hledání z fotky viditelné na stránce, og:image a strukturovaná data to jen potvrzují.
 * Fotky jsou z src/assets/blog/ (Unsplash License). Stejná stránka má vždy stejnou fotku,
 * sousední stránky se střídají podle adresy.
 */
const SOUBORY = import.meta.glob<{ default: ImageMetadata }>('../assets/blog/*.jpg', { eager: true });

const POPIS: Record<string, string> = {
  'salon-cihly': 'Světlý kadeřnický salon s křesly a kulatými zrcadly',
  'salon-kreslo-zrcadlo': 'Kadeřnické křeslo u zrcadla v salonu',
  'salon-praha-kresla': 'Kadeřnický salon s řadou křesel u zrcadla',
  'salon-zrcadla': 'Moderní kadeřnictví s kulatými zrcadly',
  'strih-salon-klientka': 'Kadeřnice stříhá klientku v salonu',
  fenovani: 'Foukaná v kadeřnickém salonu',
  'strih-damsky': 'Mytí vlasů v kadeřnictví',
  'strih-nuzky-salon': 'Stříhání dlouhých vlasů nůžkami',
  'barvene-vlasy': 'Dlouhé barvené vlasy po návštěvě kadeřnictví',
  'vlny-blond-bruneta': 'Vlnité vlasy po úpravě v kadeřnictví',
  'barbershop-interier': 'Interiér barbershopu s koženými křesly',
  'barbershop-zrcadlo': 'Barberské křeslo před zrcadlem',
  'strih-barber': 'Barber stříhá zákazníka',
  'strih-nuzky': 'Pánský střih nůžkami a hřebenem',
  vousy: 'Úprava vousů v barbershopu',
  nastroje: 'Nůžky, strojky a hřebeny na stole v barbershopu',
  'detsky-strih': 'Chlapec při stříhání v kadeřnictví',
  kartace: 'Kartáče, nůžky a hřebeny',
};

export type Tema = 'obecne' | 'barber' | 'damske' | 'detske';

const SADY: Record<Tema, string[]> = {
  obecne: ['salon-cihly', 'salon-kreslo-zrcadlo', 'salon-praha-kresla', 'salon-zrcadla', 'strih-salon-klientka', 'fenovani', 'strih-nuzky-salon', 'barbershop-interier', 'strih-damsky'],
  barber: ['barbershop-interier', 'barbershop-zrcadlo', 'strih-barber', 'strih-nuzky', 'vousy', 'nastroje'],
  damske: ['strih-salon-klientka', 'fenovani', 'strih-damsky', 'strih-nuzky-salon', 'barvene-vlasy', 'vlny-blond-bruneta', 'salon-kreslo-zrcadlo'],
  detske: ['detsky-strih', 'kartace'],
};

/** Téma fotky podle kategorie výpisu (ostatní kategorie mají obecné fotky salonů) */
export const TEMA_ZAMERU: Record<string, Tema> = {
  barbershopy: 'barber',
  'panska-kadernictvi': 'barber',
  'damska-kadernictvi': 'damske',
  'detska-kadernictvi': 'detske',
};

export interface Nahled {
  src: ImageMetadata;
  alt: string;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Fotka pro stránku: klíč = adresa stránky (stejná stránka = stejná fotka) */
export function nahled(klic: string, tema: Tema = 'obecne'): Nahled {
  const sada = SADY[tema];
  const jmeno = sada[hash(klic) % sada.length];
  const soubor = SOUBORY[`../assets/blog/${jmeno}.jpg`];
  if (!soubor) throw new Error(`Chybí náhledová fotka src/assets/blog/${jmeno}.jpg`);
  return { src: soubor.default, alt: POPIS[jmeno] };
}
