<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Http;

use Fig\Http\Message\StatusCodeInterface;
use Fisharebest\Webtrees\Auth;
use Fisharebest\Webtrees\I18N;
use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\Registry;
use Fisharebest\Webtrees\Services\RelationshipService;
use Fisharebest\Webtrees\Tree;
use Fisharebest\Webtrees\Validator;
use Jungbluth\AhnenSchaufenster\Service\Kinship;
use Jungbluth\AhnenSchaufenster\Service\StartPerson;
use Jungbluth\AhnenSchaufenster\Service\StationBuilder;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * GET /tree/tree1/schaufenster/api/station/{xref}[?family=…] → {station: …|null}
 *
 * Verwandtschaft und direkte Linie beziehen sich immer auf die mit dem Konto verknüpfte Person (ohne sie: leer bzw. false).
 */
class StationApi implements RequestHandlerInterface
{
    public function __construct(
        private readonly StartPerson $start_person,
        private readonly StationBuilder $station_builder,
        private readonly RelationshipService $relationship_service,
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
        $viewer      = $this->start_person->ownRecord($tree, $user);
        $xref        = Validator::attributes($request)->isXref()->string('xref', '');
        $family_xref = Validator::queryParams($request)->isXref()->string('family', '');
        $child       = $xref === '' ? null : Registry::individualFactory()->make($xref, $tree);

        // Unbekannt oder verborgen: dieselbe Antwort, damit nichts über die Existenz verraten wird.
        if (!$child instanceof Individual || !$child->canShow()) {
            return $this->json(['station' => null, 'hidden' => true]);
        }

        // Die Oberfläche ist deutsch: Daten und Beziehungsnamen in deutscher Form, unabhängig von der Kontosprache.
        $previous = I18N::languageTag();
        I18N::init('de');

        try {
            $kinship = new Kinship($this->relationship_service, $viewer);
            $station = $this->station_builder->forChild($child, $kinship, $family_xref === '' ? null : $family_xref);
        } finally {
            I18N::init($previous);
        }

        // Elternfamilie vorhanden, aber kein Elternteil sichtbar: „nicht sichtbar“, nicht „Hier endet das Bekannte“.
        if ($station === null && $this->station_builder->hasParentLink($child)) {
            return $this->json(['station' => null, 'hidden' => true]);
        }

        // station:null ohne hidden: das Kind hat überhaupt keine Elternfamilie.
        return $this->json(['station' => $station]);
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
