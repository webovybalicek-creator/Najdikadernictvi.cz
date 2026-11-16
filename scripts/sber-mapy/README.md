# Doplňování kontaktů z Google Map + indexace 🗺️

Postup pro denní naplánovanou úlohu (běží v prohlížeči v aplikaci Claude na počítači provozovatele).
Cíl: obce, které Google kvůli chybějícím údajům neindexuje (pravidlo MIN_MESTO = 3 salony s obsahem),
dostanou ke salonům telefon, web a otevírací dobu z veřejných profilů na Google Mapách.

Pravidla (AdSense, soukromí):
- Doplňují se jen chybějící údaje (telefon, web/facebook, otevírací doba). Názvy salonů se NEMĚNÍ
  (Google často uvádí jména osob; OSVČ zobrazujeme bez jmen).
- Párování jen podle adresy (ulice + číslo + obec) na existující záznam v katalogu. Nic nového se nepřidává.
- Bez nových URL, bez generovaného textu.

## 1. Katalog adres do prohlížeče (jednou za běh)
1. Otevřít `https://najdikadernictvi.cz/` a spustit `katalog.js` (vrátí „keys …“; uloží do `window.name`).
2. Hned přejít na `https://www.google.com/maps/@50.08,14.43,12z?hl=cs` a spustit:
   `localStorage.setItem('najdiKAT', window.name.slice(3)); localStorage.najdiKAT.length`
3. Spustit `nastroje.js` (uloží do localStorage funkce najdiPREP / najdiGO / najdiEXT).

## 2. Jedno město
- Otevřít `https://www.google.com/maps/search/kadeřnictví+<Obec>?hl=cs`, udělat malý screenshot (scale 0.1),
  pak `await eval(localStorage.najdiPREP)('<Obec přesně jako v katalogu>')` → „fronta N“.
- Opakovat (max. 4× na jedno volání kvůli časovému limitu):
  `eval(localStorage.najdiGO)` → počkat 2 s → **screenshot scale 0.1** (bez něj Google stránku nevykreslí,
  když panel není vidět) → `await eval(localStorage.najdiEXT)` → „ok … tel hod“.
- Cíl: aspoň 4 úspěšné salony na obec. „prazdne“ = stránka se nenačetla, zkusit znovu.
- Pro barbershopy ve velkých městech totéž s hledáním `barbershop+<Obec>`.

## 3. Export a uložení
- V Google kartě: `ext-export.js` vrátí řádky `id|název|tel|web|hodiny|kategorie`.
- Uložit do souboru a spustit `python3 scripts/sber-mapy/prevod.py soubor.txt`
  (vynechá nekadeřnické kategorie a „nonstop“ hodiny).
- Kontrola: `npx tsx` skript s `mesta()` + `indexovatMesto()` (viz commit 13c4f86), `npm run build`,
  `node scripts/kontrola-indexace.mjs`. Commit „Doplněné kontakty: <obce>“, push do main.
- Po úspěšném exportu v localStorage smazat `najdiRES` (`localStorage.removeItem('najdiRES')`).
- Odškrtnout obce v seznamu níže.

## 4. Indexace v Google Search Console
- Účet s přístupem k doméně je v prohlížeči druhý: `https://search.google.com/u/1/search-console?resource_id=sc-domain%3Anajdikadernictvi.cz`
- Pole „Zkontrolujte libovolnou adresu“: `document.querySelector('input[aria-label*="Zkontrolujte"]').focus()`,
  napsat URL, Enter, počkat ~10 s, `find("Požádat")` → kliknout na tlačítko „Požádat o indexování…“,
  počkat ~20 s, ověřit dialog „Požádáno o indexování“.
- Limit ~10 adres denně („Byla překročena kvóta“ = konec pro dnešek).
- Odeslané adresy zapsat do `docs/indexace-odeslano.txt` (jedna na řádek, s datem).
- Pořadí: nejdřív stránky obcí, které se právě staly indexovatelnými, pak profily salonů s fotkami
  (`src/data/fotky.json`), které ještě nejsou v `docs/indexace-odeslano.txt`.

## Obce k doplnění (podle počtu salonů)
- [x] Kladno, Karlovy Vary, Opava, Teplice, Mladá Boleslav (10. 11. 2026)
- [x] Prostějov, Jihlava, Frýdek-Místek, Příbram (10. 11. 2026)
- [x] Jablonec nad Nisou, Třebíč, Cheb, Chomutov (10. 11. 2026)
- [ ] Most (jen 2 salony s údaji; hledat „kadeřnictví Most Litvínov“ nebo přiblížit mapu)
- [x] Havířov (11. 11. 2026)
- [x] Česká Lípa (10. 11. 2026)
- [x] Kroměříž (10. 11. 2026)
- [x] Šumperk (11. 11. 2026)
- [x] Děčín (11. 11. 2026)
- [x] Chrudim (11. 11. 2026)
- [ ] Trutnov
- [x] Písek (10. 11. 2026)
- [ ] Sokolov
- [ ] Strakonice
- [ ] Karviná
- [x] Hodonín (12. 11. 2026)
- [ ] Jindřichův Hradec
- [ ] Břeclav
- [ ] Litoměřice
- [ ] Beroun
- [x] Havlíčkův Brod (12. 11. 2026)
- [ ] Klatovy
- [x] Poděbrady (12. 11. 2026)
- [ ] Valašské Meziříčí
- [x] Žatec (10. 11. 2026)
- [ ] Uherský Brod
- [x] Mělník (12. 11. 2026)
- [ ] Vyškov
- [ ] Mariánské Lázně
- [ ] Nový Jičín
- [ ] Vsetín
- [x] Benešov (12. 11. 2026)
- [ ] Žďár nad Sázavou
- [ ] Louny
- [ ] Náchod
- [x] Rokycany (10. 11. 2026)
- [x] Sušice (10. 11. 2026)
- [ ] Hlinsko (10. 11. 2026 doplněny jen 2 salony, na indexaci chybí třetí; hledat „holičství Hlinsko“)
- [ ] Bílina
- [x] Kralupy nad Vltavou (12. 11. 2026)
- [x] Blansko (12. 11. 2026)
- [x] Boskovice, Domažlice, Tachov, Rychnov nad Kněžnou (13. 11. 2026)
- [x] Zábřeh, Varnsdorf, Veselí nad Moravou (14. 11. 2026)
- [x] Jeseník, Kopřivnice, Dobříš, Žamberk (15. 11. 2026)
- [ ] Hlučín (14. 11. 2026 doplněn jen 1 salon, další dva na Mapách vedené jako kosmetika)
- [x] Český Brod, Červený Kostelec, Lysá nad Labem, Přelouč (16. 11. 2026)
- [ ] Františkovy Lázně (16. 11. 2026 doplněn 1 salon, další dva na Mapách vedené jako kosmetika)

## Čtvrti
- [x] Opava – Předměstí, Brno – Bystrc, Třebíč – Nové Dvory, Liberec – Nové Město (12. 11. 2026)
- [x] Opava – Město, Praha 4 – Michle, Poděbrady – Poděbrady III, Děčín – Podmokly, Olomouc – Povel (12. 11. 2026)
- [ ] Olomouc – Nové Sady (12. 11. 2026 Google našel jen 2 salony, Schweitzerova 99 nejednoznačná adresa)

- [x] Ostrava – Zábřeh, Plzeň – Severní Předměstí, Liberec – Jeřáb (13. 11. 2026)
- [ ] Frýdek-Místek – Místek (13. 11. 2026 hledání „kadeřnictví Místek Frýdek-Místek“ vrátilo jen salony z Frýdku)
- [x] Kolín – Kolín I, Kolín – Kolín II, Praha 5 – Zbraslav (14. 11. 2026)
- [ ] Praha 4 – Kamýk (14. 11. 2026 hledání vrátilo jen 6 výsledků, doplněn 1 salon)
- [x] Praha 10 – Uhříněves, Praha 9 – Hloubětín, Praha 9 – Letňany (15. 11. 2026)
- [x] Praha 9 – Čakovice, Praha 10 – Vinohrady (16. 11. 2026)
- [ ] Jičín – Valdické Předměstí (16. 11. 2026 doplněn 1 salon, Google vrací jen salony z centra)
- [ ] Havířov – Podlesí (16. 11. 2026 hledání nevrátilo žádný salon z této čtvrti)

## Barbershopy ve velkých městech (hledat „barbershop <Obec>“)
- [ ] Praha
- [ ] Brno
- [ ] Ostrava
- [ ] Plzeň
- [ ] Liberec
- [ ] Olomouc
- [ ] České Budějovice
- [ ] Hradec Králové
- [ ] Ústí nad Labem
- [ ] Pardubice
- [ ] Zlín
