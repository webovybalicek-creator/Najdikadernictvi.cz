# Automatické články: pravidla

Tento postup používá denní naplánovaná úloha (2 články denně). Platí i pro ruční psaní.

## Postup jednoho běhu
1. `git pull`. Vezmi první 2 témata ze zásobníku v `docs/temata-clanku.md`.
   Zkontroluj, že podobný článek v `src/content/blog/` ještě není (jinak téma přeskoč a přesuň do Hotovo s poznámkou „duplicitní“).
2. Ke každému tématu udělej rešerši webovým vyhledáváním (česky). Fakta, čísla a zdravotní tvrzení jen z dohledatelných zdrojů;
   konkrétní čísla (ceny, procenta) vždy s odkazem na zdroj v textu nebo na konci. Nic nevymýšlej.
   U zdravotních témat (vypadávání vlasů, lupy, těhotenství…) piš opatrně a doporuč lékaře/dermatologa.
3. Fotka: vyhledej na unsplash.com volnou fotku (Unsplash License, NE Unsplash+), zjisti autora a ID `photo-…`
   (z adresy images.unsplash.com). Přidej položku do `scripts/obrazky.json`
   (`{"soubor": "nazev.jpg", "id": "…", "autor": "…"}`), commitni a pushni JEN tenhle soubor.
   Workflow „Stažení obrázků (Unsplash)“ fotku stáhne a commitne do `src/assets/blog/` (cca 1 min).
   Počkej na dokončení (`gh run list --workflow obrazky.yml`), `git pull` a ověř, že soubor existuje a fotka sedí k tématu (prohlédni si ji).
   Když se stažení nepovede, použij některou nepoužitou fotku z `src/assets/blog/`.
4. Napiš článek do `src/content/blog/<slug>.md` (slug bez diakritiky, výstižný, pro SEO).
5. Sestav web (`npm run build`, Node ≥ 22) a zkontroluj interní odkazy (každý odkaz `/…/` musí v `dist/` existovat).
6. Přesuň témata do „Hotovo“ v `docs/temata-clanku.md`. Když v zásobníku zbývá méně než 10 témat, doplň 15 nových
   (hledané dotazy kolem vlasů, kadeřnictví, barberů; žádné duplicity).
7. Commit a push do `main` (spustí deploy). Ověř, že workflow „Build a deploy“ skončil úspěšně.

## Formát článku
```
---
title: 'Titulek s klíčovým dotazem (max. ~65 znaků)'
description: 'Meta popis 140–160 znaků.'
perex: '1–2 věty pro výpis.'
datum: RRRR-MM-DD   # dnešní datum
kategorie: 'Pro pány' | 'Pro ženy' | 'Péče o vlasy' | 'Rady a návody'
obrazek: '../../assets/blog/<soubor>.jpg'
obrazekAlt: 'Popis fotky česky'
obrazekAutor: 'Jméno autora z Unsplash'
---
```
- Délka 700–1200 slov, struktura `##` nadpisy, krátké odstavce, odrážky tam, kde pomáhají.
- Úvod odpoví rovnou na hlavní otázku. Žádné vatové fráze, žádné „v dnešní době“.
- Čeština bez anglicismů, kde existuje české slovo. Bez dlouhých pomlček (—); místo nich čárka, dvojtečka nebo spojovník.
- 3–5 interních odkazů: na související články (`/blog/<slug>/`), výběry měst (`/barbershopy/brno/`, `/damska-kadernictvi/brno/`,
  `/otevreno-v-sobotu/brno/` …), `/mapa/`, `/kraje/`. Jen na existující stránky.
- Na konci krátký odstavec, jak najít vhodný salon na webu (s odkazem).
- Žádná zmínka, že článek psala AI. Žádné vymyšlené citace, recenze ani „zkušenosti našich čtenářů“.
