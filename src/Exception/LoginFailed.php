<?php

declare(strict_types=1);

namespace Jungbluth\AhnenSchaufenster\Exception;

use RuntimeException;

/**
 * Eine Anmeldung über das Schaufenster ist gescheitert. Die Meldung ist deutsch und für den Besucher bestimmt.
 *
 * Eigene Klasse, damit LoginAction nur diese Fehler als Meldung zeigt: andere Laufzeitfehler (etwa PDOException mit
 * Datenbankdetails) gehen an die Fehlerbehandlung von webtrees und erscheinen nie auf der Anmeldeseite.
 */
final class LoginFailed extends RuntimeException
{
}
