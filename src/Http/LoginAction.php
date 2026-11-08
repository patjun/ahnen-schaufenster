<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Http;

use Fisharebest\Webtrees\Auth;
use Fisharebest\Webtrees\Contracts\UserInterface;
use Fisharebest\Webtrees\I18N;
use Fisharebest\Webtrees\Log;
use Fisharebest\Webtrees\Registry;
use Fisharebest\Webtrees\Services\TreeService;
use Fisharebest\Webtrees\Services\UserService;
use Fisharebest\Webtrees\Session;
use Fisharebest\Webtrees\Validator;
use Jungbluth\AhnenSchaufenster\Exception\LoginFailed;
use Jungbluth\AhnenSchaufenster\SchaufensterModule;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

use function redirect;
use function route;
use function time;

/**
 * Meldet einen Benutzer an. Anders als webtrees' eigene LoginAction bleibt man bei einem Fehler
 * auf der Schaufenster-Anmeldeseite (HTTP 200, deutsche Meldung) statt auf die webtrees-Anmeldung umgeleitet zu werden.
 */
class LoginAction implements RequestHandlerInterface
{
    use PageResponseTrait;

    public function __construct(
        private readonly SchaufensterModule $module,
        private readonly TreeService $tree_service,
        private readonly UserService $user_service,
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $username = Validator::parsedBody($request)->string('username', '');
        $password = Validator::parsedBody($request)->string('password', '');

        try {
            $this->doLogin($username, $password);
        } catch (LoginFailed $ex) {
            return $this->pageResponse($this->module, 'login', LoginPage::data(
                fehler: $ex->getMessage(),
                username: $username,
                action: route(self::class),
            ));
        }

        return redirect(route(StreetPage::class, ['tree' => SchaufensterModule::TREE_NAME]));
    }

    /**
     * Prüfungen wie Fisharebest\Webtrees\Http\RequestHandlers\LoginAction::doLogin().
     *
     * @throws LoginFailed mit deutscher Meldung
     */
    private function doLogin(string $username, #[\SensitiveParameter] string $password): void
    {
        if ($_COOKIE === []) {
            Log::addAuthenticationLog('Login failed (no session cookies): ' . $username);
            throw new LoginFailed('Dein Browser akzeptiert keine Cookies. Ohne Cookies ist keine Anmeldung möglich.');
        }

        $user = $username === '' ? null : $this->user_service->findByIdentifier($username);

        if ($user === null) {
            Log::addAuthenticationLog('Login failed (no such user/email): ' . $username);
            throw new LoginFailed('Benutzername oder Passwort stimmen nicht.');
        }

        if (!$user->checkPassword($password)) {
            Log::addAuthenticationLog('Login failed (incorrect password): ' . $username);
            throw new LoginFailed('Benutzername oder Passwort stimmen nicht.');
        }

        if ($user->getPreference(UserInterface::PREF_IS_EMAIL_VERIFIED) !== '1') {
            Log::addAuthenticationLog('Login failed (not verified by user): ' . $username);
            throw new LoginFailed('Dieses Konto ist noch nicht freigeschaltet.');
        }

        if ($user->getPreference(UserInterface::PREF_IS_ACCOUNT_APPROVED) !== '1') {
            Log::addAuthenticationLog('Login failed (not approved by admin): ' . $username);
            throw new LoginFailed('Dieses Konto ist noch nicht freigeschaltet.');
        }

        Auth::login($user);

        // Auf einem privaten Baum sieht ein Konto ohne Rolle den Baum gar nicht (TreeService::all() filtert ihn weg);
        // webtrees würde die Straße dann auf die Startseite umleiten. Stattdessen hier mit klarer Meldung stehen bleiben.
        // Der Baumlisten-Cache wurde ggf. noch ohne Benutzer gefüllt: verwerfen.
        Registry::cache()->array()->forget('all-trees');

        if (!$this->tree_service->all()->has(SchaufensterModule::TREE_NAME)) {
            Log::addAuthenticationLog('Login failed (no access to tree ' . SchaufensterModule::TREE_NAME . '): ' . $username);
            Auth::logout();
            throw new LoginFailed('Dein Konto hat noch keinen Zugang zum Stammbaum.');
        }

        Log::addAuthenticationLog('Login: ' . Auth::user()->userName() . '/' . Auth::user()->realName());
        Auth::user()->setPreference(UserInterface::PREF_TIMESTAMP_ACTIVE, (string) time());

        Session::put('language', Auth::user()->getPreference(UserInterface::PREF_LANGUAGE, 'en-US'));
        Session::put('theme', Auth::user()->getPreference(UserInterface::PREF_THEME));
        I18N::init(Auth::user()->getPreference(UserInterface::PREF_LANGUAGE, 'en-US'));
    }
}
