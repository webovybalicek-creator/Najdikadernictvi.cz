# Backlog: co dál s najdikadernictvi.cz 🔍✂️

Analýza 25. 11. 2026. Podklady: katalog v repozitáři (po buildu), Google Search Console za posledních 28 dní
(přes Windsor.ai), kontrola tenkých stránek (`scripts/kontrola-indexace.mjs`), `docs/` a projektové dokumenty
KONKURENCE a PROPAGACE. Témata článků jsou zvlášť v `docs/temata-clanku.md`.

## Jak na tom web je

### Katalog
| | Počet | Podíl |
|---|---:|---:|
| Salonů celkem | 14 649 | 100 % |
| z toho z rejstříku (jen adresa) | 13 070 | 89 % |
| Detail jde do Googlu (`indexovatDetail`) | 1 405 | 9,6 % |
| Otevírací doba | 947 | 6,5 % |
| Telefon | 858 | 5,9 % |
| Web | 504 | 3,4 % |
| Fotky (všechny od redakce) | 93 | 0,6 % |
| Profil ověřený nebo upravený majitelem | 0 | 0 % |
| Ceník / popis od majitele | 0 | 0 % |
| Hodnocení návštěvníků | 1 | |
| Odkaz na online rezervaci | 17 | (zatím jen salony, jejichž web je přímo Reservio/MyFox/Fresha) |

Indexovatelné detaily ve velkých městech (salonů celkem → s obsahem):
Praha 2 034 → 396 · Brno 660 → 183 · Ostrava 391 → **16** · Plzeň 332 → 39 · České Budějovice 209 → 23 ·
Olomouc 186 → 21 · Hradec Králové 179 → 51 · Pardubice 159 → 38 · Liberec 151 → **16** · Zlín 123 → **3** ·
Karlovy Vary 99 → 6 · Kladno 95 → 7 · Ústí n. L. 93 → 13 · Opava 92 → 8 · Most 87 → **3** · Karviná 49 → **0**.

Indexovaných stránek celkem 1 805, z toho 106 má v `<main>` méně než 1 200 znaků. Jde hlavně o výběry v pražských
obvodech (`/kadernictvi-platba-kartou/praha-9/` 536 znaků, `/barbershopy/praha-8/`, `/otevreno-rano/praha-2/`…),
dále `/mapa/`, `/kontakt/` a `/blog/kategorie/pece-o-vlasy/`.

### Google (28 dní do 25. 11.)
- **109 kliknutí, 10 632 zobrazení**, zobrazení mělo 709 různých stránek.
- Typ stránky → zobrazení / kliknutí / průměrná pozice:
  detail salonu 8 167 / 76 / 11,2 · obec 991 / 19 / 17,5 · čtvrť 846 / 12 / 19,0 · blog 360 / 2 / 18,8 ·
  výběry (barbershopy, sobota…) 216 / **0** / 36,2 · úvodní stránka 51 / 0 / 56,7.
- 63 % zobrazení je na pozicích 4–10, ale CTR je kolem 1 %. Většina jsou dotazy na název salonu („1990 barbershop“,
  „the hudson barber“, „chaos hair studio“) a nad námi je web salonu a jeho karta v Mapách.
- Obecné dotazy, o které jde (AdSense potřebuje návštěvnost z nich): „barber praha 1“, „barbershop praha 4“,
  „barber shop olomouc“ a podobné. Ukazujeme se na pozicích 50–80, a to **detailem salonu, ne výběrem**
  `/barbershopy/praha-1/`, přestože ten existuje a má 15 salonů. Výběry Google zatím skoro neukazuje.
- Zajímavé skupiny dotazů:
  - **„bez objednání“ / walk-in: 64 dotazů, 186 zobrazení** („kadeřnictví brno bez objednání“, „ostrava poruba
    bez objednání“, „žamberk bez objednání“…). Filtr máme jen jako službu od majitele, takže je prázdný.
  - čtvrti a ulice: 67 dotazů, 413 zobrazení, 10 kliknutí (Dubina, Poruba, Starý Lískovec, Chodov, Bohunice).
    Stránky čtvrtí fungují nejlíp ze všech výpisů.
  - „Praha N“: 54 dotazů, 322 zobrazení, 0 kliknutí (pozice 50–90).
  - „recenze“: 26 dotazů, 115 zobrazení. Hodnocení máme jen u jednoho salonu.
  - anglicky („barber near me“, „prague 1“, „opening hours“): 59 dotazů, 292 zobrazení.
- Blog: 24 článků, 2 kliknutí. V Googlu ještě visí staré adresy sloučených článků (`sediny-barvit-nebo-nechat`,
  `barveni-vlasu-melir-balayage-ombre`, `svatebni-uces`). Mají 301, časem zmizí.

### Shrnutí
Web je technicky hotový a funkcí má víc než konkurence. **Brzdou jsou data:** 90 % katalogu tvoří samotné adresy
z rejstříku, majitelé zatím nic nedoplnili a výběry a obvody Google ještě nebere. Dalším úsilím by proto měla být
data a indexace výpisů, ne nové funkce.

---

## P1: nejvyšší dopad (AdSense + návštěvnost)

### 1. Doplnit data v okresních městech (Google Mapy)
- Postup je hotový v `scripts/sber-mapy/README.md`. Pořadí podle poměru „salonů celkem / s obsahem“:
  **Ostrava, Liberec, Zlín, Karviná, Most, Olomouc, České Budějovice, Opava, Kladno, Karlovy Vary, Ústí n. L.**,
  pak okresní města, kde vede orlovekrasy.cz (viz KONKURENCE).
- Cíl: v každém z 20 největších měst aspoň 30 % salonů s otevírací dobou nebo telefonem. Indexovatelné detaily
  by se tím zhruba zdvojnásobily (1 405 → ~3 000) a vznikly by výběry („otevřeno v sobotu“…) i tam, kde chybí.
- Měřit: počet `indexovatDetail` po každém běhu (stačí čísla z tabulky výše).

### 2. Oslovení salonů: zjistit, proč 0 % reakcí
- Denní dávky běží (`docs/OSLOVENI-SALONU.md`), ale ověřený ani upravený profil zatím není žádný.
- Zkontrolovat v administraci: odesláno → otevřeli odkaz → upravili. Když skoro nikdo neotevírá, jde nejspíš o spam:
  ověřit SPF/DKIM (Exon → Email Deliverability) a testovací e-mail na Gmail a Seznam.
- Když otevírají, ale neupravují, zkrátit e-mail na jednu prosbu: „Zkontrolujte otevírací dobu o Vánocích“
  (sváteční doba je teď ten nejlepší důvod) a nabídnout jen tuhle jednu věc, ne celý profil.
- Profily od majitelů jsou nejsilnější unikátní obsah. Bez nich zůstane web pro AdSense „katalogem adres“.

### 3. Tenké stránky (106) před další žádostí o AdSense
- Výběry v pražských obvodech s pár salony: zvednout `MIN_ZAMER` pro výběry v obvodech (např. na 8), nebo je
  sloučit do výběru celé Prahy s rozpadem podle obvodů. Obojí sníží počet tenkých stránek v indexu.
- `/blog/kategorie/pece-o-vlasy/` má jen pár článků: přidat úvodní text kategorie, nebo dát `noindex`, dokud
  nebude mít aspoň 5 článků.
- `/mapa/` a `/kontakt/` jsou tenké „z podstaty“, dát jim `noindex` (do Googlu nepatří, nic tím neztratíme).
- Kontrola: `node scripts/kontrola-indexace.mjs` po buildu musí ukázat 0.

### 4. Dostat do Googlu výběry a obvody
- Výběry (`/barbershopy/praha-1/` atd.) mají pozici 36 a 0 kliknutí, na „barber praha 1“ místo nich Google
  ukazuje detail salonu na 80. místě. V Search Console ověřit (Kontrola URL), jestli jsou výběry vůbec indexované.
- Když ne, posílit vnitřní odkazy: z detailu salonu odkazovat na výběr hned nahoře (u štítku „Barbershop“
  odkaz „Další barbershopy v Praze 1“), z úvodní stránky přidat odkazy na barbershopy ve velkých městech.
  Do titulku výběru dát i variantu dotazu, kterou lidé píšou: „Barber Praha 1: 15 barbershopů…“.
- Totéž pro „Kadeřnictví Praha N“: titulek obvodu je dnes „Kadeřnictví Praha 1: 185 salonů – kdo má otevřeno
  právě teď“, což sedí, jen chybí síla (odkazy, data). Přímo souvisí s bodem 1.

### 5. Znovu požádat o AdSense, až bude splněno
- 0 tenkých stránek v indexu (bod 3), aspoň 2 500 indexovatelných detailů (bod 1), aspoň 30 článků na blogu,
  zhruba 4 týdny po poslední velké změně, ať je Google stihne projít.
- Pravidelný provoz: stovky kliknutí měsíčně z obecných dotazů, ne jen z názvů salonů.

## P2: nové funkce podložené daty z Googlu

### 6. „Bez objednání“ (64 dotazů za 28 dní)
- Doplnit detekci do `scripts/web-kontakty.ts`: text „bez objednání“, „walk-in“, „bez rezervace“ na webu salonu
  → služba `bez-objednani` v `doplneno.json` (do `data.ts` přidat převzetí pole `sluzby` z doplněných údajů).
  Navíc salony, které to mají v názvu (Walk-In Barber Brno, The Original Walk-In Barber Olomouc, Haircut Express…).
- Pak výběr `/bez-objednani/<město>/` (stejně jako `online-rezervace`), vznikne sám od 3 salonů.
- Datový článek „Kde se ostříhat bez objednání v Brně / Praze“, až bude dost salonů.

### 7. Online rezervace (hotovo 25. 11., vyhodnotit)
- Odkaz se hledá na webech salonů v nedělním běhu „Kontakty z webů salonů“ (Reservio, MyFox, Fresha, Booksy,
  Bookio, Noona, Reservanto, SimplyBook). Filtr „Online rezervace“ ve výpisu obce se ukáže od 2 salonů, výběr
  `/online-rezervace/<město>/` od 3.
- Po prvním běhu (neděle 29. 11.) zkontrolovat počet. Když jich bude v Praze a Brně aspoň 15, posunout článek
  „Online rezervace v kadeřnictví: jak funguje“ v zásobníku nahoru a napsat ho jako datový.
- Později: filtr i na `/mapa/` a `/okoli/` (vyžaduje přidat příznak do dlaždic v `src/lib/dlazdice.ts`).

### 8. Zastávky MHD (hotovo 25. 11., spustit)
- Workflow „Zastávky MHD“ je potřeba **jednou spustit ručně** (GitHub → Actions → Zastávky MHD → Run workflow),
  pak běží 3. den v měsíci. Na detailu salonu se ukáže nejbližší zastávka a stanice metra nebo vlaku.
- Další krok: výběry „Kadeřnictví u metra Anděl“ pro stanice pražského metra s aspoň 5 salony do 400 m.
  Lidé tak hledají („barber anděl“, „kadeřnictví kubánské náměstí“, „barber budějovická“ jsou v datech).

### 9. Hodnocení a „recenze“ (26 dotazů)
- Hodnocení se už zapéká do HTML i do JSON-LD, jen nikdo nehodnotí (1 salon).
- Nabízet plakát s QR kódem (`/plakat/`) v oslovovacím e-mailu jako hlavní výhodu pro salon.
- Na detailu salonu krátká výzva „Byli jste tu?“ až po návratu na stránku (návštěvník, který salon hledal znovu).

## P3: obsah

### 10. Blog
- Plesový článek je první v zásobníku (při běhu Po/St/Pá vyjde nejspíš v pátek 27. 11.), sezóna začíná v lednu.
- Svatební účes je sekce článku `damske-strihy-a-ucesy`. Před jarem ji rozšířit (časový plán, zkouška účesu,
  kadeřnice s výjezdem), samostatný článek nepsat.
- Ze zásobníku vyřazeno 8 témat, která už pokrývají sloučené články (zapsáno v Hotovo). Do pravidel
  `docs/AUTOMAT-CLANKY.md` přidána kontrola sekcí sloučených článků.
- Datové články fungují líp než obecné (`kadernictvi-praha-nedele` pozice 7, obecné 13–48). Datových témat ubývá,
  protože mimo Prahu a Brno chybí data (Ostrava, Olomouc přeskočeny). Po bodu 1 přidat datová témata pro Ostravu,
  Olomouc, Liberec, České Budějovice.
- Sezónní kalendář: prosinec svátky (`/kadernictvi-o-svatcich/`), leden–únor plesy, únor–březen svatby,
  srpen dětské střihy do školy, každý měsíc report z rejstříku.

### 11. Propagace
- Ověřit, jestli odešla tisková zpráva z PROPAGACE (víkendová data). Když ne, poslat ji teď k článku
  o Vánocích a otevírací době o svátcích, to je pro redakce aktuálnější.
- Bing Webmaster (import ze Search Console) a Firmy.cz: zkontrolovat, jestli jsou hotové.

## Později / zvážit
- Anglická verze pro Prahu (59 anglických dotazů za měsíc). Zatím malý objem a riziko duplicit, vrátit se,
  až bude česká verze silná.
- Filtr podle ceny střihu: data o cenách zatím nejsou (0 ceníků, ceny od návštěvníků u 0 salonů).
- Zrychlit build (dnes ~6,5 min, 17 700 stránek): zatím netřeba.

## Hotovo 25. 11. 2026
- Zásobník článků: ples nahoru, vypadávání vlasů bez „na podzim“, zimní péče dřív, 8 duplicit vyřazeno.
- Online rezervace: rozpoznání rezervačních systémů v `data.ts`, hledání odkazů ve `scripts/web-kontakty.ts`,
  filtr ve výpisu obce, výběry `/online-rezervace/<město>/`.
- Zastávky MHD: `scripts/zastavky.ts`, workflow `zastavky.yml`, zobrazení na detailu salonu (kontakty i text „O salonu“).
