<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Service;

use Fisharebest\Webtrees\Family;
use Fisharebest\Webtrees\I18N;
use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\Module\ModuleLanguageInterface;
use Fisharebest\Webtrees\Registry;
use Fisharebest\Webtrees\Services\ModuleService;
use Fisharebest\Webtrees\Services\RelationshipService;

use function array_key_exists;
use function array_reverse;
use function array_pop;
use function array_shift;
use function count;
use function explode;
use function implode;
use function mb_strtolower;
use function mb_substr;
use function preg_match;
use function preg_replace;
use function str_ends_with;
use function trim;

/**
 * Verwandtschaft einer Person zum Betrachter (dem angemeldeten Benutzer): direkte Linie und deutsche Bezeichnung.
 *
 * Betrachter ist nur die mit dem Konto verknüpfte Person (StartPerson::ownRecord()). Ohne sie (null) gibt es keinen
 * Bezug: jede Bezeichnung ist "", niemand gehört zur direkten Linie.
 *
 * Es werden nur Personen und Familien durchlaufen, die der angemeldete Benutzer sehen darf. Vorfahrenmenge und
 * Breitensuche werden je Objekt (also je Anfrage) einmal berechnet.
 */
class Kinship
{
    /** Höchstens so viele Personenschritte vom Betrachter entfernt wird eine Bezeichnung gesucht. */
    private const int MAX_STEPS = 16;

    /** @var array<string,true>|null Kennungen des Betrachters und aller sichtbaren Vorfahren */
    private array|null $ancestors = null;

    /** @var array<string,array{0:Family,1:Individual}|null>|null Vorgänger je Person auf dem kürzesten Pfad */
    private array|null $predecessors = null;

    /** @var array<string,string> */
    private array $labels = [];

    public function __construct(
        private readonly RelationshipService $relationships,
        private readonly Individual|null $viewer,
    ) {
    }

    /**
     * Ist die Person der Betrachter selbst oder einer seiner Vorfahren (über alle sichtbaren Elternfamilien)?
     */
    public function isDirectLine(Individual $person): bool
    {
        if ($this->viewer === null) {
            return false;
        }

        if ($this->ancestors === null) {
            $this->ancestors = [$this->viewer->xref() => true];
            $queue           = [$this->viewer];

            while ($queue !== []) {
                $individual = array_shift($queue);

                foreach ($individual->childFamilies() as $family) {
                    foreach ([$family->husband(), $family->wife()] as $parent) {
                        if ($parent instanceof Individual && $parent->canShow() && !isset($this->ancestors[$parent->xref()])) {
                            $this->ancestors[$parent->xref()] = true;
                            $queue[]                          = $parent;
                        }
                    }
                }
            }
        }

        return isset($this->ancestors[$person->xref()]);
    }

    /**
     * Deutsche Bezeichnung aus Sicht des Betrachters, z. B. „deine Mutter“, „dein Urgroßvater“.
     * Der Betrachter selbst: „du“. Kein Pfad oder kein Betrachter: "".
     */
    public function label(Individual $person): string
    {
        if ($this->viewer === null) {
            return '';
        }

        $xref = $person->xref();

        if ($xref === $this->viewer->xref()) {
            return 'du';
        }

        if (isset($this->labels[$xref])) {
            return $this->labels[$xref];
        }

        $nodes = $this->path($person);

        if ($nodes === []) {
            return $this->labels[$xref] = '';
        }

        $name = $this->inGerman(fn (): string => $this->relationships->nameFromPath($nodes, $this->germanLanguage()));

        return $this->labels[$xref] = self::possessive($name, $person->sex());
    }

    /**
     * Kürzester Pfad Betrachter → Person als abwechselnde Liste Individual/Family. Leer, wenn keiner gefunden.
     *
     * @return array<Individual|Family>
     */
    private function path(Individual $person): array
    {
        if ($this->predecessors === null) {
            $this->search();
        }

        if (!array_key_exists($person->xref(), $this->predecessors)) {
            return [];
        }

        $nodes = [$person];
        $xref  = $person->xref();

        while ($this->predecessors[$xref] !== null) {
            [$family, $previous] = $this->predecessors[$xref];
            $nodes[]             = $family;
            $nodes[]             = $previous;
            $xref                = $previous->xref();
        }

        return array_reverse($nodes);
    }

    /**
     * Breitensuche vom Betrachter über Eltern-, Ehe- und Kinderfamilien, nur über sichtbare Personen.
     */
    private function search(): void
    {
        $this->predecessors = [$this->viewer->xref() => null];
        $frontier           = [$this->viewer];

        for ($step = 0; $step < self::MAX_STEPS && $frontier !== []; $step++) {
            $next = [];

            foreach ($frontier as $individual) {
                foreach ($individual->childFamilies()->merge($individual->spouseFamilies()) as $family) {
                    $members = [$family->husband(), $family->wife(), ...$family->children()->all()];

                    foreach ($members as $member) {
                        if (
                            $member instanceof Individual &&
                            $member->canShow() &&
                            !array_key_exists($member->xref(), $this->predecessors)
                        ) {
                            $this->predecessors[$member->xref()] = [$family, $individual];
                            $next[]                              = $member;
                        }
                    }
                }
            }

            $frontier = $next;
        }
    }

    /**
     * Deutsche Beziehungsnamen von webtrees aus Sicht des Betrachters, mit Possessivpronomen.
     *
     * Grundform: „Mutter“ → „deine Mutter“, „Großvater mütterlicherseits“ → „dein Großvater mütterlicherseits“.
     * Genitivketten von webtrees („%1$ss %2$s“, vorangestellter Genitiv, das erste Glied bezieht sich auf den
     * Betrachter) werden zu nachgestellten Genitiven: „Urgroßvaters Stiefmutter“ → „Stiefmutter deines Urgroßvaters“,
     * „Großvaters Bruders Sohn“ → „Sohn des Bruders deines Großvaters“, „Neffes Tochter“ → „Tochter deines Neffen“.
     */
    public static function possessive(string $name, string $sex): string
    {
        $name = trim($name);

        if ($name === '' || preg_match('/^dein/u', $name) === 1) {
            return $name;
        }

        $chain = self::chain($name);
        $first = array_shift($chain);

        if ($chain === []) {
            return (self::gender($first, $sex) === 'F' ? 'deine ' : 'dein ') . $first;
        }

        // Letztes Glied im Nominativ, davor die mittleren Glieder mit bestimmtem Artikel, zuletzt das erste mit „dein“.
        $text = array_pop($chain);

        foreach (array_reverse($chain) as $element) {
            $text .= (self::gender($element, '') === 'F' ? ' der ' : ' des ') . self::genitive($element);
        }

        return $text . (self::gender($first, '') === 'F' ? ' deiner ' : ' deines ') . self::genitive($first);
    }

    /**
     * Zerlegt „Großvater mütterlicherseitss Bruders Sohn“ in ["Großvater mütterlicherseits", "Bruder", "Sohn"].
     * Grenze ist ein Wort mit angehängtem Genitiv-s: ohne das s ein Beziehungswort („Bruders“) oder ein Wort, das schon
     * auf s endet („mütterlicherseitss“, „Gradess“). Nach „des“/„der“ steht ein echter Genitiv („Ehefrau des Enkels“).
     *
     * @return non-empty-list<string>
     */
    private static function chain(string $name): array
    {
        $elements = [];
        $current  = [];
        $words    = explode(' ', $name);

        foreach ($words as $index => $word) {
            $last     = $index === count($words) - 1;
            $previous = $current === [] ? '' : $current[count($current) - 1];
            $stem     = mb_substr($word, 0, -1);
            $boundary =
                !$last &&
                str_ends_with($word, 's') &&
                $previous !== 'des' && $previous !== 'der' &&
                (str_ends_with($stem, 's') || self::isNoun($stem));

            if ($boundary) {
                $current[]  = $stem;
                $elements[] = implode(' ', $current);
                $current    = [];
            } else {
                $current[] = $word;
            }
        }

        $elements[] = implode(' ', $current);

        return $elements;
    }

    /** Beziehungswörter (Endungen, klein), an denen sich Kopfwort und Genus erkennen lassen. */
    private const array NOUNS_F = [
        'mutter', 'schwester', 'tochter', 'enkelin', 'nichte', 'tante', 'cousine', 'kusine', 'partnerin', 'frau',
        'schwägerin', 'verlobte',
    ];
    private const array NOUNS_N = ['kind', 'geschwister', 'elternteil'];
    private const array NOUNS_M = [
        'vater', 'bruder', 'sohn', 'enkel', 'neffe', 'onkel', 'cousin', 'partner', 'ehemann', 'ehepartner',
        'schwager', 'verlobter',
    ];

    private static function isNoun(string $word): bool
    {
        return self::nounGender($word) !== '';
    }

    /** "F", "N", "M" oder "" (kein Beziehungswort). */
    private static function nounGender(string $word): string
    {
        $word = mb_strtolower($word);

        foreach (['F' => self::NOUNS_F, 'N' => self::NOUNS_N, 'M' => self::NOUNS_M] as $gender => $nouns) {
            foreach ($nouns as $noun) {
                if (str_ends_with($word, $noun)) {
                    return $gender;
                }
            }
        }

        return '';
    }

    /** Index des Kopfworts eines Glieds (erstes Beziehungswort) oder null. */
    private static function head(string $element): int|null
    {
        foreach (explode(' ', $element) as $index => $word) {
            if (self::isNoun($word)) {
                return $index;
            }
        }

        return null;
    }

    /** Genus des Glieds nach seinem Kopfwort; ohne erkennbares Kopfwort nach dem Geschlecht der Person. */
    private static function gender(string $element, string $sex): string
    {
        $head = self::head($element);

        if ($head !== null) {
            return self::nounGender(explode(' ', $element)[$head]);
        }

        return $sex === 'F' ? 'F' : 'M';
    }

    /**
     * Genitiv eines Glieds: Kopfwort dekliniert, Beifügungen bleiben („Großvater mütterlicherseits“ →
     * „Großvaters mütterlicherseits“). Femininum unverändert; schwache Maskulina auf -e mit -n („Neffe“ → „Neffen“);
     * „Verlobter“ → „Verlobten“; sonst -s („Cousin“ → „Cousins“, „Enkel“ → „Enkels“). Vorangestellte Adjektive auf -en.
     */
    private static function genitive(string $element): string
    {
        $words = explode(' ', $element);
        $head  = self::head($element);

        if ($head === null) {
            return $element;
        }

        $gender = self::nounGender($words[$head]);

        for ($index = 0; $index < $head; $index++) {
            $words[$index] = preg_replace('/e[rs]?$/u', 'en', $words[$index]);
        }

        if ($gender !== 'F') {
            $word = $words[$head];

            if (str_ends_with($word, 'e')) {
                $words[$head] = $word . 'n';
            } elseif (str_ends_with($word, 'Verlobter')) {
                $words[$head] = mb_substr($word, 0, -1) . 'n';
            } else {
                $words[$head] = $word . 's';
            }
        }

        return implode(' ', $words);
    }

    /**
     * Die Beziehungsnamen sind immer deutsch, unabhängig von der Sprache des Benutzers. Das deutsche Sprachmodul hat
     * keine eigenen Beziehungsregeln, webtrees nutzt dann den Übersetzungskatalog: dafür muss I18N deutsch sein.
     *
     * @param callable():string $callback
     */
    private function inGerman(callable $callback): string
    {
        $previous = I18N::languageTag();

        if ($previous === 'de') {
            return $callback();
        }

        I18N::init('de');

        try {
            return $callback();
        } finally {
            I18N::init($previous);
        }
    }

    private function germanLanguage(): ModuleLanguageInterface
    {
        return Registry::container()->get(ModuleService::class)
            ->findByInterface(ModuleLanguageInterface::class, true)
            ->first(static fn (ModuleLanguageInterface $language): bool => $language->locale()->languageTag() === 'de')
            ?? I18N::language();
    }
}
