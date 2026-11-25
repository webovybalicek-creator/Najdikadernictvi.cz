<?php
/**
 * Oslovení salonů e-mailem: majitel dostane osobní odkaz rovnou do správy svého profilu (bez registrace).
 *
 * GET  ?admin=<podpis>                       → administrace: seznam salonů s e-mailem, výběr, náhled, odeslání
 * POST akce=odeslat, admin, ids[]            → odeslání vybraným (nejvýš DENNI_LIMIT za den)
 * GET  ?k=<id oslovení>&t=<podpis>           → klik z e-mailu: zaznamená a přesměruje do správy profilu (nový odkaz)
 * GET/POST ?odhlasit=<id>&t=<podpis>         → „Už mi nepište“ (i one-click List-Unsubscribe)
 *
 * Seznam salonů: osloveni-data.php (generuje build webu). Stav oslovení: SQLite mimo veřejnou složku.
 * Přihlášení do správy používá stejné tajemství a podpis jako sprava.php.
 */
declare(strict_types=1);

const PRIJEMCE = 'info@najdikadernictvi.cz';
const ODESILATEL = 'Vladimír Fischer – Najdi kadeřnictví';
const WEB = 'https://najdikadernictvi.cz';
const DENNI_LIMIT = 20;
const AUTO_DAVKA = 10;              // automatická denní dávka (GitHub Actions, pracovní dny dopoledne)
const KOPIE = 'webovybalicek@gmail.com';
const PLATNOST_E_MAILU_DNI = 90;   // jak dlouho funguje odkaz v e-mailu
const PLATNOST_SPRAVY_DNI = 30;    // jak dlouho platí přihlášení do správy po kliknutí (jako v sprava.php)

date_default_timezone_set('Europe/Prague');
header('X-Robots-Tag: noindex');
header('Cache-Control: no-store');

$uloziste = dirname($_SERVER['DOCUMENT_ROOT'] ?: __DIR__ . '/..') . '/najdikadernictvi-data';
if (!is_dir($uloziste)) @mkdir($uloziste, 0700, true);
$tajSoubor = $uloziste . '/hodnoceni-tajemstvi.txt';
if (!is_file($tajSoubor)) {
    file_put_contents($tajSoubor, bin2hex(random_bytes(32)));
    @chmod($tajSoubor, 0600);
}
$TAJ = trim((string)file_get_contents($tajSoubor));
$podpis = fn(string $s): string => substr(hash_hmac('sha256', $s, $TAJ), 0, 32);
$b64 = fn(string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
$h = fn($s): string => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');

$db = new PDO('sqlite:' . $uloziste . '/osloveni.sqlite', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$db->exec('PRAGMA journal_mode=WAL');
$db->exec('CREATE TABLE IF NOT EXISTS osloveni (
    id INTEGER PRIMARY KEY AUTOINCREMENT, salon TEXT NOT NULL, email TEXT NOT NULL,
    odeslano TEXT NOT NULL, kliknuto TEXT, pocet_kliku INTEGER NOT NULL DEFAULT 0, chyba TEXT)');
$db->exec('CREATE INDEX IF NOT EXISTS i_salon ON osloveni(salon)');
$db->exec('CREATE TABLE IF NOT EXISTS odhlaseni (email TEXT PRIMARY KEY, vytvoreno TEXT NOT NULL)');

$salony = is_file(__DIR__ . '/osloveni-data.php') ? (array)(require __DIR__ . '/osloveni-data.php') : [];

function stranka(string $titulek, string $obsah, bool $siroka = false): void
{
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="cs"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="robots" content="noindex"><title>' . htmlspecialchars($titulek) . '</title>'
        . '<body style="font:16px/1.5 system-ui,sans-serif;max-width:' . ($siroka ? '72rem' : '36rem') . ';margin:2.5rem auto;padding:0 1rem;color:#222;background:#fafafa">'
        . '<p style="font-size:1.3rem;margin:0 0 1.5rem">najdi<b style="color:#ff385c">kadeřnictví</b></p>' . $obsah . '</body></html>';
    exit;
}

/** Odkaz do správy profilu ve stejném formátu jako sprava.php */
function odkazSpravy(string $salon, string $url, string $email, callable $podpis, callable $b64): string
{
    $x = time() + PLATNOST_SPRAVY_DNI * 86400;
    $e = strtolower($email);
    return WEB . '/sprava/?' . http_build_query(['s' => $salon, 'u' => $url, 'e' => $b64($e), 'x' => $x, 't' => $podpis("sprava:$salon:$e:$x"), 'zdroj' => 'email']);
}

/**
 * E-mail pro salon: [předmět, prostý text, HTML].
 * Krátký osobní dopis s jednou prosbou (zkontrolovat otevírací dobu), ne reklamní newsletter:
 * bez obrázků a ikon, ať nepadá do „Promo akcí“ a působí jako zpráva od člověka.
 * Od 15. 11. do 6. 1. je důvodem otevírací doba o svátcích (nejsilnější důvod odpovědět).
 */
function textEmailu(array $s, string $klik, string $odhlasit): array
{
    $e = fn($t): string => htmlspecialchars((string)$t, ENT_QUOTES, 'UTF-8');
    $profil = WEB . $s['url'];
    $md = (int)date('n') * 100 + (int)date('j');
    $svatky = $md >= 1115 || $md <= 106;
    $nazev = $s['nazev'];

    if ($svatky) {
        $predmet = "Otevírací doba o Vánocích – $nazev";
        $prosba = 'Před Vánoci u nás lidé nejčastěji hledají, kdo má otevřeno 23. a 27.–31. prosince. '
            . 'Můžete mi prosím potvrdit, jak to budete mít? Stačí kliknout na odkaz níže a vyplnit dny o svátcích, zabere to minutu.';
    } else {
        $predmet = "$nazev: sedí otevírací doba?";
        $prosba = $s['doba']
            ? 'Můžete se prosím podívat, jestli u vás sedí otevírací doba a kontakt? Lidé se podle nich rozhodují, kam zajít.'
            : 'U vašeho salonu nám chybí otevírací doba, a lidé se podle ní rozhodují, kam zajít. Můžete ji prosím doplnit?';
    }
    $navic = 'Když budete chtít, přidáte i pár fotek nebo ceník a stáhnete si plakát s QR kódem do výlohy. Je to zdarma, bez registrace a bez hesla.';

    // ---- prostý text
    $text = "Dobrý den,\n\n"
        . "píšu z najdikadernictvi.cz, kde lidé hledají kadeřnictví a barbershopy v okolí. Váš salon $nazev tam má profil:\n$profil\n\n"
        . "$prosba\n$klik\n\n"
        . "$navic\n\n"
        . "Kdyby bylo cokoli špatně nebo v katalogu být nechcete, stačí odpovědět na tento e-mail.\n\n"
        . "Děkuji a hezký den\nVladimír Fischer\nnajdikadernictvi.cz\n\n--\n"
        . "Píšu jednou na veřejný e-mail salonu. Další zprávy nechcete: $odhlasit\n";

    // ---- HTML: vypadá jako běžný e-mail (bez obrázků, bez tlačítek)
    $f = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222";
    $html = '<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . $e($predmet) . '</title></head>'
        . '<body style="margin:0;padding:16px;background:#ffffff"><div style="max-width:560px;' . $f . '">'
        . '<p style="margin:0 0 14px">Dobrý den,</p>'
        . '<p style="margin:0 0 14px">píšu z <a href="' . WEB . '" style="color:#222">najdikadernictvi.cz</a>, kde lidé hledají kadeřnictví a barbershopy v okolí. '
        . 'Váš salon <a href="' . $e($profil) . '" style="color:#222">' . $e($nazev) . '</a> tam má profil.</p>'
        . '<p style="margin:0 0 14px">' . $e($prosba) . '</p>'
        . '<p style="margin:0 0 14px"><a href="' . $e($klik) . '" style="color:#e00b41;font-weight:600">' . ($svatky ? 'Vyplnit otevírací dobu o svátcích' : 'Zkontrolovat profil salonu') . '</a></p>'
        . '<p style="margin:0 0 14px">' . $e($navic) . '</p>'
        . '<p style="margin:0 0 14px">Kdyby bylo cokoli špatně nebo v katalogu být nechcete, stačí odpovědět na tento e-mail.</p>'
        . '<p style="margin:0 0 24px">Děkuji a hezký den<br>Vladimír Fischer<br>najdikadernictvi.cz</p>'
        . '<p style="margin:0;font-size:12px;color:#999">Píšu jednou na veřejný e-mail salonu. Další zprávy nechcete? <a href="' . $e($odhlasit) . '" style="color:#999">Odhlásit</a>.</p>'
        . '</div></body></html>';
    return [$predmet, $text, $html];
}

/** Hlavičky a tělo multipart/alternative (prostý text + HTML) */
function mimeZprava(string $text, string $html, string $odh): array
{
    $hranice = 'nk' . bin2hex(random_bytes(12));
    $hlavicky = implode("\r\n", [
        'From: =?UTF-8?B?' . base64_encode(ODESILATEL) . '?= <' . PRIJEMCE . '>',
        'Reply-To: ' . PRIJEMCE,
        'List-Unsubscribe: <' . $odh . '>, <mailto:' . PRIJEMCE . '?subject=odhlasit>',
        'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $hranice . '"',
    ]);
    $telo = "--$hranice\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($text))
        . "--$hranice\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($html))
        . "--$hranice--\r\n";
    return [$hlavicky, $telo];
}

// ---------------------------------------------------------------- klik z e-mailu
if (isset($_GET['k'])) {
    $id = (int)$_GET['k'];
    $st = $db->prepare('SELECT * FROM osloveni WHERE id = ?');
    $st->execute([$id]);
    $o = $st->fetch();
    $s = $o ? ($salony[$o['salon']] ?? null) : null;
    if (!$o || !$s || !hash_equals($podpis("osloveni-klik:$id"), (string)($_GET['t'] ?? ''))) {
        stranka('Neplatný odkaz', '<h1>Odkaz nefunguje</h1><p>Odkaz je neplatný nebo salon už v katalogu není. Napište nám na <a href="mailto:' . PRIJEMCE . '">' . PRIJEMCE . '</a>.</p>');
    }
    if (strtotime($o['odeslano']) < time() - PLATNOST_E_MAILU_DNI * 86400) {
        stranka('Platnost vypršela', '<h1>Platnost odkazu vypršela</h1><p>Nový přihlašovací odkaz si vyžádáte na stránce svého salonu (tlačítko „Spravovat profil“):</p><p><a href="' . WEB . $h($s['url']) . '">' . $h($s['nazev']) . '</a></p>');
    }
    $db->prepare('UPDATE osloveni SET kliknuto = COALESCE(kliknuto, ?), pocet_kliku = pocet_kliku + 1 WHERE id = ?')->execute([date('c'), $id]);
    // v sezóně svátků rovnou na pole „Otevírací doba o svátcích“ (o to e-mail prosí)
    $md = (int)date('n') * 100 + (int)date('j');
    header('Location: ' . odkazSpravy($o['salon'], $s['url'], $o['email'], $podpis, $b64) . ($md >= 1115 || $md <= 106 ? '#svatky' : ''), true, 302);
    exit;
}

// ---------------------------------------------------------------- odhlášení
if (isset($_GET['odhlasit'])) {
    $id = (int)$_GET['odhlasit'];
    if (!hash_equals($podpis("osloveni-odhlasit:$id"), (string)($_GET['t'] ?? ''))) stranka('Neplatný odkaz', '<p>Odkaz je neplatný.</p>');
    $st = $db->prepare('SELECT email FROM osloveni WHERE id = ?');
    $st->execute([$id]);
    $email = (string)$st->fetchColumn();
    if ($email !== '') $db->prepare('INSERT OR IGNORE INTO odhlaseni (email, vytvoreno) VALUES (?, ?)')->execute([$email, date('c')]);
    if ($_SERVER['REQUEST_METHOD'] === 'POST') { http_response_code(200); exit; } // one-click z poštovního klienta
    stranka('Odhlášeno', '<h1>Hotovo</h1><p>Na adresu ' . $h($email) . ' už vám nic nepošleme.</p>'
        . '<p>Pokud chcete salon z katalogu odstranit nebo opravit údaje, napište na <a href="mailto:' . PRIJEMCE . '">' . PRIJEMCE . '</a>.</p>');
}

// ---------------------------------------------------------------- automatická denní dávka
// Spouští GitHub Actions (POST ?auto=1). Bez tajemství, ale nejvýš jedna dávka denně, jen v pracovní dny 7–13 h,
// takže spuštění zvenku nemůže poslat víc e-mailů, jen dnešní dávku dřív.
$auto = isset($_GET['auto']) && $_SERVER['REQUEST_METHOD'] === 'POST';
if (isset($_GET['auto']) && !$auto) { http_response_code(405); exit; }

// ---------------------------------------------------------------- administrace
$admin = (string)($_POST['admin'] ?? $_GET['admin'] ?? '');
if (!$auto && !hash_equals($podpis('osloveni-admin'), $admin)) stranka('Oslovení salonů', '<p>Odkaz do administrace přijde e-mailem přes <a href="/api/admin.php">/api/admin.php</a>.</p>');

// stav každého salonu: oslovení + úprava profilu majitelem (sprava.sqlite)
$stav = [];
// neúspěšná odeslání (chyba) se nepočítají, salon jde poslat znovu
foreach ($db->query('SELECT salon, MAX(CASE WHEN chyba IS NULL THEN odeslano END) odeslano, MAX(kliknuto) kliknuto FROM osloveni GROUP BY salon HAVING odeslano IS NOT NULL') as $r) $stav[$r['salon']] = $r;
$odhlaseni = array_flip(array_column($db->query('SELECT email FROM odhlaseni')->fetchAll(), 'email'));
$upraveno = [];
if (is_file($uloziste . '/sprava.sqlite')) {
    try {
        $sp = new PDO('sqlite:' . $uloziste . '/sprava.sqlite');
        foreach ($sp->query('SELECT salon, upraveno FROM profily') as $r) $upraveno[$r[0]] = $r[1];
    } catch (Throwable $e) { /* správa zatím nemá data */ }
}
$dnes = (int)$db->query("SELECT COUNT(*) FROM osloveni WHERE substr(odeslano, 1, 10) = '" . date('Y-m-d') . "' AND chyba IS NULL")->fetchColumn();
$zbyva = max(0, DENNI_LIMIT - $dnes);



// Zkušební e-mail na libovolnou adresu (např. mail-tester.com) – nic se nezaznamená
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['akce'] ?? '') === 'test') {
    $kam = trim((string)($_POST['kam'] ?? ''));
    $vz = reset($salony);
    $ok = filter_var($kam, FILTER_VALIDATE_EMAIL) && $vz;
    if ($ok) {
        // v testu vede tlačítko na veřejný profil vzorového salonu (přihlašovací odkaz se netvoří)
        $odhT = WEB . '/api/osloveni.php?odhlasit=0&t=test';
        [$predmet, $text, $html] = textEmailu($vz, WEB . $vz['url'], $odhT);
        [$hl, $telo] = mimeZprava($text, $html, $odhT);
        $ok = @mail($kam, '=?UTF-8?B?' . base64_encode('[TEST] ' . $predmet) . '?=', $telo, $hl, '-f' . PRIJEMCE);
    }
    header('Location: ?admin=' . urlencode($admin) . '&test=' . ($ok ? 'ok' : 'chyba'), true, 303);
    exit;
}

/** Odešle e-mail vybraným salonům (přeskočí oslovené, odhlášené a upravené). Vrací [odesláno, chyb]. */
$odesli = function (array $ids) use ($db, $salony, $stav, $odhlaseni, $upraveno, $podpis): array {
    $ok = $chyb = 0;
    foreach ($ids as $sid) {
        $s = $salony[$sid] ?? null;
        if (!$s || isset($stav[$sid]['odeslano']) || isset($odhlaseni[$s['email']]) || isset($upraveno[$sid])) continue;
        $db->prepare('INSERT INTO osloveni (salon, email, odeslano) VALUES (?, ?, ?)')->execute([$sid, $s['email'], date('c')]);
        $id = (int)$db->lastInsertId();
        $klik = WEB . "/api/osloveni.php?k=$id&t=" . $podpis("osloveni-klik:$id");
        $odh = WEB . "/api/osloveni.php?odhlasit=$id&t=" . $podpis("osloveni-odhlasit:$id");
        [$predmet, $text, $html] = textEmailu($s, $klik, $odh);
        [$hl, $telo] = mimeZprava($text, $html, $odh);
        if (@mail($s['email'], '=?UTF-8?B?' . base64_encode($predmet) . '?=', $telo, $hl, '-f' . PRIJEMCE)) $ok++;
        else {
            $chyb++;
            $db->prepare('UPDATE osloveni SET chyba = ? WHERE id = ?')->execute(['mail() selhal', $id]);
        }
        usleep(1500000); // ať server neposílá dávku naráz
    }
    return [$ok, $chyb];
};

/** Salony, které ještě lze oslovit (v pořadí seznamu: indexované profily napřed) */
$kOsloveni = function () use ($salony, $stav, $odhlaseni, $upraveno): array {
    $ids = array_keys(array_filter($salony, fn($s, $sid) => !isset($stav[$sid]) && !isset($odhlaseni[$s['email']]) && !isset($upraveno[$sid]), ARRAY_FILTER_USE_BOTH));
    usort($ids, fn($a, $b) => (int)$salony[$b]['index'] <=> (int)$salony[$a]['index']);
    return $ids;
};

if ($auto) {
    header('Content-Type: text/plain; charset=utf-8');
    $den = (int)date('N');
    $hod = (int)date('G');
    if ($den > 5 || $hod < 7 || $hod > 13) exit("mimo okno (den $den, hodina $hod)\n");
    $db->exec('CREATE TABLE IF NOT EXISTS auto_davky (den TEXT PRIMARY KEY, odeslano INTEGER, chyb INTEGER)');
    $dnesDen = date('Y-m-d');
    try {
        $db->prepare('INSERT INTO auto_davky (den, odeslano, chyb) VALUES (?, 0, 0)')->execute([$dnesDen]);
    } catch (PDOException $e) {
        exit("dnešní dávka už proběhla\n");
    }
    $fronta = $kOsloveni();
    [$ok, $chyb] = $odesli(array_slice($fronta, 0, min(AUTO_DAVKA, $zbyva)));
    $db->prepare('UPDATE auto_davky SET odeslano = ?, chyb = ? WHERE den = ?')->execute([$ok, $chyb, $dnesDen]);
    $zbyvaSalonu = max(0, count($fronta) - $ok - $chyb);
    $celkem = (int)$db->query('SELECT COUNT(DISTINCT salon) FROM osloveni WHERE chyba IS NULL')->fetchColumn();
    $klikli = (int)$db->query('SELECT COUNT(DISTINCT salon) FROM osloveni WHERE kliknuto IS NOT NULL')->fetchColumn();
    $souhrn = "Oslovení salonů – dávka $dnesDen\n\n"
        . "Dnes odesláno: $ok" . ($chyb ? " (chyb: $chyb)" : '') . "\n"
        . "Celkem osloveno: $celkem\n"
        . "Otevřeli odkaz: $klikli\n"
        . "Upravili profil: " . count($upraveno) . "\n"
        . "Zbývá oslovit: $zbyvaSalonu" . ($zbyvaSalonu ? ' (asi ' . (int)ceil($zbyvaSalonu / AUTO_DAVKA) . ' pracovních dní)' : ' – hotovo, všichni osloveni') . "\n\n"
        . "Odpovědi salonů chodí na " . PRIJEMCE . ". Žádosti o odstranění zapište do src/data/vyrazene.json.\n";
    if ($ok || $chyb) @mail(PRIJEMCE . ', ' . KOPIE, '=?UTF-8?B?' . base64_encode("[najdikadernictvi.cz] Oslovení: dnes $ok, zbývá $zbyvaSalonu") . '?=', $souhrn,
        implode("\r\n", ['From: Najdi kadeřnictví <' . PRIJEMCE . '>', 'Content-Type: text/plain; charset=UTF-8', 'MIME-Version: 1.0']), '-f' . PRIJEMCE);
    exit($souhrn);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['akce'] ?? '') === 'odeslat') {
    $ids = array_slice(array_values(array_filter((array)($_POST['ids'] ?? []), fn($i) => isset($salony[$i]))), 0, $zbyva);
    [$ok, $chyb] = $odesli($ids);
    header('Location: ?admin=' . urlencode($admin) . '&odeslano=' . $ok . '&chyb=' . $chyb, true, 303);
    exit;
}

// náhled e-mailu pro první salon bez oslovení
$vzor = null;
foreach ($salony as $sid => $s) if (!isset($stav[$sid])) { $vzor = $s; break; }
[$vzorPredmet, , $vzorHtml] = $vzor ? textEmailu($vzor, WEB . $vzor['url'], '#') : ['', '', ''];

$pocty = ['vse' => count($salony), 'osloveno' => 0, 'kliknuto' => 0, 'upraveno' => 0];
$radky = '';
foreach ($salony as $sid => $s) {
    $o = $stav[$sid] ?? null;
    $u = $upraveno[$sid] ?? null;
    $odh = isset($odhlaseni[$s['email']]);
    if ($o) $pocty['osloveno']++;
    if ($o && $o['kliknuto']) $pocty['kliknuto']++;
    if ($u) $pocty['upraveno']++;
    $stavText = $odh ? 'odhlášeno' : ($u ? 'profil upraven ' . substr($u, 0, 10) : ($o ? ($o['kliknuto'] ? 'otevřel ' . substr($o['kliknuto'], 0, 10) : 'odesláno ' . substr($o['odeslano'], 0, 10)) : ''));
    $lzeOdeslat = !$o && !$odh && !$u;
    $chybi = implode(', ', array_filter([!$s['doba'] ? 'doba' : '', !$s['fotky'] ? 'fotky' : '', !$s['cenik'] ? 'ceník' : '']));
    $radky .= '<tr data-stav="' . ($lzeOdeslat ? 'novy' : 'hotovo') . '" data-doba="' . ($s['doba'] ? '1' : '0') . '" data-mesto="' . $h($s['mesto']) . '">'
        . '<td>' . ($lzeOdeslat ? '<input type="checkbox" name="ids[]" value="' . $h($sid) . '">' : '') . '</td>'
        . '<td><a href="' . WEB . $h($s['url']) . '" target="_blank" rel="noopener">' . $h($s['nazev']) . '</a><br><small>' . $h($s['mesto']) . ' · ' . ($s['typ'] === 'barber' ? 'barbershop' : 'kadeřnictví') . '</small></td>'
        . '<td><small>' . $h($s['email']) . '</small></td>'
        . '<td><small>' . ($chybi ?: '–') . '</small></td>'
        . '<td><small>' . $h($stavText) . '</small></td></tr>';
}
$mesta = array_unique(array_column($salony, 'mesto'));
sort($mesta);

$zprava = (isset($_GET['test']) ? '<p style="padding:.75rem 1rem;background:' . ($_GET['test'] === 'ok' ? '#e8f5ea' : '#fdecec') . ';border-radius:10px">' . ($_GET['test'] === 'ok' ? 'Zkušební e-mail odeslán.' : 'Zkušební e-mail se nepodařilo odeslat (neplatná adresa nebo nefunguje mail() na serveru).') . '</p>' : '')
    . (isset($_GET['odeslano']) ? '<p style="padding:.75rem 1rem;background:#e8f5ea;border-radius:10px">Odesláno: ' . (int)$_GET['odeslano'] . ((int)($_GET['chyb'] ?? 0) ? ', chyb: ' . (int)$_GET['chyb'] . ' (server odmítl odeslat, zkontrolujte funkci mail() na hostingu)' : '') . '.</p>' : '');

stranka('Oslovení salonů', '<h1 style="margin:0 0 .5rem">Oslovení salonů</h1>'
    . '<p>Salony s veřejným e-mailem: <b>' . $pocty['vse'] . '</b> · osloveno: <b>' . $pocty['osloveno'] . '</b> · otevřeli odkaz: <b>' . $pocty['kliknuto'] . '</b> · upravili profil: <b>' . $pocty['upraveno'] . '</b></p>'
    . $zprava
    . '<p>Dnes můžete odeslat ještě <b>' . $zbyva . '</b> z ' . DENNI_LIMIT . ' e-mailů. Každý salon dostane jen jeden e-mail, odhlášeným a salonům, které už profil upravily, se nic nepošle.</p>'
    . '<details style="margin:1rem 0;padding:1rem;background:#fff;border:1px solid #e5e5e5;border-radius:12px"><summary><b>Náhled e-mailu</b>' . ($vzor ? ' (pro ' . $h($vzor['nazev']) . ')' : '') . '</summary>'
    . '<p><b>Předmět:</b> ' . $h($vzorPredmet) . '</p><iframe srcdoc="' . $h($vzorHtml) . '" style="width:100%;height:1150px;border:0;border-radius:8px"></iframe></details>'
    . '<form method="post" style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:1rem 0">'
    . '<input type="hidden" name="admin" value="' . $h($admin) . '"><input type="hidden" name="akce" value="test">'
    . '<input type="email" name="kam" required placeholder="adresa z mail-tester.com nebo vaše" style="padding:.45rem .6rem;min-width:18rem">'
    . '<button type="submit" style="padding:.45rem .9rem">Poslat zkušební e-mail</button>'
    . '<small>Ověřte, že e-mail nepadá do spamu (mail-tester.com ukáže skóre i SPF/DKIM).</small></form>'
    . '<form method="post" data-form>'
    . '<input type="hidden" name="admin" value="' . $h($admin) . '"><input type="hidden" name="akce" value="odeslat">'
    . '<div style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:1rem 0;position:sticky;top:0;background:#fafafa;padding:.5rem 0;z-index:1">'
    . '<select data-f-mesto style="padding:.4rem"><option value="">Všechna města</option>' . implode('', array_map(fn($m) => '<option>' . $h($m) . '</option>', $mesta)) . '</select>'
    . '<label><input type="checkbox" data-f-novy checked> jen neoslovené</label>'
    . '<label><input type="checkbox" data-f-doba> jen bez otevírací doby</label>'
    . '<button type="button" data-vybrat style="padding:.4rem .8rem">Vybrat prvních ' . $zbyva . '</button>'
    . '<button type="submit" style="padding:.5rem 1rem;background:#222;color:#fff;border:0;border-radius:8px" ' . ($zbyva ? '' : 'disabled') . '>Odeslat vybrané (<span data-pocet>0</span>)</button>'
    . '</div>'
    . '<table style="width:100%;border-collapse:collapse;font-size:.92rem;background:#fff"><thead><tr style="text-align:left"><th></th><th>Salon</th><th>E-mail</th><th>Chybí</th><th>Stav</th></tr></thead><tbody>' . $radky . '</tbody></table>'
    . '</form>'
    . '<style>td,th{padding:.45rem .5rem;border-bottom:1px solid #eee;vertical-align:top}small{color:#666}</style>'
    . '<script>
const f=document.querySelector("[data-form]"),rows=[...f.querySelectorAll("tbody tr")],max=' . $zbyva . ';
const fm=f.querySelector("[data-f-mesto]"),fn=f.querySelector("[data-f-novy]"),fd=f.querySelector("[data-f-doba]"),pocet=f.querySelector("[data-pocet]");
function filtr(){rows.forEach(r=>{r.hidden=(fm.value&&r.dataset.mesto!==fm.value)||(fn.checked&&r.dataset.stav!=="novy")||(fd.checked&&r.dataset.doba!=="0")});spocitej()}
function spocitej(){const n=f.querySelectorAll("input[name=\'ids[]\']:checked").length;pocet.textContent=n;f.querySelectorAll("input[name=\'ids[]\']").forEach(c=>{if(!c.checked)c.disabled=n>=max})}
f.addEventListener("change",e=>{if(e.target.matches("[data-f-mesto],[data-f-novy],[data-f-doba]"))filtr();else spocitej()});
f.querySelector("[data-vybrat]").onclick=()=>{let n=f.querySelectorAll("input[name=\'ids[]\']:checked").length;rows.filter(r=>!r.hidden).forEach(r=>{const c=r.querySelector("input[name=\'ids[]\']");if(c&&!c.checked&&n<max){c.checked=true;n++}});spocitej()};
f.addEventListener("submit",e=>{const n=+pocet.textContent;if(!n||!confirm("Odeslat e-mail "+n+" salonům?"))e.preventDefault()});
filtr();
</script>', true);
