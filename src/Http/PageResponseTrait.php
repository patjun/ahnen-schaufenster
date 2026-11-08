<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Http;

use Fig\Http\Message\StatusCodeInterface;
use Fisharebest\Webtrees\Registry;
use Jungbluth\AhnenSchaufenster\SchaufensterModule;
use Psr\Http\Message\ResponseInterface;

use function view;

/**
 * Rendert eine Seite im eigenen Schaufenster-Gerüst (nicht im webtrees-Layout).
 */
trait PageResponseTrait
{
    /**
     * @param array<string,mixed>  $data
     * @param array{css?:list<string>,import_map?:array<string,string>,script?:string} $assets
     *        weitere Stylesheets (Asset-Pfade), Import-Map (Name → Asset-Pfad) und Einstiegsskript (Asset-Pfad)
     */
    private function pageResponse(
        SchaufensterModule $module,
        string $view,
        array $data,
        int $status = StatusCodeInterface::STATUS_OK,
        array $assets = []
    ): ResponseInterface {
        $content = view(SchaufensterModule::VIEW_NAMESPACE . '::' . $view, $data);

        $css_urls = [$module->assetUrl('css/schaufenster.css')];
        foreach ($assets['css'] ?? [] as $css) {
            $css_urls[] = $module->assetUrl($css);
        }

        // Die Asset-Route von webtrees trägt den Dateipfad als Query-Parameter: relative ES-Importe ("./model.js")
        // lösen dort nicht auf. Deshalb importieren die Module einander über Namen aus dieser Import-Map.
        $import_map = [];
        foreach ($assets['import_map'] ?? [] as $name => $asset) {
            $import_map[$name] = $module->assetUrl($asset);
        }

        $html = view(SchaufensterModule::VIEW_NAMESPACE . '::layout', [
            'title'      => 'Ahnen-Schaufenster',
            'css_urls'   => $css_urls,
            'import_map' => $import_map,
            'script_url' => isset($assets['script']) ? $module->assetUrl($assets['script']) : '',
            'content'    => $content,
        ]);

        return Registry::responseFactory()->response($html, $status, [
            // Seiten enthalten Anmeldezustand und Personendaten: nicht zwischenspeichern.
            'cache-control' => 'no-store',
        ]);
    }
}
