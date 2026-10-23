import openingHours from 'opening_hours';

/** Intervaly v minutách od půlnoci, index 0 = pondělí … 6 = neděle */
export type Tyden = [number, number][][];

export const DNY = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
export const DNY_KRATCE = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

// Referenční týden bez státních svátků (pondělí 2. 11. 2026)
const START = new Date(2026, 10, 2, 0, 0, 0);

const cache = new Map<string, Tyden | null>();

export function parseTyden(value?: string, lat = 50, lon = 15): Tyden | null {
  if (!value) return null;
  if (cache.has(value)) return cache.get(value)!;
  let result: Tyden | null = null;
  try {
    const oh = new openingHours(value, { lat, lon, address: { country_code: 'cz', state: '' } }, { mode: 0 });
    const end = new Date(START.getTime() + 7 * 864e5);
    const intervals = oh.getOpenIntervals(START, end) as [Date, Date, boolean, string?][];
    const tyden: Tyden = [[], [], [], [], [], [], []];
    for (const [from, to, unknown] of intervals) {
      if (unknown) continue;
      // interval může přesáhnout půlnoc → rozdělit po dnech
      let cur = from;
      while (cur < to) {
        const dayIdx = Math.floor((cur.getTime() - START.getTime()) / 864e5);
        const dayStart = new Date(START.getTime() + dayIdx * 864e5);
        const dayEnd = new Date(dayStart.getTime() + 864e5);
        const segEnd = to < dayEnd ? to : dayEnd;
        const a = Math.round((cur.getTime() - dayStart.getTime()) / 6e4);
        const b = Math.round((segEnd.getTime() - dayStart.getTime()) / 6e4);
        if (dayIdx >= 0 && dayIdx < 7 && b > a) tyden[dayIdx].push([a, b]);
        cur = segEnd;
      }
    }
    result = tyden.some((d) => d.length) ? tyden : null;
  } catch {
    result = null;
  }
  cache.set(value, result);
  return result;
}

export const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

export const denText = (d: [number, number][]) =>
  d.length ? d.map(([a, b]) => `${hhmm(a)}–${hhmm(b === 1440 ? 1440 : b)}`).join(', ') : 'Zavřeno';

/** Seskupí dny se stejnou dobou: „Po–Pá 9:00–18:00“ */
export function souhrn(t: Tyden): { dny: string; cas: string }[] {
  const out: { dny: string; cas: string }[] = [];
  let i = 0;
  while (i < 7) {
    const cas = denText(t[i]);
    let j = i;
    while (j + 1 < 7 && denText(t[j + 1]) === cas) j++;
    out.push({ dny: i === j ? DNY_KRATCE[i] : `${DNY_KRATCE[i]}–${DNY_KRATCE[j]}`, cas });
    i = j + 1;
  }
  return out;
}

const SCHEMA_DNY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const iso = (m: number) => (m >= 1440 ? '23:59' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

export function schemaSpec(t: Tyden) {
  return t.flatMap((d, i) =>
    d.map(([a, b]) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: SCHEMA_DNY[i],
      opens: iso(a),
      closes: iso(b),
    })),
  );
}
