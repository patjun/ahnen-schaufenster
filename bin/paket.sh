#!/usr/bin/env bash
# Baut ahnen-schaufenster-<version>.zip aus dem letzten Commit (HEAD), ohne Entwicklungsdateien.
# Das Archiv entpackt zu einem Ordner `ahnen-schaufenster/` mit module.php an oberster Stelle
# und gehört nach modules_v4/ des Servers. Nur eingecheckte Dateien kommen hinein.
set -euo pipefail

cd "$(dirname "$0")/.."
version="$(git show HEAD:latest-version.txt | tr -d '[:space:]')"
ziel="$PWD/ahnen-schaufenster-${version}.zip"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Hinweis: Es gibt nicht eingecheckte Änderungen; das Paket enthält nur den Stand von HEAD." >&2
fi

rm -f "$ziel"
# Die Ausschlüsse gelten nur für den Modul-Wurzelordner: `resources/vendor/leaflet/` (Leaflet,
# wird zur Laufzeit gebraucht) bleibt erhalten, das Composer-`vendor/` (nur PHPUnit) entfällt.
git archive --format=zip --prefix=ahnen-schaufenster/ -o "$ziel" HEAD -- . \
  ':(exclude)vendor' \
  ':(exclude)tests' \
  ':(exclude)bin' \
  ':(exclude)tools' \
  ':(exclude)node_modules' \
  ':(exclude)composer.json' \
  ':(exclude)composer.lock' \
  ':(exclude)phpunit.xml' \
  ':(exclude)package.json' \
  ':(exclude)package-lock.json' \
  ':(exclude).gitignore' \
  ':(exclude).github' \
  ':(exclude).phpunit.result.cache'

echo "Paket: $ziel (Version ${version})"
if ! git tag --points-at HEAD | grep -qx "v${version}"; then
  echo "Hinweis: HEAD trägt nicht das Tag v${version} – für ein Release erst taggen (siehe README, „Versionen“)." >&2
fi
unzip -l "$ziel" | tail -1
