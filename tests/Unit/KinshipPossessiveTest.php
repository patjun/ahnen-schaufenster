<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Tests\Unit;

use Jungbluth\AhnenSchaufenster\Service\Kinship;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

#[CoversClass(Kinship::class)]
final class KinshipPossessiveTest extends TestCase
{
    /**
     * Beziehungsname von webtrees (deutsch), Geschlecht der Person → Anzeige aus Sicht des Betrachters.
     *
     * @return array<string,array{string,string,string}>
     */
    public static function namen(): array
    {
        return [
            'leer'                          => ['', 'M', ''],
            'schon mit Pronomen'            => ['deine Mutter', 'F', 'deine Mutter'],
            'Mutter'                        => ['Mutter', 'F', 'deine Mutter'],
            'Vater'                         => ['Vater', 'M', 'dein Vater'],
            'Beifügung bleibt'              => ['Großvater mütterlicherseits', 'M', 'dein Großvater mütterlicherseits'],
            'Cousin (m)'                    => ['Cousin', 'M', 'dein Cousin'],
            'Cousine (f)'                   => ['Cousine', 'F', 'deine Cousine'],
            'Cousin 2. Grades'              => ['Cousin 2. Grades', 'M', 'dein Cousin 2. Grades'],
            'Geschwister ist Neutrum'       => ['Halbgeschwister', 'F', 'dein Halbgeschwister'],
            'Adjektiv'                      => ['älterer Bruder', 'M', 'dein älterer Bruder'],
            'echter Genitiv im Namen'       => ['Ehefrau des Enkels', 'F', 'deine Ehefrau des Enkels'],
            'Kette maskulin'                => ['Urgroßvaters Stiefmutter', 'F', 'Stiefmutter deines Urgroßvaters'],
            'Kette feminin'                 => ['Großmutters Partner', 'M', 'Partner deiner Großmutter'],
            'Cousin ist maskulin'           => ['Cousins Sohn', 'M', 'Sohn deines Cousins'],
            'Cousine ist feminin'           => ['Cousines Sohn', 'M', 'Sohn deiner Cousine'],
            'Neffe ist schwach'             => ['Neffes Tochter', 'F', 'Tochter deines Neffen'],
            'Großneffe ist schwach'         => ['Großneffes Sohn', 'M', 'Sohn deines Großneffen'],
            'Enkel ist stark'               => ['Enkels Ehefrau', 'F', 'Ehefrau deines Enkels'],
            'Enkelin'                       => ['Enkelins Ehemann', 'M', 'Ehemann deiner Enkelin'],
            'Nichte'                        => ['Nichtes Sohn', 'M', 'Sohn deiner Nichte'],
            'Schwager'                      => ['Schwagers Bruder', 'M', 'Bruder deines Schwagers'],
            'Halbbruder'                    => ['Halbbruders Tochter', 'F', 'Tochter deines Halbbruders'],
            'Kette mit Beifügung'           => ['Großvater mütterlicherseitss Bruder', 'M', 'Bruder deines Großvaters mütterlicherseits'],
            'Kette mit Grad'                => ['Cousin 2. Gradess Tochter', 'F', 'Tochter deines Cousins 2. Grades'],
            'Kette mit Adjektiv'            => ['älterer Bruders Sohn', 'M', 'Sohn deines älteren Bruders'],
            'lange Kette'                   => ['Großvaters Bruders Sohn', 'M', 'Sohn des Bruders deines Großvaters'],
            'lange Kette feminin innen'     => ['Großmutters Schwesters Tochter', 'F', 'Tochter der Schwester deiner Großmutter'],
            'lange Kette schwach innen'     => ['Onkels Neffes Sohn', 'M', 'Sohn des Neffen deines Onkels'],
        ];
    }

    #[DataProvider('namen')]
    public function testPossessiv(string $name, string $sex, string $erwartet): void
    {
        self::assertSame($erwartet, Kinship::possessive($name, $sex));
    }
}
