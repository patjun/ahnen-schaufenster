#!/usr/bin/env bash
# Smoke-Test Task 4: Lebensweg-Endpunkt (Diaschau + Karte). Voraussetzung: tests/smoke/setup-testkonten.sh wurde ausgeführt.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./lib.sh

PASSWORT="schaufenster-test"
API="/index.php?route=/tree/${TREE}/schaufenster/api/leben"
STATION="/index.php?route=/tree/${TREE}/schaufenster/api/station"
JAR_PATRICK="${TMPDIR:-/tmp}/schaufenster-smoke-cookies-patrick.txt"
JAR_PFAD="${TMPDIR:-/tmp}/schaufenster-smoke-cookies-pfad.txt"

leben() {
    get_json "${API}/$1"
}

jqr() {
    printf '%s' "$1" | jq -r "$2"
}

http_status() {
    sed -n 's/^HTTP\/[0-9.]* \([0-9]*\).*/\1/p' "$SCHAUFENSTER_HEADER" | tail -1
}

# Allgemeine Formprüfungen eines Lebenswegs. Aufruf: form_pruefen <json> <bezeichnung>
form_pruefen() {
    local j="$1" b="$2"
    assert_eq "$(jqr "$j" '.slides | type')" "array" "${b}: slides ist eine Liste"
    assert_eq "$(jqr "$j" '.route | type')" "array" "${b}: route ist eine Liste"
    assert_eq "$(jqr "$j" '[.slides[] | select(.point != null) | select(.point.lat < 40 or .point.lat > 60)] | length')" "0" "${b}: jeder Punkt mit lat zwischen 40 und 60"
    assert_eq "$(jqr "$j" '[.slides[] | select(.point != null) | select(.point.lng < -10 or .point.lng > 40)] | length')" "0" "${b}: jeder Punkt mit lng zwischen -10 und 40"
    # Sortierung: Schlüssel aufsteigend, null am Ende.
    assert_eq "$(jqr "$j" '[.slides[].sortKey] as $k | ($k | map(select(. != null))) as $d | ($d == ($d | sort)) and ($k[0:($d | length)] == $d)')" "true" "${b}: aufsteigend nach sortKey, ohne Datum am Ende"
    assert_eq "$(jqr "$j" '[.slides[].id] | length == (unique | length)')" "true" "${b}: Dia-Kennungen eindeutig"
    assert_eq "$(jqr "$j" '[.slides[].persons[] | select((keys | sort) != ["directLine","name","relation","xref"])] | length')" "0" "${b}: Personen nur mit xref/name/relation/directLine"
    assert_eq "$(jqr "$j" '[.slides[].persons[] | select(.visible == false)] | length')" "0" "${b}: keine verborgenen Personen in Dias"
    assert_eq "$(jqr "$j" '[.slides[] | select((keys | sort) != ["date","id","media","notes","own","persons","place","point","sortKey","sources","text","title"])] | length')" "0" "${b}: Dias mit allen Feldern"
    assert_eq "$(jqr "$j" '[.slides[].media[] | select(.kind != "image" and .kind != "pdf" and .kind != "link")] | length')" "0" "${b}: Medienarten image/pdf/link"
    # Route: nur eigene Dias mit Punkt, Reihenfolge der Dias, keine direkt wiederholten Punkte.
    assert_eq "$(jqr "$j" '[.slides[] | select(.own and .point != null) | .id] as $own | [.route[].slideId] | all(. as $s | $own | index($s) != null)')" "true" "${b}: Route nur aus eigenen Dias mit Punkt"
    assert_eq "$(jqr "$j" '[.slides[].id] as $ids | [.route[].slideId | . as $s | $ids | index($s)] | . == sort')" "true" "${b}: Route in Dia-Reihenfolge"
    assert_eq "$(jqr "$j" '[range(1; .route | length) as $i | select(.route[$i].lat == .route[$i-1].lat and .route[$i].lng == .route[$i-1].lng)] | length')" "0" "${b}: keine direkt wiederholten Routenpunkte"
    assert_not_contains "$j" "<bdi>" "${b}: keine HTML-Auszeichnung"
    assert_not_contains "$j" "<span" "${b}: keine span-Auszeichnung"
}

echo "== Anonym =="
COOKIE_JAR="${TMPDIR:-/tmp}/schaufenster-smoke-cookies-anonym.txt"
neue_sitzung
wt_curl -o "$SCHAUFENSTER_BODY" -D "$SCHAUFENSTER_HEADER" -H 'Accept: application/json' "${BASE_URL}${API}/${ICH}"
assert_eq "$(http_status)" "401" "Lebensweg anonym -> 401"
assert_eq "$(jq -r '.error' "$SCHAUFENSTER_BODY" 2>/dev/null)" "anmeldung" "Anonym: JSON {error:\"anmeldung\"}"

echo "== test-patrick: Lebensweg des Großvaters mütterlicherseits =="
COOKIE_JAR="$JAR_PATRICK"
assert_eq "$(schaufenster_login test-patrick "$PASSWORT")" "302" "Anmeldung test-patrick"
s_patrick="$(get_json "${STATION}/${ICH}")"
vater="$(jqr "$s_patrick" '.station.father.xref')"
mutter="$(jqr "$s_patrick" '.station.mother.xref')"
opa="$(jqr "$(get_json "${STATION}/${mutter}")" '.station.father.xref')"
assert_eq "$([ -n "$opa" ] && [ "$opa" != null ] && echo ja)" "ja" "Großvater über die Station der Mutter gefunden (${opa})"

wt_curl -o "$SCHAUFENSTER_BODY" -D "$SCHAUFENSTER_HEADER" -H 'Accept: application/json' "${BASE_URL}${API}/${opa}"
assert_eq "$(http_status)" "200" "Lebensweg ${opa} -> 200"
assert_contains "$(grep -i '^content-type' "$SCHAUFENSTER_HEADER")" "application/json" "Typ application/json"
assert_contains "$(grep -i '^cache-control' "$SCHAUFENSTER_HEADER")" "no-store" "cache-control no-store"
p_opa="$(cat "$SCHAUFENSTER_BODY")"
form_pruefen "$p_opa" "Großvater"
assert_contains "$(jqr "$p_opa" '.person.name')" "$OPA_M_VORNAME" "person.name enthält ${OPA_M_VORNAME}"
assert_eq "$(jqr "$p_opa" '.person.relation')" "dein Großvater mütterlicherseits" "person.relation = dein Großvater mütterlicherseits"
assert_eq "$(jqr "$p_opa" '[.slides[] | select(.own == false and (.title | test("Geburt"))) | select([.persons[].name] | any(test("'"${MUTTER_VORNAME}"'")))] | length > 0')" "true" "Verwandten-Dia (own:false) 'Geburt …' mit der Mutter"
assert_eq "$(jqr "$p_opa" '[.slides[].persons[] | select(.name | test("'"${MUTTER_VORNAME}"'")) | .relation] | first')" "deine Mutter" "Mutter im Dia: relation = deine Mutter"
assert_eq "$(jqr "$p_opa" '[.slides[].persons[] | select(.name | test("'"${MUTTER_VORNAME}"'")) | .directLine] | first')" "true" "Mutter im Dia: directLine:true"
assert_eq "$(jqr "$p_opa" '[.slides[] | select(.own and (.title | test("Geburt")))] | first | .sortKey != null')" "true" "Eigene Geburt mit sortKey"
assert_contains "$(jqr "$p_opa" '[.slides[] | select(.own and (.title | test("Geburt")))] | first | .date')" "$OPA_M_GEBURT_JAHR" "Eigene Geburt ${OPA_M_GEBURT_JAHR}"
assert_contains "$(jqr "$p_opa" '[.slides[] | select(.own and (.title | test("Geburt")))] | first | .place')" "$OPA_M_GEBURT_ORT" "Geburtsort ${OPA_M_GEBURT_ORT}"
assert_eq "$(jqr "$p_opa" '[.slides[] | select(.text == "'"${OPA_M_BERUF}"'")] | first | .point != null')" "true" "Beruf '${OPA_M_BERUF}' mit Kartenpunkt"
assert_eq "$(jqr "$p_opa" '.route | length > 0')" "true" "Route hat mindestens einen Punkt"
assert_eq "$(jqr "$p_opa" '[.slides[] | select(.own and (.title | test("Geburt")))] | first | .sources | length > 0')" "true" "Geburt mit Quelle"
assert_eq "$(jqr "$p_opa" '[.slides[] | select(.own and (.title | test("Geburt")))] | first | .media | length > 0')" "true" "Geburt mit Medium (2 OBJE)"
assert_eq "$(jqr "$p_opa" '[.slides[] | select(.title == "Geschichte")] | first | .sortKey')" "null" "Dia 'Geschichte' ohne Datum"
assert_contains "$(jqr "$p_opa" '[.slides[] | select(.title == "Geschichte")] | first | .notes | join(" ")')" "$OPA_M_NOTIZ" "Geschichte enthält die Personennotiz"
assert_eq "$(jqr "$p_opa" '[.slides[] | select(.title == "Bilder und Dokumente")] | first | .media | length > 0')" "true" "Dia 'Bilder und Dokumente' mit Medien"
assert_eq "$(jqr "$p_opa" '[.slides[] | select(.title == "Bilder und Dokumente")] | first | .sortKey')" "null" "Dia 'Bilder und Dokumente' ohne Datum"
for tag in Name Geschlecht "Letzte Änderung" REFN _FSFTID; do
    assert_eq "$(jqr "$p_opa" "[.slides[] | select(.title == \"${tag}\")] | length")" "0" "Kein eigenständiges Dia '${tag}'"
done
thumb="$(jqr "$p_opa" '[.slides[].media[] | select(.kind == "image") | .thumb] | first // empty')"
if [ -n "$thumb" ]; then
    assert_contains "$thumb" "media-thumbnail" "Bild über die Vorschau-Route von webtrees"
    assert_eq "$(wt_curl -o /dev/null -w '%{http_code}' "$thumb")" "200" "Vorschaubild abrufbar"
fi

echo "== test-patrick: unbekannte Kennung =="
p_unbekannt="$(leben I999999999)"
assert_eq "$(jqr "$p_unbekannt" '.person')" "null" "Unbekannte Kennung -> person:null"
assert_eq "$(jqr "$p_unbekannt" '.hidden')" "true" "Unbekannte Kennung -> hidden:true"
assert_eq "$(jqr "$p_unbekannt" 'has("slides")')" "false" "Unbekannte Kennung -> keine slides"

echo "== test-patrick: Lebensweg des Vaters (${vater}) =="
p_vater="$(leben "$vater")"
form_pruefen "$p_vater" "Vater"
p_mutter="$(leben "$mutter")"
form_pruefen "$p_mutter" "Mutter"

# Großmutter der Ehepartnerin (tot): ihr Lebensweg enthält die Geburt ihrer lebenden Tochter, der Schwiegermutter,
# die für test-pfad verborgen ist (Pfadlänge 2).
echo "== test-patrick: Lebensweg von ${SCHWIEGEROMA} (Verwandten-Ereignis einer für test-pfad verborgenen Person) =="
p_schwiegeroma="$(leben ${SCHWIEGEROMA})"
form_pruefen "$p_schwiegeroma" "${SCHWIEGEROMA}"
schwiegeroma_dia="$(jqr "$p_schwiegeroma" '[.slides[] | select(.own == false and (.persons | any(.xref == "'"${SCHWIEGERMUTTER}"'")))] | first | .id // empty')"
assert_eq "$([ -n "$schwiegeroma_dia" ] && echo ja)" "ja" "test-patrick sieht ein Verwandten-Dia mit der Schwiegermutter"
assert_eq "$(jqr "$p_schwiegeroma" "[.slides[] | select(.id == \"${schwiegeroma_dia}\")] | first | .title")" "Geburt einer Tochter" "Dia: Geburt einer Tochter"
assert_contains "$(jqr "$p_schwiegeroma" "[.slides[] | select(.id == \"${schwiegeroma_dia}\")] | first | .persons[0].name")" "$SCHWIEGERMUTTER_VORNAME" "Dia nennt die Schwiegermutter"
assert_eq "$(jqr "$p_schwiegeroma" "[.slides[] | select(.id == \"${schwiegeroma_dia}\")] | first | .persons[0].relation")" "deine Schwiegermutter" "Schwiegermutter: deine Schwiegermutter"

# Eine Ehe von EHE_PERSON hat eine Notiz und ein Medium an der Familie (1 NOTE, 1 OBJE).
echo "== test-patrick: Notizen und Medien der eigenen Ehe, Quellen der Person =="
p_ehe="$(leben ${EHE_PERSON})"
form_pruefen "$p_ehe" "Ehe-Person"
assert_contains "$(jqr "$p_ehe" '[.slides[] | select(.title == "Geschichte")] | first | .notes | join(" ")')" "$EHE_NOTIZ" "Geschichte enthält die Notiz der Ehe (1 NOTE an der Familie)"
assert_contains "$(jqr "$p_ehe" '[.slides[] | select(.title == "Bilder und Dokumente")] | first | [.media[].title] | join(" | ")')" "$EHE_MEDIUM" "Bilder und Dokumente enthält das Medium der Ehe (1 OBJE an der Familie)"
assert_contains "$(jqr "$p_opa" '[.slides[] | select(.title == "Geschichte")] | first | .sources | join(" | ")')" "Geburtsurkunde" "Geschichte des Großvaters: Quellen der Person (1 SOUR)"
assert_eq "$(jqr "$p_opa" '[.slides[] | select(.title == "Geschichte")] | first | .sources | length > 1')" "true" "Geschichte des Großvaters: mehrere Personenquellen"
assert_eq "$(jqr "$p_vater" '[.slides[] | select(.id == "quellen")] | first | [.title, (.sortKey == null), (.notes | length), (.sources | length > 0)] | @tsv')" "$(printf 'Quellen\ttrue\t0\ttrue')" "Vater ohne Notizen: eigenes undatiertes Dia „Quellen“ mit den Personenquellen"
p_patrick="$(leben ${ICH})"
form_pruefen "$p_patrick" "${ICH}"
# Medien, deren Titel ein Dateiname ist (z. B. aus Ancestry), bekommen keinen Titel.
p_dateinamen="$(leben ${DATEINAMEN_PERSON})"
assert_eq "$(jqr "$p_dateinamen" '[.slides[].media[] | select(.title == "")] | length > 0')" "true" "${DATEINAMEN_PERSON}: Medien mit Dateinamen als Titel ohne Titel"
assert_eq "$(jqr "$p_dateinamen" '[.slides[].media[].title | select(test("'"${DATEINAMEN_MUSTER}"'"))] | length')" "0" "${DATEINAMEN_PERSON}: kein Dateiname als Medientitel"
for b in p_patrick p_vater p_mutter p_opa p_ehe p_schwiegeroma p_dateinamen; do
    j="${!b}"
    assert_not_contains "$j" "Referenznummer: MH:" "${b}: keine Import-Kennungen als Notiz"
    assert_eq "$(jqr "$j" '[.slides[].media[].title | select(test("\\s") | not) | select(test("[_^]|\\.[A-Za-z][A-Za-z0-9]{1,4}$"))] | length')" "0" "${b}: keine Dateinamen als Medientitel"
    assert_eq "$(jqr "$j" '[.slides[] | select(.sortKey == null and (.id == "geschichte" or .id == "quellen" or .id == "bilder-und-dokumente"))] | map(.id) | length == (unique | length)')" "true" "${b}: Bilder/Geschichte/Quellen höchstens einmal"
done

echo "== test-pfad (Beziehungspfad 1): verborgene Personen in Verwandten-Ereignissen =="
COOKIE_JAR="$JAR_PFAD"
assert_eq "$(schaufenster_login test-pfad "$PASSWORT")" "302" "Anmeldung test-pfad"
q_vater="$(leben "$vater")"
q_mutter="$(leben "$mutter")"
q_opa="$(leben "$opa")"
q_schwiegeroma="$(leben ${SCHWIEGEROMA})"
form_pruefen "$q_vater" "test-pfad Vater"
form_pruefen "$q_schwiegeroma" "test-pfad ${SCHWIEGEROMA}"
assert_contains "$(jqr "$q_schwiegeroma" '.person.name')" "$SCHWIEGEROMA_NACHNAME" "test-pfad sieht die Großmutter der Ehepartnerin (tot)"
assert_not_contains "$q_schwiegeroma" "\"${schwiegeroma_dia}\"" "test-pfad: Dia 'Geburt einer Tochter' fehlt"
assert_not_contains "$q_schwiegeroma" "$SCHWIEGERMUTTER_VORNAME" "test-pfad: kein Name der verborgenen Tochter"
assert_not_contains "$q_schwiegeroma" "$SCHWIEGERMUTTER" "test-pfad: keine Kennung der verborgenen Tochter"
assert_not_contains "$q_schwiegeroma" "$PARTNERIN_VATER_VORNAMEN" "test-pfad: kein Name des verborgenen Schwiegersohns"
assert_not_contains "$q_schwiegeroma" "$SCHWIEGERVATER" "test-pfad: keine Kennung des verborgenen Schwiegersohns"

verborgen=0
for paar in "Vater:p_vater:q_vater" "Mutter:p_mutter:q_mutter" "Großvater:p_opa:q_opa" "${SCHWIEGEROMA}:p_schwiegeroma:q_schwiegeroma"; do
    b="${paar%%:*}"; rest="${paar#*:}"; p_name="${rest%%:*}"; q_name="${rest#*:}"
    p="${!p_name}"; q="${!q_name}"
    sichtbar_pfad=" $(jqr "$q" '[.slides[].persons[].xref] | unique | join(" ")') "
    while IFS=$'\t' read -r hx hname; do
        [ -z "$hx" ] && continue
        case "$sichtbar_pfad" in
            *" $hx "*) ;;
            *)
                verborgen=$((verborgen + 1))
                echo "INFO Lebensweg ${b}: ${hx} (${hname}) sieht test-patrick, test-pfad nicht"
                assert_not_contains "$q" "$hname" "Lebensweg ${b}: Name '${hname}' nicht in der Antwort für test-pfad"
                assert_not_contains "$q" "\"${hx}\"" "Lebensweg ${b}: Kennung ${hx} nicht in der Antwort für test-pfad"
                ;;
        esac
    done < <(jqr "$p" '[.slides[].persons[] | [.xref, .name]] | unique[] | @tsv')
done
assert_eq "$([ "$verborgen" -gt 0 ] && echo ja)" "ja" "Mindestens eine Person in einem Verwandten-Ereignis ist für test-pfad verborgen (${verborgen})"

echo "== test-pfad: Notizen, Medien und Quellen der Ehen nur, wenn sichtbar =="
q_ehe="$(leben ${EHE_PERSON})"
q_patrick="$(leben ${ICH})"
# Diese Ehe hat ein Kind ohne Daten (gilt als lebend, für test-pfad verborgen): webtrees
# verbirgt dann die ganze Familie. Ihre Notiz und ihr Medium dürfen test-pfad nicht erreichen, test-patrick sieht beide.
assert_eq "$(jqr "$(get_json "${STATION}/${EHE_KIND_LEBEND}")" '.hidden')" "true" "test-pfad: Kind der Ehe ist verborgen"
assert_not_contains "$q_ehe" "$EHE_NOTIZ" "test-pfad: keine Notiz der verborgenen Ehe"
assert_not_contains "$q_ehe" "$EHE_MEDIUM" "test-pfad: kein Medium der verborgenen Ehe"
assert_contains "$(jqr "$q_ehe" '[.slides[] | select(.title == "Geschichte")] | first | .notes | join(" ")')" "$EHE_PERSON_NOTIZ" "test-pfad: eigene Notiz der Person bleibt sichtbar"
# Ohne Datum: alles, was test-pfad in Geschichte/Bilder/Quellen sieht, sieht auch test-patrick (nie mehr).
undatiert='[.slides[] | select(.sortKey == null) | (.notes[]?), (.media[]?.title), (.sources[]?)] | unique'
for paar in "Vater:p_vater:q_vater" "Mutter:p_mutter:q_mutter" "Großvater:p_opa:q_opa" "${SCHWIEGEROMA}:p_schwiegeroma:q_schwiegeroma" "Ehe:p_ehe:q_ehe" "${ICH}:p_patrick:q_patrick"; do
    b="${paar%%:*}"; rest="${paar#*:}"; p_name="${rest%%:*}"; q_name="${rest#*:}"
    p="${!p_name}"; q="${!q_name}"
    mehr="$(jq -n --argjson p "$(jqr "$p" "$undatiert")" --argjson q "$(jqr "$q" "$undatiert")" '$q - $p | length')"
    assert_eq "$mehr" "0" "Lebensweg ${b}: test-pfad sieht ohne Datum nichts, was test-patrick nicht sieht"
done

echo "== test-ohne-person: Lebensweg ohne Betrachter =="
COOKIE_JAR="${TMPDIR:-/tmp}/schaufenster-smoke-cookies-ohne-person.txt"
assert_eq "$(schaufenster_login test-ohne-person "$PASSWORT")" "302" "Anmeldung test-ohne-person"
for x in ${ERSATZ_START} ${ICH} "$opa"; do
    o="$(leben "$x")"
    form_pruefen "$o" "test-ohne-person ${x}"
    assert_eq "$(jqr "$o" '.person.relation')" "" "test-ohne-person ${x}: person.relation leer"
    assert_eq "$(jqr "$o" '[.slides[].persons[] | select(.relation != "")] | length')" "0" "test-ohne-person ${x}: keine Verwandtschaftsnamen in Dias"
    assert_not_contains "$o" '"directLine":true' "test-ohne-person ${x}: kein directLine:true"
done
assert_eq "$(jqr "$(leben ${ICH})" '[.slides[].persons[]] | length > 0')" "true" "test-ohne-person: Lebensweg ${ICH} nennt Personen"
COOKIE_JAR="$JAR_PFAD"

q_stiefmutter="$(leben ${STIEFMUTTER})"
assert_eq "$(jqr "$q_stiefmutter" '.person')" "null" "test-pfad: Lebensweg der verborgenen ${STIEFMUTTER} -> person:null"
assert_eq "$(jqr "$q_stiefmutter" '.hidden')" "true" "test-pfad: verborgene ${STIEFMUTTER} -> hidden:true"
assert_not_contains "$q_stiefmutter" "$STIEFMUTTER_NAME" "test-pfad: kein Name der verborgenen Person"

smoke_ende
