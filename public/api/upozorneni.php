<?php
/**
 * Upozornění e-mailem na nové salony v obci (s potvrzením odběru).
 * POST akce=odber   email, mesto (slug), nazev                  → pošle potvrzovací e-mail
 * GET  akce=potvrdit&id=&t=                                     → potvrzení odběru
 * GET  akce=odhlasit&id=&t=                                     → odhlášení jedním klikem
 * GET  akce=rozeslat                                            → porovná katalog s minulým stavem a rozešle novinky
 *                                                                 (spouští denně GitHub Actions, nejvýš 1× za 20 h)
 * GET  admin=<podpis>                                           → počty odběratelů
 */
declare(strict_types=1);

const PRIJEMCE = 'info@najdikadernictvi.cz';
const WEB = 'https://najdikadernictvi.cz';
header('X-Robots-Tag: noindex');

function json_out(int $code, array $d): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($d, JSON_UNESCAPED_UNICODE);
    exit;
}
function html_out(string $t, string $o): void
{
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' . htmlspecialchars($t) . '</title>'
        . '<body style="font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#26241f;background:#f6f4ef">'
        . '<h1 style="font-weight:400">' . htmlspecialchars($t) . '</h1>' . $o . '<p><a href="' . WEB . '/">Najdi kadeřnictví</a></p></body>';
    exit;
}
function posli(string $komu, string $predmet, string $telo, string $odhlasit = ''): bool
{
    $hl = ['From: Najdi kadeřnictví <' . PRIJEMCE . '>', 'Content-Type: text/plain; charset=UTF-8', 'MIME-Version: 1.0'];
    if ($odhlasit) {
        $hl[] = "List-Unsubscribe: <$odhlasit>";
        $hl[] = 'List-Unsubscribe-Post: List-Unsubscribe=One-Click';
    }
    return @mail($komu, '=?UTF-8?B?' . base64_encode($predmet) . '?=', $telo, implode("\r\n", $hl), '-f' . PRIJEMCE);
}

$uloziste = dirname($_SERVER['DOCUMENT_ROOT'] ?: __DIR__ . '/..') . '/najdikadernictvi-data';
if (!is_dir($uloziste) && !@mkdir($uloziste, 0700, true)) json_out(503, ['ok' => false]);
$tajSoubor = $uloziste . '/hodnoceni-tajemstvi.txt';
if (!is_file($tajSoubor)) {
    file_put_contents($tajSoubor, bin2hex(random_bytes(32)));
    @chmod($tajSoubor, 0600);
}
$TAJ = trim((string)file_get_contents($tajSoubor));
$podpis = fn(string $s): string => substr(hash_hmac('sha256', $s, $TAJ), 0, 32);

$db = new PDO('sqlite:' . $uloziste . '/upozorneni.sqlite', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$db->exec('CREATE TABLE IF NOT EXISTS odbery (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, mesto TEXT NOT NULL, nazev TEXT NOT NULL,
    stav TEXT NOT NULL DEFAULT "ceka", vytvoreno TEXT NOT NULL, potvrzeno TEXT, otisk_ip TEXT NOT NULL,
    UNIQUE (email, mesto))');

$odhlasitUrl = fn(int $id): string => WEB . '/api/upozorneni.php?akce=odhlasit&id=' . $id . '&t=' . $podpis("odhlasit:$id");
$akce = (string)($_GET['akce'] ?? $_POST['akce'] ?? '');

// ---------------------------------------------------------------- přihlášení k odběru
if ($akce === 'odber' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $ref = $_SERVER['HTTP_REFERER'] ?? '';
    if ($ref !== '' && !preg_match('~^https?://(www\.)?najdikadernictvi\.cz/~', $ref)) json_out(403, ['ok' => false]);
    if (trim((string)($_POST['web2'] ?? '')) !== '') json_out(200, ['ok' => true]);
    $email = strtolower(trim((string)($_POST['email'] ?? '')));
    $mesto = (string)($_POST['mesto'] ?? '');
    $nazev = mb_substr(trim((string)($_POST['nazev'] ?? '')), 0, 80);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_out(422, ['ok' => false, 'chyba' => 'Zadejte platný e-mail.']);
    if (!preg_match('/^[a-z0-9\-]{2,80}$/', $mesto) || $nazev === '') json_out(400, ['ok' => false, 'chyba' => 'Neplatná obec.']);
    $otisk = hash_hmac('sha256', 'odber:' . ($_SERVER['REMOTE_ADDR'] ?? '') . ':' . date('YmdH'), $TAJ);
    $st = $db->prepare('SELECT COUNT(*) FROM odbery WHERE otisk_ip = ?');
    $st->execute([$otisk]);
    if ((int)$st->fetchColumn() >= 5) json_out(429, ['ok' => false, 'chyba' => 'Příliš mnoho pokusů. Zkuste to prosím později.']);

    $st = $db->prepare('SELECT id, stav FROM odbery WHERE email = ? AND mesto = ?');
    $st->execute([$email, $mesto]);
    $r = $st->fetch();
    if ($r && $r['stav'] === 'ok') json_out(200, ['ok' => true, 'uz' => true]);
    if ($r) {
        $id = (int)$r['id'];
        $db->prepare("UPDATE odbery SET stav = 'ceka', otisk_ip = ? WHERE id = ?")->execute([$otisk, $id]);
    } else {
        $db->prepare('INSERT INTO odbery (email, mesto, nazev, stav, vytvoreno, otisk_ip) VALUES (?,?,?,?,?,?)')
            ->execute([$email, $mesto, $nazev, 'ceka', date('c'), $otisk]);
        $id = (int)$db->lastInsertId();
    }
    $potvrdit = WEB . '/api/upozorneni.php?akce=potvrdit&id=' . $id . '&t=' . $podpis("potvrdit:$id");
    posli(
        $email,
        "Potvrďte odběr: nové salony – $nazev",
        "Dobrý den,\n\npotvrďte prosím, že chcete dostávat e-mail, když v katalogu přibude nové kadeřnictví nebo barbershop v obci $nazev:\n\n$potvrdit\n\n"
            . "Píšeme jen tehdy, když opravdu něco přibude. Odhlásit se můžete jedním kliknutím v každém e-mailu.\n"
            . "Pokud jste o odběr nežádali, e-mail ignorujte, nic vám chodit nebude.\n\nNajdi kadeřnictví\n" . WEB . "\n"
    );
    json_out(200, ['ok' => true]);
}

if (in_array($akce, ['potvrdit', 'odhlasit'], true) && isset($_REQUEST['id'], $_REQUEST['t'])) {
    $id = (int)$_REQUEST['id'];
    if (!hash_equals($podpis("$akce:$id"), (string)$_REQUEST['t'])) html_out('Neplatný odkaz', '<p>Odkaz je neplatný.</p>');
    $st = $db->prepare('SELECT nazev, mesto FROM odbery WHERE id = ?');
    $st->execute([$id]);
    $r = $st->fetch();
    if (!$r) html_out('Odběr nenalezen', '<p>Tento odběr už neexistuje.</p>');
    if ($akce === 'potvrdit') {
        $db->prepare("UPDATE odbery SET stav = 'ok', potvrzeno = ? WHERE id = ?")->execute([date('c'), $id]);
        html_out('Odběr potvrzen', '<p>Jakmile v obci ' . htmlspecialchars($r['nazev']) . ' přibude nový salon, dáme vám vědět e-mailem.</p>');
    }
    $db->prepare('DELETE FROM odbery WHERE id = ?')->execute([$id]);
    html_out('Odhlášeno', '<p>Upozornění pro obec ' . htmlspecialchars($r['nazev']) . ' už chodit nebudou a váš e-mail jsme smazali.</p>');
}

// ---------------------------------------------------------------- rozesílka
if ($akce === 'rozeslat') {
    $zamek = $uloziste . '/upozorneni-posledni.txt';
    if (is_file($zamek) && time() - (int)file_get_contents($zamek) < 20 * 3600) json_out(200, ['ok' => true, 'preskoceno' => true]);
    $index = json_decode((string)@file_get_contents(($_SERVER['DOCUMENT_ROOT'] ?: __DIR__ . '/..') . '/okoli.json'), true);
    if (!is_array($index) || count($index) < 1000) json_out(503, ['ok' => false, 'chyba' => 'Index salonů není dostupný.']);
    file_put_contents($zamek, (string)time());

    $znameSoubor = $uloziste . '/upozorneni-zname.json';
    $zname = is_file($znameSoubor) ? (json_decode((string)file_get_contents($znameSoubor), true) ?: []) : null;
    $aktualni = [];
    $nove = [];
    foreach ($index as $z) {
        // [lat, lon, název, url, adresa, barber, týden, dětské, id, …]
        $id = (string)($z[8] ?? '');
        if ($id === '') continue;
        $aktualni[$id] = 1;
        if ($zname !== null && !isset($zname[$id])) {
            $mesto = explode('/', trim((string)$z[3], '/'))[0] ?? '';
            $nove[$mesto][] = $z;
        }
    }
    file_put_contents($znameSoubor, json_encode($aktualni), LOCK_EX);
    if ($zname === null) json_out(200, ['ok' => true, 'prvni_beh' => true, 'salonu' => count($aktualni)]);

    $odeslano = 0;
    if ($nove) {
        $st = $db->prepare("SELECT id, email, mesto, nazev FROM odbery WHERE stav = 'ok' AND mesto IN (" . implode(',', array_fill(0, count($nove), '?')) . ')');
        $st->execute(array_keys($nove));
        foreach ($st->fetchAll() as $o) {
            $seznam = $nove[$o['mesto']] ?? [];
            if (!$seznam) continue;
            $radky = array_map(fn($z) => '• ' . $z[2] . ', ' . $z[4] . "\n  " . WEB . $z[3], array_slice($seznam, 0, 30));
            $odhl = $odhlasitUrl((int)$o['id']);
            if (posli(
                $o['email'],
                'Nové salony: ' . $o['nazev'] . ' (' . count($seznam) . ')',
                "Dobrý den,\n\nv katalogu přibyly nové salony v obci {$o['nazev']}:\n\n" . implode("\n\n", $radky) . "\n\n"
                    . 'Všechna kadeřnictví: ' . WEB . '/' . $o['mesto'] . "/\n\n"
                    . "Odhlásit odběr: $odhl\n",
                $odhl
            )) $odeslano++;
        }
    }
    json_out(200, ['ok' => true, 'novych_obci' => count($nove), 'odeslano' => $odeslano]);
}

// ---------------------------------------------------------------- přehled
if (isset($_GET['admin'])) {
    if (!hash_equals($podpis('upozorneni-admin'), (string)$_GET['admin'])) html_out('Neplatný odkaz', '');
    $h = '<table style="border-collapse:collapse;width:100%">';
    foreach ($db->query("SELECT nazev, SUM(stav = 'ok') ok, SUM(stav = 'ceka') ceka FROM odbery GROUP BY mesto ORDER BY ok DESC LIMIT 200") as $r) {
        $h .= '<tr style="border-top:1px solid #e3ded4"><td>' . htmlspecialchars($r['nazev']) . '</td><td style="text-align:right">' . (int)$r['ok'] . ' potvrzeno</td><td style="text-align:right;color:#6b645a">' . (int)$r['ceka'] . ' čeká</td></tr>';
    }
    html_out('Odběry upozornění', $h . '</table>');
}

json_out(400, ['ok' => false]);
