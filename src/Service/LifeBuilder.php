<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Service;

use Fisharebest\Webtrees\Fact;
use Fisharebest\Webtrees\Family;
use Fisharebest\Webtrees\Gedcom;
use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\Media;
use Fisharebest\Webtrees\MediaFile;
use Fisharebest\Webtrees\Note;
use Fisharebest\Webtrees\Registry;
use Fisharebest\Webtrees\Services\IndividualFactsService;
use Fisharebest\Webtrees\Source;
use Fisharebest\Webtrees\Tree;
use Illuminate\Support\Collection;

use function array_filter;
use function array_unique;
use function array_values;
use function basename;
use function explode;
use function html_entity_decode;
use function in_array;
use function pathinfo;
use function preg_match;
use function preg_match_all;
use function preg_replace;
use function str_ends_with;
use function str_replace;
use function strip_tags;
use function trim;
use function usort;

/**
 * Der Lebensweg einer Person: eine Diaschau aus allem, was webtrees über sie zeigt (eigene Fakten, Fakten ihrer Ehen,
 * Ereignisse naher Verwandter), dazu die Kartenroute. Es erscheint nur, was der angemeldete Benutzer sehen darf.
 */
class LifeBuilder
{
    /** Fakten, die kein eigenes Dia bekommen (Verwaltungsdaten, Verweise; Medien/Notizen/Quellen hängen an Dias). */
    private const array SKIPPED_TAGS = [
        'NAME', 'SEX', 'FAMS', 'FAMC', 'CHAN', 'CREA', '_UID', 'UID', '_FSFTID', 'REFN', 'RIN', 'RFN', 'AFN',
        'OBJE', 'NOTE', 'SOUR', 'RESN', 'SUBM', 'ALIA', 'ASSO', '_ASSO', '_TODO', '_WT_OBJE_SORT',
        'CHIL', 'HUSB', 'WIFE',
    ];

    /** Werte, die nichts erzählen (Ereignis-Merker, Platzhalter der Verwandten-Ereignisse von webtrees). */
    private const array EMPTY_VALUES = ['', 'Y', 'CLOSE_RELATIVE'];

    public const string TITLE_MEDIA = 'Bilder und Dokumente';
    public const string TITLE_NOTES = 'Geschichte';
    public const string TITLE_SOURCES = 'Quellen';

    public function __construct(private readonly IndividualFactsService $facts_service)
    {
    }

    /**
     * @return array{person:array<string,mixed>,slides:list<array<string,mixed>>,route:list<array<string,mixed>>}
     */
    public function forPerson(Individual $person, Kinship $kinship): array
    {
        $own = $this->facts_service->individualFacts($person, new Collection())
            ->merge($this->facts_service->familyFacts($person, new Collection()));
        $relatives = $this->facts_service->relativeFacts($person);

        $slides     = [];
        $seen_ids   = [];
        $fact_media = [];

        foreach ([[$own, true], [$relatives, false]] as [$facts, $is_own]) {
            foreach (Fact::sortFacts($facts) as $fact) {
                if (!$this->showable($fact) || isset($seen_ids[$fact->id()])) {
                    continue;
                }

                $seen_ids[$fact->id()] = true;
                $slide                 = $this->slide($fact, $is_own, $person, $kinship);
                $slides[]              = $slide;

                foreach ($slide['media'] as $item) {
                    $fact_media[$item['xref']] = true;
                }
            }
        }

        $slides = self::sortSlides($slides);

        // Eigene Ehen: nur sichtbare Familien (webtrees' Datenschutz für Familien und deren Mitglieder).
        $families = $person->spouseFamilies()->filter(static fn (Family $family): bool => $family->canShow());

        $media = $this->recordMedia([$person, ...$families->all()], $fact_media);
        if ($media !== []) {
            $slides[] = $this->undatedSlide('bilder-und-dokumente', self::TITLE_MEDIA, media: $media);
        }

        // „Geschichte“: Notizen der Person und ihrer Ehen, dazu die Quellen am Personendatensatz (zugeklappt).
        // Ohne Notizen heißt das Dia „Quellen“.
        $tree  = $person->tree();
        $notes = $this->notes($person->facts(['NOTE']), $tree);
        foreach ($families as $family) {
            $notes = [...$notes, ...$this->notes($family->facts(['NOTE']), $tree)];
        }
        $sources = $this->recordSources($person);

        if ($notes !== [] || $sources !== []) {
            $slides[] = $notes !== []
                ? $this->undatedSlide('geschichte', self::TITLE_NOTES, notes: $notes, sources: $sources)
                : $this->undatedSlide('quellen', self::TITLE_SOURCES, sources: $sources);
        }

        // Die Medienkennung war nur für das Zusammenführen da.
        foreach ($slides as $index => $slide) {
            foreach ($slide['media'] as $m => $item) {
                unset($slides[$index]['media'][$m]['xref']);
            }
        }

        return [
            'person' => PersonCard::make($person, $kinship),
            'slides' => $slides,
            'route'  => self::route($slides),
        ];
    }

    /**
     * Aufsteigend nach sortKey; gleiche Schlüssel behalten ihre Eingabereihenfolge, Dias ohne Schlüssel (null) ans Ende.
     *
     * @param list<array<string,mixed>> $slides
     *
     * @return list<array<string,mixed>>
     */
    public static function sortSlides(array $slides): array
    {
        $indexed = [];
        foreach (array_values($slides) as $position => $slide) {
            $indexed[] = [$position, $slide];
        }

        usort($indexed, static function (array $a, array $b): int {
            $key_a = $a[1]['sortKey'] ?? null;
            $key_b = $b[1]['sortKey'] ?? null;

            if ($key_a === null || $key_b === null) {
                return ($key_a === null) <=> ($key_b === null) ?: $a[0] <=> $b[0];
            }

            return $key_a <=> $key_b ?: $a[0] <=> $b[0];
        });

        $sorted = [];
        foreach ($indexed as [, $slide]) {
            $sorted[] = $slide;
        }

        return $sorted;
    }

    /**
     * Kartenroute: die Punkte der eigenen Dias in Dia-Reihenfolge, direkt aufeinanderfolgende gleiche Punkte nur einmal.
     *
     * @param list<array<string,mixed>> $slides
     *
     * @return list<array{lat:float,lng:float,place:string|null,slideId:string}>
     */
    public static function route(array $slides): array
    {
        $route = [];
        $last  = null;

        foreach ($slides as $slide) {
            $point = $slide['point'] ?? null;

            if (($slide['own'] ?? false) !== true || $point === null) {
                continue;
            }

            if ($last !== null && $last['lat'] === $point['lat'] && $last['lng'] === $point['lng']) {
                continue;
            }

            $route[] = [
                'lat'     => $point['lat'],
                'lng'     => $point['lng'],
                'place'   => $slide['place'] ?? null,
                'slideId' => $slide['id'],
            ];
            $last    = $point;
        }

        return $route;
    }

    /**
     * Ein Fakt wird nur gezeigt, wenn webtrees ihn selbst zeigen würde: Fakt und zugehöriger Datensatz sichtbar.
     */
    private function showable(Fact $fact): bool
    {
        $tag = explode(':', $fact->tag())[1] ?? $fact->tag();

        return
            !in_array($tag, self::SKIPPED_TAGS, true) &&
            $fact->canShow() &&
            $fact->record()->canShow();
    }

    /**
     * @return array<string,mixed>
     */
    private function slide(Fact $fact, bool $own, Individual $person, Kinship $kinship): array
    {
        $date      = $fact->date();
        $place     = $fact->place();
        $latitude  = $fact->latitude();
        $longitude = $fact->longitude();
        $tree      = $fact->record()->tree();

        return [
            'id'      => $fact->id(),
            'sortKey' => $date->isOK() ? $date->julianDay() : null,
            'date'    => $date->isOK() ? PersonCard::text($date->display()) : '',
            'title'   => PersonCard::text($fact->label()),
            'own'     => $own,
            'text'    => $this->text($fact),
            'place'   => $place->gedcomName() !== '' ? PersonCard::text($place->fullName()) : null,
            'point'   => $latitude !== null && $longitude !== null ? ['lat' => $latitude, 'lng' => $longitude] : null,
            'persons' => $this->persons($fact, $person, $kinship),
            'media'   => $this->media($this->linkedXrefs($fact->gedcom(), 'OBJE'), $tree),
            'notes'   => $this->subNotes($fact->gedcom(), $tree),
            'sources' => $this->sources($fact->gedcom(), $tree),
        ];
    }

    /**
     * @param list<string>                          $notes
     * @param list<array<string,string|null>>       $media
     * @param list<string>                          $sources
     *
     * @return array<string,mixed>
     */
    private function undatedSlide(string $id, string $title, array $media = [], array $notes = [], array $sources = []): array
    {
        return [
            'id'      => $id,
            'sortKey' => null,
            'date'    => '',
            'title'   => $title,
            'own'     => true,
            'text'    => '',
            'place'   => null,
            'point'   => null,
            'persons' => [],
            'media'   => $media,
            'notes'   => $notes,
            'sources' => $sources,
        ];
    }

    /**
     * Der Wert des Fakts, wenn er etwas erzählt (Beruf, Titel, Religion …); beim Wohnort ersatzweise die Anschrift.
     */
    private function text(Fact $fact): string
    {
        $value = trim($fact->value());

        if (in_array($value, self::EMPTY_VALUES, true) || preg_match('/^@' . Gedcom::REGEX_XREF . '@$/', $value) === 1) {
            $value = '';
        }

        if ($value === '' && str_ends_with($fact->tag(), ':RESI')) {
            $value = trim($fact->attribute('ADDR'));
        }

        return $value;
    }

    /**
     * Die im Ereignis genannten Personen außer der Person selbst: der Verwandte (Verwandten-Ereignis) oder die Ehepartner
     * (Ereignis einer Familie). Nur sichtbare Personen, verborgene fehlen ganz.
     *
     * @return list<array{xref:string,name:string,relation:string,directLine:bool}>
     */
    private function persons(Fact $fact, Individual $person, Kinship $kinship): array
    {
        $record = $fact->record();

        if ($record instanceof Individual) {
            $candidates = [$record];
        } elseif ($record instanceof Family) {
            $candidates = [$record->husband(), $record->wife()];
        } else {
            $candidates = [];
        }

        $persons = [];

        foreach ($candidates as $candidate) {
            if (
                !$candidate instanceof Individual ||
                $candidate->xref() === $person->xref() ||
                !$candidate->canShow() ||
                !$candidate->canShowName()
            ) {
                continue;
            }

            $persons[] = [
                'xref'       => $candidate->xref(),
                'name'       => PersonCard::text($candidate->fullName()),
                'relation'   => $kinship->label($candidate),
                'directLine' => $kinship->isDirectLine($candidate),
            ];
        }

        return $persons;
    }

    /**
     * Kennungen der verknüpften Datensätze auf Ebene 2, z. B. "2 OBJE @M1@".
     *
     * @return list<string>
     */
    private function linkedXrefs(string $gedcom, string $tag): array
    {
        preg_match_all('/\n2 ' . $tag . ' @(' . Gedcom::REGEX_XREF . ')@/', $gedcom, $matches);

        return array_values(array_unique($matches[1]));
    }

    /**
     * Sichtbare Medien als Bild (Vorschau-Route), PDF (Download-Route, inline) oder Verweis (externe Adresse, andere Dateien).
     *
     * @param list<string> $xrefs
     *
     * @return list<array{xref:string,kind:string,thumb:string|null,url:string,title:string}>
     */
    private function media(array $xrefs, Tree $tree): array
    {
        $items = [];

        foreach ($xrefs as $xref) {
            $media = Registry::mediaFactory()->make($xref, $tree);

            if (!$media instanceof Media || !$media->canShow()) {
                continue;
            }

            foreach ($media->mediaFiles() as $file) {
                $item = $this->mediaItem($file);

                if ($item !== null) {
                    $items[] = $item;
                }
            }
        }

        return $items;
    }

    /**
     * @return array{xref:string,kind:string,thumb:string|null,url:string,title:string}|null
     */
    private function mediaItem(MediaFile $file): array|null
    {
        // Erster brauchbarer Titel; Dateinamen („45209_srep100^048603-00016_01_Tod“) sind keine Titel.
        $title = '';
        foreach ([trim($file->title()), PersonCard::text($file->media()->fullName())] as $candidate) {
            if ($candidate !== '' && !self::looksLikeFilename($candidate, $file->filename())) {
                $title = $candidate;
                break;
            }
        }

        if ($file->isExternal()) {
            // Nur echte Webadressen weitergeben (kein javascript: o. Ä. als Verweisziel).
            if (preg_match('#^https?://#i', $file->filename()) !== 1) {
                return null;
            }

            return ['xref' => $file->media()->xref(), 'kind' => 'link', 'thumb' => null, 'url' => $file->filename(), 'title' => $title];
        }

        if ($file->isImage()) {
            return [
                'xref'  => $file->media()->xref(),
                'kind'  => 'image',
                'thumb' => $file->imageUrl(320, 320, 'contain'),
                'url'   => $file->imageUrl(1600, 1600, 'contain'),
                'title' => $title,
            ];
        }

        return [
            'xref'  => $file->media()->xref(),
            'kind'  => $file->mimeType() === 'application/pdf' ? 'pdf' : 'link',
            'thumb' => null,
            'url'   => $file->downloadUrl('inline'),
            'title' => $title,
        ];
    }

    /**
     * Medien am Personendatensatz und an den eigenen Ehen ("1 OBJE"), die noch an keinem Dia hängen.
     * Nur sichtbare Verknüpfungen (Fact::canShow über facts()) und sichtbare Medien (media()).
     *
     * @param list<Individual|Family> $records
     * @param array<string,true>      $already_shown
     *
     * @return list<array<string,string|null>>
     */
    private function recordMedia(array $records, array $already_shown): array
    {
        $xrefs = [];
        $tree  = null;

        foreach ($records as $record) {
            $tree ??= $record->tree();

            foreach ($record->facts(['OBJE']) as $fact) {
                $target = $fact->target();

                // Kennungen als Liste, nicht als Schlüssel: rein numerische Kennungen würden sonst zu int.
                if ($target instanceof Media && !isset($already_shown[$target->xref()]) && !in_array($target->xref(), $xrefs, true)) {
                    $xrefs[] = $target->xref();
                }
            }
        }

        return $tree === null ? [] : $this->media($xrefs, $tree);
    }

    /**
     * Quellen am Personendatensatz ("1 SOUR"), gleiche Zitate nur einmal. Nur sichtbare Zitate und Quellen.
     *
     * @return list<string>
     */
    private function recordSources(Individual $person): array
    {
        $sources = [];

        foreach ($person->facts(['SOUR']) as $fact) {
            $text = $this->citation($fact->value(), $fact->attribute('PAGE'), $person->tree());

            if ($text !== '' && !in_array($text, $sources, true)) {
                $sources[] = $text;
            }
        }

        return $sources;
    }

    /**
     * Notizen auf Ebene 2 eines Fakts: eingebettet ("2 NOTE Text" mit "3 CONT") oder gemeinsam ("2 NOTE @N1@", nur sichtbare).
     *
     * @return list<string>
     */
    private function subNotes(string $gedcom, Tree $tree): array
    {
        preg_match_all('/\n2 NOTE ?(.*(?:\n3 CONT ?.*)*)/', $gedcom, $matches);

        $notes = [];
        foreach ($matches[1] as $value) {
            $notes[] = $this->noteText(preg_replace('/\n3 CONT ?/', "\n", $value), $tree);
        }

        return array_values(array_filter($notes, static fn (string $note): bool => $note !== ''));
    }

    /**
     * Notizen am Personendatensatz ("1 NOTE").
     *
     * @param Collection<int,Fact> $facts
     *
     * @return list<string>
     */
    private function notes(Collection $facts, Tree $tree): array
    {
        $notes = [];
        foreach ($facts as $fact) {
            $notes[] = $this->noteText($fact->value(), $tree);
        }

        return array_values(array_filter($notes, static fn (string $note): bool => $note !== ''));
    }

    private function noteText(string $value, Tree $tree): string
    {
        if (preg_match('/^@(' . Gedcom::REGEX_XREF . ')@$/', trim($value), $match) === 1) {
            $note = Registry::noteFactory()->make($match[1], $tree);
            $text = $note instanceof Note && $note->canShow() ? self::plainNote($note->getNote()) : '';
        } else {
            $text = self::plainNote($value);
        }

        return self::isReferenceOnly($text) ? '' : $text;
    }

    /**
     * Notizen, die nur aus Importkennungen bestehen („Referenznummer: MH:F500001“, aus dem MyHeritage-Import an fast
     * allen Familien), erzählen nichts und werden nicht gezeigt.
     */
    public static function isReferenceOnly(string $note): bool
    {
        return preg_match('/^(?:\s*Referenznummer:\s*\S+\s*)+$/u', $note) === 1;
    }

    /**
     * Sieht ein Medientitel wie ein Dateiname aus? Dann wird er nicht gezeigt. Ja, wenn er dem Dateinamen (mit oder ohne
     * Endung) gleicht oder kein Leerzeichen enthält und dafür „_“, „^“ oder eine Dateiendung („.jpg“, „.pdf“).
     */
    public static function looksLikeFilename(string $title, string $filename = ''): bool
    {
        $title = trim($title);

        if ($title === '') {
            return false;
        }

        if ($filename !== '') {
            $base = basename(str_replace('\\', '/', $filename));

            if ($title === $base || $title === pathinfo($base, PATHINFO_FILENAME)) {
                return true;
            }
        }

        return
            preg_match('/\s/u', $title) !== 1 &&
            preg_match('/[_^]|\.[A-Za-z][A-Za-z0-9]{1,4}$/u', $title) === 1;
    }

    /**
     * Notizen aus dem MacFamilyTree-Import enthalten teils HTML ("<p>…&nbsp;…</p>"). Das Schaufenster bekommt reinen Text:
     * Absätze und Zeilenumbrüche werden zu Zeilenumbrüchen, Auszeichnung entfällt. Notizen ohne HTML bleiben unverändert
     * (ein "<" im Text, etwa "<Salez", wird nicht als Auszeichnung behandelt).
     */
    public static function plainNote(string $note): string
    {
        if (preg_match('/<\/?(?:p|br|div|span|tt|b|i|u|em|strong|font|a|li|ul|ol|h[1-6]|table|tr|td|th|sup|sub|blockquote|pre)\b[^>]*>|&(?:[a-z]+|#[0-9]+);/i', $note) === 1) {
            $note = preg_replace('/<br\s*\/?>|<\/(?:p|div|li|h[1-6])>/i', "\n", $note);
            $note = html_entity_decode(strip_tags($note), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $note = str_replace("\u{a0}", ' ', $note);
            $note = preg_replace("/[ \t]+\n/", "\n", $note);
            $note = preg_replace("/\n{3,}/", "\n\n", $note);
        }

        return trim($note);
    }

    /**
     * Quellen auf Ebene 2 eines Fakts als Text: Titel der (sichtbaren) Quelle, dahinter die Fundstelle (PAGE).
     *
     * @return list<string>
     */
    private function sources(string $gedcom, Tree $tree): array
    {
        preg_match_all('/\n2 SOUR ?(.*)((?:\n[3-9] .*)*)/', $gedcom, $matches, PREG_SET_ORDER);

        $sources = [];

        foreach ($matches as [, $value, $details]) {
            $page = preg_match('/\n3 PAGE (.*)/', $details, $match) === 1 ? $match[1] : '';
            $text = $this->citation($value, $page, $tree);

            if ($text !== '') {
                $sources[] = $text;
            }
        }

        return $sources;
    }

    /**
     * Ein Quellenzitat als Text: Titel der Quelle (nur sichtbare; verborgene ergeben ""), dahinter die Fundstelle.
     */
    private function citation(string $value, string $page, Tree $tree): string
    {
        $value = trim($value);
        $page  = trim($page);

        if (preg_match('/^@(' . Gedcom::REGEX_XREF . ')@$/', $value, $match) === 1) {
            $source = Registry::sourceFactory()->make($match[1], $tree);

            if (!$source instanceof Source || !$source->canShow()) {
                return '';
            }

            $text = PersonCard::text($source->fullName());
        } else {
            $text = $value;
        }

        if ($page !== '') {
            $text = $text === '' ? $page : $text . ', ' . $page;
        }

        return $text;
    }
}
