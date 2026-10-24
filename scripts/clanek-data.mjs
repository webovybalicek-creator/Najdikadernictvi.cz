// Podklady pro datové články z vlastního katalogu.
// Použití (po `npm run build`): node scripts/clanek-data.mjs brno
//   praha → všechny pražské obvody (praha-1 … praha-22), plzen → i plzen-3 apod.
// Vypíše JSON: počty, salony otevřené v sobotu / neděli / večer / brzy ráno, barbershopy, dětská kadeřnictví.
import { readFileSync } from 'node:fs';

const slug = process.argv[2];
if (!slug) {
  console.error('Zadej slug města, např. brno, ostrava, praha');
  process.exit(1);
}
const data = JSON.parse(readFileSync(new URL('../dist/okoli.json', import.meta.url), 'utf8'));
// záznam: [lat, lon, název, url, adresa, barber, týden | 0, dětské, id, bezbariérové, karta]
const vMeste = data.filter((z) => {
  const m = z[3].split('/')[1];
  // město včetně číslovaných částí (praha-6, plzen-3 …)
  return m === slug || new RegExp(`^${slug}-\\d+$`).test(m);
});
if (!vMeste.length) {
  console.error(`Pro „${slug}“ nic nenalezeno.`);
  process.exit(1);
}
const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const DNY = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const doba = (t) => (t ? t.map((d, i) => `${DNY[i]} ${d.length ? d.map(([a, b]) => `${hm(a)}–${hm(b)}`).join(', ') : 'zavřeno'}`).join('; ') : null);
const salon = (z) => ({ nazev: z[2], url: `https://najdikadernictvi.cz${z[3]}`, odkaz: z[3], adresa: z[4], barber: !!z[5], doba: doba(z[6]) });
const sDobou = vMeste.filter((z) => z[6]);

const out = {
  mesto: slug,
  celkem: vMeste.length,
  barbershopu: vMeste.filter((z) => z[5]).length,
  sOteviraciDobou: sDobou.length,
  poznamka: 'Otevírací doba je z OpenStreetMap / od majitelů, může být neaktuální – v článku na to upozorni.',
  sobota: sDobou.filter((z) => z[6][5].length).map(salon),
  nedele: sDobou.filter((z) => z[6][6].length).map(salon),
  vecer: sDobou.filter((z) => z[6].slice(0, 5).some((d) => d.some(([, b]) => b >= 19 * 60))).map(salon),
  rano: sDobou.filter((z) => z[6].slice(0, 5).some((d) => d.some(([a]) => a <= 7 * 60 + 30))).map(salon),
  barbershopy: vMeste.filter((z) => z[5]).map(salon),
  detska: vMeste.filter((z) => z[7]).map(salon),
  bezbarierova: vMeste.filter((z) => z[9]).map(salon),
};
console.log(JSON.stringify(out, null, 2));
