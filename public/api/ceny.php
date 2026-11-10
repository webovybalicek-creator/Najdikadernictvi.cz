<?php
/**
 * Ceny od návštěvníků („Kolik jste tu platili?“).
 *
 * GET  ?salon=<id>        → { sluzby: { pansky: { n, median } … } }   median jen od 3 odpovědí
 * GET  ?export=1          → { salony: { <id>: { pansky: <medián>, damsky: <medián> } } }   pro build webu, jen od 3 odpovědí
 * GET  ?souhrn=1          → { mesta: { <mesto>: { pansky: { n, median } … } }, cr: { … } }   jen od 3 odpovědí
 * POST salon, mesto, sluzba, cena
 *
 * SQLite mimo veřejnou složku. Ukládá se jen anonymní otisk IP (HMAC). Jedna cena za službu a salon z jedné IP
 * za 90 dní (novější přepíše starší), nejvýš 20 odeslání za hodinu. Odpovědi starší než 2 roky se nepočítají.
 */
declare(strict_types=1);

const SLUZBY = ['pansky', 'damsky', 'detsky', 'barveni', 'vousy'];
const MIN_N = 3;
const LIMIT_ZA_HODINU = 20;

header('X-Robots-Tag: noindex');

function out(int $code, array $data, int $cache = 0): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header($cache > 0 ? "Cache-Control: public, max-age=$cache" : 'Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

$uloziste = dirname($_SERVER['DOCUMENT_ROOT'] ?: __DIR__ . '/..') . '/najdikadernictvi-data';
if (!is_dir($uloziste) && !@mkdir($uloziste, 0700, true)) out(503, ['ok' => false]);
$tajemstviSoubor = $uloziste . '/ceny-tajemstvi.txt';
if (!is_file($tajemstviSoubor)) {
    file_put_contents($tajemstviSoubor, bin2hex(random_bytes(32)));
    @chmod($tajemstviSoubor, 0600);
}
$TAJEMSTVI = trim((string)file_get_contents($tajemstviSoubor));
$podpis = fn(string $s): string => substr(hash_hmac('sha256', $s, $TAJEMSTVI), 0, 32);

if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) out(503, ['ok' => false]);
$db = new PDO('sqlite:' . $uloziste . '/ceny.sqlite', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$db->exec('PRAGMA journal_mode=WAL');
$db->exec('CREATE TABLE IF NOT EXISTS ceny (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    salon TEXT NOT NULL,
    mesto TEXT NOT NULL,
    sluzba TEXT NOT NULL,
    cena INTEGER NOT NULL,
    otisk TEXT NOT NULL,
    otisk_ip TEXT NOT NULL,
    vytvoreno TEXT NOT NULL
)');
$db->exec('CREATE UNIQUE INDEX IF NOT EXISTS u_otisk ON ceny(otisk)');
$db->exec('CREATE INDEX IF NOT EXISTS i_salon ON ceny(salon)');
$db->exec('CREATE INDEX IF NOT EXISTS i_mesto ON ceny(mesto, sluzba)');

$od = date('c', time() - 730 * 86400);

function median(array $a): int
{
    sort($a);
    $n = count($a);
    $m = intdiv($n, 2);
    return (int)round($n % 2 ? $a[$m] : ($a[$m - 1] + $a[$m]) / 2);
}

/** @return array<string, array{n:int, median:?int}> */
function shrn(array $radky): array
{
    $po = [];
    foreach ($radky as $r) $po[$r['sluzba']][] = (int)$r['cena'];
    $out = [];
    foreach ($po as $s => $ceny) $out[$s] = ['n' => count($ceny), 'median' => count($ceny) >= MIN_N ? median($ceny) : null];
    return $out;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['souhrn'])) {
        $st = $db->prepare('SELECT mesto, sluzba, cena FROM ceny WHERE vytvoreno >= ?');
        $st->execute([$od]);
        $vse = $st->fetchAll();
        $mesta = [];
        foreach ($vse as $r) $mesta[$r['mesto']][] = $r;
        $mesta = array_map('shrn', $mesta);
        $mesta = array_filter(array_map(fn($m) => array_filter($m, fn($x) => $x['median'] !== null), $mesta));
        out(200, ['ok' => true, 'mesta' => $mesta, 'cr' => shrn($vse), 'odpovedi' => count($vse)], 3600);
    }
    if (isset($_GET['export'])) {
        // Mediány cen střihu podle salonu pro build webu (štítek „střih od“, filtr a řazení podle ceny)
        $st = $db->prepare("SELECT salon, sluzba, cena FROM ceny WHERE vytvoreno >= ? AND sluzba IN ('pansky', 'damsky')");
        $st->execute([$od]);
        $po = [];
        foreach ($st->fetchAll() as $r) $po[$r['salon']][] = $r;
        $salony = [];
        foreach ($po as $id => $radky) {
            $m = array_map(fn($x) => $x['median'], array_filter(shrn($radky), fn($x) => $x['median'] !== null));
            if ($m) $salony[$id] = $m;
        }
        ksort($salony);
        out(200, ['ok' => true, 'salony' => (object)$salony], 3600);
    }
    $salon = $_GET['salon'] ?? '';
    if (!is_string($salon) || !preg_match('/^[nwr]\d{1,12}$/', $salon)) out(400, ['ok' => false]);
    $st = $db->prepare('SELECT sluzba, cena FROM ceny WHERE salon = ? AND vytvoreno >= ?');
    $st->execute([$salon, $od]);
    out(200, ['ok' => true, 'sluzby' => shrn($st->fetchAll())], 300);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(405, ['ok' => false]);
if (($_POST['web'] ?? '') !== '') out(200, ['ok' => true]); // past na roboty

$salon = (string)($_POST['salon'] ?? '');
$mesto = (string)($_POST['mesto'] ?? '');
$sluzba = (string)($_POST['sluzba'] ?? '');
$cena = (int)preg_replace('/\D/', '', (string)($_POST['cena'] ?? ''));
if (!preg_match('/^[nwr]\d{1,12}$/', $salon) || !preg_match('/^[a-z0-9-]{1,80}$/', $mesto) || !in_array($sluzba, SLUZBY, true)) out(400, ['ok' => false]);
if ($cena < 50 || $cena > 20000) out(422, ['ok' => false, 'chyba' => 'Zadejte cenu v korunách (50 až 20 000 Kč).']);

$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$otisk = $podpis("$salon:$sluzba:$ip:" . (int)(time() / (90 * 86400)));
$otiskIp = $podpis('ip:' . $ip . ':' . date('YmdH'));
$st = $db->prepare('SELECT COUNT(*) FROM ceny WHERE otisk_ip = ?');
$st->execute([$otiskIp]);
if ((int)$st->fetchColumn() >= LIMIT_ZA_HODINU) out(429, ['ok' => false]);

$db->prepare('INSERT INTO ceny (salon, mesto, sluzba, cena, otisk, otisk_ip, vytvoreno) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(otisk) DO UPDATE SET cena = excluded.cena, vytvoreno = excluded.vytvoreno')
    ->execute([$salon, $mesto, $sluzba, $cena, $otisk, $otiskIp, date('c')]);

$st = $db->prepare('SELECT sluzba, cena FROM ceny WHERE salon = ? AND vytvoreno >= ?');
$st->execute([$salon, $od]);
out(200, ['ok' => true, 'sluzby' => shrn($st->fetchAll())]);
