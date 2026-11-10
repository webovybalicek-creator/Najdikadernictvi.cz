<?php
/**
 * Samoobslužná správa profilu salonu majitelem.
 *
 * POST akce=zadost   salon, url, email, jmeno, telefon      → přihlašovací odkaz e-mailem
 *      Odkaz odejde hned, když e-mail prokazatelně patří salonu: je to e-mail salonu v katalogu, je na doméně webu
 *      salonu, nebo je uvedený přímo na webu salonu (úvodní stránka a kontakty). Jinak žádost čeká na ruční ověření.
 * GET  akce=blokovat&s=<salon>&e=<email>&t=<podpis>          → „Nejsem to já“: zablokuje e-mail a smaže jeho úpravy a fotky
 * GET  akce=nacti    s, e, x, t                              → uložené údaje, fotky a návštěvnost profilu
 * POST akce=uloz     s, e, x, t, u, data (JSON)              → uložení údajů (na web se dostanou při další synchronizaci)
 * POST akce=foto     s, e, x, t, foto (soubor)               → přidání fotky (max. 6)
 * POST akce=smazfoto s, e, x, t, n                           → smazání fotky
 * GET  foto=<salon>&n=<n>                                    → fotka salonu
 * GET  export=1                                              → veřejná data ověřených profilů (pro build webu)
 * GET  admin=<podpis>                                        → přehled pro provozovatele
 * GET  akce=pristup&z=<id>&t=<podpis>                        → schválení přístupu (pošle majiteli odkaz)
 * GET  akce=zamitnout&s=<salon>&t=<podpis>                   → stažení profilu z webu
 */
declare(strict_types=1);

const PRIJEMCE = 'info@najdikadernictvi.cz';
const WEB = 'https://najdikadernictvi.cz';
const PLATNOST_DNI = 30;
const MAX_FOTEK = 6;
const MAX_FOTO = 10 * 1024 * 1024;
const MAX_ZADOSTI_SALON = 3; // žádostí o přístup k jednomu salonu za 24 h
// Domény, které salonu „nepatří“ (sociální sítě, freemaily, stavebnice webů, rezervační systémy)
const SDILENE = '~(^|\.)(facebook|instagram|tiktok|google|goo|youtube|wix|wixsite|webnode|estranky|blogspot|wordpress|squarespace|weebly|webflow|gmail|googlemail|seznam|email|centrum|atlas|volny|post|tiscali|quick|outlook|hotmail|live|icloud|me|yahoo|proton|protonmail|linktr|linktree|business\.site|sites|reservio|noona|booksy|fresha|treatwell|mojeobjednavka|bookio|firmy|najisto|zlatestranky)\.~';

header('X-Robots-Tag: noindex');

function json_out(int $code, $data): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function html_out(string $titulek, string $obsah): void
{
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
        . '<title>' . htmlspecialchars($titulek) . '</title><body style="font:15px/1.5 system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;color:#26241f;background:#f6f4ef">'
        . '<h1 style="font-weight:400">' . htmlspecialchars($titulek) . '</h1>' . $obsah . '</body>';
    exit;
}
function posli_mail(string $komu, string $predmet, string $telo): bool
{
    return @mail(
        $komu,
        '=?UTF-8?B?' . base64_encode($predmet) . '?=',
        $telo,
        implode("\r\n", ['From: Najdi kadeřnictví <' . PRIJEMCE . '>', 'Reply-To: ' . PRIJEMCE, 'Content-Type: text/plain; charset=UTF-8', 'MIME-Version: 1.0']),
        '-f' . PRIJEMCE
    );
}

// ---------------------------------------------------------------- úložiště
$uloziste = dirname($_SERVER['DOCUMENT_ROOT'] ?: __DIR__ . '/..') . '/najdikadernictvi-data';
if (!is_dir($uloziste) && !@mkdir($uloziste, 0700, true)) json_out(503, ['ok' => false, 'chyba' => 'Úložiště není dostupné.']);
$tajSoubor = $uloziste . '/hodnoceni-tajemstvi.txt';
if (!is_file($tajSoubor)) {
    file_put_contents($tajSoubor, bin2hex(random_bytes(32)));
    @chmod($tajSoubor, 0600);
}
$TAJ = trim((string)file_get_contents($tajSoubor));
$podpis = fn(string $s): string => substr(hash_hmac('sha256', $s, $TAJ), 0, 32);
$fotkyDir = $uloziste . '/fotky-salonu';

$db = new PDO('sqlite:' . $uloziste . '/sprava.sqlite', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$db->exec('PRAGMA journal_mode=WAL');
$db->exec('CREATE TABLE IF NOT EXISTS profily (
    salon TEXT PRIMARY KEY, url TEXT NOT NULL, email TEXT NOT NULL, data TEXT NOT NULL,
    stav TEXT NOT NULL DEFAULT "ok", overeno TEXT NOT NULL, upraveno TEXT NOT NULL)');
$db->exec('CREATE TABLE IF NOT EXISTS zadosti (
    id INTEGER PRIMARY KEY AUTOINCREMENT, salon TEXT NOT NULL, url TEXT NOT NULL, email TEXT NOT NULL,
    jmeno TEXT, telefon TEXT, stav TEXT NOT NULL DEFAULT "ceka", vytvoreno TEXT NOT NULL, otisk_ip TEXT NOT NULL)');
$db->exec('CREATE TABLE IF NOT EXISTS blokace (salon TEXT NOT NULL, email TEXT NOT NULL, vytvoreno TEXT NOT NULL, PRIMARY KEY (salon, email))');
$db->exec('CREATE TABLE IF NOT EXISTS fotky (salon TEXT NOT NULL, n INTEGER NOT NULL, verze INTEGER NOT NULL, PRIMARY KEY (salon, n))');
foreach (['zadosti' => 'overeni', 'fotky' => 'email'] as $tab => $sloupec) {
    try { $db->exec("ALTER TABLE $tab ADD COLUMN $sloupec TEXT"); } catch (Throwable $e) { /* sloupec už existuje */ }
}

$platneId = fn($s): bool => is_string($s) && preg_match('/^[nwr]\d{1,12}$/', $s) === 1;
$platnaUrl = fn($u): bool => is_string($u) && preg_match('~^/[a-z0-9\-/]{3,200}/$~', $u) === 1;
$b64 = fn(string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
$unb64 = fn(string $s): string => (string)base64_decode(strtr($s, '-_', '+/'));

/** Host z URL bez www */
function domena(string $url): string
{
    $h = strtolower((string)parse_url(preg_match('~^https?://~i', $url) ? $url : "https://$url", PHP_URL_HOST));
    return preg_replace('/^www\./', '', $h);
}
/** Registrovatelná doména (salon.cz z rezervace.salon.cz) */
function koren(string $d): string
{
    $c = explode('.', $d);
    return implode('.', array_slice($c, -2));
}
/** Je e-mail uvedený na webu salonu? Kontroluje úvodní stránku a obvyklé stránky s kontakty. */
function emailNaWebu(string $email, string $web): bool
{
    if (!preg_match('~^https?://~i', $web)) $web = "https://$web";
    $p = parse_url($web);
    if (empty($p['host'])) return false;
    $zaklad = ($p['scheme'] ?? 'https') . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
    $ctx = stream_context_create([
        'http' => ['timeout' => 6, 'follow_location' => 1, 'max_redirects' => 4, 'ignore_errors' => true,
            'user_agent' => 'najdikadernictvi.cz-overeni/1.0 (+https://najdikadernictvi.cz)'],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $cesty = array_unique([rtrim($p['path'] ?? '', '/'), '', '/kontakt', '/kontakty', '/kontakt/', '/contact', '/o-nas']);
    $zacatek = microtime(true);
    foreach ($cesty as $cesta) {
        if (microtime(true) - $zacatek > 15) break;
        $html = @file_get_contents($zaklad . $cesta, false, $ctx, 0, 1_500_000);
        if (!$html) continue;
        $text = strtolower(html_entity_decode(urldecode($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $text = str_replace(['[at]', '(at)', ' @ ', '&#64;', '[zavináč]', '(zavináč)'], '@', $text);
        if (preg_match('~(?<![a-z0-9._%+\-])' . preg_quote($email, '~') . '(?![a-z0-9\-])~', $text)) return true;
    }
    return false;
}
/**
 * Automatické ověření, že e-mail patří salonu. Vrací popis způsobu, nebo null.
 * $k = záznam z /sprava-overeni.json: ['e' => otisk e-mailu salonu, 'w' => web salonu]
 */
function overitEmail(string $email, array $k, ?callable $naWebu = null): ?string
{
    $naWebu ??= 'emailNaWebu';
    if (!empty($k['e']) && hash_equals($k['e'], hash('sha256', $email))) return 'e-mail salonu v katalogu';
    $web = (string)($k['w'] ?? '');
    if ($web === '') return null;
    $domWeb = domena($web);
    $domEmail = strtolower(substr(strrchr($email, '@') ?: '', 1));
    if ($domWeb === '' || preg_match(SDILENE, ".$domWeb.")) return null;
    if ($domEmail !== '' && !preg_match(SDILENE, ".$domEmail.") && koren($domEmail) === koren($domWeb)) return "e-mail na doméně webu salonu ($domWeb)";
    if ($naWebu($email, $web)) return "e-mail uvedený na webu salonu ($domWeb)";
    return null;
}

/** Přihlašovací odkaz platný PLATNOST_DNI dní */
function odkaz(string $salon, string $url, string $email, callable $podpis, callable $b64): string
{
    $x = time() + PLATNOST_DNI * 86400;
    $e = $b64(strtolower($email));
    return WEB . '/sprava/?' . http_build_query(['s' => $salon, 'u' => $url, 'e' => $e, 'x' => $x, 't' => $podpis("sprava:$salon:" . strtolower($email) . ":$x")]);
}
function posli_odkaz(string $salon, string $url, string $email, callable $podpis, callable $b64): bool
{
    $o = odkaz($salon, $url, $email, $podpis, $b64);
    return posli_mail(
        $email,
        'Správa profilu salonu na Najdi kadeřnictví',
        "Dobrý den,\n\nposíláme odkaz pro správu profilu vašeho salonu:\n" . WEB . $url . "\n\n"
            . "Upravit údaje, ceník a fotky:\n$o\n\n"
            . 'Odkaz platí ' . PLATNOST_DNI . " dní a je jen pro vás, nikomu ho neposílejte. Nový odkaz si kdykoli vyžádáte na stránce salonu.\n\n"
            . "Pokud jste o odkaz nežádali, e-mail ignorujte.\n\nNajdi kadeřnictví\n" . WEB . "\n"
    );
}

/** Ověření přihlášení majitele z parametrů s, e, x, t */
$prihlaseni = function (array $z) use ($podpis, $unb64, $platneId, $db): array {
    $salon = (string)($z['s'] ?? '');
    $email = strtolower($unb64((string)($z['e'] ?? '')));
    $x = (int)($z['x'] ?? 0);
    if (!$platneId($salon) || !filter_var($email, FILTER_VALIDATE_EMAIL) || $x < time()
        || !hash_equals($podpis("sprava:$salon:$email:$x"), (string)($z['t'] ?? ''))) {
        json_out(403, ['ok' => false, 'chyba' => 'Odkaz je neplatný nebo vypršel. Vyžádejte si nový na stránce salonu.']);
    }
    $st = $db->prepare('SELECT 1 FROM blokace WHERE salon = ? AND email = ?');
    $st->execute([$salon, $email]);
    if ($st->fetchColumn()) json_out(403, ['ok' => false, 'chyba' => 'Přístup ke správě tohoto salonu byl zrušen.']);
    return [$salon, $email];
};

$fotkySalonu = function (string $salon) use ($db): array {
    $st = $db->prepare('SELECT n, verze FROM fotky WHERE salon = ? ORDER BY n');
    $st->execute([$salon]);
    return array_map(fn($r) => '/api/sprava.php?foto=' . $salon . '&n=' . $r['n'] . '&v=' . $r['verze'], $st->fetchAll());
};

// ---------------------------------------------------------------- fotka
if (isset($_GET['foto'])) {
    $salon = (string)$_GET['foto'];
    $n = (int)($_GET['n'] ?? 0);
    $soubor = "$fotkyDir/$salon/$n.jpg";
    $st = $db->prepare("SELECT stav FROM profily WHERE salon = ?");
    $st->execute([$salon]);
    $stav = $st->fetchColumn();
    if (!$platneId($salon) || !is_file($soubor) || $stav === 'zamitnuto') {
        http_response_code(404);
        exit;
    }
    header('Content-Type: image/jpeg');
    header('Cache-Control: public, max-age=2592000, immutable');
    header('Content-Length: ' . filesize($soubor));
    readfile($soubor);
    exit;
}

// ---------------------------------------------------------------- export pro build (jen veřejné údaje)
if (isset($_GET['export'])) {
    $out = [];
    foreach ($db->query("SELECT salon, data, overeno FROM profily WHERE stav = 'ok' ORDER BY salon") as $r) {
        $d = json_decode($r['data'], true) ?: [];
        $d['overeno'] = substr($r['overeno'], 0, 10);
        $f = $fotkySalonu($r['salon']);
        if ($f) $d['fotky'] = $f;
        $out[$r['salon']] = $d;
    }
    json_out(200, ['salony' => (object)$out]);
}

// ---------------------------------------------------------------- administrace
if (isset($_GET['admin'])) {
    if (!hash_equals($podpis('sprava-admin'), (string)$_GET['admin'])) html_out('Neplatný odkaz', '');
    $e = fn($s) => htmlspecialchars((string)$s);
    $h = '<h2 style="font-weight:400">Žádosti o přístup</h2>';
    $zad = $db->query("SELECT * FROM zadosti WHERE stav = 'ceka' ORDER BY id DESC LIMIT 100")->fetchAll();
    if (!$zad) $h .= '<p>Žádné nečekají.</p>';
    foreach ($zad as $z) {
        $h .= '<div style="background:#fff;border:1px solid #e3ded4;padding:1rem;margin:0 0 .75rem">'
            . '<p style="margin:0 0 .4rem"><a href="' . $e(WEB . $z['url']) . '">' . $e($z['url']) . '</a></p>'
            . '<p style="margin:0 0 .6rem">' . $e($z['jmeno'] ?: 'bez jména') . ' · ' . $e($z['email']) . ($z['telefon'] ? ' · ' . $e($z['telefon']) : '') . ' · ' . $e(substr($z['vytvoreno'], 0, 16)) . '</p>'
            . '<a href="?akce=pristup&z=' . $z['id'] . '&t=' . $podpis('pristup:' . $z['id']) . '">Ověřeno, poslat přístup</a> · '
            . '<a href="?akce=odmitnout&z=' . $z['id'] . '&t=' . $podpis('odmitnout:' . $z['id']) . '">Odmítnout</a></div>';
    }
    $h .= '<h2 style="font-weight:400">Profily spravované majiteli</h2>';
    foreach ($db->query('SELECT salon, url, email, stav, upraveno FROM profily ORDER BY upraveno DESC LIMIT 300') as $p) {
        $h .= '<p style="border-top:1px solid #e3ded4;padding-top:.5rem"><a href="' . $e(WEB . $p['url']) . '">' . $e($p['url']) . '</a> · ' . $e($p['email'])
            . ' · ' . $e(substr($p['upraveno'], 0, 10)) . ' · <strong>' . ($p['stav'] === 'ok' ? 'na webu' : 'stažen') . '</strong> · '
            . ($p['stav'] === 'ok'
                ? '<a href="?akce=zamitnout&s=' . $p['salon'] . '&t=' . $podpis('zamitnout:' . $p['salon']) . '">Stáhnout z webu</a>'
                : '<a href="?akce=obnovit&s=' . $p['salon'] . '&t=' . $podpis('obnovit:' . $p['salon']) . '">Obnovit</a>') . '</p>';
    }
    html_out('Správa profilů', $h . '<p style="color:#6b645a;font-size:13px">Změny se na web propisují automaticky každé 3 hodiny (GitHub Actions „Synchronizace profilů“), nebo ručním spuštěním.</p>');
}

$akce = (string)($_GET['akce'] ?? $_POST['akce'] ?? '');

if (in_array($akce, ['pristup', 'odmitnout'], true) && isset($_GET['z'], $_GET['t'])) {
    $id = (int)$_GET['z'];
    if (!hash_equals($podpis("$akce:$id"), (string)$_GET['t'])) html_out('Neplatný odkaz', '');
    $st = $db->prepare('SELECT * FROM zadosti WHERE id = ?');
    $st->execute([$id]);
    $z = $st->fetch();
    if (!$z) html_out('Žádost nenalezena', '');
    $db->prepare('UPDATE zadosti SET stav = ? WHERE id = ?')->execute([$akce === 'pristup' ? 'schvaleno' : 'odmitnuto', $id]);
    if ($akce === 'pristup') {
        $ok = posli_odkaz($z['salon'], $z['url'], $z['email'], $podpis, $b64);
        html_out('Přístup schválen', '<p>' . ($ok ? 'Odkaz pro správu jsme poslali na ' . htmlspecialchars($z['email']) . '.' : 'E-mail se nepodařilo odeslat.') . '</p>');
    }
    html_out('Žádost odmítnuta', '<p>Majitel přístup nedostane.</p>');
}
if ($akce === 'blokovat' && isset($_GET['s'], $_GET['e'], $_GET['t'])) {
    $salon = (string)$_GET['s'];
    $email = strtolower($unb64((string)$_GET['e']));
    if (!$platneId($salon) || !hash_equals($podpis("blokovat:$salon:$email"), (string)$_GET['t'])) html_out('Neplatný odkaz', '');
    $db->prepare('INSERT OR IGNORE INTO blokace (salon, email, vytvoreno) VALUES (?,?,?)')->execute([$salon, $email, date('c')]);
    // Úpravy a fotky blokovaného e-mailu z webu zmizí; skutečný majitel si profil může znovu převzít
    $st = $db->prepare('SELECT email FROM profily WHERE salon = ?');
    $st->execute([$salon]);
    $jehoProfil = $st->fetchColumn() === $email;
    if ($jehoProfil) $db->prepare('DELETE FROM profily WHERE salon = ?')->execute([$salon]);
    $st = $db->prepare('SELECT n FROM fotky WHERE salon = ? AND (email = ?' . ($jehoProfil ? ' OR email IS NULL' : '') . ')');
    $st->execute([$salon, $email]);
    foreach ($st->fetchAll() as $f) {
        @unlink("$fotkyDir/$salon/{$f['n']}.jpg");
        $db->prepare('DELETE FROM fotky WHERE salon = ? AND n = ?')->execute([$salon, $f['n']]);
    }
    posli_mail(PRIJEMCE, '[najdikadernictvi.cz] Zablokován přístup ke správě', "Salon: $salon
Zablokovaný e-mail: $email
Úpravy a fotky tohoto e-mailu byly odstraněny.
");
    html_out('Přístup zablokován', '<p>E-mail ' . htmlspecialchars($email) . ' už nemůže spravovat tento salon a jeho úpravy i fotky jsme z webu odstranili (změna se projeví do několika hodin).</p>'
        . '<p>Pokud salon spravujete vy, vyžádejte si nový přihlašovací odkaz na jeho stránce.</p>');
}
if (in_array($akce, ['zamitnout', 'obnovit'], true) && isset($_GET['s'], $_GET['t'])) {
    $salon = (string)$_GET['s'];
    if (!hash_equals($podpis("$akce:$salon"), (string)$_GET['t'])) html_out('Neplatný odkaz', '');
    $db->prepare('UPDATE profily SET stav = ? WHERE salon = ?')->execute([$akce === 'zamitnout' ? 'zamitnuto' : 'ok', $salon]);
    html_out($akce === 'zamitnout' ? 'Profil stažen' : 'Profil obnoven', '<p>Změna se na webu projeví při další synchronizaci.</p>');
}

// ---------------------------------------------------------------- žádost o přístup
if ($akce === 'zadost' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $ref = $_SERVER['HTTP_REFERER'] ?? '';
    if ($ref !== '' && !preg_match('~^https?://(www\.)?najdikadernictvi\.cz/~', $ref)) json_out(403, ['ok' => false]);
    if (trim((string)($_POST['web2'] ?? '')) !== '') json_out(200, ['ok' => true, 'rezim' => 'kontrola']);
    $salon = (string)($_POST['salon'] ?? '');
    $url = (string)($_POST['url'] ?? '');
    $email = strtolower(trim((string)($_POST['email'] ?? '')));
    $jmeno = mb_substr(trim((string)($_POST['jmeno'] ?? '')), 0, 80);
    $tel = mb_substr(trim((string)($_POST['telefon'] ?? '')), 0, 30);
    if (!$platneId($salon) || !$platnaUrl($url)) json_out(400, ['ok' => false, 'chyba' => 'Neplatný salon.']);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_out(422, ['ok' => false, 'chyba' => 'Zadejte platný e-mail.']);

    $otiskIp = hash_hmac('sha256', 'sprava:' . ($_SERVER['REMOTE_ADDR'] ?? '') . ':' . date('YmdH'), $TAJ);
    $st = $db->prepare('SELECT COUNT(*) FROM zadosti WHERE otisk_ip = ?');
    $st->execute([$otiskIp]);
    if ((int)$st->fetchColumn() >= 5) json_out(429, ['ok' => false, 'chyba' => 'Příliš mnoho žádostí. Zkuste to prosím později.']);

    $st = $db->prepare('SELECT 1 FROM blokace WHERE salon = ? AND email = ?');
    $st->execute([$salon, $email]);
    $blokovany = (bool)$st->fetchColumn();

    // Údaje salonu z katalogu (otisk e-mailu, web); starší formát souboru obsahoval jen otisk
    $katalog = json_decode((string)@file_get_contents(($_SERVER['DOCUMENT_ROOT'] ?: __DIR__ . '/..') . '/sprava-overeni.json'), true) ?: [];
    $k = $katalog[$salon] ?? [];
    if (is_string($k)) $k = ['e' => $k];
    $st = $db->prepare("SELECT email FROM profily WHERE salon = ? AND stav = 'ok'");
    $st->execute([$salon]);
    $spravce = (string)($st->fetchColumn() ?: '');
    $overeni = $blokovany ? null : ($spravce === $email ? 'stávající správce profilu' : overitEmail($email, (array)$k));

    // Limit neověřených žádostí na salon (brání zkoušení e-mailů); ověřený majitel projde vždy
    if (!$overeni) {
        $st = $db->prepare('SELECT COUNT(*) FROM zadosti WHERE salon = ? AND vytvoreno >= ? AND overeni IS NULL');
        $st->execute([$salon, date('c', time() - 86400)]);
        if ((int)$st->fetchColumn() >= MAX_ZADOSTI_SALON) json_out(429, ['ok' => false, 'chyba' => 'K tomuto salonu přišlo dnes už několik žádostí. Zkuste to prosím zítra.']);

    }

    $db->prepare('INSERT INTO zadosti (salon, url, email, jmeno, telefon, stav, vytvoreno, otisk_ip, overeni) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$salon, $url, $email, $jmeno ?: null, $tel ?: null, $overeni ? 'automaticky' : ($blokovany ? 'blokovano' : 'ceka'), date('c'), $otiskIp, $overeni]);
    $id = (int)$db->lastInsertId();
    if ($blokovany) json_out(200, ['ok' => true, 'rezim' => 'kontrola']); // nic neprozrazujeme

    $api = WEB . '/api/sprava.php';
    $blok = fn(string $e) => "$api?akce=blokovat&s=$salon&e=" . $b64($e) . '&t=' . $podpis("blokovat:$salon:$e");
    if ($overeni) {
        posli_odkaz($salon, $url, $email, $podpis, $b64);
        // Všichni dosavadní správci se o novém přístupu dozví a můžou ho jedním klikem zrušit
        $st = $db->prepare("SELECT DISTINCT email FROM zadosti WHERE salon = ? AND email != ? AND stav IN ('automaticky', 'schvaleno')
            AND email NOT IN (SELECT email FROM blokace WHERE salon = ?)");
        $st->execute([$salon, $email, $salon]);
        $predchozi = $st->fetchAll(PDO::FETCH_COLUMN);
        if ($spravce !== '' && $spravce !== $email) $predchozi[] = $spravce;
        foreach (array_unique($predchozi) as $spravce) {
            posli_mail($spravce, 'Někdo další získal přístup ke správě vašeho salonu',
                "Dobrý den,\n\nk profilu vašeho salonu " . WEB . $url . " získal přístup ke správě e-mail $email ($overeni).\n\n"
                . "Pokud ho neznáte, zrušte mu přístup a odstraňte jeho úpravy jedním kliknutím:\n" . $blok($email) . "\n\nNajdi kadeřnictví\n");
        }
        posli_mail(PRIJEMCE, '[najdikadernictvi.cz] Majitel ověřen automaticky',
            "Salon: " . WEB . $url . " ($salon)\nE-mail: $email\nJméno: " . ($jmeno ?: '-') . "\nTelefon: " . ($tel ?: '-') . "\nOvěření: $overeni\n\n"
            . "Zablokovat a odstranit jeho úpravy: " . $blok($email) . "\n");
        json_out(200, ['ok' => true, 'rezim' => 'odkaz']);
    }
    posli_mail(
        PRIJEMCE,
        '[najdikadernictvi.cz] Žádost o správu profilu',
        "Salon: " . WEB . $url . " ($salon)\nE-mail: $email\nJméno: " . ($jmeno ?: '-') . "\nTelefon: " . ($tel ?: '-') . "\n\n"
            . "Automaticky ověřit nešlo (e-mail se neshoduje s e-mailem ani webem salonu). Ověřte, že žadatel salon opravdu zastupuje (např. zavolejte na telefon salonu z katalogu), a pak:\n\n"
            . "Poslat přístup: $api?akce=pristup&z=$id&t=" . $podpis("pristup:$id") . "\n"
            . "Odmítnout: $api?akce=odmitnout&z=$id&t=" . $podpis("odmitnout:$id") . "\n"
    );
    json_out(200, ['ok' => true, 'rezim' => 'kontrola']);
}

// ---------------------------------------------------------------- načtení profilu
if ($akce === 'nacti') {
    [$salon, $email] = $prihlaseni($_GET);
    $st = $db->prepare('SELECT data, upraveno FROM profily WHERE salon = ?');
    $st->execute([$salon]);
    $p = $st->fetch();
    // Návštěvnost profilu za 90 dní
    $navstevy = [];
    $url = (string)($_GET['u'] ?? '');
    if ($platnaUrl($url) && is_file($uloziste . '/statistika.sqlite')) {
        $s = new PDO('sqlite:' . $uloziste . '/statistika.sqlite');
        $q = $s->prepare('SELECT den, pocet FROM zobrazeni WHERE cesta = ? AND den >= ? ORDER BY den');
        $q->execute([$url, date('Y-m-d', strtotime('-90 days'))]);
        $navstevy = $q->fetchAll(PDO::FETCH_KEY_PAIR);
    }
    json_out(200, [
        'ok' => true,
        'email' => $email,
        'data' => $p ? json_decode($p['data'], true) : null,
        'upraveno' => $p['upraveno'] ?? null,
        'fotky' => $fotkySalonu($salon),
        'navstevy' => (object)$navstevy,
    ]);
}

// ---------------------------------------------------------------- uložení údajů
if ($akce === 'uloz' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    [$salon, $email] = $prihlaseni($_POST);
    $url = (string)($_POST['u'] ?? '');
    if (!$platnaUrl($url)) json_out(400, ['ok' => false, 'chyba' => 'Neplatný salon.']);
    $vstup = json_decode((string)($_POST['data'] ?? ''), true);
    if (!is_array($vstup)) json_out(400, ['ok' => false, 'chyba' => 'Neplatná data.']);

    $txt = fn($v, int $max) => mb_substr(trim(preg_replace('/\s+/u', ' ', (string)$v)), 0, $max);
    $odkaz = function ($v) use ($txt) {
        $v = $txt($v, 300);
        if ($v === '') return '';
        if (!preg_match('~^https?://~i', $v)) $v = 'https://' . $v;
        return filter_var($v, FILTER_VALIDATE_URL) && preg_match('~^https?://[^\s/]+\.[a-z]{2,}~i', $v) ? $v : null;
    };
    $d = [];
    $chyby = [];
    $tel = $txt($vstup['telefon'] ?? '', 30);
    if ($tel !== '') {
        if (!preg_match('/^\+?[\d\s]{9,20}$/', $tel)) $chyby[] = 'Telefon zadejte jen číslicemi, např. +420 777 123 456.';
        else $d['telefon'] = $tel;
    }
    $em = strtolower($txt($vstup['email'] ?? '', 120));
    if ($em !== '') {
        if (!filter_var($em, FILTER_VALIDATE_EMAIL)) $chyby[] = 'Neplatný e-mail salonu.';
        else $d['email'] = $em;
    }
    foreach (['web' => 'Web', 'instagram' => 'Instagram', 'facebook' => 'Facebook', 'rezervace' => 'Odkaz na rezervace'] as $k => $nazev) {
        $v = $odkaz($vstup[$k] ?? '');
        if ($v === null) $chyby[] = "$nazev: neplatná adresa.";
        elseif ($v !== '') $d[$k] = $v;
    }
    $popis = mb_substr(trim((string)($vstup['popis'] ?? '')), 0, 1000);
    if (preg_match('~https?://|www\.~i', $popis)) $chyby[] = 'Popis nesmí obsahovat odkazy.';
    elseif ($popis !== '') $d['popis'] = $popis;
    $svatky = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)($vstup['svatky'] ?? ''))), 0, 300);
    if (preg_match('~https?://|www\.~i', $svatky)) $chyby[] = 'Otevírací doba o svátcích nesmí obsahovat odkazy.';
    elseif ($svatky !== '') $d['svatky'] = $svatky;
    $doba = $txt($vstup['oteviraciDoba'] ?? '', 250);
    if ($doba !== '') {
        if (!preg_match('/^[A-Za-z0-9 :;,\-]+$/', $doba)) $chyby[] = 'Otevírací doba má neplatný formát.';
        else $d['oteviraciDoba'] = $doba;
    }
    if (in_array($vstup['platbaKartou'] ?? '', ['yes', 'no'], true)) $d['platbaKartou'] = $vstup['platbaKartou'];
    if (in_array($vstup['bezbarierove'] ?? '', ['yes', 'limited', 'no'], true)) $d['bezbarierove'] = $vstup['bezbarierove'];
    $zam = array_values(array_intersect((array)($vstup['zamereni'] ?? []), ['panske', 'damske', 'detske', 'unisex']));
    if ($zam) $d['zamereni'] = $zam;
    $slu = array_values(array_intersect((array)($vstup['sluzby'] ?? []), ['bez-objednani', 'parkovani', 'vousy', 'barveni', 'prodluzovani']));
    if ($slu) $d['sluzby'] = $slu;
    $cenik = [];
    foreach (array_slice((array)($vstup['cenik'] ?? []), 0, 40) as $r) {
        $pol = $txt($r['polozka'] ?? '', 80);
        $cena = $txt($r['cena'] ?? '', 40);
        if ($pol !== '' && $cena !== '') $cenik[] = ['polozka' => $pol, 'cena' => $cena];
    }
    if ($cenik) $d['cenik'] = $cenik;
    $g = (array)($vstup['google'] ?? []);
    $gh = trim((string)($g['h'] ?? ''));
    $gn = trim((string)($g['n'] ?? ''));
    if ($gh !== '' || $gn !== '') {
        $h = (float)str_replace(',', '.', $gh);
        $n = (int)$gn;
        if ($h < 1 || $h > 5 || $n < 1 || $n > 100000) $chyby[] = 'Hodnocení na Googlu: zadejte hodnocení 1–5 i počet recenzí.';
        else {
            $d['google'] = ['h' => round($h, 1), 'n' => $n, 'datum' => date('Y-m-d')];
            $gu = $odkaz($g['url'] ?? '');
            if ($gu === null || ($gu !== '' && !preg_match('~^https://(www\.)?(google\.[a-z.]+/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl/maps|g\.page)/~i', $gu))) $chyby[] = 'Odkaz na Google Mapy je neplatný.';
            elseif ($gu !== '') $d['google']['url'] = $gu;
        }
    }
    if ($chyby) json_out(422, ['ok' => false, 'chyba' => implode(' ', $chyby)]);

    $ted = date('c');
    $st = $db->prepare('SELECT data FROM profily WHERE salon = ?');
    $st->execute([$salon]);
    $predtim = $st->fetchColumn();
    // datum Google hodnocení se mění jen při změně čísel
    $pg = $predtim ? (json_decode((string)$predtim, true)['google'] ?? null) : null;
    if (isset($d['google'], $pg['h'], $pg['n'], $pg['datum']) && $pg['h'] == $d['google']['h'] && $pg['n'] == $d['google']['n']) $d['google']['datum'] = $pg['datum'];
    $db->prepare('INSERT INTO profily (salon, url, email, data, stav, overeno, upraveno) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(salon) DO UPDATE SET url = excluded.url, email = excluded.email, data = excluded.data, upraveno = excluded.upraveno')
        ->execute([$salon, $url, $email, json_encode($d, JSON_UNESCAPED_UNICODE), 'ok', $ted, $ted]);

    if ($predtim !== json_encode($d, JSON_UNESCAPED_UNICODE)) {
        $api = WEB . '/api/sprava.php';
        posli_mail(
            PRIJEMCE,
            '[najdikadernictvi.cz] Majitel upravil profil',
            "Salon: " . WEB . $url . "\nUpravil: $email\n\n" . json_encode($d, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n\n"
                . "Pokud úprava není v pořádku, stáhněte profil z webu:\n$api?akce=zamitnout&s=$salon&t=" . $podpis("zamitnout:$salon") . "\n"
        );
    }
    json_out(200, ['ok' => true]);
}

// ---------------------------------------------------------------- fotky
if ($akce === 'foto' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    [$salon, $email] = $prihlaseni($_POST);
    $f = $_FILES['foto'] ?? null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK || $f['size'] > MAX_FOTO) json_out(422, ['ok' => false, 'chyba' => 'Fotku se nepodařilo nahrát (max. 10 MB).']);
    $st = $db->prepare('SELECT COUNT(*) FROM fotky WHERE salon = ?');
    $st->execute([$salon]);
    if ((int)$st->fetchColumn() >= MAX_FOTEK) json_out(422, ['ok' => false, 'chyba' => 'Nahrát lze nejvýš ' . MAX_FOTEK . ' fotek.']);
    $info = @getimagesize($f['tmp_name']);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true) || $info[0] * $info[1] > 60_000_000) {
        json_out(422, ['ok' => false, 'chyba' => 'Podporujeme fotky JPG, PNG nebo WebP.']);
    }
    $img = @imagecreatefromstring((string)file_get_contents($f['tmp_name']));
    if (!$img) json_out(422, ['ok' => false, 'chyba' => 'Fotku se nepodařilo přečíst.']);
    if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
        $o = (int)(@exif_read_data($f['tmp_name'])['Orientation'] ?? 1);
        $uhel = [3 => 180, 6 => -90, 8 => 90][$o] ?? 0;
        if ($uhel) $img = imagerotate($img, $uhel, 0);
    }
    $w = imagesx($img);
    $h = imagesy($img);
    $k = min(1, 1600 / max($w, $h));
    if ($k < 1) $img = imagescale($img, (int)round($w * $k), (int)round($h * $k), IMG_BICUBIC);
    $n = (int)$db->query('SELECT COALESCE(MAX(n), 0) + 1 FROM fotky WHERE salon = ' . $db->quote($salon))->fetchColumn();
    if (!is_dir("$fotkyDir/$salon")) @mkdir("$fotkyDir/$salon", 0700, true);
    if (!@imagejpeg($img, "$fotkyDir/$salon/$n.jpg", 84)) json_out(500, ['ok' => false, 'chyba' => 'Fotku se nepodařilo uložit.']);
    imagedestroy($img);
    $db->prepare('INSERT INTO fotky (salon, n, verze, email) VALUES (?,?,?,?)')->execute([$salon, $n, time(), $email]);
    json_out(200, ['ok' => true, 'fotky' => $fotkySalonu($salon)]);
}
if ($akce === 'smazfoto' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    [$salon, $email] = $prihlaseni($_POST);
    $n = (int)($_POST['n'] ?? 0);
    $db->prepare('DELETE FROM fotky WHERE salon = ? AND n = ?')->execute([$salon, $n]);
    @unlink("$fotkyDir/$salon/$n.jpg");
    json_out(200, ['ok' => true, 'fotky' => $fotkySalonu($salon)]);
}

json_out(400, ['ok' => false]);
