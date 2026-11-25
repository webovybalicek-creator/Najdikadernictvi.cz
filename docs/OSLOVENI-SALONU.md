# Oslovení salonů ✉️

Cíl: majitelé doplní fotky, ceník, popis a otevírací dobu. Je to nejsilnější unikátní obsah webu
(pro návštěvníky i pro schválení AdSense).

## Jak to funguje
1. **Administrace:** na https://najdikadernictvi.cz/api/admin.php klikněte na „Poslat odkazy“. Na info@ přijde mimo jiné
   odkaz **Oslovení salonů e-mailem**.
2. V administraci vidíte všechny salony s veřejným e-mailem, co jim v profilu chybí (doba, fotky, ceník) a stav:
   odesláno → otevřel odkaz → profil upraven, případně odhlášeno.
3. Filtrem vyberte město nebo jen salony bez otevírací doby, klikněte „Vybrat prvních N“ a „Odeslat vybrané“.
   Denní limit je **20 e-mailů** (ochrana pověsti domény). E-maily odchází z info@najdikadernictvi.cz po 1,5 s.
4. Salon dostane **jeden** krátký osobní e-mail od Vladimíra (bez obrázků a tlačítek, ať nepůsobí jako reklama a nepadá
   do Promo akcí) s jednou prosbou: od 15. 11. do 6. 1. „Otevírací doba o Vánocích“ (odkaz vede rovnou na pole se svátky),
   jinak „sedí otevírací doba?“. Původní grafický e-mail s výhodami (do 25. 11. 2026) neměl žádnou odezvu.
   E-mail obsahuje osobní odkaz, který majitele přihlásí rovnou do
   správy profilu, bez registrace a hesla. Odkaz v e-mailu platí 90 dní, po kliknutí platí přihlášení 30 dní.
   E-mail je na veřejné adrese salonu z katalogu, takže kliknutí zároveň ověřuje, že jde o majitele.
5. Ve správě profilu majitel vidí, z kolika % je profil vyplněný a co chybí. Fotky nahraje víc naráz přímo
   z telefonu (automaticky se zmenší), vyplní otevírací dobu i o svátcích, ceník, kontakty a rezervace.
   Změny se na web propíší při dalším buildu (do pár hodin).
6. Odhlášení: odkaz v patičce e-mailu i tlačítko „Odhlásit“ v poštovním klientu (List-Unsubscribe).
   Odhlášeným, salonům, které už profil upravily, a už osloveným systém znovu nepošle.

## Automatické rozesílání
- Workflow **Oslovení salonů (denní dávka)** běží každý pracovní den kolem 9:20 a pošle **10 e-mailů** dalším
  neosloveným salonům (napřed ty, jejichž profil už je v Googlu). Velikost dávky: `AUTO_DAVKA` v `public/api/osloveni.php`.
- Server pustí nejvýš jednu dávku denně, jen v pracovní dny 7–13 h, a vždy dodrží denní limit.
- Po každé dávce přijde na info@ a webovybalicek@gmail.com souhrn: odesláno, otevřeli, upravili, kolik zbývá.
- Zastavení: v GitHubu Actions → workflow → „Disable workflow“.

## Pravidla
- Žádné hromadné rozesílky ani připomínky. Každý salon jeden e-mail.
- Odpovědi chodí na info@. Žádost o odstranění vyřiďte do pár dní (záznam do `src/data/vyrazene.json`).
- Před první dávkou pošlete testovací e-mail sami sobě (dočasně si do administrace přidejte vlastní salon,
  nebo si nechte poslat odkaz přes „Spravovat profil“) a zkontrolujte, že nepadá do spamu.
- Doména najdikadernictvi.cz musí mít nastavené **SPF a DKIM** pro server, ze kterého PHP posílá (Exon, cPanel →
  Email Deliverability). Bez nich skončí většina e-mailů ve spamu.

## Kdy posílat
Nejlépe úterý až čtvrtek dopoledne. Před Vánoci je dobrý důvod sváteční otevírací doba.
