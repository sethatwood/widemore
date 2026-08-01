<?php

declare(strict_types=1);

// Read-only view onto the same list subscribe.php writes. The password is a
// plain file outside the web root and outside the repo clone -- set once
// over SSH, see DEPLOY.md. Deliberately not a Forge/PHP-FPM environment
// variable: env passthrough to PHP-FPM is version- and config-dependent, a
// file read is not.
const DB_DEFAULT = '/home/forge/widemore-data/subscribers.sqlite';
const PASSWORD_FILE_DEFAULT = '/home/forge/widemore-data/admin-password';
const MAX_LOGIN_ATTEMPTS_PER_HOUR = 5;
const SESSION_HOURS = 12;

header('X-Robots-Tag: noindex');

session_set_cookie_params([
    'lifetime' => SESSION_HOURS * 3600,
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

function db(): PDO
{
    static $db = null;
    if ($db !== null) {
        return $db;
    }

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
    $db->exec('CREATE TABLE IF NOT EXISTS login_attempts (
        ip_key TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )');
    return $db;
}

function adminPassword(): string
{
    $path = getenv('WIDEMORE_ADMIN_PASSWORD_FILE') ?: PASSWORD_FILE_DEFAULT;
    if (!is_file($path)) {
        http_response_code(500);
        exit('admin password not set -- see site/DEPLOY.md.');
    }
    return trim((string) file_get_contents($path));
}

function rateLimited(PDO $db): bool
{
    // Same daily-rotating hash as subscribe.php: never a raw IP at rest.
    $ipKey = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . gmdate('Y-m-d'));
    $now = time();

    $db->prepare('DELETE FROM login_attempts WHERE created_at < ?')->execute([$now - 3600]);
    $count = $db->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip_key = ?');
    $count->execute([$ipKey]);
    if ((int) $count->fetchColumn() >= MAX_LOGIN_ATTEMPTS_PER_HOUR) {
        return true;
    }
    $db->prepare('INSERT INTO login_attempts (ip_key, created_at) VALUES (?, ?)')->execute([$ipKey, $now]);
    return false;
}

if (isset($_POST['logout'])) {
    session_destroy();
    header('Location: admin.php');
    exit;
}

$error = null;
if (isset($_POST['password'])) {
    $db = db();
    if (rateLimited($db)) {
        $error = 'too many tries -- come back in a bit.';
    } elseif (hash_equals(adminPassword(), $_POST['password'])) {
        session_regenerate_id(true);
        $_SESSION['authed'] = true;
    } else {
        $error = 'wrong password.';
    }
}

if (empty($_SESSION['authed'])) {
    ?>
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>widemore admin</title></head>
<body style="font:15px system-ui;background:#0e1013;color:#e6ebee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;">
  <form method="post" style="width:260px;">
    <?php if ($error): ?><p style="color:#e0605c;margin:0 0 12px;"><?= htmlspecialchars($error) ?></p><?php endif; ?>
    <input type="password" name="password" placeholder="password" autofocus
      style="width:100%;padding:9px 10px;background:#1c2129;border:1px solid rgba(255,255,255,.12);border-radius:7px;color:inherit;box-sizing:border-box;">
    <button style="width:100%;margin-top:8px;padding:9px;background:#2bbf9f;border:none;border-radius:7px;color:#0b2b23;font-weight:600;cursor:pointer;">enter</button>
  </form>
</body>
</html>
    <?php
    exit;
}

$db = db();

if (($_GET['format'] ?? '') === 'csv') {
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="widemore-subscribers.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['email', 'created_at']);
    foreach ($db->query('SELECT email, created_at FROM subscribers ORDER BY created_at DESC') as $row) {
        fputcsv($out, [$row['email'], $row['created_at']]);
    }
    exit;
}

$rows = $db->query('SELECT email, created_at FROM subscribers ORDER BY created_at DESC')->fetchAll();
?>
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>widemore admin</title></head>
<body style="font:15px/1.5 system-ui;background:#0e1013;color:#e6ebee;max-width:640px;margin:6vh auto;padding:0 20px;">
  <p style="color:#8a939e;">
    <?= count($rows) ?> subscriber<?= count($rows) === 1 ? '' : 's' ?>
    · <a href="?format=csv" style="color:#2bbf9f;">download csv</a>
    · <form method="post" style="display:inline;"><button name="logout" value="1"
        style="border:none;background:none;color:#2bbf9f;cursor:pointer;padding:0;font:inherit;">log out</button></form>
  </p>
  <table style="width:100%;border-collapse:collapse;">
    <?php foreach ($rows as $r): ?>
    <tr style="border-top:1px solid rgba(255,255,255,.08);">
      <td style="padding:7px 0;"><?= htmlspecialchars($r['email']) ?></td>
      <td style="padding:7px 0;color:#8a939e;text-align:right;"><?= htmlspecialchars($r['created_at']) ?></td>
    </tr>
    <?php endforeach; ?>
  </table>
</body>
</html>
