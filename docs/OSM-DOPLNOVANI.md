# Doplňování dat do OpenStreetMap 🗺️

Katalog bere otevírací doby a nové salony z OpenStreetMap (OSM). Co doplníte do OSM, objeví se na webu
při dalším importu (workflow „Import dat“, jednou týdně). Je to legální a otevřený zdroj, na rozdíl od Google Map.

## Co a odkud
- **Otevírací dobu** zjistěte jen z legálního zdroje: vlastní web salonu, cedule na dveřích, telefonát, osobní návštěva.
  Z Google Map ani Firmy.cz do OSM nic nekopírujte (licenčně to nejde a OSM to výslovně zakazuje).
- Seznam salonů ve velkých městech, které v OSM nemají otevírací dobu: export `osm-doplnit-oteviraci-dobu.csv`
  (sloupec `upravit_v_osm` otevře editor přímo na daném salonu). Přednost má Brno, Pardubice, Hradec, Plzeň.
- **Chybějící salony** (hlavně Ostrava, Liberec, Zlín, Ústí): přidejte jako nový bod.

## Jak na to (iD editor v prohlížeči)
1. Založte si účet na openstreetmap.org (zdarma).
2. Otevřete odkaz z tabulky, nebo na mapě najděte salon a klikněte na **Upravit**.
3. U existujícího salonu doplňte pole **Otevírací doba**. Formát: `Mo-Fr 09:00-18:00; Sa 08:00-12:00`
   (dny Mo Tu We Th Fr Sa Su, přestávka: `Mo-Fr 09:00-12:00,13:00-18:00`).
4. Nový salon: **Přidat bod** → typ „Kadeřnictví“ (shop=hairdresser) nebo „Holičství“ (shop=barber),
   vyplňte název, adresu, otevírací dobu, telefon, web.
5. **Uložit** a do poznámky ke změně napište zdroj, např. „otevírací doba z webu salonu“.

## Tempo
Hodina týdně = zhruba 15–20 salonů. Po 4 týdnech tak přibude 60–80 salonů s otevírací dobou ve velkých městech,
což výrazně zlepší městské stránky, výběry (otevřeno v sobotu, večer…) i nástroj Kdy se ostříhám.
