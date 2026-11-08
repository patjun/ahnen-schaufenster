<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Http;

use Fisharebest\Webtrees\Auth;
use Fisharebest\Webtrees\Http\RequestHandlers\Logout;
use Fisharebest\Webtrees\I18N;
use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\Services\RelationshipService;
use Fisharebest\Webtrees\Tree;
use Fisharebest\Webtrees\Validator;
use Jungbluth\AhnenSchaufenster\SchaufensterModule;
use Jungbluth\AhnenSchaufenster\Service\Kinship;
use Jungbluth\AhnenSchaufenster\Service\PersonCard;
use Jungbluth\AhnenSchaufenster\Service\StartPerson;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

use function redirect;
use function route;

/**
 * Die Straße: Startfenster (serverseitig als JSON) und Gerüst, in das street.js die Stationen nachlädt.
 * Bezug ist immer der angemeldete Benutzer.
 */
class StreetPage implements RequestHandlerInterface
{
    use PageResponseTrait;

    /** Platzhalter in der API-Adresse, den das Frontend durch die XREF ersetzt. */
    public const string XREF_PLACEHOLDER = 'XREF-PLATZHALTER';

    /** Assets der Straße: Stylesheets, Import-Map der ES-Module, Einstieg. Leaflet lädt map.js erst bei Bedarf. */
    private const array ASSETS = [
        'css'        => ['css/strasse.css', 'css/leben.css'],
        'import_map' => [
            'schaufenster/dom.js'    => 'js/dom.js',
            'schaufenster/model.js'  => 'js/model.js',
            'schaufenster/street.js' => 'js/street.js',
            'schaufenster/life.js'   => 'js/life.js',
            'schaufenster/map.js'    => 'js/map.js',
            'schaufenster/abmelden.js' => 'js/abmelden.js',
        ],
        'script'     => 'js/main.js',
    ];

    /** Hinweisseiten (kein Zugang, keine sichtbare Person): nur das Abmelden. */
    private const array MESSAGE_ASSETS = ['script' => 'js/abmelden.js'];

    public function __construct(
        private readonly SchaufensterModule $module,
        private readonly StartPerson $start_person,
        private readonly RelationshipService $relationship_service,
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        if (!Auth::check()) {
            return redirect(route(LoginPage::class));
        }

        $tree = Validator::attributes($request)->treeOptional();
        $user = Validator::attributes($request)->user();

        // Angemeldet, aber der Baum ist für dieses Konto unsichtbar (kein Rollenzugang): Hinweis statt Umleitungsschleife.
        if (!$tree instanceof Tree) {
            return $this->pageResponse($this->module, 'street', $this->data(
                tree: SchaufensterModule::TREE_NAME,
                hinweis: 'Dein Konto hat noch keinen Zugang zum Stammbaum.',
            ), assets: self::MESSAGE_ASSETS);
        }

        $start = $this->start_person->forUser($tree, $user);

        if (!$start instanceof Individual) {
            return $this->pageResponse($this->module, 'street', $this->data(
                tree: $tree->name(),
                hinweis: 'Für dein Konto ist keine Person sichtbar.',
            ), assets: self::MESSAGE_ASSETS);
        }

        // Die Oberfläche ist deutsch: Daten und Beziehungsnamen in deutscher Form, unabhängig von der Kontosprache.
        $previous = I18N::languageTag();
        I18N::init('de');

        try {
            // Bezug nur auf die eigene, verknüpfte Person; bei einer Ersatz-Startperson gibt es keinen Betrachter.
            $viewer = $this->start_person->ownRecord($tree, $user);
            $card   = PersonCard::make($start, new Kinship($this->relationship_service, $viewer));
        } finally {
            I18N::init($previous);
        }

        return $this->pageResponse($this->module, 'street', $this->data(
            tree: $tree->name(),
            start: $start->xref(),
            card: $card,
        ), assets: self::ASSETS);
    }

    /**
     * @param array<string,mixed>|null $card
     *
     * @return array<string,mixed>
     */
    private function data(string $tree, string $hinweis = '', string $start = '', array|null $card = null): array
    {
        return [
            'start'       => $start,
            'tree'        => $tree,
            'hinweis'     => $hinweis,
            'card'        => $card,
            'api'         => route(StationApi::class, ['xref' => self::XREF_PLACEHOLDER]),
            'leben'       => route(LifeApi::class, ['xref' => self::XREF_PLACEHOLDER]),
            'leaflet'     => [
                'js'  => $this->module->assetUrl('vendor/leaflet/leaflet.js'),
                'css' => $this->module->assetUrl('vendor/leaflet/leaflet.css'),
            ],
            'login'       => route(LoginPage::class),
            // webtrees' eigene Abmeldung (POST, von der CSRF-Prüfung ausgenommen).
            'abmelden'    => route(Logout::class),
            'silhouetten' => [
                'M' => $this->module->assetUrl('img/silhouette-m.svg'),
                'F' => $this->module->assetUrl('img/silhouette-f.svg'),
                'U' => $this->module->assetUrl('img/silhouette-u.svg'),
            ],
        ];
    }
}
