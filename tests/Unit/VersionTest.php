<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Tests\Unit;

use Jungbluth\AhnenSchaufenster\SchaufensterModule;
use PHPUnit\Framework\TestCase;

/**
 * Die Version steht an drei Stellen: SchaufensterModule::VERSION, latest-version.txt (für die Update-Prüfung
 * von webtrees) und CHANGELOG.md. Dieser Test hält sie gleich.
 */
final class VersionTest extends TestCase
{
    private const string ROOT = __DIR__ . '/../../';

    public function testVersionIstSemVer(): void
    {
        self::assertMatchesRegularExpression('/^\d+\.\d+\.\d+$/', SchaufensterModule::VERSION);
    }

    public function testLatestVersionTxtStimmtUeberein(): void
    {
        self::assertSame(SchaufensterModule::VERSION, trim((string) file_get_contents(self::ROOT . 'latest-version.txt')));
    }

    public function testChangelogHatEintragFuerDieVersion(): void
    {
        $changelog = (string) file_get_contents(self::ROOT . 'CHANGELOG.md');
        self::assertMatchesRegularExpression('/^## \[' . preg_quote(SchaufensterModule::VERSION, '/') . '\] – \d{4}-\d{2}-\d{2}$/m', $changelog);
    }
}
