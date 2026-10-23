<?php
/**
 * Jednorázový rozbalovač deploye. GitHub Action do něj před nahráním doplní hash tokenu
 * a název ZIPu, nahraje ho pod náhodným jménem, zavolá a skript se po dokončení sám smaže.
 */
declare(strict_types=1);

const TOKEN_HASH = '__TOKEN_HASH__';
const ZIP_NAME = '__ZIP_NAME__';
const MANIFEST = '.deploy-manifest.txt';

header('Content-Type: text/plain; charset=utf-8');
$root = __DIR__;
$self = __FILE__;
$zipPath = $root . '/' . ZIP_NAME;

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

@set_time_limit(0);
@ignore_user_abort(true);

if (!class_exists('ZipArchive')) {
    konec(500, 'CHYBA: PHP nemá rozšíření ZipArchive');
}
$zip = new ZipArchive();
if ($zip->open($zipPath) !== true) {
    konec(500, 'CHYBA: nelze otevřít ZIP');
}

$nove = [];
for ($i = 0; $i < $zip->numFiles; $i++) {
    $name = $zip->getNameIndex($i);
    if ($name === false || str_contains($name, '..') || str_starts_with($name, '/')) {
        konec(500, 'CHYBA: neplatná cesta v ZIPu');
    }
    if (!str_ends_with($name, '/')) {
        $nove[$name] = true;
    }
}

if (!$zip->extractTo($root)) {
    konec(500, 'CHYBA: rozbalení selhalo');
}
$zip->close();

// Smazání souborů z minulého deploye, které v novém už nejsou
$smazano = 0;
if (is_file($root . '/' . MANIFEST)) {
    foreach (file($root . '/' . MANIFEST, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $old) {
        if (isset($nove[$old]) || str_contains($old, '..') || str_starts_with($old, '/')) {
            continue;
        }
        $p = $root . '/' . $old;
        if (is_file($p) && @unlink($p)) {
            $smazano++;
            // prázdné složky po smazaném souboru
            $dir = dirname($p);
            while ($dir !== $root && is_dir($dir) && count(scandir($dir)) === 2) {
                @rmdir($dir);
                $dir = dirname($dir);
            }
        }
    }
}
file_put_contents($root . '/' . MANIFEST, implode("\n", array_keys($nove)) . "\n");

@unlink($zipPath);
@unlink($self);
echo 'OK: ' . count($nove) . ' souborů, smazáno ' . $smazano . "\n";
