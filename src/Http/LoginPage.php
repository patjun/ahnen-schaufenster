<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Http;

use Fisharebest\Webtrees\Auth;
use Fisharebest\Webtrees\FlashMessages;
use Fisharebest\Webtrees\Http\RequestHandlers\PasswordRequestPage;
use Fisharebest\Webtrees\Validator;
use Jungbluth\AhnenSchaufenster\SchaufensterModule;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

use function redirect;
use function route;

/**
 * Eigene Anmeldeseite im Schaufenster-Stil.
 */
class LoginPage implements RequestHandlerInterface
{
    use PageResponseTrait;

    public function __construct(private readonly SchaufensterModule $module)
    {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        // Schon angemeldet: direkt auf die Straße.
        if (Auth::check()) {
            return redirect(route(StreetPage::class, ['tree' => SchaufensterModule::TREE_NAME]));
        }

        // Hinweise von webtrees (z. B. abgelaufenes Formular nach CSRF-Fehler) anzeigen statt aufzuschieben.
        $hinweise = [];
        foreach (FlashMessages::getMessages() as $nachricht) {
            $hinweise[] = strip_tags($nachricht->text);
        }

        // Nach dem Abmelden (abmelden.js): webtrees' eigene Meldung („You have signed out.“, in der Kontosprache)
        // durch eine ruhige deutsche ersetzen.
        $abgemeldet = Validator::queryParams($request)->string('abgemeldet', '') === '1';

        return $this->pageResponse($this->module, 'login', self::data(
            fehler: $abgemeldet || $hinweise === [] ? '' : implode(' ', $hinweise),
            username: '',
            action: route(LoginAction::class),
            hinweis: $abgemeldet ? 'Du bist abgemeldet.' : '',
        ));
    }

    /**
     * Daten der Anmeldeseite (auch für LoginAction): Meldung, Hinweis, Formularziel und „Passwort vergessen?“.
     *
     * @return array<string,string>
     */
    public static function data(string $fehler, string $username, string $action, string $hinweis = ''): array
    {
        return [
            'fehler'    => $fehler,
            'hinweis'   => $hinweis,
            'username'  => $username,
            'action'    => $action,
            // webtrees' eigene Seite „Neues Passwort anfordern“ (ohne Baum: der private Baum ist anonym unsichtbar).
            'vergessen' => route(PasswordRequestPage::class),
        ];
    }
}
