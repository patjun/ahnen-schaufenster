#!/usr/bin/env bash
# Hilfsfunktionen für die Smoke-Tests gegen die lokale webtrees-Instanz. Mit `source` einbinden.
#
# webtrees beantwortet anonyme Erstanfragen mit 404/406 + "Set-Cookie: x=y" (Cookie-Check, keine
# Zugriffssperre). Mit Cookie-Jar und Browser-User-Agent liefert der dritte Aufruf die echte Seite.

BASE_URL="${BASE_URL:-https://privat__webtrees.test}"
TREE="${TREE:-tree1}"
BROWSER_UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
COOKIE_JAR="${COOKIE_JAR:-${TMPDIR:-/tmp}/schaufenster-smoke-cookies.txt}"
SMOKE_FAILURES=0

# Baumspezifische Testwerte (Kennungen, Namen) liegen in der lokalen, nicht eingecheckten baum.sh.
if [ -f "$(dirname "${BASH_SOURCE[0]}")/baum.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/baum.sh"
else
    echo "Fehlt: tests/smoke/baum.sh (Vorlage: tests/smoke/baum.beispiel.sh)" >&2
    return 2 2>/dev/null || exit 2
fi

# Rohe Anfrage mit Cookie-Jar. Aufruf: wt_curl [curl-Optionen] <URL>
wt_curl() {
    curl -sk -A "$BROWSER_UA" -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$@"
}

# Cookie-Check-Runde: dreimal GET, damit webtrees den Cookie akzeptiert.
cookie_runde() {
    local pfad="${1:-/index.php?route=/login/${TREE}}" i
    for i in 1 2 3; do
        wt_curl -o /dev/null "${BASE_URL}${pfad}"
    done
}

# Meldet einen Benutzer an. Aufruf: login <benutzer> <passwort>
# Setzt den Jar neu zurück; gibt den HTTP-Status des Login-POST aus (302 = Weiterleitung nach Erfolg
# oder Fehler – ob angemeldet wurde, entscheidet erst der Folgeaufruf).
login() {
    local user="$1" pass="$2" seite csrf
    rm -f "$COOKIE_JAR"
    cookie_runde
    seite="$(wt_curl "${BASE_URL}/index.php?route=/login/${TREE}")"
    csrf="$(printf '%s' "$seite" | sed -n 's/.*name="_csrf" value="\([^"]*\)".*/\1/p' | head -1)"
    if [ -z "$csrf" ]; then
        csrf="$(printf '%s' "$seite" | sed -n 's/.*value="\([^"]*\)" name="_csrf".*/\1/p' | head -1)"
    fi
    wt_curl -o /dev/null -w '%{http_code}' \
        --data-urlencode "username=${user}" \
        --data-urlencode "password=${pass}" \
        --data-urlencode "_csrf=${csrf}" \
        --data-urlencode "url=${BASE_URL}/index.php?route=/tree/${TREE}" \
        "${BASE_URL}/index.php?route=/login/${TREE}"
    echo
}

# GET und Ausgabe des Rumpfes. Aufruf: get <pfad>   (Pfad ab "/", z. B. "/index.php?route=/tree/tree1")
get() {
    wt_curl "${BASE_URL}$1"
}

# GET mit JSON-Header. Aufruf: get_json <pfad>
get_json() {
    wt_curl -H 'Accept: application/json' "${BASE_URL}$1"
}

# HTTP-Status eines GET. Aufruf: get_status <pfad>
get_status() {
    wt_curl -o /dev/null -w '%{http_code}' "${BASE_URL}$1"
}

# Vergleicht Ist und Soll. Aufruf: assert_eq <ist> <soll> <text>
assert_eq() {
    if [ "$1" = "$2" ]; then
        echo "OK   $3"
    else
        echo "FAIL $3 (ist: '$1', soll: '$2')"
        SMOKE_FAILURES=$((SMOKE_FAILURES + 1))
    fi
}

# Beendet das Skript mit Fehlercode, wenn Prüfungen fehlschlugen.
smoke_ende() {
    if [ "$SMOKE_FAILURES" -gt 0 ]; then
        echo "${SMOKE_FAILURES} Prüfung(en) fehlgeschlagen."
        exit 1
    fi
    echo "Alle Prüfungen bestanden."
}

# Frische anonyme Sitzung für die Schaufenster-Anmeldeseite (Cookie-Check inklusive).
neue_sitzung() {
    rm -f "$COOKIE_JAR"
    cookie_runde "/index.php?route=/schaufenster"
}

# Liest das CSRF-Token aus dem HTML auf stdin.
csrf_aus_html() {
    local html
    html="$(cat)"
    printf '%s' "$html" | sed -n 's/.*name="_csrf" value="\([^"]*\)".*/\1/p' | head -1
}

# Meldet über die Schaufenster-Anmeldeseite an (frische Sitzung). Aufruf: schaufenster_login <benutzer> <passwort>
# Schreibt Kopfzeilen nach $SCHAUFENSTER_HEADER und den Rumpf nach $SCHAUFENSTER_BODY; gibt den Status aus.
SCHAUFENSTER_HEADER="${TMPDIR:-/tmp}/schaufenster-smoke-header.txt"
SCHAUFENSTER_BODY="${TMPDIR:-/tmp}/schaufenster-smoke-body.txt"
schaufenster_login() {
    local csrf
    neue_sitzung
    csrf="$(wt_curl "${BASE_URL}/index.php?route=/schaufenster" | csrf_aus_html)"
    wt_curl -D "$SCHAUFENSTER_HEADER" -o "$SCHAUFENSTER_BODY" -w '%{http_code}' \
        --data-urlencode "username=$1" \
        --data-urlencode "password=$2" \
        --data-urlencode "_csrf=${csrf}" \
        "${BASE_URL}/index.php?route=/schaufenster"
    echo
}

# Prüft, ob ein Text im Rumpf vorkommt. Aufruf: assert_contains <rumpf> <text> <beschreibung>
assert_contains() {
    if printf '%s' "$1" | grep -qF -- "$2"; then
        echo "OK   $3"
    else
        echo "FAIL $3 (nicht gefunden: '$2')"
        SMOKE_FAILURES=$((SMOKE_FAILURES + 1))
    fi
}

assert_not_contains() {
    if printf '%s' "$1" | grep -qF -- "$2"; then
        echo "FAIL $3 (unerwartet gefunden: '$2')"
        SMOKE_FAILURES=$((SMOKE_FAILURES + 1))
    else
        echo "OK   $3"
    fi
}
