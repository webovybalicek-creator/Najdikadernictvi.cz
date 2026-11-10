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
const PLATNOST_E_MAILU_DNI = 90;   // jak dlouho funguje odkaz v e-mailu
const PLATNOST_SPRAVY_DNI = 30;    // jak dlouho platí přihlášení do správy po kliknutí (jako v sprava.php)

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
 * E-mail pro salon: [předmět, prostý text, HTML]. Píše se z pohledu majitele: co z toho bude mít.
 * HTML je tabulkové s inline styly (Gmail, Seznam, Outlook), prostý text je záložní část multipart zprávy.
 */
function textEmailu(array $s, string $klik, string $odhlasit): array
{
    $e = fn($t): string => htmlspecialchars((string)$t, ENT_QUOTES, 'UTF-8');
    $barber = ($s['typ'] ?? '') === 'barber';
    $profil = WEB . $s['url'];
    $polozky = [
        ['Otevírací doba', (bool)$s['doba']],
        ['Fotky salonu', (bool)$s['fotky']],
        ['Ceník', (bool)$s['cenik']],
    ];
    $predmet = $s['nazev'] . ': víc zákazníků z vašeho profilu na Najdi kadeřnictví';
    $google = !empty($s['index'])
        ? 'Profil vašeho salonu už lidé najdou v Googlu.'
        : 'Jakmile profil doplníte, ukážeme ho i ve vyhledávání Googlu.';
    $vyhody = [
        ['📸', 'Zákazníci vás uvidí dřív, než přijdou', 'Lidé si salon vybírají podle fotek. Úplné profily s fotkami a ceníkem řadíme ve výpisech výš.'],
        ['📞', 'Méně telefonátů „Máte otevřeno?“', 'Otevírací doba (i o svátcích) a ceník jsou na očích. Telefon zvoní hlavně kvůli objednání.'],
        ['✅', 'Údaje máte pod kontrolou', 'Opravíte, co je špatně, a profil dostane odznak „Ověřeno majitelem“. ' . $google],
        ['🎁', 'Zdarma, bez registrace, 5 minut z mobilu', 'Žádné předplatné ani závazek. Navíc si stáhnete plakát s QR kódem do výlohy.'],
    ];

    // ---- prostý text
    $text = "Váš salon už je na Najdikadernictvi.cz\n" . $s['nazev'] . "\n\n"
        . "Dobrý den,\n\nprovozujeme najdikadernictvi.cz, katalog kadeřnictví a barbershopů v Česku. Váš salon v něm už má profil:\n$profil\n\n"
        . "Co vám doplněný profil přinese:\n";
    foreach ($vyhody as [, $t, $d]) $text .= "- $t. $d\n";
    $text .= "\nCo v profilu zatím chybí: " . (implode(', ', array_map(fn($p) => mb_strtolower($p[0]), array_filter($polozky, fn($p) => !$p[1]))) ?: 'nic, jen zkontrolujte údaje') . ".\n\n"
        . "Doplnit profil (osobní odkaz, bez hesla):\n$klik\n\n"
        . "Když je něco špatně nebo v katalogu být nechcete, stačí odpovědět na tento e-mail.\n\n"
        . "Vladimír Fischer\nnajdikadernictvi.cz · " . PRIJEMCE . "\n\n--\n"
        . "Píšeme vám jednou na veřejný e-mail salonu. Nechcete-li ani případné budoucí zprávy: $odhlasit\n";

    // ---- HTML
    $f = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
    $radkyVyhod = '';
    foreach ($vyhody as [$ikona, $t, $d]) {
        $radkyVyhod .= '<tr><td width="48" valign="top" style="padding:0 14px 18px 0"><div style="width:44px;height:44px;line-height:44px;text-align:center;border-radius:12px;background:#fff1f3;font-size:21px">' . $ikona . '</div></td>'
            . '<td valign="top" style="padding:0 0 18px;' . $f . '"><div style="font-size:16px;font-weight:600;color:#222;line-height:1.35">' . $e($t) . '</div>'
            . '<div style="font-size:14px;color:#5f5f5f;line-height:1.5;margin-top:3px">' . $e($d) . '</div></td></tr>';
    }
    $radkyStav = '';
    foreach ($polozky as [$nazev, $ok]) {
        $radkyStav .= '<td width="33%" align="center" style="padding:12px 6px;' . $f . '">'
            . '<div style="font-size:18px;line-height:1;color:' . ($ok ? '#1a7f37' : '#e00b41') . '">' . ($ok ? '✓' : '+') . '</div>'
            . '<div style="font-size:13px;color:#222;margin-top:6px;font-weight:600">' . $nazev . '</div>'
            . '<div style="font-size:12px;color:' . ($ok ? '#1a7f37' : '#e00b41') . ';margin-top:2px">' . ($ok ? 'hotovo' : 'chybí') . '</div></td>';
    }
    $html = '<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>' . $e($predmet) . '</title></head>'
        . '<body style="margin:0;padding:0;background:#f4f2ee">'
        . '<div style="display:none;max-height:0;overflow:hidden;opacity:0">Zdarma a bez registrace doplníte fotky, ceník a otevírací dobu. Zabere to 5 minut z mobilu.</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee"><tr><td align="center" style="padding:24px 12px">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">'
        // logo
        . '<tr><td style="padding:20px 28px;' . $f . ';font-size:19px;color:#222">najdi<b style="color:#ff385c">kadeřnictví</b></td></tr>'
        // úzká fotka
        . '<tr><td><img src="' . WEB . '/email/' . ($barber ? 'barber' : 'kadernictvi') . '.jpg" width="600" height="180" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>'
        // úvod
        . '<tr><td style="padding:28px 28px 8px;' . $f . '">'
        . '<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;color:#222;font-weight:700">Váš salon už je na Najdikadernictvi.cz<br><span style="color:#ff385c">' . $e($s['nazev']) . '</span></h1>'
        . '<p style="margin:0;font-size:15px;line-height:1.6;color:#444">Dobrý den, provozujeme <a href="' . WEB . '" style="color:#222">najdikadernictvi.cz</a>, katalog kadeřnictví a barbershopů v Česku. '
        . 'Váš salon v něm už má profil: <a href="' . $e($profil) . '" style="color:#e00b41">zobrazit</a>. '
        . 'Když ho doplníte, pomůže vám získat nové zákazníky.</p></td></tr>'
        // stav profilu
        . '<tr><td style="padding:18px 28px 6px">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ececec;border-radius:12px;background:#fafafa"><tr>' . $radkyStav . '</tr></table></td></tr>'
        // výhody
        . '<tr><td style="padding:22px 28px 4px;' . $f . '"><div style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#888;margin-bottom:14px">Co z toho budete mít</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' . $radkyVyhod . '</table></td></tr>'
        // tlačítko
        . '<tr><td align="center" style="padding:6px 28px 8px">'
        . '<a href="' . $e($klik) . '" style="display:inline-block;background:#ff385c;color:#ffffff;text-decoration:none;' . $f . ';font-size:16px;font-weight:700;padding:15px 30px;border-radius:12px">Doplnit profil zdarma</a>'
        . '<div style="' . $f . ';font-size:13px;color:#888;margin-top:10px">Osobní odkaz, bez hesla a registrace. Funguje i v mobilu.</div></td></tr>'
        // podpis
        . '<tr><td style="padding:24px 28px 28px;' . $f . ';font-size:15px;line-height:1.6;color:#444">'
        . 'Kdyby bylo cokoli špatně nebo nechcete být v katalogu, stačí odpovědět na tento e-mail.<br><br>'
        . 'Přeji hodně spokojených zákazníků<br><b style="color:#222">Vladimír Fischer</b><br><span style="color:#888;font-size:14px">najdikadernictvi.cz · ' . PRIJEMCE . '</span></td></tr>'
        . '</table>'
        // patička
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px"><tr><td style="padding:16px 28px;' . $f . ';font-size:12px;line-height:1.5;color:#999;text-align:center">'
        . 'Píšeme vám jednou na veřejný e-mail salonu. Nechcete-li ani případné budoucí zprávy, <a href="' . $e($odhlasit) . '" style="color:#999">odhlaste se</a>.</td></tr></table>'
        . '</td></tr></table></body></html>';
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
    header('Location: ' . odkazSpravy($o['salon'], $s['url'], $o['email'], $podpis, $b64), true, 302);
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

// ---------------------------------------------------------------- administrace
$admin = (string)($_POST['admin'] ?? $_GET['admin'] ?? '');
if (!hash_equals($podpis('osloveni-admin'), $admin)) stranka('Oslovení salonů', '<p>Odkaz do administrace přijde e-mailem přes <a href="/api/admin.php">/api/admin.php</a>.</p>');

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

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['akce'] ?? '') === 'odeslat') {
    $ids = array_slice(array_values(array_filter((array)($_POST['ids'] ?? []), fn($i) => isset($salony[$i]))), 0, $zbyva);
    $ok = $chyb = 0;
    foreach ($ids as $sid) {
        $s = $salony[$sid];
        if (isset($stav[$sid]['odeslano']) || isset($odhlaseni[$s['email']]) || isset($upraveno[$sid])) continue;
        $db->prepare('INSERT INTO osloveni (salon, email, odeslano) VALUES (?, ?, ?)')->execute([$sid, $s['email'], date('c')]);
        $id = (int)$db->lastInsertId();
        $klik = WEB . "/api/osloveni.php?k=$id&t=" . $podpis("osloveni-klik:$id");
        $odh = WEB . "/api/osloveni.php?odhlasit=$id&t=" . $podpis("osloveni-odhlasit:$id");
        [$predmet, $text, $html] = textEmailu($s, $klik, $odh);
        [$hl, $telo] = mimeZprava($text, $html, $odh);
        $poslano = @mail($s['email'], '=?UTF-8?B?' . base64_encode($predmet) . '?=', $telo, $hl, '-f' . PRIJEMCE);
        if ($poslano) $ok++;
        else {
            $chyb++;
            $db->prepare('UPDATE osloveni SET chyba = ? WHERE id = ?')->execute(['mail() selhal', $id]);
        }
        usleep(1500000); // ať server neposílá dávku naráz
    }
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
