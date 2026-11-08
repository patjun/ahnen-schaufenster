<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Tests\Unit;

use Jungbluth\AhnenSchaufenster\Service\LifeBuilder;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

use function array_column;

#[CoversClass(LifeBuilder::class)]
final class LifeBuilderSortTest extends TestCase
{
    public function testAufsteigendStabilUndOhneDatumAmEnde(): void
    {
        $slides = [
            ['sortKey' => 2440000, 'id' => 'a'],
            ['sortKey' => null, 'id' => 'b'],
            ['sortKey' => 2430000, 'id' => 'c'],
            ['sortKey' => 2440000, 'id' => 'd'],
        ];

        self::assertSame(['c', 'a', 'd', 'b'], array_column(LifeBuilder::sortSlides($slides), 'id'));
    }

    public function testMehrereOhneDatumBehaltenIhreReihenfolge(): void
    {
        $slides = [
            ['sortKey' => null, 'id' => 'x'],
            ['sortKey' => 5, 'id' => 'y'],
            ['sortKey' => null, 'id' => 'z'],
            ['sortKey' => 1, 'id' => 'w'],
        ];

        self::assertSame(['w', 'y', 'x', 'z'], array_column(LifeBuilder::sortSlides($slides), 'id'));
    }

    public function testLeereListe(): void
    {
        self::assertSame([], LifeBuilder::sortSlides([]));
    }

    public function testRouteNurEigeneDiasMitPunktUndOhneWiederholung(): void
    {
        $berlin = ['lat' => 52.5, 'lng' => 13.4];
        $bonn   = ['lat' => 50.7, 'lng' => 7.1];
        $slides = [
            ['id' => 'a', 'own' => true, 'point' => $berlin, 'place' => 'Berlin'],
            ['id' => 'b', 'own' => true, 'point' => $berlin, 'place' => 'Berlin'],
            ['id' => 'c', 'own' => false, 'point' => $bonn, 'place' => 'Bonn'],
            ['id' => 'd', 'own' => true, 'point' => null, 'place' => null],
            ['id' => 'e', 'own' => true, 'point' => $bonn, 'place' => 'Bonn'],
            ['id' => 'f', 'own' => true, 'point' => $berlin, 'place' => 'Berlin'],
        ];

        self::assertSame([
            ['lat' => 52.5, 'lng' => 13.4, 'place' => 'Berlin', 'slideId' => 'a'],
            ['lat' => 50.7, 'lng' => 7.1, 'place' => 'Bonn', 'slideId' => 'e'],
            ['lat' => 52.5, 'lng' => 13.4, 'place' => 'Berlin', 'slideId' => 'f'],
        ], LifeBuilder::route($slides));
    }
}
