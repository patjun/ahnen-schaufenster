<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Service;

use Fisharebest\Webtrees\Contracts\UserInterface;
use Fisharebest\Webtrees\DB;
use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\Registry;
use Fisharebest\Webtrees\Tree;

/**
 * Wählt die Person, bei der der Schaufensterbummel beginnt.
 *
 * Bewusst NICHT Tree::significantIndividual(): das bevorzugt die Standardperson vor dem eigenen Datensatz des Benutzers.
 */
class StartPerson
{
    /**
     * Reihenfolge: mit dem Konto verknüpfte Person, Standardperson des Baums, erste sichtbare Person des Baums.
     * Es werden nur Personen geliefert, die der Benutzer sehen darf (canShow). Ist keine sichtbar: null.
     */
    public function forUser(Tree $tree, UserInterface $user): Individual|null
    {
        $person = $this->ownRecord($tree, $user);

        if ($person instanceof Individual) {
            return $person;
        }

        $person = $this->visible($tree, $tree->getPreference('PEDIGREE_ROOT_ID'));

        if ($person instanceof Individual) {
            return $person;
        }

        return $this->firstVisible($tree);
    }

    /**
     * Die mit dem Konto verknüpfte Person („Persönlicher Datensatz“, gedcomid), wenn der Benutzer sie sehen darf; sonst null.
     *
     * Nur diese Person ist der Betrachter, auf den sich Verwandtschaft („deine Mutter“, „das bist du“) und direkte Linie
     * beziehen. Beginnt die Straße bei einer Ersatzperson (Standardperson, erste sichtbare Person), gibt es keinen
     * Betrachter: keine Verwandtschaftsnamen, keine direkte Linie.
     */
    public function ownRecord(Tree $tree, UserInterface $user): Individual|null
    {
        return $this->visible($tree, $tree->getUserPreference($user, UserInterface::PREF_TREE_ACCOUNT_XREF));
    }

    private function visible(Tree $tree, string $xref): Individual|null
    {
        if ($xref === '') {
            return null;
        }

        $person = Registry::individualFactory()->make($xref, $tree);

        return $person instanceof Individual && $person->canShow() ? $person : null;
    }

    /**
     * Die erste sichtbare Person in XREF-Reihenfolge.
     *
     * Einzige lesende Abfrage im Modul: webtrees bietet keine Liste aller XREFs; wie Tree::significantIndividual()
     * nehmen wir die Kennungen der Personentabelle und prüfen jede über die webtrees-Objekte auf Sichtbarkeit.
     */
    private function firstVisible(Tree $tree): Individual|null
    {
        $xrefs = DB::table('individuals')
            ->where('i_file', '=', $tree->id())
            ->orderBy('i_id')
            ->pluck('i_id');

        foreach ($xrefs as $xref) {
            $person = $this->visible($tree, (string) $xref);

            if ($person instanceof Individual) {
                return $person;
            }
        }

        return null;
    }
}
