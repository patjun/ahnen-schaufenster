<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Http;

use Fig\Http\Message\StatusCodeInterface;
use Fisharebest\Webtrees\Auth;
use Fisharebest\Webtrees\Factories\ElementFactory;
use Fisharebest\Webtrees\Gedcom;
use Fisharebest\Webtrees\I18N;
use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\Registry;
use Fisharebest\Webtrees\Services\RelationshipService;
use Fisharebest\Webtrees\Tree;
use Fisharebest\Webtrees\Validator;
use Jungbluth\AhnenSchaufenster\Service\Kinship;
use Jungbluth\AhnenSchaufenster\Service\LifeBuilder;
use Jungbluth\AhnenSchaufenster\Service\StartPerson;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * GET /tree/tree1/schaufenster/api/leben/{xref} → {person, slides, route} bzw. {person:null, hidden:true}
 *
 * Der Lebensweg einer Person als Diaschau mit Kartenroute. Verwandtschaft und direkte Linie der genannten Personen
 * beziehen sich immer auf die mit dem Konto verknüpfte Person (ohne sie: leer bzw. false).
 */
class LifeApi implements RequestHandlerInterface
{
    public function __construct(
        private readonly StartPerson $start_person,
        private readonly LifeBuilder $life_builder,
        private readonly RelationshipService $relationship_service,
        private readonly Gedcom $gedcom,
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        if (!Auth::check()) {
            return $this->json(['error' => 'anmeldung'], StatusCodeInterface::STATUS_UNAUTHORIZED);
        }

        $tree = Validator::attributes($request)->treeOptional();

        if (!$tree instanceof Tree) {
            return $this->json(['error' => 'kein-zugang'], StatusCodeInterface::STATUS_FORBIDDEN);
        }

        $user = Validator::attributes($request)->user();

        if (!$this->start_person->forUser($tree, $user) instanceof Individual) {
            return $this->json(['error' => 'keine-person'], StatusCodeInterface::STATUS_FORBIDDEN);
        }

        // Bezug nur auf die eigene, verknüpfte Person; ohne sie (Ersatz-Startperson) keine Verwandtschaft, keine direkte Linie.
        $viewer = $this->start_person->ownRecord($tree, $user);
        $xref   = Validator::attributes($request)->isXref()->string('xref', '');
        $person = $xref === '' ? null : Registry::individualFactory()->make($xref, $tree);

        // Unbekannt oder verborgen: dieselbe Antwort, damit nichts über die Existenz verraten wird.
        if (!$person instanceof Individual || !$person->canShow()) {
            return $this->json(['person' => null, 'hidden' => true]);
        }

        $life = $this->inGerman(
            fn (): array => $this->life_builder->forPerson($person, new Kinship($this->relationship_service, $viewer))
        );

        return $this->json($life);
    }

    /**
     * Deutsch für Daten, Fakt-Bezeichnungen („Geburt“, „Geburt einer Tochter“) und Beziehungsnamen, unabhängig von der
     * Kontosprache. Die Bezeichnungen der GEDCOM-Elemente übersetzt webtrees beim Registrieren (Middleware
     * RegisterGedcomTags, in der Sprache des Benutzers); deshalb gilt für die Dauer des Aufbaus eine frisch auf Deutsch
     * registrierte Element-Fabrik. Sprache und Fabrik werden danach wiederhergestellt.
     *
     * @param callable():array<string,mixed> $callback
     *
     * @return array<string,mixed>
     */
    private function inGerman(callable $callback): array
    {
        $previous_language = I18N::languageTag();

        if ($previous_language === 'de') {
            return $callback();
        }

        $previous_factory = Registry::elementFactory();
        I18N::init('de');

        try {
            $german_factory = new ElementFactory();
            $this->gedcom->registerTags($german_factory, true);
            Registry::elementFactory($german_factory);

            return $callback();
        } finally {
            Registry::elementFactory($previous_factory);
            I18N::init($previous_language);
        }
    }

    /**
     * @param array<string,mixed> $data
     */
    private function json(array $data, int $status = StatusCodeInterface::STATUS_OK): ResponseInterface
    {
        // JSON_UNESCAPED_UNICODE (durch webtrees): Namen erscheinen im Klartext, nicht als \u-Folgen.
        return Registry::responseFactory()->response($data, $status, [
            'cache-control' => 'no-store',
        ]);
    }
}
