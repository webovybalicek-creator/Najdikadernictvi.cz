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
- [ ] Havířov
- [x] Česká Lípa (10. 11. 2026)
- [x] Kroměříž (10. 11. 2026)
- [ ] Šumperk
- [ ] Děčín
- [ ] Chrudim
- [ ] Trutnov
- [x] Písek (10. 11. 2026)
- [ ] Sokolov
- [ ] Strakonice
- [ ] Karviná
- [ ] Hodonín
- [ ] Jindřichův Hradec
- [ ] Břeclav
- [ ] Litoměřice
- [ ] Beroun
- [ ] Havlíčkův Brod
- [ ] Klatovy
- [ ] Poděbrady
- [ ] Valašské Meziříčí
- [x] Žatec (10. 11. 2026)
- [ ] Uherský Brod
- [ ] Mělník
- [ ] Vyškov
- [ ] Mariánské Lázně
- [ ] Nový Jičín
- [ ] Vsetín
- [ ] Benešov
- [ ] Žďár nad Sázavou
- [ ] Louny
- [ ] Náchod
- [x] Rokycany (10. 11. 2026)
- [x] Sušice (10. 11. 2026)
- [ ] Hlinsko (10. 11. 2026 doplněny jen 2 salony, na indexaci chybí třetí; hledat „holičství Hlinsko“)
- [ ] Bílina

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
