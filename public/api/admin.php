<?php
/**
 * Pošle provozovateli na info@ e-mail s podepsanými odkazy do administrace
 * (hodnocení ke schválení, návštěvnost, profily majitelů, odběry). Odkazy nikdy nevypisuje do prohlížeče.
 * GET ?poslat=1  (max. 1× za 10 minut)
 */
declare(strict_types=1);

const PRIJEMCE = 'info@najdikadernictvi.cz';
const WEB = 'https://najdikadernictvi.cz';
header('X-Robots-Tag: noindex');
header('Content-Type: text/html; charset=utf-8');
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

$stranka = fn(string $t) => exit('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Administrace</title>'
    . '<body style="font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#26241f;background:#f6f4ef">'
    . '<h1 style="font-weight:400">Administrace</h1>' . $t . '</body>');

if (!isset($_GET['poslat'])) {
    $stranka('<p>Odkazy do administrace vám pošleme e-mailem na ' . PRIJEMCE . '.</p><p><a href="?poslat=1" style="display:inline-block;padding:.6em 1.1em;background:#26241f;color:#fff;text-decoration:none;border-radius:4px">Poslat odkazy</a></p>');
}

$zamek = $uloziste . '/admin-posledni.txt';
if (is_file($zamek) && time() - (int)file_get_contents($zamek) < 600) {
    $stranka('<p>Odkazy jsme poslali před chvílí. Zkontrolujte schránku ' . PRIJEMCE . ' (i složku spam).</p>');
}
file_put_contents($zamek, (string)time());

$api = WEB . '/api';
$telo = "Odkazy do administrace webu najdikadernictvi.cz (nesdílejte je):\n\n"
    . "Hodnocení ke schválení:\n$api/hodnoceni.php?admin=" . $podpis('admin') . "\n\n"
    . "Návštěvnost:\n$api/stat.php?admin=" . $podpis('stat-admin') . "\n\n"
    . "Úpravy profilů od majitelů:\n$api/sprava.php?admin=" . $podpis('sprava-admin') . "\n\n"
    . "Odběry upozornění:\n$api/upozorneni.php?admin=" . $podpis('upozorneni-admin') . "\n";
$ok = @mail(
    PRIJEMCE,
    '=?UTF-8?B?' . base64_encode('[najdikadernictvi.cz] Odkazy do administrace') . '?=',
    $telo,
    implode("\r\n", ['From: Najdi kadeřnictví <' . PRIJEMCE . '>', 'Content-Type: text/plain; charset=UTF-8', 'MIME-Version: 1.0']),
    '-f' . PRIJEMCE
);
$stranka($ok
    ? '<p>Hotovo. Odkazy jsme poslali na ' . PRIJEMCE . '. Pokud e-mail nedorazí do pár minut, podívejte se do spamu.</p>'
    : '<p>E-mail se nepodařilo odeslat. Server pravděpodobně nemá povolenou funkci mail(). Ozvěte se správci webu.</p>');
