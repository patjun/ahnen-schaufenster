<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster;

use Fisharebest\Webtrees\Module\AbstractModule;
use Fisharebest\Webtrees\Module\ModuleCustomInterface;
use Fisharebest\Webtrees\Module\ModuleCustomTrait;
use Fisharebest\Webtrees\Registry;
use Fisharebest\Webtrees\View;
use Jungbluth\AhnenSchaufenster\Http\LifeApi;
use Jungbluth\AhnenSchaufenster\Http\LoginAction;
use Jungbluth\AhnenSchaufenster\Http\LoginPage;
use Jungbluth\AhnenSchaufenster\Http\StationApi;
use Jungbluth\AhnenSchaufenster\Http\StreetPage;

/**
 * Ahnen-Schaufenster: ein animierter Schaufensterbummel durch die eigenen Vorfahren.
 */
class SchaufensterModule extends AbstractModule implements ModuleCustomInterface
{
    use ModuleCustomTrait;

    public const string VIEW_NAMESPACE = 'ahnen-schaufenster';

    /** Der Baum, in dem sich Benutzer über das Schaufenster anmelden. */
    public const string TREE_NAME = 'tree1';

    /** Modulversion nach Semantic Versioning; muss mit latest-version.txt und CHANGELOG.md übereinstimmen. */
    public const string VERSION = '0.1.0';

    public const string REPOSITORY_URL = 'https://github.com/patjun/ahnen-schaufenster';

    public function title(): string
    {
        return 'Ahnen-Schaufenster';
    }

    public function description(): string
    {
        return 'Ein animierter Schaufensterbummel durch die Vorfahren des angemeldeten Benutzers.';
    }

    public function customModuleAuthorName(): string
    {
        return 'Patrick Jungbluth';
    }

    public function customModuleVersion(): string
    {
        return self::VERSION;
    }

    /** webtrees vergleicht damit in der Modulverwaltung und meldet neuere Versionen. */
    public function customModuleLatestVersionUrl(): string
    {
        return 'https://raw.githubusercontent.com/patjun/ahnen-schaufenster/main/latest-version.txt';
    }

    public function customModuleSupportUrl(): string
    {
        return self::REPOSITORY_URL;
    }

    public function resourcesFolder(): string
    {
        return __DIR__ . '/../resources/';
    }

    public function boot(): void
    {
        View::registerNamespace(self::VIEW_NAMESPACE, $this->resourcesFolder() . 'views/');

        // Die Handler bekommen das Modul (für Asset-URLs) per Konstruktor aus dem Container.
        Registry::container()->set(self::class, $this);

        $routes = Registry::routeFactory()->routeMap();

        // Ohne {tree}: private Bäume leiten anonyme Besucher sonst vorher auf die webtrees-Anmeldung um.
        $routes->get(LoginPage::class, '/schaufenster', LoginPage::class);
        $routes->post(LoginAction::class, '/schaufenster', LoginAction::class);
        // Die Straße steht unter /tree/tree1/schaufenster, aber ohne {tree}-Platzhalter: webtrees verwirft Routen mit
        // {tree} schon im Router, wenn der Besucher den (privaten) Baum nicht sieht, und leitet auf die Startseite um.
        // Mit festem Pfad und Vorgabewert greift stattdessen StreetPage und leitet auf die Schaufenster-Anmeldung.
        $routes->get(StreetPage::class, '/tree/' . self::TREE_NAME . '/schaufenster', StreetPage::class)
            ->defaults(['tree' => self::TREE_NAME]);
        // JSON für das Nachladen der Stationen; gleiches Muster (fester Pfad), damit anonyme Anfragen 401 bekommen.
        $routes->get(StationApi::class, '/tree/' . self::TREE_NAME . '/schaufenster/api/station/{xref}', StationApi::class)
            ->defaults(['tree' => self::TREE_NAME]);
        // Lebensweg einer Person (Diaschau + Karte), gleiches Muster.
        $routes->get(LifeApi::class, '/tree/' . self::TREE_NAME . '/schaufenster/api/leben/{xref}', LifeApi::class)
            ->defaults(['tree' => self::TREE_NAME]);
    }
}
