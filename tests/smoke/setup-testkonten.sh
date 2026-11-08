#!/usr/bin/env bash
# Legt die Testkonten für die Smoke-Tests an (idempotent). Nur lokale Instanz, nur über die webtrees-CLI.
set -euo pipefail

WT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PASSWORT="schaufenster-test"
BAUM="tree1"
source "$(dirname "${BASH_SOURCE[0]}")/baum.sh"

wt() { (cd "$WT_DIR" && php index.php "$@"); }

konto() {
    local name="$1" gedcomid="${2:-}" rolle="${3:-}" verified="${4:-1}" genehmigt="${5:-1}"

    if wt user-list | grep -qE "\| ${name} +\|"; then
        echo "Konto ${name} existiert, setze nur Einstellungen."
    else
        wt user --create --real-name="$name" --email="${name}@example.invalid" --password="$PASSWORT" "$name"
    fi

    wt user-setting "$name" verified "$verified"
    wt user-setting "$name" verified_by_admin "$genehmigt"

    if [ -n "$rolle" ]; then
        wt user-tree-setting "$name" "$BAUM" canedit "$rolle"
    else
        wt user-tree-setting --delete "$name" "$BAUM" canedit
    fi

    if [ -n "$gedcomid" ]; then
        wt user-tree-setting "$name" "$BAUM" gedcomid "$gedcomid"
    else
        wt user-tree-setting --delete "$name" "$BAUM" gedcomid
    fi
}

konto test-patrick      "$ICH" access
konto test-ohne-person  ""      access
konto test-ohne-rolle   "$ICH" ""
# Konten für die Anmeldeprüfungen: E-Mail unbestätigt bzw. vom Administrator nicht freigeschaltet (Spalten: gedcomid, Rolle, verified, verified_by_admin).
konto test-unverifiziert "$ICH" access 0 1
konto test-ungenehmigt   "$ICH" access 1 0
# Mitglied mit Beziehungs-Datenschutz: lebende Personen sind nur bis Pfadlänge 1 (Eltern, Kinder, Ehepartner,
# Geschwister) sichtbar. Damit lassen sich verborgene Personen prüfen (test-ohne-rolle kommt in den privaten Baum nicht hinein).
konto test-pfad          "$ICH" access
wt user-tree-setting test-pfad "$BAUM" RELATIONSHIP_PATH_LENGTH 1
