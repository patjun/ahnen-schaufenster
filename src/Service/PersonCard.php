<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Service;

use Fisharebest\Webtrees\Date;
use Fisharebest\Webtrees\Fact;
use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\Media;
use Fisharebest\Webtrees\MediaFile;
use Fisharebest\Webtrees\Place;

use function html_entity_decode;
use function in_array;
use function strtolower;
use function strip_tags;
use function trim;

/**
 * Die Daten einer Person für ein Fenster: nur, was webtrees dem angemeldeten Benutzer zeigt.
 */
class PersonCard
{
    /** Medientypen (GEDCOM SOURCE_MEDIA_TYPE), die ein Bild der Person sein können: Foto und Gemälde. */
    public const array PORTRAIT_TYPES = ['photo', 'painting'];

    /**
     * Verborgene oder fehlende Personen: nur {xref, visible:false}, sonst nichts (kein Name, keine Daten, kein Bild).
     *
     * @return array<string,mixed>
     */
    public static function make(Individual|null $person, Kinship $kinship): array
    {
        if (!$person instanceof Individual || !$person->canShow()) {
            return ['xref' => $person?->xref(), 'visible' => false];
        }

        $card = ['xref' => $person->xref(), 'visible' => true];

        if ($person->canShowName()) {
            $card['name'] = self::text($person->fullName());
        }

        $sex = $person->sex();

        $card['sex']        = $sex === 'M' || $sex === 'F' ? $sex : 'U';
        $card['birth']      = self::event($person->getBirthDate(), $person->getBirthPlace());
        $card['death']      = self::event($person->getDeathDate(), $person->getDeathPlace());
        $card['image']      = self::image(self::portrait($person));
        $card['relation']   = $kinship->label($person);
        $card['directLine'] = $kinship->isDirectLine($person);

        return $card;
    }

    /**
     * Datum und Ort als reiner Text; null, wenn beides unbekannt ist.
     *
     * @return array{date:string|null,place:string|null}|null
     */
    public static function event(Date $date, Place $place): array|null
    {
        $date_text  = $date->isOK() ? self::text($date->display()) : null;
        $place_text = $place->gedcomName() !== '' ? self::text($place->placeName()) : null;

        if ($date_text === null && $place_text === null) {
            return null;
        }

        return ['date' => $date_text, 'place' => $place_text];
    }

    /**
     * Das Bild im Fenster: das erste Foto oder Gemälde, das direkt an der Person hängt (GEDCOM `1 OBJE`), in der
     * Reihenfolge, die in webtrees unter „Medien sortieren“ festgelegt ist. Bilder an Ereignissen (`2 OBJE`, z. B. die
     * Taufkirche) und Medien anderer Typen oder ohne Typ (Urkunden, Adressbücher, Scans) kommen nie ins Fenster.
     */
    public static function portrait(Individual $person): MediaFile|null
    {
        foreach ($person->facts(['OBJE']) as $fact) {
            $media = $fact instanceof Fact ? $fact->target() : null;

            if (!$media instanceof Media || !$media->canShow()) {
                continue;
            }

            foreach ($media->mediaFiles() as $file) {
                if ($file->isImage() && !$file->isExternal() && self::isPortraitType($file->type())) {
                    return $file;
                }
            }
        }

        return null;
    }

    /**
     * Foto oder Gemälde? Groß-/Kleinschreibung egal (Importe schreiben z. B. `PHOTO`).
     */
    public static function isPortraitType(string $type): bool
    {
        return in_array(strtolower(trim($type)), self::PORTRAIT_TYPES, true);
    }

    /**
     * Hauptbild über die Vorschau-Route von webtrees (die prüft die Medienrechte ein zweites Mal).
     *
     * @return array{thumb:string,full:string}|null
     */
    private static function image(MediaFile|null $file): array|null
    {
        if (!$file instanceof MediaFile || !$file->isImage() || $file->isExternal() || !$file->media()->canShow()) {
            return null;
        }

        return [
            'thumb' => $file->imageUrl(240, 300, 'crop'),
            'full'  => $file->imageUrl(1200, 1200, 'contain'),
        ];
    }

    /**
     * webtrees liefert Namen, Daten und Orte als HTML; das Schaufenster bekommt reinen Text.
     */
    public static function text(string $html): string
    {
        return trim(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }
}
