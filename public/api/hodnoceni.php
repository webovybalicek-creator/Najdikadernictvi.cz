<?php
/**
 * Hodnocení salonů (hvězdičky 1–5 + volitelný text se schvalováním).
 *
 * GET  ?salon=<id>                 → průměr, počet a schválené texty jednoho salonu
 * GET  ?souhrn=1                   → { id: [průměr, počet] } pro všechny hodnocené salony
 * POST salon, hvezdy, text, jmeno  → uložení hodnocení (hvězdy platí hned, text po schválení)
 * GET  ?akce=schvalit|zamitnout&id=<id>&t=<podpis>  → moderace z e-mailu
 * GET  ?admin=<podpis>             → seznam hodnocení čekajících na schválení
 *
 * Data: SQLite mimo veřejnou složku webu. Ukládá se jen anonymní otisk IP (HMAC), ne IP.
 */
declare(strict_types=1);

const PRIJEMCE = 'info@najdikadernictvi.cz';
const WEB = 'https://najdikadernictvi.cz';
const LIMIT_ZA_HODINU = 10;
const MAX_TEXT = 600;
const MAX_JMENO = 40;

header('X-Robots-Tag: noindex');

function json_out(int $code, $data, int $cache = 0): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header($cache > 0 ? "Cache-Control: public, max-age=$cache" : 'Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function html_out(string $titulek, string $obsah): void
{
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="robots" content="noindex"><title>' . htmlspecialchars($titulek) . '</title>'
        . '<body style="font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#26241f;background:#f6f4ef">'
        . '<h1 style="font-weight:400">' . htmlspecialchars($titulek) . '</h1>' . $obsah . '</body>';
    exit;
}

// ---------------------------------------------------------------- úložiště
$uloziste = dirname($_SERVER['DOCUMENT_ROOT'] ?: __DIR__ . '/..') . '/najdikadernictvi-data';
if (!is_dir($uloziste) && !@mkdir($uloziste, 0700, true)) {
    json_out(503, ['ok' => false, 'chyba' => 'Úložiště není dostupné.']);
}
$tajemstviSoubor = $uloziste . '/hodnoceni-tajemstvi.txt';
if (!is_file($tajemstviSoubor)) {
    file_put_contents($tajemstviSoubor, bin2hex(random_bytes(32)));
    @chmod($tajemstviSoubor, 0600);
}
$TAJEMSTVI = trim((string)file_get_contents($tajemstviSoubor));
$podpis = fn(string $s): string => substr(hash_hmac('sha256', $s, $TAJEMSTVI), 0, 32);

if (!class_exists('PDO') || !in_array('sqlite', PDO::getAvailableDrivers(), true)) {
    json_out(503, ['ok' => false, 'chyba' => 'Na serveru chybí podpora SQLite (pdo_sqlite).']);
}
$db = new PDO('sqlite:' . $uloziste . '/hodnoceni.sqlite', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$db->exec('PRAGMA journal_mode=WAL');
$db->exec('CREATE TABLE IF NOT EXISTS hodnoceni (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    salon TEXT NOT NULL,
    url TEXT,
    hvezdy INTEGER NOT NULL CHECK (hvezdy BETWEEN 1 AND 5),
    text TEXT,
    jmeno TEXT,
    stav TEXT NOT NULL DEFAULT "ok",          -- ok | ceka | zamitnuto (týká se textu)
    otisk TEXT NOT NULL,                      -- HMAC(IP + salon): jedno hodnocení na salon
    otisk_ip TEXT NOT NULL,                   -- HMAC(IP + hodina): limit odeslání
    vytvoreno TEXT NOT NULL
)');
$db->exec('CREATE UNIQUE INDEX IF NOT EXISTS u_otisk ON hodnoceni(otisk)');
$db->exec('CREATE INDEX IF NOT EXISTS i_salon ON hodnoceni(salon)');

$souhrnSoubor = $uloziste . '/hodnoceni-souhrn.json';
function obnov_souhrn(PDO $db, string $soubor): void
{
    $out = [];
    foreach ($db->query('SELECT salon, ROUND(AVG(hvezdy), 1) p, COUNT(*) n FROM hodnoceni GROUP BY salon') as $r) {
        $out[$r['salon']] = [(float)$r['p'], (int)$r['n']];
    }
    file_put_contents($soubor, json_encode($out), LOCK_EX);
}

$platneId = fn($s): bool => is_string($s) && preg_match('/^[nwr]\d{1,12}$/', $s) === 1;

// ---------------------------------------------------------------- moderace
if (isset($_GET['akce'], $_GET['id'], $_GET['t'])) {
    $id = (int)$_GET['id'];
    $akce = $_GET['akce'];
    if (!in_array($akce, ['schvalit', 'zamitnout'], true) || !hash_equals($podpis("$akce:$id"), (string)$_GET['t'])) {
        html_out('Neplatný odkaz', '<p>Odkaz je neplatný nebo neúplný.</p>');
    }
    $st = $db->prepare('UPDATE hodnoceni SET stav = ? WHERE id = ?');
    $st->execute([$akce === 'schvalit' ? 'ok' : 'zamitnuto', $id]);
    $r = $db->query('SELECT url FROM hodnoceni WHERE id = ' . $id)->fetch();
    html_out(
        $akce === 'schvalit' ? 'Hodnocení schváleno' : 'Text hodnocení zamítnut',
        '<p>' . ($akce === 'schvalit' ? 'Text je teď na webu vidět.' : 'Text se nezobrazí, hvězdičky zůstávají započítané.') . '</p>'
        . ($r && $r['url'] ? '<p><a href="' . htmlspecialchars(WEB . $r['url']) . '">Zobrazit salon</a></p>' : '')
        . '<p><a href="?admin=' . $podpis('admin') . '">Další hodnocení ke schválení</a></p>'
    );
}

if (isset($_GET['admin'])) {
    if (!hash_equals($podpis('admin'), (string)$_GET['admin'])) {
        html_out('Neplatný odkaz', '<p>Odkaz je neplatný.</p>');
    }
    $rows = $db->query("SELECT * FROM hodnoceni WHERE stav = 'ceka' ORDER BY id DESC LIMIT 200")->fetchAll();
    $h = $rows ? '' : '<p>Nic nečeká na schválení.</p>';
    foreach ($rows as $r) {
        $h .= '<div style="background:#fff;border:1px solid #e3ded4;padding:1rem;margin:0 0 1rem">'
            . '<p style="margin:0 0 .4rem"><strong>' . str_repeat('★', (int)$r['hvezdy']) . str_repeat('☆', 5 - (int)$r['hvezdy']) . '</strong> · '
            . htmlspecialchars($r['jmeno'] ?: 'Anonym') . ' · <a href="' . htmlspecialchars(WEB . $r['url']) . '">' . htmlspecialchars($r['url']) . '</a></p>'
            . '<p style="white-space:pre-wrap;margin:0 0 .6rem">' . htmlspecialchars((string)$r['text']) . '</p>'
            . '<a href="?akce=schvalit&id=' . $r['id'] . '&t=' . $podpis('schvalit:' . $r['id']) . '">Schválit</a> · '
            . '<a href="?akce=zamitnout&id=' . $r['id'] . '&t=' . $podpis('zamitnout:' . $r['id']) . '">Zamítnout text</a></div>';
    }
    html_out('Hodnocení ke schválení (' . count($rows) . ')', $h);
}

// ---------------------------------------------------------------- čtení
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['souhrn'])) {
        if (!is_file($souhrnSoubor)) obnov_souhrn($db, $souhrnSoubor);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: public, max-age=300');
        readfile($souhrnSoubor);
        exit;
    }
    $salon = $_GET['salon'] ?? '';
    if (!$platneId($salon)) json_out(400, ['ok' => false]);
    $st = $db->prepare('SELECT ROUND(AVG(hvezdy), 1) p, COUNT(*) n FROM hodnoceni WHERE salon = ?');
    $st->execute([$salon]);
    $s = $st->fetch();
    $st = $db->prepare("SELECT hvezdy, text, jmeno, substr(vytvoreno, 1, 10) datum FROM hodnoceni
        WHERE salon = ? AND stav = 'ok' AND text IS NOT NULL AND text != '' ORDER BY id DESC LIMIT 50");
    $st->execute([$salon]);
    json_out(200, ['prumer' => (float)$s['p'], 'pocet' => (int)$s['n'], 'recenze' => $st->fetchAll()], 60);
}

// ---------------------------------------------------------------- zápis
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(405, ['ok' => false]);

$ref = $_SERVER['HTTP_REFERER'] ?? '';
if ($ref !== '' && !preg_match('~^https?://(www\.)?najdikadernictvi\.cz/~', $ref)) json_out(403, ['ok' => false]);

$v = fn(string $k, int $max): string => mb_substr(trim(preg_replace('/\s+/u', ' ', (string)($_POST[$k] ?? ''))), 0, $max);
if ($v('web2', 50) !== '') json_out(200, ['ok' => true]); // robot
$start = (int)($_POST['t'] ?? 0);
if ($start > 0 && (time() * 1000 - $start) < 2500) json_out(400, ['ok' => false, 'chyba' => 'Zkuste to prosím znovu.']);

$salon = (string)($_POST['salon'] ?? '');
$url = (string)($_POST['url'] ?? '');
$hvezdy = (int)($_POST['hvezdy'] ?? 0);
$text = $v('text', MAX_TEXT);
$jmeno = $v('jmeno', MAX_JMENO);
if (!$platneId($salon) || !preg_match('~^/[a-z0-9\-/]{3,200}/$~', $url)) json_out(400, ['ok' => false, 'chyba' => 'Neplatný salon.']);
if ($hvezdy < 1 || $hvezdy > 5) json_out(422, ['ok' => false, 'chyba' => 'Vyberte počet hvězdiček.']);
if ($text !== '' && mb_strlen($text) < 10) json_out(422, ['ok' => false, 'chyba' => 'Text je moc krátký (aspoň 10 znaků), nebo ho nechte prázdný.']);
if (preg_match('~https?://|www\.~i', $text)) json_out(422, ['ok' => false, 'chyba' => 'Text nesmí obsahovat odkazy.']);

$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$otisk = $podpis("salon:$salon:$ip");
$otiskIp = $podpis('ip:' . $ip . ':' . date('YmdH'));
$st = $db->prepare('SELECT COUNT(*) FROM hodnoceni WHERE otisk_ip = ?');
$st->execute([$otiskIp]);
if ((int)$st->fetchColumn() >= LIMIT_ZA_HODINU) json_out(429, ['ok' => false, 'chyba' => 'Příliš mnoho hodnocení. Zkuste to prosím později.']);

$stav = $text === '' ? 'ok' : 'ceka';
try {
    $st = $db->prepare('INSERT INTO hodnoceni (salon, url, hvezdy, text, jmeno, stav, otisk, otisk_ip, vytvoreno) VALUES (?,?,?,?,?,?,?,?,?)');
    $st->execute([$salon, $url, $hvezdy, $text ?: null, $jmeno ?: null, $stav, $otisk, $otiskIp, date('c')]);
} catch (PDOException $e) {
    json_out(409, ['ok' => false, 'chyba' => 'Tento salon jste už hodnotili. Děkujeme!']);
}
$id = (int)$db->lastInsertId();
obnov_souhrn($db, $souhrnSoubor);

if ($stav === 'ceka') {
    $base = WEB . '/api/hodnoceni.php';
    $telo = str_repeat('★', $hvezdy) . str_repeat('☆', 5 - $hvezdy) . "\n"
        . 'Salon: ' . WEB . $url . "\n"
        . 'Jméno: ' . ($jmeno ?: 'neuvedeno') . "\n\n"
        . $text . "\n\n"
        . "Schválit: $base?akce=schvalit&id=$id&t=" . $podpis("schvalit:$id") . "\n"
        . "Zamítnout text: $base?akce=zamitnout&id=$id&t=" . $podpis("zamitnout:$id") . "\n\n"
        . "Vše ke schválení: $base?admin=" . $podpis('admin') . "\n";
    @mail(
        PRIJEMCE,
        '=?UTF-8?B?' . base64_encode("[najdikadernictvi.cz] Nové hodnocení ke schválení ($hvezdy/5)") . '?=',
        $telo,
        implode("\r\n", ['From: Najdi kadeřnictví <' . PRIJEMCE . '>', 'Content-Type: text/plain; charset=UTF-8', 'MIME-Version: 1.0']),
        '-f' . PRIJEMCE
    );
}

json_out(200, ['ok' => true, 'ceka' => $stav === 'ceka']);
