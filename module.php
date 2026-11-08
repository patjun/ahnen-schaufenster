<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster;

// Kein Composer-Autoloader im Betrieb: webtrees' Modulordner wird ohne vendor/ ausgeliefert.
spl_autoload_register(static function (string $class): void {
    $prefix = __NAMESPACE__ . '\\';

    if (str_starts_with($class, $prefix)) {
        $file = __DIR__ . '/src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';

        if (is_file($file)) {
            require_once $file;
        }
    }
});

return new SchaufensterModule();
