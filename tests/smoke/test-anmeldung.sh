#!/usr/bin/env bash
# Smoke-Test Task 2: Anmeldung und Startperson. Voraussetzung: tests/smoke/setup-testkonten.sh wurde ausgeführt.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./lib.sh

LOGIN="/index.php?route=/schaufenster"
STRASSE="/index.php?route=/tree/${TREE}/schaufenster"
PASSWORT="schaufenster-test"

echo "== Anonym: Anmeldeseite =="
neue_sitzung
status="$(get_status "$LOGIN")"
body="$(get "$LOGIN")"
assert_eq "$status" "200" "GET /schaufenster anonym -> 200"
assert_contains "$body" "Ahnen-Schaufenster" "Anmeldeseite nennt Ahnen-Schaufenster"
assert_contains "$body" 'type="password"' "Anmeldeseite hat Passwortfeld"
assert_contains "$body" 'name="_csrf"' "Anmeldeformular trägt CSRF-Token"
assert_not_contains "$body" "wt-header" "Anmeldeseite nutzt nicht das webtrees-Layout"
assert_contains "$body" ">Passwort vergessen?</a>" "Anmeldeseite: Verweis „Passwort vergessen?“"
vergessen="$(printf '%s' "$body" | sed -n 's/.*<a href="\([^"]*\)">Passwort vergessen?.*/\1/p' | head -1 | sed 's/&amp;/\&/g')"
assert_contains "$vergessen" "route=%2Fpassword-request" "„Passwort vergessen?“ führt auf webtrees' PasswordRequestPage"
assert_eq "$(wt_curl -o /dev/null -w '%{http_code}' "$vergessen")" "200" "PasswordRequestPage anonym erreichbar (200)"

css="$(printf '%s' "$body" | sed -n 's/.*href="\([^"]*schaufenster.css[^"]*\)".*/\1/p' | head -1 | sed 's/&amp;/\&/g')"
assert_contains "$css" "schaufenster.css" "Anmeldeseite verlinkt schaufenster.css"
wt_curl -o "$SCHAUFENSTER_BODY" -D "$SCHAUFENSTER_HEADER" "$css"
assert_contains "$(head -1 "$SCHAUFENSTER_HEADER")" "200" "schaufenster.css wird ausgeliefert (200)"
assert_contains "$(grep -i '^content-type' "$SCHAUFENSTER_HEADER")" "text/css" "schaufenster.css hat Typ text/css"
assert_contains "$(cat "$SCHAUFENSTER_BODY")" "#1f1a14" "schaufenster.css enthält die Grundfarbe"

echo "== Anonym: Straße =="
neue_sitzung
wt_curl -o /dev/null -D "$SCHAUFENSTER_HEADER" "${BASE_URL}${STRASSE}"
assert_eq "$(sed -n 's/^HTTP\/[0-9.]* \([0-9]*\).*/\1/p' "$SCHAUFENSTER_HEADER" | tail -1)" "302" "GET /tree/tree1/schaufenster anonym -> 302"
loc="$(grep -i '^location:' "$SCHAUFENSTER_HEADER" | tr -d '\r' | head -1)"
assert_contains "$loc" "route=%2Fschaufenster" "Weiterleitung geht auf Schaufenster-Anmeldung"
assert_not_contains "$loc" "/tree/" "Weiterleitung geht nicht auf eine Baumseite"
assert_not_contains "$loc" "login" "Weiterleitung geht nicht auf die webtrees-Anmeldung"

echo "== Falsches Passwort =="
status="$(schaufenster_login test-patrick falsch)"
assert_eq "$status" "200" "Falsches Passwort -> 200"
assert_contains "$(cat "$SCHAUFENSTER_BODY")" "Benutzername oder Passwort stimmen nicht." "Meldung bei falschem Passwort"
assert_eq "$(grep -ci '^location:' "$SCHAUFENSTER_HEADER")" "0" "Falsches Passwort: kein Location-Header"
assert_not_contains "$(cat "$SCHAUFENSTER_BODY")" "wt-header" "Fehlerseite nutzt nicht das webtrees-Layout"

echo "== Leere Felder =="
status="$(schaufenster_login "" "")"
assert_eq "$status" "200" "Leere Felder -> 200"
assert_contains "$(cat "$SCHAUFENSTER_BODY")" "Benutzername oder Passwort stimmen nicht." "Meldung bei leeren Feldern"

echo "== Unbekannter Benutzer =="
status="$(schaufenster_login gibt-es-nicht "$PASSWORT")"
assert_eq "$status" "200" "Unbekannter Benutzer -> 200"
assert_contains "$(cat "$SCHAUFENSTER_BODY")" "Benutzername oder Passwort stimmen nicht." "Meldung bei unbekanntem Benutzer"

echo "== Ohne CSRF-Token =="
neue_sitzung
status="$(wt_curl -o /dev/null -w '%{http_code}' --data-urlencode "username=test-patrick" --data-urlencode "password=${PASSWORT}" "${BASE_URL}${LOGIN}")"
assert_eq "$status" "302" "POST ohne CSRF-Token -> 302 zurück auf die Anmeldeseite (webtrees-CheckCsrf)"
assert_eq "$(get_status "$STRASSE")" "302" "Nach CSRF-Fehler ist niemand angemeldet (Straße leitet um)"
assert_contains "$(get "$LOGIN")" 'type="password"' "Nach CSRF-Fehler bleibt man auf der Schaufenster-Anmeldeseite"

echo "== test-patrick =="
status="$(schaufenster_login test-patrick "$PASSWORT")"
assert_eq "$status" "302" "Anmeldung test-patrick -> 302"
loc="$(grep -i '^location:' "$SCHAUFENSTER_HEADER" | tr -d '\r' | head -1)"
assert_contains "$loc" "route=%2Ftree%2F${TREE}%2Fschaufenster" "Weiterleitung auf /tree/tree1/schaufenster"
status="$(get_status "$STRASSE")"
body="$(get "$STRASSE")"
assert_eq "$status" "200" "Straße nach Anmeldung -> 200"
assert_contains "$body" "data-start=\"${ICH}\"" "Startperson test-patrick = ${ICH}"
assert_contains "$body" 'id="strasse"' "Straße hat Container #strasse"
assert_not_contains "$body" "wt-header" "Straße nutzt nicht das webtrees-Layout"
assert_contains "$body" "data-start-card=\"{&quot;xref&quot;:&quot;${ICH}&quot;" "Startkarte als JSON-Daten-Attribut"
assert_contains "$body" '&quot;relation&quot;:&quot;du&quot;' "Startkarte: relation = du (deutsch)"
assert_contains "$body" 'XREF-PLATZHALTER' "API-Adresse mit XREF-Platzhalter"
assert_contains "$body" '<script type="importmap">' "Straße hat eine Import-Map"
for asset in js/main.js js/street.js js/model.js js/dom.js js/life.js js/map.js css/strasse.css css/leben.css \
    vendor/leaflet/leaflet.js vendor/leaflet/leaflet.css img/silhouette-m.svg; do
    enc="$(printf '%s' "$asset" | sed 's|/|%2F|g')"
    url="$(printf '%s' "$body" | grep -o "https://[^\"]*asset=${enc}[^\"]*" | head -1 | sed 's/&amp;/\&/g; s/\\u0026/\&/g')"
    wt_curl -o /dev/null -D "$SCHAUFENSTER_HEADER" "$url"
    assert_contains "$(head -1 "$SCHAUFENSTER_HEADER")" "200" "${asset} wird ausgeliefert (200)"
done
assert_contains "$body" 'data-leben="' "Lebensweg-API als Daten-Attribut"
assert_contains "$body" 'api%2Fleben%2FXREF-PLATZHALTER' "Lebensweg-API mit XREF-Platzhalter"
leaflet="$(printf '%s' "$body" | grep -o 'https://[^"]*asset=vendor%2Fleaflet%2Fleaflet.js[^"]*' | head -1 | sed 's/&quot;.*//; s/&amp;/\&/g')"
assert_contains "$(wt_curl "$leaflet" | head -c 200)" "Leaflet 1.9.4" "leaflet.js ist Leaflet 1.9.4"
wt_curl -o /dev/null -D "$SCHAUFENSTER_HEADER" "${BASE_URL}${LOGIN}"
assert_contains "$(grep -i '^location:' "$SCHAUFENSTER_HEADER" | tr -d '\r')" "route=%2Ftree%2F${TREE}%2Fschaufenster" "Angemeldet: /schaufenster leitet auf die Straße"

echo "== test-ohne-person =="
root="$(mysql -uroot -proot -h127.0.0.1 PRIVAT__webtrees -N -e "select setting_value from wt_gedcom_setting where setting_name='PEDIGREE_ROOT_ID' and gedcom_id=(select gedcom_id from wt_gedcom where gedcom_name='${TREE}')" 2>/dev/null)"
status="$(schaufenster_login test-ohne-person "$PASSWORT")"
assert_eq "$status" "302" "Anmeldung test-ohne-person -> 302"
body="$(get "$STRASSE")"
start="$(printf '%s' "$body" | sed -n 's/.*data-start="\([^"]*\)".*/\1/p' | head -1)"
if [ -n "$root" ]; then
    assert_eq "$start" "$root" "test-ohne-person startet bei PEDIGREE_ROOT_ID (${root})"
else
    if [ -n "$start" ] && [ "$start" != "$ICH" ]; then
        echo "OK   test-ohne-person startet bei erster sichtbarer Person (${start})"
    else
        echo "FAIL test-ohne-person: data-start leer oder ${ICH} ('${start}')"
        SMOKE_FAILURES=$((SMOKE_FAILURES + 1))
    fi
fi
# Ohne verknüpfte Person gibt es keinen Betrachter: die Ersatz-Startperson ist nicht „du“.
karte="$(printf '%s' "$body" | sed -n 's/.*data-start-card="\([^"]*\)".*/\1/p' | head -1 | sed 's/&quot;/"/g; s/&amp;/\&/g')"
assert_eq "$(printf '%s' "$karte" | jq -r '.relation')" "" "test-ohne-person: Startkarte relation leer (nicht „du“)"
assert_eq "$(printf '%s' "$karte" | jq -r '.directLine')" "false" "test-ohne-person: Startkarte directLine:false"
assert_not_contains "$body" "das bist du" "test-ohne-person: kein „das bist du“"
assert_contains "$body" 'data-abmelden="' "test-ohne-person: Straße kennt die Abmelde-Adresse"

for konto in test-unverifiziert test-ungenehmigt; do
    echo "== ${konto} =="
    status="$(schaufenster_login "$konto" "$PASSWORT")"
    assert_eq "$status" "200" "${konto}: Anmeldung -> 200"
    assert_contains "$(cat "$SCHAUFENSTER_BODY")" "Dieses Konto ist noch nicht freigeschaltet." "${konto}: Meldung nicht freigeschaltet"
    assert_eq "$(grep -ci '^location:' "$SCHAUFENSTER_HEADER")" "0" "${konto}: kein Location-Header"
    assert_not_contains "$(cat "$SCHAUFENSTER_BODY")" "wt-header" "${konto}: Fehlerseite nutzt nicht das webtrees-Layout"
    assert_eq "$(get_status "$STRASSE")" "302" "${konto}: nicht angemeldet (Straße leitet um)"
    wt_curl -o /dev/null -D "$SCHAUFENSTER_HEADER" "${BASE_URL}${STRASSE}"
    assert_contains "$(grep -i '^location:' "$SCHAUFENSTER_HEADER" | tr -d '\r')" "route=%2Fschaufenster" "${konto}: Umleitung geht auf die Schaufenster-Anmeldung"
done

echo "== test-ohne-rolle (privater Baum: kein Zugang) =="
status="$(schaufenster_login test-ohne-rolle "$PASSWORT")"
assert_eq "$status" "200" "test-ohne-rolle bleibt auf der Schaufenster-Anmeldeseite (200)"
assert_contains "$(cat "$SCHAUFENSTER_BODY")" "Dein Konto hat noch keinen Zugang zum Stammbaum." "Meldung ohne Baumzugang"
assert_eq "$(grep -ci '^location:' "$SCHAUFENSTER_HEADER")" "0" "test-ohne-rolle: kein Location-Header"
assert_eq "$(get_status "$STRASSE")" "302" "test-ohne-rolle ist danach nicht angemeldet (Straße leitet um)"
wt_curl -o /dev/null -D "$SCHAUFENSTER_HEADER" "${BASE_URL}${STRASSE}"
assert_contains "$(grep -i '^location:' "$SCHAUFENSTER_HEADER" | tr -d '\r')" "route=%2Fschaufenster" "Umleitung geht auf die Schaufenster-Anmeldung"

echo "== Abmelden (test-patrick) =="
status="$(schaufenster_login test-patrick "$PASSWORT")"
assert_eq "$status" "302" "Anmeldung test-patrick"
body="$(get "$STRASSE")"
abmelden="$(printf '%s' "$body" | sed -n 's/.*data-abmelden="\([^"]*\)".*/\1/p' | head -1 | sed 's/&amp;/\&/g')"
assert_contains "$abmelden" "route=%2Flogout" "Straße: Abmelde-Adresse ist webtrees' Logout-Route"
assert_eq "$(get_status "$STRASSE")" "200" "Vor dem Abmelden: Straße 200"
# Wie abmelden.js: Ajax-POST ohne CSRF-Token (webtrees nimmt die Logout-Route von der CSRF-Prüfung aus).
assert_eq "$(wt_curl -o /dev/null -w '%{http_code}' -X POST -H 'X-Requested-With: XMLHttpRequest' "$abmelden")" "204" "Logout-POST (Ajax) -> 204 (leere Antwort)"
wt_curl -o /dev/null -D "$SCHAUFENSTER_HEADER" "${BASE_URL}${STRASSE}"
assert_eq "$(sed -n 's/^HTTP\/[0-9.]* \([0-9]*\).*/\1/p' "$SCHAUFENSTER_HEADER" | tail -1)" "302" "Nach dem Abmelden: Straße leitet um"
assert_contains "$(grep -i '^location:' "$SCHAUFENSTER_HEADER" | tr -d '\r')" "route=%2Fschaufenster" "Nach dem Abmelden: Umleitung auf die Schaufenster-Anmeldung"
body="$(get "${LOGIN}&abgemeldet=1")"
assert_contains "$body" "Du bist abgemeldet." "Anmeldeseite nach dem Abmelden: „Du bist abgemeldet.“"
assert_not_contains "$body" 'role="alert"' "Anmeldeseite nach dem Abmelden: keine Fehlermeldung"

echo "== Abmelden ohne JavaScript (Formular) =="
assert_eq "$(schaufenster_login test-patrick "$PASSWORT")" "302" "Anmeldung test-patrick"
wt_curl -o /dev/null -D "$SCHAUFENSTER_HEADER" -X POST "$abmelden"
assert_eq "$(sed -n 's/^HTTP\/[0-9.]* \([0-9]*\).*/\1/p' "$SCHAUFENSTER_HEADER" | tail -1)" "302" "Logout-Formular -> 302 (webtrees-Startseite)"
assert_eq "$(get_status "$STRASSE")" "302" "Nach dem Formular-Abmelden: Straße leitet um"

echo "== Hinweisseite mit Abmelden (test-ohne-rolle, über die webtrees-Anmeldung angemeldet) =="
assert_eq "$(login test-ohne-rolle "$PASSWORT")" "302" "webtrees-Anmeldung test-ohne-rolle"
body="$(get "$STRASSE")"
assert_contains "$body" "Dein Konto hat noch keinen Zugang zum Stammbaum." "Hinweisseite: kein Zugang"
assert_contains "$body" '<form class="abmelden" method="post" action="' "Hinweisseite: Abmelde-Formular"
assert_contains "$body" ">Abmelden</button>" "Hinweisseite: Knopf „Abmelden“"
assert_contains "$body" "asset=js%2Fabmelden.js" "Hinweisseite lädt abmelden.js"
abmelden="$(printf '%s' "$body" | sed -n 's/.*<form class="abmelden" method="post" action="\([^"]*\)".*/\1/p' | head -1 | sed 's/&amp;/\&/g')"
assert_eq "$(wt_curl -o /dev/null -w '%{http_code}' -X POST -H 'X-Requested-With: XMLHttpRequest' "$abmelden")" "204" "Hinweisseite: Logout-POST -> 204"
assert_eq "$(get_status "$STRASSE")" "302" "Hinweisseite: danach abgemeldet (Straße leitet um)"

smoke_ende
