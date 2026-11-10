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
4. Salon dostane **jeden** osobní e-mail (prostý text, od Vladimíra) s odkazem, který ho přihlásí rovnou do
   správy profilu, bez registrace a hesla. Odkaz v e-mailu platí 90 dní, po kliknutí platí přihlášení 30 dní.
   E-mail je na veřejné adrese salonu z katalogu, takže kliknutí zároveň ověřuje, že jde o majitele.
5. Ve správě profilu majitel vidí, z kolika % je profil vyplněný a co chybí. Fotky nahraje víc naráz přímo
   z telefonu (automaticky se zmenší), vyplní otevírací dobu i o svátcích, ceník, kontakty a rezervace.
   Změny se na web propíší při dalším buildu (do pár hodin).
6. Odhlášení: odkaz v patičce e-mailu i tlačítko „Odhlásit“ v poštovním klientu (List-Unsubscribe).
   Odhlášeným, salonům, které už profil upravily, a už osloveným systém znovu nepošle.

## Pravidla
- Žádné hromadné rozesílky ani připomínky. Každý salon jeden e-mail.
- Odpovědi chodí na info@. Žádost o odstranění vyřiďte do pár dní (záznam do `src/data/vyrazene.json`).
- Před první dávkou pošlete testovací e-mail sami sobě (dočasně si do administrace přidejte vlastní salon,
  nebo si nechte poslat odkaz přes „Spravovat profil“) a zkontrolujte, že nepadá do spamu.
- Doména najdikadernictvi.cz musí mít nastavené **SPF a DKIM** pro server, ze kterého PHP posílá (Exon, cPanel →
  Email Deliverability). Bez nich skončí většina e-mailů ve spamu.

## Kdy posílat
Nejlépe úterý až čtvrtek dopoledne. Před Vánoci je dobrý důvod sváteční otevírací doba.
