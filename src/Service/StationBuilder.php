<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Service;

use Fisharebest\Webtrees\Elements\PedigreeLinkageType;
use Fisharebest\Webtrees\Fact;
use Fisharebest\Webtrees\Family;
use Fisharebest\Webtrees\Individual;

use function strtoupper;

/**
 * Eine Station der Straße: das Elternpaar eines Kindes mit Scheiben (weitere Ehen) und Seitengasse (Geschwister).
 */
class StationBuilder
{
    /** Bezeichnungen der Elternfamilien nach Pedigree (GEDCOM PEDI). */
    private const array PEDIGREE_LABELS = [
        PedigreeLinkageType::VALUE_BIRTH   => 'Leibliche Eltern',
        PedigreeLinkageType::VALUE_ADOPTED => 'Adoptiveltern',
        PedigreeLinkageType::VALUE_FOSTER  => 'Pflegeeltern',
        PedigreeLinkageType::VALUE_SEALING => 'Siegelungseltern',
        PedigreeLinkageType::VALUE_RADA    => 'Milcheltern',
    ];

    /**
     * Die Station der Eltern von $child. Ist $family_xref eine sichtbare Elternfamilie des Kindes, wird sie genommen,
     * sonst die erste leibliche (PEDI birth oder ohne PEDI). Kein sichtbarer Elternteil: null – ob dahinter verborgene
     * Eltern stehen oder gar keine, sagt hasParentLink().
     *
     * @return array<string,mixed>|null
     */
    public function forChild(Individual $child, Kinship $kinship, string|null $family_xref = null): array|null
    {
        $families = $child->childFamilies();

        if ($families->isEmpty()) {
            return null;
        }

        $family = $families->first(static fn (Family $family): bool => $family->xref() === $family_xref)
            ?? $families->first(fn (Family $family): bool => $this->pedigree($child, $family) === PedigreeLinkageType::VALUE_BIRTH)
            ?? $families->first();

        $father = $family->husband();
        $mother = $family->wife();

        if (!$this->visible($father) && !$this->visible($mother)) {
            return null;
        }

        $siblings = [];

        foreach ($family->children() as $sibling) {
            if ($sibling->xref() !== $child->xref()) {
                $siblings[$sibling->xref()] = PersonCard::make($sibling, $kinship) + ['half' => false];
            }
        }

        $father_marriages = $this->otherMarriages($father, $family, $kinship, $child, $siblings);
        $mother_marriages = $this->otherMarriages($mother, $family, $kinship, $child, $siblings);

        $alternatives = [];

        foreach ($families as $other) {
            if ($other !== $family) {
                $alternatives[] = [
                    'family' => $other->xref(),
                    'label'  => self::PEDIGREE_LABELS[$this->pedigree($child, $other)] ?? 'Eltern',
                ];
            }
        }

        return [
            'family'               => $family->xref(),
            'father'               => $father instanceof Individual ? PersonCard::make($father, $kinship) : null,
            'mother'               => $mother instanceof Individual ? PersonCard::make($mother, $kinship) : null,
            'marriage'             => $this->marriage($family),
            'fatherOtherMarriages' => $father_marriages,
            'motherOtherMarriages' => $mother_marriages,
            'siblings'             => array_values($siblings),
            'alternatives'         => $alternatives,
        ];
    }

    /**
     * Weitere Ehen eines (sichtbaren) Elternteils als Scheiben; deren Kinder kommen als Halbgeschwister in die Gasse.
     *
     * @param array<string,array<string,mixed>> $siblings
     *
     * @return list<array<string,mixed>>
     */
    private function otherMarriages(Individual|null $parent, Family $family, Kinship $kinship, Individual $child, array &$siblings): array
    {
        if (!$this->visible($parent)) {
            return [];
        }

        $marriages = [];

        foreach ($parent->spouseFamilies() as $other) {
            if ($other === $family) {
                continue;
            }

            $spouse = $other->spouse($parent);

            $marriages[] = [
                'family'   => $other->xref(),
                'spouse'   => $spouse instanceof Individual ? PersonCard::make($spouse, $kinship) : null,
                'marriage' => $this->marriage($other),
            ];

            foreach ($other->children() as $half) {
                if ($half->xref() !== $child->xref() && !isset($siblings[$half->xref()])) {
                    $siblings[$half->xref()] = PersonCard::make($half, $kinship) + ['half' => true];
                }
            }
        }

        return $marriages;
    }

    /**
     * @return array{date:string|null,place:string|null}|null
     */
    private function marriage(Family $family): array|null
    {
        $fact = $family->facts(['MARR'])->first();

        return $fact instanceof Fact ? PersonCard::event($fact->date(), $fact->place()) : null;
    }

    /**
     * Pedigree der Verbindung Kind → Familie; ohne Angabe gilt sie als leiblich.
     */
    private function pedigree(Individual $child, Family $family): string
    {
        $fact = $child->facts(['FAMC'])->first(static fn (Fact $fact): bool => $fact->target() === $family);
        $pedi = $fact instanceof Fact ? strtoupper($fact->attribute('PEDI')) : '';

        return $pedi === '' ? PedigreeLinkageType::VALUE_BIRTH : $pedi;
    }

    /**
     * Hat das Kind eine (für den Benutzer sichtbare) Verknüpfung zu einer bestehenden Elternfamilie?
     * Liefert forChild() null, obwohl das zutrifft, sind die Eltern verborgen – nicht unbekannt.
     */
    public function hasParentLink(Individual $child): bool
    {
        return $child->facts(['FAMC'])->contains(static fn (Fact $fact): bool => $fact->target() instanceof Family);
    }

    private function visible(Individual|null $person): bool
    {
        return $person instanceof Individual && $person->canShow();
    }
}
