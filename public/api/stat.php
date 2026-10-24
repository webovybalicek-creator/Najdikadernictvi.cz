<?php
/**
 * Statistika návštěvnosti bez cookies a bez osobních údajů.
 * POST p=<cesta>, r=<doména odkazující stránky>  → +1 zobrazení (den, cesta) a zdroj
 * GET  ?admin=<podpis>[&dni=30]                 → přehled pro provozovatele
 * GET  ?cesta=<cesta>&t=<podpis cesty>           → počty zobrazení jedné stránky (pro majitele salonu)
 * Neukládá IP adresy, otisky prohlížeče ani identifikátory, jen agregované počty za den.
 */
declare(strict_types=1);

/** Veřejný souhrn pro stránku /navstenost/ (true = zapnuto). Vypnutím se stránka skryje. */
const VEREJNE = true;

header('X-Robots-Tag: noindex');

$uloziste = dirname($_SERVER['DOCUMENT_ROOT'] ?: __DIR__ . '/..') . '/najdikadernictvi-data';
if (!is_dir($uloziste) && !@mkdir($uloziste, 0700, true)) {
    http_response_code(503);
    exit;
}
$tajSoubor = $uloziste . '/hodnoceni-tajemstvi.txt';
if (!is_file($tajSoubor)) {
    file_put_contents($tajSoubor, bin2hex(random_bytes(32)));
    @chmod($tajSoubor, 0600);
}
$TAJ = trim((string)file_get_contents($tajSoubor));
$podpis = fn(string $s): string => substr(hash_hmac('sha256', $s, $TAJ), 0, 32);

$db = new PDO('sqlite:' . $uloziste . '/statistika.sqlite', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$db->exec('PRAGMA journal_mode=WAL');
$db->exec('PRAGMA busy_timeout=3000');
$db->exec('CREATE TABLE IF NOT EXISTS zobrazeni (den TEXT NOT NULL, cesta TEXT NOT NULL, pocet INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (den, cesta))');
$db->exec('CREATE TABLE IF NOT EXISTS zdroje (den TEXT NOT NULL, zdroj TEXT NOT NULL, pocet INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (den, zdroj))');

/** Počty zobrazení stránky za posledních N dní (pro správu profilu i pro admin) */
function pocty_cesty(PDO $db, string $cesta, int $dni): array
{
    $st = $db->prepare('SELECT den, pocet FROM zobrazeni WHERE cesta = ? AND den >= ? ORDER BY den');
    $st->execute([$cesta, date('Y-m-d', strtotime("-$dni days"))]);
    return $st->fetchAll(PDO::FETCH_KEY_PAIR);
}

// Vyloučené IP (provozovatel webu): ukládá se jen otisk IP, ne IP samotná
$vylouceneSoubor = $uloziste . '/stat-vyloucene.json';
$vyloucene = is_file($vylouceneSoubor) ? (json_decode((string)file_get_contents($vylouceneSoubor), true) ?: []) : [];
$otiskIp = hash_hmac('sha256', 'stat-ip:' . ($_SERVER['REMOTE_ADDR'] ?? ''), $TAJ);

// ---------------------------------------------------------------- zápis
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Cache-Control: no-store');
    if (isset($vyloucene[$otiskIp])) {
        http_response_code(204);
        exit;
    }
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    if ($ua === '' || preg_match('~bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|monitor~i', $ua)) {
        http_response_code(204);
        exit;
    }
    $cesta = (string)($_POST['p'] ?? '');
    if (!preg_match('~^/[a-z0-9\-/]{0,200}$~', $cesta)) {
        http_response_code(204);
        exit;
    }
    $den = date('Y-m-d');
    $db->prepare('INSERT INTO zobrazeni (den, cesta, pocet) VALUES (?, ?, 1) ON CONFLICT(den, cesta) DO UPDATE SET pocet = pocet + 1')
        ->execute([$den, $cesta]);
    $zdroj = strtolower((string)($_POST['r'] ?? ''));
    $zdroj = preg_replace('/^www\./', '', $zdroj);
    if ($zdroj !== '' && preg_match('/^[a-z0-9.\-]{3,80}$/', $zdroj) && !str_ends_with($zdroj, 'najdikadernictvi.cz')) {
        $db->prepare('INSERT INTO zdroje (den, zdroj, pocet) VALUES (?, ?, 1) ON CONFLICT(den, zdroj) DO UPDATE SET pocet = pocet + 1')
            ->execute([$den, $zdroj]);
    }
    // Úklid: data starší 400 dní
    if (random_int(1, 500) === 1) {
        $limit = date('Y-m-d', strtotime('-400 days'));
        $db->prepare('DELETE FROM zobrazeni WHERE den < ?')->execute([$limit]);
        $db->prepare('DELETE FROM zdroje WHERE den < ?')->execute([$limit]);
    }
    http_response_code(204);
    exit;
}

// ---------------------------------------------------------------- počty jedné stránky (podepsaný odkaz)
if (isset($_GET['cesta'], $_GET['t'])) {
    $cesta = (string)$_GET['cesta'];
    if (!hash_equals($podpis("stat:$cesta"), (string)$_GET['t'])) {
        http_response_code(403);
        exit;
    }
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['cesta' => $cesta, 'dny' => pocty_cesty($db, $cesta, 90)]);
    exit;
}

// ---------------------------------------------------------------- veřejný souhrn (jen agregované počty)
if (isset($_GET['verejne'])) {
    header('Content-Type: application/json; charset=utf-8');
    if (!VEREJNE) {
        http_response_code(404);
        echo '{"ok":false}';
        exit;
    }
    header('Cache-Control: public, max-age=300');
    $dni = max(1, min(365, (int)($_GET['dni'] ?? 30)));
    $od = date('Y-m-d', strtotime("-$dni days"));
    $q = function (string $sql) use ($db, $od) {
        $st = $db->prepare($sql);
        $st->execute([$od]);
        return $st->fetchAll(PDO::FETCH_NUM);
    };
    echo json_encode([
        'ok' => true,
        'dni' => $dni,
        'poDnech' => $q('SELECT den, SUM(pocet) FROM zobrazeni WHERE den >= ? GROUP BY den ORDER BY den'),
        'stranky' => $q('SELECT cesta, SUM(pocet) n FROM zobrazeni WHERE den >= ? GROUP BY cesta ORDER BY n DESC LIMIT 30'),
        'zdroje' => $q('SELECT zdroj, SUM(pocet) n FROM zdroje WHERE den >= ? GROUP BY zdroj ORDER BY n DESC LIMIT 15'),
        'typy' => $q("SELECT CASE
            WHEN cesta = '/' THEN 'Úvodní stránka'
            WHEN cesta LIKE '/blog/%' THEN 'Články'
            WHEN cesta LIKE '%/ctvrt/%' THEN 'Čtvrti'
            WHEN cesta IN ('/mapa/', '/okoli/', '/kraje/') OR cesta LIKE '/kraj/%' THEN 'Mapa a přehledy'
            WHEN length(cesta) - length(replace(cesta, '/', '')) >= 3 THEN 'Detaily salonů'
            ELSE 'Města a výběry' END t, SUM(pocet) n FROM zobrazeni WHERE den >= ? GROUP BY t ORDER BY n DESC"),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ---------------------------------------------------------------- přehled pro provozovatele
if (isset($_GET['admin'])) {
    if (!hash_equals($podpis('stat-admin'), (string)$_GET['admin'])) {
        http_response_code(403);
        exit('Neplatný odkaz.');
    }
    if (isset($_GET['vyloucit'])) {
        if ($_GET['vyloucit'] === '1') $vyloucene[$otiskIp] = date('Y-m-d');
        else unset($vyloucene[$otiskIp]);
        file_put_contents($vylouceneSoubor, json_encode($vyloucene), LOCK_EX);
    }
    $dni = max(1, min(400, (int)($_GET['dni'] ?? 30)));
    $od = date('Y-m-d', strtotime("-$dni days"));
    $poDnech = $db->prepare('SELECT den, SUM(pocet) n FROM zobrazeni WHERE den >= ? GROUP BY den ORDER BY den DESC');
    $poDnech->execute([$od]);
    $top = $db->prepare('SELECT cesta, SUM(pocet) n FROM zobrazeni WHERE den >= ? GROUP BY cesta ORDER BY n DESC LIMIT 60');
    $top->execute([$od]);
    $zdroje = $db->prepare('SELECT zdroj, SUM(pocet) n FROM zdroje WHERE den >= ? GROUP BY zdroj ORDER BY n DESC LIMIT 30');
    $zdroje->execute([$od]);
    $dnyR = $poDnech->fetchAll();
    $celkem = array_sum(array_column($dnyR, 'n'));
    $max = max([1, ...array_map('intval', array_column($dnyR, 'n'))]);
    $e = fn($s) => htmlspecialchars((string)$s);

    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Návštěvnost</title>'
        . '<body style="font:15px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#26241f;background:#f6f4ef">'
        . '<h1 style="font-weight:400">Návštěvnost za ' . $dni . ' dní: ' . number_format($celkem, 0, ',', ' ') . ' zobrazení</h1>'
        . '<p>' . implode(' · ', array_map(fn($d) => '<a href="?admin=' . $e($_GET['admin']) . '&dni=' . $d . '">' . $d . ' dní</a>', [7, 30, 90, 365])) . '</p>'
        . '<p style="background:#fff;border:1px solid #e3ded4;padding:.75rem 1rem">'
        . (isset($vyloucene[$otiskIp])
            ? 'Vaše aktuální IP adresa se <strong>nepočítá</strong>. <a href="?admin=' . $e($_GET['admin']) . '&vyloucit=0">Znovu počítat</a>'
            : 'Vaše aktuální IP adresa se počítá. <a href="?admin=' . $e($_GET['admin']) . '&vyloucit=1">Vyloučit moji IP z měření</a>')
        . ' · Vyloučených adres: ' . count($vyloucene)
        . '<br><small>Na mobilu a jiných sítích se IP mění. Spolehlivější je otevřít na každém zařízení <a href="https://najdikadernictvi.cz/nemerit/">najdikadernictvi.cz/nemerit/</a>.</small></p>'
        . '<h2 style="font-weight:400">Po dnech</h2><table style="border-collapse:collapse;width:100%">';
    foreach ($dnyR as $r) {
        $w = round($r['n'] / $max * 100);
        echo '<tr><td style="width:7rem">' . $e($r['den']) . '</td><td><div style="background:#786b5c;height:12px;width:' . $w . '%"></div></td><td style="width:5rem;text-align:right">' . $e($r['n']) . '</td></tr>';
    }
    echo '</table><h2 style="font-weight:400">Nejnavštěvovanější stránky</h2><table style="border-collapse:collapse;width:100%">';
    foreach ($top->fetchAll() as $r) {
        echo '<tr style="border-top:1px solid #e3ded4"><td><a href="https://najdikadernictvi.cz' . $e($r['cesta']) . '">' . $e($r['cesta']) . '</a></td><td style="text-align:right">' . $e($r['n']) . '</td></tr>';
    }
    echo '</table><h2 style="font-weight:400">Odkud lidé přišli</h2><table style="border-collapse:collapse;width:100%">';
    foreach ($zdroje->fetchAll() as $r) {
        echo '<tr style="border-top:1px solid #e3ded4"><td>' . $e($r['zdroj']) . '</td><td style="text-align:right">' . $e($r['n']) . '</td></tr>';
    }
    echo '</table><p style="color:#6b645a;font-size:13px">Bez cookies a osobních údajů. Roboti a vyhledávače se nepočítají.</p></body>';
    exit;
}

http_response_code(400);
