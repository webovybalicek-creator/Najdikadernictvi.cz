<?php
/**
 * Nahlášení chyby v údajích salonu jedním klikem. Pošle e-mail redakci.
 * POST salon, url, typ, poznamka (nepovinné), t (čas načtení), web2 (past na roboty)
 * Uchovává jen HMAC otisk IP na 24 hodin kvůli limitu odeslání.
 */
declare(strict_types=1);

const PRIJEMCE = 'info@najdikadernictvi.cz';
const WEB = 'https://najdikadernictvi.cz';
const LIMIT_ZA_HODINU = 6;
const TYPY = [
    'zavreno' => 'Zavřeno natrvalo',
    'telefon' => 'Špatný telefon',
    'doba' => 'Jiná otevírací doba',
    'adresa' => 'Špatná adresa nebo poloha na mapě',
    'nazev' => 'Jiný název',
    'jine' => 'Jiná chyba',
];

header('X-Robots-Tag: noindex');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(405, ['ok' => false]);
$ref = $_SERVER['HTTP_REFERER'] ?? '';
if ($ref !== '' && !preg_match('~^https?://(www\.)?najdikadernictvi\.cz/~', $ref)) out(403, ['ok' => false]);
if (trim((string)($_POST['web2'] ?? '')) !== '') out(200, ['ok' => true]);
$start = (int)($_POST['t'] ?? 0);
if ($start > 0 && (time() * 1000 - $start) < 1500) out(400, ['ok' => false, 'chyba' => 'Zkuste to prosím znovu.']);

$salon = (string)($_POST['salon'] ?? '');
$url = (string)($_POST['url'] ?? '');
$typ = (string)($_POST['typ'] ?? '');
$pozn = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)($_POST['poznamka'] ?? ''))), 0, 500);
if (!preg_match('/^[nwr]\d{1,12}$/', $salon) || !preg_match('~^/[a-z0-9\-/]{3,200}/$~', $url)) out(400, ['ok' => false, 'chyba' => 'Neplatný salon.']);
if (!isset(TYPY[$typ])) out(422, ['ok' => false, 'chyba' => 'Vyberte, co je špatně.']);
if ($typ === 'jine' && mb_strlen($pozn) < 5) out(422, ['ok' => false, 'chyba' => 'Napište prosím krátce, co je špatně.']);

$uloziste = dirname($_SERVER['DOCUMENT_ROOT'] ?: __DIR__ . '/..') . '/najdikadernictvi-data';
if (!is_dir($uloziste) && !@mkdir($uloziste, 0700, true)) out(503, ['ok' => false, 'chyba' => 'Služba není dostupná.']);
$tajSoubor = $uloziste . '/hodnoceni-tajemstvi.txt';
if (!is_file($tajSoubor)) {
    file_put_contents($tajSoubor, bin2hex(random_bytes(32)));
    @chmod($tajSoubor, 0600);
}
$taj = trim((string)file_get_contents($tajSoubor));
$ip = $_SERVER['REMOTE_ADDR'] ?? '';

$db = new PDO('sqlite:' . $uloziste . '/nahlaseni.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('CREATE TABLE IF NOT EXISTS nahlaseni (otisk_ip TEXT NOT NULL, klic TEXT NOT NULL, cas INTEGER NOT NULL)');
$db->exec('DELETE FROM nahlaseni WHERE cas < ' . (time() - 86400));
$otiskIp = hash_hmac('sha256', "nahlasit:$ip", $taj);
$klic = hash_hmac('sha256', "nahlasit:$ip:$salon:$typ", $taj);

$st = $db->prepare('SELECT COUNT(*) FROM nahlaseni WHERE klic = ?');
$st->execute([$klic]);
if ((int)$st->fetchColumn() > 0 && $pozn === '') out(200, ['ok' => true]); // už nahlášeno, bez nové informace
$st = $db->prepare('SELECT COUNT(*) FROM nahlaseni WHERE otisk_ip = ? AND cas > ?');
$st->execute([$otiskIp, time() - 3600]);
if ((int)$st->fetchColumn() >= LIMIT_ZA_HODINU) out(429, ['ok' => false, 'chyba' => 'Příliš mnoho hlášení. Zkuste to prosím později.']);
$db->prepare('INSERT INTO nahlaseni (otisk_ip, klic, cas) VALUES (?,?,?)')->execute([$otiskIp, $klic, time()]);

$telo = 'Chyba: ' . TYPY[$typ] . "\n"
    . 'Salon: ' . WEB . $url . " ($salon)\n"
    . ($pozn !== '' ? "\nPoznámka:\n$pozn\n" : '')
    . "\nOpravu zapište do src/data/overene.json (ověřené údaje), vyřazení do src/data/vyrazene.json.\n";
$odeslano = @mail(
    PRIJEMCE,
    '=?UTF-8?B?' . base64_encode('[najdikadernictvi.cz] Nahlášená chyba: ' . TYPY[$typ]) . '?=',
    $telo,
    implode("\r\n", ['From: Najdi kadeřnictví <' . PRIJEMCE . '>', 'Content-Type: text/plain; charset=UTF-8', 'MIME-Version: 1.0']),
    '-f' . PRIJEMCE
);
// Záloha pro případ, že e-mail neodejde
@file_put_contents($uloziste . '/nahlaseni.log', date('c') . "\t$typ\t$url\t" . str_replace(["\t", "\n"], ' ', $pozn) . ($odeslano ? '' : "\tMAIL-FAIL") . "\n", FILE_APPEND | LOCK_EX);

out(200, ['ok' => true]);
