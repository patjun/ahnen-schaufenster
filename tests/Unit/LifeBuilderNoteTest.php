<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Tests\Unit;

use Jungbluth\AhnenSchaufenster\Service\LifeBuilder;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(LifeBuilder::class)]
final class LifeBuilderNoteTest extends TestCase
{
    public function testHtmlNotizWirdReinerText(): void
    {
        self::assertSame(
            "Fern ihrer Heimat\nFrüher Tilsit",
            LifeBuilder::plainNote('<p><tt>Fern ihrer&nbsp;Heimat</tt></p><p>Fr&uuml;her Tilsit</p>')
        );
    }

    public function testTextOhneHtmlBleibtUnveraendert(): void
    {
        self::assertSame('Geboren in <Salez, St. Gallen> & getauft', LifeBuilder::plainNote(" Geboren in <Salez, St. Gallen> & getauft \n"));
    }

    public function testNurImportkennungIstKeineGeschichte(): void
    {
        self::assertTrue(LifeBuilder::isReferenceOnly('Referenznummer: MH:F500001'));
        self::assertTrue(LifeBuilder::isReferenceOnly("Referenznummer: MH:I1\nReferenznummer: MH:F2"));
        self::assertFalse(LifeBuilder::isReferenceOnly("Referenznummer: MH:F500001\nHeirat in Tilsit"));
        self::assertFalse(LifeBuilder::isReferenceOnly('Trauzeugen laut Urkunde'));
    }
}
