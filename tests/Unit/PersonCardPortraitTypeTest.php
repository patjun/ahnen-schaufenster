<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Tests\Unit;

use Jungbluth\AhnenSchaufenster\Service\PersonCard;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class PersonCardPortraitTypeTest extends TestCase
{
    /**
     * @return array<string,array{string,bool}>
     */
    public static function typen(): array
    {
        return [
            'Foto'               => ['photo', true],
            'Foto groß'          => ['PHOTO', true],
            'Gemälde'            => ['painting', true],
            'Gemälde mit Rand'   => [' Painting ', true],
            'ohne Typ'           => ['', false],
            'Urkunde'            => ['certificate', false],
            'Dokument'           => ['DOCUMENT', false],
            'Buch (Adressbuch)'  => ['book', false],
            'Zeitung'            => ['newspaper', false],
            'Karte (Meldekarte)' => ['card', false],
            'Grabstein'          => ['tombstone', false],
            'Andere'             => ['other', false],
        ];
    }

    #[DataProvider('typen')]
    public function testNurFotoUndGemaelde(string $type, bool $erwartet): void
    {
        self::assertSame($erwartet, PersonCard::isPortraitType($type));
    }
}
