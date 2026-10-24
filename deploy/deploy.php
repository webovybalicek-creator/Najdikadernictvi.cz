<?php
/**
 * Jednorázový rozbalovač přírůstkového deploye. GitHub Action do něj doplní hash tokenu a název ZIPu,
 * nahraje ho pod náhodným jménem a volá ve dvou krocích:
 *   akce=manifest  → vrátí seznam souborů s otisky z minulého deploye („cesta<TAB>md5“)
 *   akce=rozbalit  → rozbalí ZIP se změněnými soubory, smaže soubory, které v novém deployi nejsou,
 *                    uloží nový manifest a smaže ZIP i sám sebe
 */
declare(strict_types=1);

const TOKEN_HASH = '__TOKEN_HASH__';
const ZIP_NAME = '__ZIP_NAME__';
const MANIFEST = '.deploy-manifest.txt';
const NOVY_MANIFEST = '.deploy-manifest-new.txt';

header('Content-Type: text/plain; charset=utf-8');
$root = __DIR__;

function konec(int $code, string $msg): void
{
    http_response_code($code);
    echo $msg . "\n";
    exit;
}

$token = $_SERVER['HTTP_X_DEPLOY_TOKEN'] ?? '';
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !hash_equals(TOKEN_HASH, hash('sha256', $token))) {
    konec(404, 'Not found');
}
$akce = $_POST['akce'] ?? $_GET['akce'] ?? 'rozbalit';
$bezpecna = fn(string $p): bool => $p !== '' && !str_contains($p, '..') && !str_starts_with($p, '/');

if ($akce === 'manifest') {
    $m = $root . '/' . MANIFEST;
    echo is_file($m) ? file_get_contents($m) : '';
    exit;
}

@set_time_limit(0);
@ignore_user_abort(true);
if (!class_exists('ZipArchive')) konec(500, 'CHYBA: PHP nemá rozšíření ZipArchive');
$zip = new ZipArchive();
if ($zip->open($root . '/' . ZIP_NAME) !== true) konec(500, 'CHYBA: nelze otevřít ZIP');
for ($i = 0; $i < $zip->numFiles; $i++) {
    $name = (string)$zip->getNameIndex($i);
    if (!$bezpecna($name)) konec(500, 'CHYBA: neplatná cesta v ZIPu');
}
$zmeneno = $zip->numFiles - 1;
if (!$zip->extractTo($root)) konec(500, 'CHYBA: rozbalení selhalo');
$zip->close();

// Nový manifest: všechny soubory nového deploye (i nezměněné)
$novy = [];
$novyText = (string)@file_get_contents($root . '/' . NOVY_MANIFEST);
foreach (preg_split('/\R/', $novyText, -1, PREG_SPLIT_NO_EMPTY) as $r) {
    $novy[explode("\t", $r)[0]] = true;
}
if (count($novy) < 100) konec(500, 'CHYBA: nový manifest chybí nebo je neúplný, nic se nemaže');

$smazano = 0;
if (is_file($root . '/' . MANIFEST)) {
    foreach (file($root . '/' . MANIFEST, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $r) {
        $old = explode("\t", $r)[0];
        if (isset($novy[$old]) || !$bezpecna($old)) continue;
        $p = $root . '/' . $old;
        if (is_file($p) && @unlink($p)) {
            $smazano++;
            $dir = dirname($p);
            while ($dir !== $root && is_dir($dir) && count(scandir($dir)) === 2) {
                @rmdir($dir);
                $dir = dirname($dir);
            }
        }
    }
}
rename($root . '/' . NOVY_MANIFEST, $root . '/' . MANIFEST);
@unlink($root . '/' . ZIP_NAME);
@unlink(__FILE__);
echo 'OK: změněno ' . $zmeneno . ' z ' . count($novy) . ' souborů, smazáno ' . $smazano . "\n";
