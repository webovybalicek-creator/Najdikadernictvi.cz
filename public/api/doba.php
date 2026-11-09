<?php
/**
 * Potvrzení otevírací doby návštěvníky („Sedí otevírací doba?“).
 *
 * GET  ?salon=<id>                      → { ano, ne, naposledy } za posledních 180 dní
 * POST salon, url, odpoved=ano|ne, pozn → uložení odpovědi; „ne“ s poznámkou odejde e-mailem provozovateli
 *
 * Data: SQLite mimo veřejnou složku webu. Ukládá se jen anonymní otisk IP (HMAC), ne IP.
 * Jeden hlas na salon a IP za 30 dní, nejvýš 20 odeslání za hodinu z jedné IP.
 */
declare(strict_types=1);

const PRIJEMCE = 'info@najdikadernictvi.cz';
const WEB = 'https://najdikadernictvi.cz';
const LIMIT_ZA_HODINU = 20;
const MAX_POZN = 400;
const OBDOBI_DNU = 180;

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
$tajemstviSoubor = $uloziste . '/doba-tajemstvi.txt';
if (!is_file($tajemstviSoubor)) {
    file_put_contents($tajemstviSoubor, bin2hex(random_bytes(32)));
    @chmod($tajemstviSoubor, 0600);
}
$TAJEMSTVI = trim((string)file_get_contents($tajemstviSoubor));
$podpis = fn(string $s): string => substr(hash_hmac('sha256', $s, $TAJEMSTVI), 0, 32);

if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) out(503, ['ok' => false]);
$db = new PDO('sqlite:' . $uloziste . '/doba.sqlite', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$db->exec('PRAGMA journal_mode=WAL');
$db->exec('CREATE TABLE IF NOT EXISTS potvrzeni (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    salon TEXT NOT NULL,
    url TEXT,
    odpoved TEXT NOT NULL CHECK (odpoved IN ("ano", "ne")),
    pozn TEXT,
    otisk TEXT NOT NULL,       -- HMAC(IP + salon + měsíc): jeden hlas na salon za období
    otisk_ip TEXT NOT NULL,    -- HMAC(IP + hodina): limit odeslání
    vytvoreno TEXT NOT NULL
)');
$db->exec('CREATE UNIQUE INDEX IF NOT EXISTS u_otisk ON potvrzeni(otisk)');
$db->exec('CREATE INDEX IF NOT EXISTS i_salon ON potvrzeni(salon)');

$platneId = fn($s): bool => is_string($s) && preg_match('/^[nwr]\d{1,12}$/', $s) === 1;
$od = date('c', time() - OBDOBI_DNU * 86400);

function souhrn(PDO $db, string $salon, string $od): array
{
    $st = $db->prepare("SELECT SUM(odpoved = 'ano') ano, SUM(odpoved = 'ne') ne, MAX(CASE WHEN odpoved = 'ano' THEN substr(vytvoreno, 1, 10) END) naposledy
        FROM potvrzeni WHERE salon = ? AND vytvoreno >= ?");
    $st->execute([$salon, $od]);
    $r = $st->fetch() ?: [];
    return ['ok' => true, 'ano' => (int)($r['ano'] ?? 0), 'ne' => (int)($r['ne'] ?? 0), 'naposledy' => $r['naposledy'] ?? null];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $salon = $_GET['salon'] ?? '';
    if (!$platneId($salon)) out(400, ['ok' => false]);
    out(200, souhrn($db, $salon, $od), 300);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(405, ['ok' => false]);

$salon = $_POST['salon'] ?? '';
$url = (string)($_POST['url'] ?? '');
$odpoved = $_POST['odpoved'] ?? '';
$pozn = trim(mb_substr((string)($_POST['pozn'] ?? ''), 0, MAX_POZN));
if (!$platneId($salon) || !in_array($odpoved, ['ano', 'ne'], true) || !preg_match('#^/[a-z0-9\-/]+/$#', $url)) out(400, ['ok' => false]);
if (($_POST['web'] ?? '') !== '') out(200, ['ok' => true]); // past na roboty

$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$otisk = $podpis("salon:$salon:$ip:" . date('Y-m'));
$otiskIp = $podpis('ip:' . $ip . ':' . date('YmdH'));
$st = $db->prepare('SELECT COUNT(*) FROM potvrzeni WHERE otisk_ip = ?');
$st->execute([$otiskIp]);
if ((int)$st->fetchColumn() >= LIMIT_ZA_HODINU) out(429, ['ok' => false]);

try {
    $st = $db->prepare('INSERT INTO potvrzeni (salon, url, odpoved, pozn, otisk, otisk_ip, vytvoreno) VALUES (?,?,?,?,?,?,?)');
    $st->execute([$salon, $url, $odpoved, $pozn ?: null, $otisk, $otiskIp, date('c')]);
} catch (PDOException $e) {
    // Už hlasoval: odpověď přepíšeme (mohl se splést)
    $st = $db->prepare('UPDATE potvrzeni SET odpoved = ?, pozn = ?, vytvoreno = ? WHERE otisk = ?');
    $st->execute([$odpoved, $pozn ?: null, date('c'), $otisk]);
}

if ($odpoved === 'ne') {
    $telo = "Návštěvník hlásí, že otevírací doba nesedí.\n\nSalon: " . WEB . $url . " ($salon)\n"
        . ($pozn !== '' ? "\nPoznámka:\n$pozn\n" : "\n(bez poznámky)\n")
        . "\nOpravu zapište do src/data/overene.json, nebo ji doplňte do OpenStreetMap.\n";
    @mail(
        PRIJEMCE,
        '=?UTF-8?B?' . base64_encode('[najdikadernictvi.cz] Nesedí otevírací doba') . '?=',
        $telo,
        implode("\r\n", ['From: Najdi kadeřnictví <' . PRIJEMCE . '>', 'Content-Type: text/plain; charset=UTF-8', 'MIME-Version: 1.0']),
        '-f' . PRIJEMCE
    );
}

out(200, souhrn($db, $salon, $od));
