<?php
/**
 * Příjem formuláře „Přidat / upravit / odstranit salon“.
 * Odešle e-mail na info@ a uloží žádost (JSON Lines) mimo veřejnou složku webu.
 */
declare(strict_types=1);

const PRIJEMCE = 'info@najdikadernictvi.cz';
const ODESILATEL = 'info@najdikadernictvi.cz';
const LIMIT_ZA_HODINU = 5;

header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex');

function odpoved(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    odpoved(405, ['ok' => false, 'chyba' => 'Metoda není povolena.']);
}

// Úložiště mimo webroot, jinak chráněná složka v webrootu
$uloziste = dirname($_SERVER['DOCUMENT_ROOT'] ?: __DIR__ . '/..') . '/najdikadernictvi-data';
if (!is_dir($uloziste) && !@mkdir($uloziste, 0700, true)) {
    $uloziste = __DIR__ . '/../_data';
    if (!is_dir($uloziste)) {
        @mkdir($uloziste, 0700, true);
        @file_put_contents($uloziste . '/.htaccess', "Require all denied\n");
    }
}

$v = fn(string $k, int $max = 500): string => mb_substr(trim((string)($_POST[$k] ?? '')), 0, $max);

// Ochrana proti spamu: skryté pole a minimální doba vyplňování
if ($v('web2') !== '') {
    odpoved(200, ['ok' => true]);
}
$start = (int)$v('t', 20);
if ($start > 0 && (time() * 1000 - $start) < 3000) {
    odpoved(400, ['ok' => false, 'chyba' => 'Formulář byl odeslán příliš rychle. Zkuste to prosím znovu.']);
}

// Úklid: otisky IP starší než 24 hodin
foreach (glob($uloziste . '/limit-*.json') ?: [] as $f) {
    if (filemtime($f) < time() - 86400) @unlink($f);
}

// Limit odeslání na IP (ukládá se jen hash IP)
$ipHash = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . date('Y-m-d-H'));
$limitSoubor = $uloziste . '/limit-' . date('YmdH') . '.json';
$limity = is_file($limitSoubor) ? (json_decode((string)file_get_contents($limitSoubor), true) ?: []) : [];
if (($limity[$ipHash] ?? 0) >= LIMIT_ZA_HODINU) {
    odpoved(429, ['ok' => false, 'chyba' => 'Příliš mnoho odeslání. Zkuste to prosím později.']);
}

$typ = in_array($v('typ', 20), ['novy', 'uprava', 'odstraneni'], true) ? $v('typ', 20) : 'novy';
$data = [
    'typ' => $typ,
    'salon' => $v('salon', 300),
    'nazev' => $v('nazev', 200),
    'adresa' => $v('adresa', 300),
    'telefon' => $v('telefon', 50),
    'web' => $v('webSalonu', 300),
    'oteviraci_doba' => $v('oteviraci_doba', 1000),
    'svatky' => $v('svatky', 1000),
    'sluzby' => $v('sluzby', 3000),
    'popis' => $v('popis', 1000),
    'rezervace' => $v('rezervace', 300),
    'zprava' => $v('zprava', 3000),
    'jmeno' => $v('jmeno', 120),
    'email' => $v('email', 200),
    'vztah' => $v('vztah', 50),
];

// Validace
$chyby = [];
if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) $chyby[] = 'Zadejte platný e-mail, ať vám můžeme odpovědět.';
if ($typ === 'novy' && ($data['nazev'] === '' || $data['adresa'] === '')) $chyby[] = 'U nového salonu vyplňte název a adresu.';
if ($typ !== 'novy' && $data['salon'] === '' && $data['nazev'] === '') $chyby[] = 'Uveďte, o který salon jde.';
if ($v('souhlas', 5) !== '1') $chyby[] = 'Potvrďte prosím souhlas se zpracováním údajů.';
if (preg_match('~https?://~i', $data['zprava']) && substr_count(strtolower($data['zprava']), 'http') > 3) $chyby[] = 'Zpráva obsahuje příliš mnoho odkazů.';
if ($chyby) {
    odpoved(422, ['ok' => false, 'chyba' => implode(' ', $chyby)]);
}

$limity[$ipHash] = ($limity[$ipHash] ?? 0) + 1;
@file_put_contents($limitSoubor, json_encode($limity));

$zaznam = ['cas' => date('c'), 'id' => bin2hex(random_bytes(6))] + $data;
@file_put_contents($uloziste . '/zadosti.jsonl', json_encode($zaznam, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);

$typText = ['novy' => 'Nový salon', 'uprava' => 'Úprava salonu', 'odstraneni' => 'Žádost o odstranění'][$typ];
$telo = "$typText (#{$zaznam['id']})\n\n";
foreach ($data as $k => $hodnota) {
    if ($hodnota !== '') $telo .= str_pad($k . ':', 18) . $hodnota . "\n";
}
$predmet = '=?UTF-8?B?' . base64_encode("[najdikadernictvi.cz] $typText: " . ($data['nazev'] ?: $data['salon'])) . '?=';
$hlavicky = [
    'From: Najdi kadeřnictví <' . ODESILATEL . '>',
    'Reply-To: ' . str_replace(["\r", "\n"], '', $data['email']),
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
];
$odeslano = @mail(PRIJEMCE, $predmet, $telo, implode("\r\n", $hlavicky), '-f' . ODESILATEL);

odpoved(200, ['ok' => true, 'email' => $odeslano]);
