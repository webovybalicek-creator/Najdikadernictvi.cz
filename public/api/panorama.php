<?php
/**
 * Proxy pro statickou panoramu Mapy.com („pohled z ulice“ na salon).
 *
 * - API klíč zůstává na serveru.
 * - Tvrdý měsíční i denní strop, aby se nikdy nepřekročily bezplatné kredity
 *   (tarif Basic: 250 000 kreditů/měsíc, panorama = 4 kredity → max. 62 500 volání).
 * - Obrázek se neukládá (podmínky Mapy.com), jen přeposílá; prohlížeč ho smí držet 1 den.
 */
declare(strict_types=1);

const API_KLIC = '51DU-WuzB5tq3ivgYzjj3cZrucqTjiScIxk8B4WdB2k';
const LIMIT_MESIC = 60000;
const LIMIT_DEN = 2000;
// Obrázky jsou o kus vyšší než zobrazení 4:3 – spodní pruh s vloženou atribucí se ořízne
// a atribuce Mapy.com se zobrazuje vedle fotek (viz MapyAtribuce.astro).
const VELIKOSTI = ['maly' => [480, 400], 'velky' => [1024, 830]];

function nenalezeno(int $code = 404, bool $trvale = false): void
{
    http_response_code($code);
    // „Panorama tu není“ si prohlížeč může pamatovat týden, dočasné chyby vůbec
    header($trvale ? 'Cache-Control: public, max-age=604800' : 'Cache-Control: no-store');
    exit;
}

$lat = filter_input(INPUT_GET, 'lat', FILTER_VALIDATE_FLOAT);
$lon = filter_input(INPUT_GET, 'lon', FILTER_VALIDATE_FLOAT);
$vel = $_GET['s'] ?? 'maly';
// Jen území ČR a povolené velikosti
if ($lat === false || $lon === false || $lat === null || $lon === null
    || $lat < 48.5 || $lat > 51.1 || $lon < 12.0 || $lon > 18.9 || !isset(VELIKOSTI[$vel])) {
    nenalezeno(400);
}
// Jen požadavky z našeho webu (ochrana kreditů před cizím použitím)
$ref = $_SERVER['HTTP_REFERER'] ?? '';
if ($ref !== '' && !preg_match('~^https?://(www\.)?najdikadernictvi\.cz/~', $ref)) {
    nenalezeno(403);
}

// Počítadlo volání (mimo webroot)
$uloziste = dirname($_SERVER['DOCUMENT_ROOT'] ?: __DIR__ . '/..') . '/najdikadernictvi-data';
if (!is_dir($uloziste) && !@mkdir($uloziste, 0700, true)) {
    nenalezeno(503);
}
$soubor = $uloziste . '/panorama-pocitadlo.json';
$fp = fopen($soubor, 'c+');
if (!$fp || !flock($fp, LOCK_EX)) {
    nenalezeno(503);
}
$stav = json_decode((string)stream_get_contents($fp), true) ?: [];
$mesic = date('Y-m');
$den = date('Y-m-d');
if (($stav['mesic'] ?? '') !== $mesic) $stav = ['mesic' => $mesic, 'pocet' => 0, 'den' => $den, 'dnes' => 0];
if (($stav['den'] ?? '') !== $den) $stav = ['den' => $den, 'dnes' => 0] + $stav;
if ($stav['pocet'] >= LIMIT_MESIC || $stav['dnes'] >= LIMIT_DEN) {
    flock($fp, LOCK_UN);
    fclose($fp);
    http_response_code(503);
    header('Cache-Control: no-store');
    exit;
}
$stav['pocet']++;
$stav['dnes']++;
ftruncate($fp, 0);
rewind($fp);
fwrite($fp, json_encode($stav));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

[$w, $h] = VELIKOSTI[$vel];
$url = 'https://api.mapy.cz/v1/static/pano?' . http_build_query([
    'lon' => round($lon, 6),
    'lat' => round($lat, 6),
    'width' => $w,
    'height' => $h,
    'yaw' => 'point',
    'radius' => 50,
    'lang' => 'cs',
    'apikey' => API_KLIC,
]);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HTTPHEADER => ['Referer: https://najdikadernictvi.cz/'],
]);
$obrazek = curl_exec($ch);
$kod = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$typ = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($kod !== 200 || !is_string($obrazek) || !str_starts_with($typ, 'image/')) {
    // V okolí není panorama (4xx) nebo chyba API (5xx) → v prohlížeči zůstane monogram
    nenalezeno(404, $kod === 404 || $kod === 204);
}

header('Content-Type: ' . $typ);
header('Cache-Control: public, max-age=86400');
header('X-Robots-Tag: noindex');
echo $obrazek;
