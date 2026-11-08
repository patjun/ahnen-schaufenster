#!/usr/bin/env bash
# Smoke-Test Task 3: Verwandtschaft und Station-Endpunkt. Voraussetzung: tests/smoke/setup-testkonten.sh wurde ausgeführt.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./lib.sh

PASSWORT="schaufenster-test"
API="/index.php?route=/tree/${TREE}/schaufenster/api/station"
JAR_PATRICK="${TMPDIR:-/tmp}/schaufenster-smoke-cookies-patrick.txt"
JAR_PFAD="${TMPDIR:-/tmp}/schaufenster-smoke-cookies-pfad.txt"

# Station als JSON. Aufruf: station <xref> [<query-zusatz>]
station() {
    get_json "${API}/$1${2:-}"
}

# Wert per jq. Aufruf: jqr <json> <filter>
jqr() {
    printf '%s' "$1" | jq -r "$2"
}

echo "== Anonym =="
COOKIE_JAR="${TMPDIR:-/tmp}/schaufenster-smoke-cookies-anonym.txt"
neue_sitzung
wt_curl -o "$SCHAUFENSTER_BODY" -D "$SCHAUFENSTER_HEADER" -H 'Accept: application/json' "${BASE_URL}${API}/${ICH}"
assert_eq "$(sed -n 's/^HTTP\/[0-9.]* \([0-9]*\).*/\1/p' "$SCHAUFENSTER_HEADER" | tail -1)" "401" "Station anonym -> 401"
assert_eq "$(jq -r '.error' "$SCHAUFENSTER_BODY" 2>/dev/null)" "anmeldung" "Anonym: JSON {error:\"anmeldung\"}"
assert_contains "$(grep -i '^content-type' "$SCHAUFENSTER_HEADER")" "application/json" "Anonym: Typ application/json"

echo "== test-patrick: Station ${ICH} =="
COOKIE_JAR="$JAR_PATRICK"
assert_eq "$(schaufenster_login test-patrick "$PASSWORT")" "302" "Anmeldung test-patrick"
wt_curl -o "$SCHAUFENSTER_BODY" -D "$SCHAUFENSTER_HEADER" -H 'Accept: application/json' "${BASE_URL}${API}/${ICH}"
assert_eq "$(sed -n 's/^HTTP\/[0-9.]* \([0-9]*\).*/\1/p' "$SCHAUFENSTER_HEADER" | tail -1)" "200" "Station ${ICH} -> 200"
assert_contains "$(grep -i '^content-type' "$SCHAUFENSTER_HEADER")" "application/json" "Station: Typ application/json"
assert_contains "$(grep -i '^cache-control' "$SCHAUFENSTER_HEADER")" "no-store" "Station: cache-control no-store"
p_patrick="$(cat "$SCHAUFENSTER_BODY")"
assert_contains "$(jqr "$p_patrick" '.station.father.name')" "$VATER_NACHNAME" "Vater-Name enthält ${VATER_NACHNAME}"
assert_contains "$(jqr "$p_patrick" '.station.mother.name')" "$MUTTER_NACHNAME" "Mutter-Name enthält ${MUTTER_NACHNAME}"
assert_eq "$(jqr "$p_patrick" '.station.father.directLine')" "true" "Vater directLine:true"
assert_eq "$(jqr "$p_patrick" '.station.mother.directLine')" "true" "Mutter directLine:true"
assert_eq "$(jqr "$p_patrick" '.station.mother.relation')" "deine Mutter" "Mutter relation = deine Mutter"
assert_eq "$(jqr "$p_patrick" '.station.father.relation')" "dein Vater" "Vater relation = dein Vater"
assert_eq "$(jqr "$p_patrick" '.station.family')" "$ELTERNFAMILIE" "Elternfamilie ${ELTERNFAMILIE}"
assert_contains "$(jqr "$p_patrick" '.station.marriage.date')" "$ELTERN_HEIRAT_JAHR" "Heirat der Eltern ${ELTERN_HEIRAT_JAHR}"
assert_contains "$(jqr "$p_patrick" '.station.mother.birth.date')" "$MUTTER_GEBURT_JAHR" "Geburtsdatum der Mutter (${MUTTER_GEBURT_JAHR})"
assert_eq "$(jqr "$p_patrick" '.station.mother.birth.place')" "$MUTTER_GEBURT_ORT" "Geburtsort der Mutter = ${MUTTER_GEBURT_ORT} (ohne HTML)"
assert_eq "$(jqr "$p_patrick" '.station.mother.sex')" "F" "Mutter sex F"
assert_eq "$(jqr "$p_patrick" ".station.father.death.date | test(\"${VATER_TOD_JAHR}\")")" "true" "Todesdatum des Vaters (${VATER_TOD_JAHR})"
assert_eq "$(jqr "$p_patrick" '.station.siblings | length')" "0" "Startperson hat keine Geschwister"
assert_eq "$(jqr "$p_patrick" '.station.alternatives | length')" "0" "Keine weiteren Elternfamilien"
assert_eq "$(jqr "$p_patrick" "[.station.fatherOtherMarriages[].family] | index(\"${VATER_WEITERE_EHE}\") != null")" "true" "Weitere Ehe des Vaters (${VATER_WEITERE_EHE}) als Scheibe"
assert_contains "$(jqr "$p_patrick" ".station.fatherOtherMarriages[] | select(.family==\"${VATER_WEITERE_EHE}\") | .spouse.name")" "$STIEFMUTTER_NAME" "Ehefrau der weiteren Ehe sichtbar für Mitglied"
assert_eq "$(jqr "$p_patrick" ".station.fatherOtherMarriages[] | select(.family==\"${VATER_WEITERE_EHE}\") | .spouse.directLine")" "false" "Ehefrau der weiteren Ehe: nicht direkte Linie"
assert_eq "$(jqr "$p_patrick" ".station.fatherOtherMarriages[] | select(.family==\"${VATER_WEITERE_EHE}\") | .spouse.relation")" "deine Stiefmutter" "Ehefrau der weiteren Ehe: deine Stiefmutter"
assert_not_contains "$p_patrick" "<span" "Keine HTML-Auszeichnung in der Antwort"
assert_not_contains "$p_patrick" "<bdi>" "Keine bdi-Auszeichnung in der Antwort"
img="$(jqr "$p_patrick" '[.station.father, .station.mother][] | select(.image != null) | .image.thumb' | head -1)"
if [ -n "$img" ]; then
    assert_contains "$img" "media-thumbnail" "Bild-URL über die Vorschau-Route von webtrees"
    assert_eq "$(wt_curl -o /dev/null -w '%{http_code}' "$img")" "200" "Vorschaubild abrufbar"
else
    echo "INFO kein Bild bei den Eltern von ${ICH}"
fi

mutter="$(jqr "$p_patrick" '.station.mother.xref')"
echo "== test-patrick: Station ${mutter} (Mutter) =="
p_mutter="$(station "$mutter")"
assert_contains "$(jqr "$p_mutter" '.station.father.name')" "$MUTTER_NACHNAME" "Vater-Name der Mutter enthält ${MUTTER_NACHNAME}"
assert_contains "$(jqr "$p_mutter" '.station.father.name')" "$OPA_M_VORNAME" "Vater der Mutter ist ${OPA_M_VORNAME}"
# webtrees (deutscher Katalog) nennt die Seite der Familie: „Großvater mütterlicherseits“.
assert_eq "$(jqr "$p_mutter" '.station.father.relation')" "dein Großvater mütterlicherseits" "Großvater relation = dein Großvater (mütterlicherseits)"
assert_eq "$(jqr "$p_mutter" '.station.father.directLine')" "true" "Großvater directLine:true"
assert_eq "$(jqr "$p_mutter" '.station.mother.relation')" "deine Großmutter mütterlicherseits" "Großmutter relation = deine Großmutter (mütterlicherseits)"
onkel="$(jqr "$p_mutter" '.station.siblings[] | select(.name | test("'"${ONKEL_M_VORNAME}"'")) | .xref')"
assert_eq "$([ -n "$onkel" ] && echo ja)" "ja" "Geschwister der Mutter enthalten ${ONKEL_M_VORNAME}"
assert_eq "$(jqr "$p_mutter" '.station.siblings[] | select(.name | test("'"${ONKEL_M_VORNAME}"'")) | .directLine')" "false" "Onkel directLine:false"
assert_eq "$(jqr "$p_mutter" '.station.siblings[] | select(.name | test("'"${ONKEL_M_VORNAME}"'")) | .relation | startswith("dein Onkel")')" "true" "Onkel relation beginnt mit 'dein Onkel'"
assert_eq "$(jqr "$p_mutter" '.station.siblings[] | select(.name | test("'"${ONKEL_M_VORNAME}"'")) | .half')" "false" "Onkel ist kein Halbgeschwister"
assert_eq "$(jqr "$p_mutter" "[.station.siblings[].xref] | index(\"${mutter}\") == null")" "true" "Mutter selbst nicht unter den Geschwistern"

echo "== test-patrick: Genitivkette (Station des Großvaters) =="
opa="$(jqr "$p_mutter" '.station.father.xref')"
p_opa="$(station "$opa")"
assert_eq "$(jqr "$p_opa" '.station.father.relation')" "dein Urgroßvater" "Vater des Großvaters = dein Urgroßvater"
assert_eq "$(jqr "$p_opa" '[.station.siblings[].relation | select(startswith("dein") | not) | select(test(" dein(es|er) ") | not)] | length')" "0" "Alle Bezeichnungen haben dein/deine/deines/deiner"

echo "== test-patrick: ?family= =="
fam_mutter="$(jqr "$p_mutter" '.station.family')"
assert_eq "$fam_mutter" "$MUTTER_ELTERNFAMILIE" "Elternfamilie der Mutter ${MUTTER_ELTERNFAMILIE}"
assert_eq "$(jqr "$(station "$mutter" "&family=${fam_mutter}")" '.station.family')" "$fam_mutter" "?family= mit eigener Elternfamilie"
assert_eq "$(jqr "$(station "$mutter" "&family=${ELTERNFAMILIE}")" '.station.family')" "$fam_mutter" "?family= mit fremder Familie fällt auf die leibliche zurück"

echo "== test-patrick: Person ohne Eltern =="
ohne_eltern="$(mysql -uroot -proot -h127.0.0.1 PRIVAT__webtrees -N -e "select i_id from wt_individuals where i_file=(select gedcom_id from wt_gedcom where gedcom_name='${TREE}') and i_gedcom not like '%\n1 FAMC %' and i_gedcom like '%\n1 DEAT%' order by i_id limit 1" 2>/dev/null)"
assert_eq "$([ -n "$ohne_eltern" ] && echo ja)" "ja" "Person ohne FAMC gefunden (${ohne_eltern})"
p_ohne="$(station "$ohne_eltern")"
assert_eq "$(jqr "$p_ohne" '.station')" "null" "Station von ${ohne_eltern} (ohne Eltern) -> station:null"
assert_eq "$(jqr "$p_ohne" '.hidden // false')" "false" "Person ohne Eltern ist nicht verborgen"

echo "== test-patrick: unbekannte / ungültige Kennung =="
p_unbekannt="$(station "I999999999")"
assert_eq "$(jqr "$p_unbekannt" '.station')" "null" "Unbekannte Kennung -> station:null"
assert_eq "$(jqr "$p_unbekannt" '.hidden')" "true" "Unbekannte Kennung -> hidden:true"

p_onkel="$(station "$onkel")"

echo "== test-pfad (Beziehungspfad 1): verborgene Personen =="
COOKIE_JAR="$JAR_PFAD"
assert_eq "$(schaufenster_login test-pfad "$PASSWORT")" "302" "Anmeldung test-pfad"
q_patrick="$(station ${ICH})"
q_mutter="$(station "$mutter")"
q_onkel="$(station "$onkel")"

alle_karten='.station // {} | [.father, .mother, (.siblings // [])[], ((.fatherOtherMarriages // []) + (.motherOtherMarriages // []))[].spouse] | map(select(. != null))[]'
for paar in "${ICH}:q_patrick" "${mutter}:q_mutter" "${onkel}:q_onkel"; do
    x="${paar%%:*}"; q_name="${paar#*:}"; q="${!q_name}"
    unerlaubt="$(jqr "$q" "[${alle_karten} | select(.visible == false) | select(has(\"name\") or has(\"birth\") or has(\"death\") or has(\"image\") or has(\"relation\") or has(\"sex\") or has(\"directLine\"))] | length")"
    assert_eq "$unerlaubt" "0" "Station ${x}: verborgene Karten ohne name/birth/death/image/relation"
done

verborgen=0
for paar in "${ICH}:p_patrick:q_patrick" "${mutter}:p_mutter:q_mutter" "${onkel}:p_onkel:q_onkel"; do
    x="${paar%%:*}"; rest="${paar#*:}"; p_name="${rest%%:*}"; q_name="${rest#*:}"
    p="${!p_name}"; q="${!q_name}"
    sichtbar_pfad="$(jqr "$q" "[${alle_karten} | select(.visible == true) | .xref] | join(\" \")")"
    while IFS=$'\t' read -r hx hname; do
        [ -z "$hx" ] && continue
        case " $sichtbar_pfad " in
            *" $hx "*) ;;
            *)
                verborgen=$((verborgen + 1))
                echo "INFO Station ${x}: ${hx} (${hname}) sieht test-patrick, test-pfad nicht"
                assert_not_contains "$q" "$hname" "Station ${x}: Name '${hname}' nicht in der Antwort für test-pfad"
                ;;
        esac
    done < <(jqr "$p" "${alle_karten} | select(.visible == true) | [.xref, .name] | @tsv")
done
assert_eq "$([ "$verborgen" -gt 0 ] && echo ja)" "ja" "Mindestens eine Person ist für test-pfad verborgen (${verborgen})"
assert_not_contains "$q_patrick" "$STIEFMUTTER_NAME" "test-pfad: Stiefmutter (zweite Ehefrau des Vaters) taucht nicht auf"
assert_eq "$(jqr "$q_patrick" '.station.mother.visible')" "true" "test-pfad sieht die Mutter (Pfadlänge 1)"

echo "== test-pfad: verborgene Startperson und verborgene Eltern =="
q_stiefmutter="$(station "$STIEFMUTTER")"
assert_eq "$(jqr "$q_stiefmutter" '.station')" "null" "Station der verborgenen ${STIEFMUTTER} -> station:null"
assert_eq "$(jqr "$q_stiefmutter" '.hidden')" "true" "Station der verborgenen ${STIEFMUTTER} -> hidden:true"
# Ehepartnerin der Startperson (Pfadlänge 1) ist sichtbar; ihre lebenden Eltern liegen bei Pfadlänge 2.
q_partnerin="$(station "$PARTNERIN")"
assert_eq "$(jqr "$q_partnerin" '.station')" "null" "Beide Eltern verborgen -> station:null"
assert_eq "$(jqr "$q_partnerin" '.hidden')" "true" "Beide Eltern verborgen -> hidden:true (nicht 'Ende der Linie')"
assert_not_contains "$q_partnerin" "$PARTNERIN_VATER_VORNAMEN" "Verborgene Eltern: kein Name des Vaters"
assert_not_contains "$q_partnerin" "$SCHWIEGERMUTTER_NACHNAME" "Verborgene Eltern: kein Name der Mutter"
assert_not_contains "$q_partnerin" "$PARTNERIN_ELTERNFAMILIE" "Verborgene Eltern: keine Familienkennung"
COOKIE_JAR="$JAR_PATRICK"
p_partnerin="$(station "$PARTNERIN")"
assert_eq "$(jqr "$p_partnerin" '.station.family')" "$PARTNERIN_ELTERNFAMILIE" "Gegenprobe test-patrick: Eltern der Ehepartnerin sichtbar"
assert_contains "$(jqr "$p_partnerin" '.station.father.name')" "$PARTNERIN_VATER_NACHNAME" "Gegenprobe test-patrick: Name des Vaters"
assert_eq "$(jqr "$p_ohne" 'has("hidden")')" "false" "Ohne Elternfamilie: station:null ohne hidden"

echo "== test-ohne-person: kein Betrachter (Ersatz-Startperson) =="
COOKIE_JAR="${TMPDIR:-/tmp}/schaufenster-smoke-cookies-ohne-person.txt"
assert_eq "$(schaufenster_login test-ohne-person "$PASSWORT")" "302" "Anmeldung test-ohne-person"
o_start="$(get "/index.php?route=/tree/${TREE}/schaufenster" | sed -n 's/.*data-start="\([^"]*\)".*/\1/p' | head -1)"
assert_eq "$([ -n "$o_start" ] && echo ja)" "ja" "test-ohne-person hat eine Startperson (${o_start})"
o_eins="$(station "$o_start")"
o_patrick="$(station ${ICH})"
o_mutter="$(station "$mutter")"
for paar in "${o_start}:o_eins" "${ICH}:o_patrick" "${mutter}:o_mutter"; do
    x="${paar%%:*}"; o_name="${paar#*:}"; o="${!o_name}"
    assert_eq "$(jqr "$o" '.station != null')" "true" "test-ohne-person: Station ${x} geladen"
    assert_eq "$(jqr "$o" '[.. | objects | select(has("relation")) | select(.relation != "")] | length')" "0" "test-ohne-person: Station ${x} ohne Verwandtschaftsnamen"
    assert_not_contains "$o" '"directLine":true' "test-ohne-person: Station ${x} ohne directLine:true"
    assert_eq "$(jqr "$o" '[.. | objects | select(has("relation"))] | length > 0')" "true" "test-ohne-person: Station ${x} hat sichtbare Karten"
done

smoke_ende
