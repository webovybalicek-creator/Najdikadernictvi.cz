// Kontrola tenkých stránek po buildu (AdSense „obsah nízké hodnoty“).
// Projde dist/, u každé indexované stránky (bez noindex) změří text v <main>
// a vypíše ty, které jsou podezřele chudé. Spuštění: node scripts/kontrola-indexace.mjs [min-znaků]
// V GitHub Actions vypisuje varování (::warning::), build nezastaví.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const MIN = Number(process.argv[2] ?? 1200);
const CI = !!process.env.GITHUB_ACTIONS;

async function* stranky(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* stranky(p);
    else if (e.name === 'index.html') yield p;
  }
}

const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<(nav|aside|footer|header)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

let indexovane = 0;
const chude = [];
for await (const soubor of stranky(DIST)) {
  const html = await readFile(soubor, 'utf8');
  if (/<meta name="robots" content="noindex/.test(html)) continue;
  indexovane++;
  const main = html.match(/<main[\s\S]*<\/main>/)?.[0] ?? html;
  const delka = text(main).length;
  if (delka < MIN) chude.push({ url: soubor.slice(DIST.length - 1).replace(/index\.html$/, ''), delka });
}

chude.sort((a, b) => a.delka - b.delka);
console.log(`Indexovaných stránek: ${indexovane}, s méně než ${MIN} znaky obsahu: ${chude.length}`);
for (const c of chude.slice(0, 100)) {
  const radek = `${c.delka.toString().padStart(5)}  ${c.url}`;
  console.log(CI ? `::warning::Tenká stránka (${c.delka} znaků): ${c.url}` : radek);
}
if (chude.length > 100) console.log(`… a dalších ${chude.length - 100}`);
