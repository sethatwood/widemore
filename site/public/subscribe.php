<?php

declare(strict_types=1);

// The list lives OUTSIDE the web root and outside the repo clone, so deploys
// never touch it and no URL can ever reach it. Override with the WIDEMORE_DB
// environment variable if the server layout differs.
const DB_DEFAULT = '/home/forge/widemore-data/subscribers.sqlite';

// Per rate-limit key (a daily-rotating hash, never a raw address) per hour.
const MAX_ATTEMPTS_PER_HOUR = 8;

$wantsJson = str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');

function respond(int $code, string $message, bool $json): never
{
    if ($json) {
        http_response_code($code);
        header('Content-Type: application/json');
        echo json_encode(['message' => $message]);
    } else {
        // the no-JS path: back to the page with a flag the page understands
        header('Location: /?signup=' . ($code < 300 ? 'ok' : 'error'), true, 303);
    }
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, 'post only.', $wantsJson);
}

// Bots fill every field; people never see this one. Pretend it worked.
if (trim($_POST['website'] ?? '') !== '') {
    respond(200, "you're on the list.", $wantsJson);
}

$email = trim($_POST['email'] ?? '');
if ($email === '' || strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(422, 'that address does not look right — typo?', $wantsJson);
}

try {
    $path = getenv('WIDEMORE_DB') ?: DB_DEFAULT;
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0700, true);
    }

    $db = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $db->exec('PRAGMA journal_mode = WAL');
    $db->exec('PRAGMA busy_timeout = 3000');
    $db->exec('CREATE TABLE IF NOT EXISTS subscribers (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
    )');
    $db->exec('CREATE TABLE IF NOT EXISTS attempts (
        ip_key TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )');

    // The rate-limit key rotates daily and stores no raw address, so it can
    // never be joined into a browsing history after the fact.
    $ipKey = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . gmdate('Y-m-d'));
    $now = time();

    $db->prepare('DELETE FROM attempts WHERE created_at < ?')
        ->execute([$now - 3600]);
    $count = $db->prepare('SELECT COUNT(*) FROM attempts WHERE ip_key = ?');
    $count->execute([$ipKey]);
    if ((int) $count->fetchColumn() >= MAX_ATTEMPTS_PER_HOUR) {
        respond(429, 'too many tries — come back in a bit.', $wantsJson);
    }
    $db->prepare('INSERT INTO attempts (ip_key, created_at) VALUES (?, ?)')
        ->execute([$ipKey, $now]);

    // Re-subscribing is fine and reveals nothing: the reply never says
    // whether the address was already on the list.
    $db->prepare('INSERT INTO subscribers (email, created_at) VALUES (?, ?)
                  ON CONFLICT(email) DO NOTHING')
        ->execute([mb_strtolower($email), gmdate('c')]);
} catch (Throwable $e) {
    error_log('[widemore subscribe] ' . $e->getMessage());
    respond(500, 'something broke on our side — try again later.', $wantsJson);
}

respond(200, "you're on the list.", $wantsJson);
