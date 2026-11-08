<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Tests\Unit;

use Jungbluth\AhnenSchaufenster\Service\LifeBuilder;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

#[CoversClass(LifeBuilder::class)]
final class LifeBuilderFilenameTest extends TestCase
{
    /**
     * Titel, Dateiname → sieht wie ein Dateiname aus?
     *
     * @return array<string,array{string,string,bool}>
     */
    public static function titel(): array
    {
        return [
            'Ancestry-Bildname'           => ['45209_srep100^048603-00016_01_Tod', '', true],
            'mit Unterstrich'             => ['Karl_Schmidt', '', true],
            'mit Endung'                  => ['IMG1234.jpg', '', true],
            'PDF-Endung'                  => ['Heiratsurkunde.PDF', '', true],
            'gleich dem Dateinamen'       => ['Scan 12', 'fotos/Scan 12.jpg', true],
            'gleich dem Dateinamen + End.' => ['Scan 12.jpg', 'fotos/Scan 12.jpg', true],
            'echter Titel'                => ['Heiratsurkunde Karl Schmidt 1921', 'scans/x_1.jpg', false],
            'Titel mit Unterstrich und Leerzeichen' => ['Familie Müller _ Berlin', '', false],
            'ein Wort'                    => ['Konfirmation', '', false],
            'Abkürzung mit Punkt am Ende' => ['Ostpr.', '', false],
            'leer'                        => ['', 'a_b.jpg', false],
        ];
    }

    #[DataProvider('titel')]
    public function testDateinamenErkennen(string $title, string $filename, bool $erwartet): void
    {
        self::assertSame($erwartet, LifeBuilder::looksLikeFilename($title, $filename));
    }
}
