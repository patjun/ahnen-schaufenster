# Ahnen-Schaufenster

webtrees-2.2-Modul: ein animierter Schaufensterbummel durch die Vorfahren des angemeldeten Benutzers.
Modulordner: `modules_v4/ahnen-schaufenster`, Namespace `Jungbluth\AhnenSchaufenster`.
Aktuelle Version: siehe `latest-version.txt` und [CHANGELOG.md](CHANGELOG.md). Lizenz: GPL-3.0 oder später (wie webtrees).

## Installation auf dem Server

Das Paket `ahnen-schaufenster-<version>.zip` (auch als Anhang jedes GitHub-Releases) enthält nur, was im Betrieb gebraucht wird: kein Composer-`vendor/`, keine Tests,
keine `composer.*`/`phpunit.xml`/`package.json`. Leaflet liegt unter `resources/vendor/leaflet/` und gehört dazu.

1. Paket bauen (lokal, aus dem letzten Commit): `bin/paket.sh` → `ahnen-schaufenster-<version>.zip`. Das Archiv entpackt zu einem
   Ordner `ahnen-schaufenster/` mit `module.php` an oberster Stelle.
2. ZIP auf dem Server in `modules_v4/` entpacken, sodass `modules_v4/ahnen-schaufenster/module.php` entsteht.
   Ein vorhandener Ordner wird vorher ersetzt (nicht darüberkopieren, sonst bleiben entfernte Dateien liegen).
3. In webtrees als Administrator: Systemverwaltung → Module → Alle Module → „Ahnen-Schaufenster“ einschalten und speichern.
4. Link für Verwandte: `https://<webtrees-adresse>/index.php?route=%2Fschaufenster`
   (die Form mit `index.php?route=` funktioniert immer; mit `rewrite_urls=1` geht auch `/schaufenster`).
5. Das Modul arbeitet auf dem Baum `tree1` („Mein Stammbaum“); der Baumname ist in `SchaufensterModule::TREE_NAME` festgelegt.

Das Ausrollen entscheidet Patrick; dieses Repository berührt die Produktion nicht.

### Konten für Verwandte

- Ein normales webtrees-Konto mit der Rolle **„Mitglied“** im Baum (Konto genehmigt und E-Mail bestätigt, sonst bleibt
  die Anmeldung auf der Schaufenster-Seite mit einer deutschen Meldung stehen).
- Im Baum bei diesem Benutzer **„Persönlicher Datensatz“** (`gedcomid`) auf die **eigene Person** setzen. Von dort aus
  gehen Startfenster, Verwandtschaftsbezeichnungen und die Kennzeichnung „◆ direkte Linie“. Ohne verknüpfte Person
  (auch beim Administrator) beginnt die Straße bei der Standardperson des Baums, aber **ohne Bezug**: Das Startschild
  heißt „Hier beginnt der Weg“, niemand ist „du“, es gibt keine Verwandtschaftsnamen und keine direkte Linie.
- **Abmelden**: Knopf „Abmelden“ oben rechts in der Straße und auf den Hinweisseiten (kein Zugang, keine sichtbare
  Person). Er schickt webtrees' eigene Abmeldung (`POST /logout`, ohne CSRF-Token, das nimmt webtrees davon aus) und
  führt danach auf die Schaufenster-Anmeldung („Du bist abgemeldet.“); ohne JavaScript landet man auf der
  webtrees-Startseite.
- **Passwort vergessen?** auf der Anmeldeseite führt auf webtrees' Seite „Neues Passwort anfordern“ (webtrees-Layout,
  E-Mail-Versand durch webtrees).
- Die Oberfläche ist immer deutsch, auch wenn die Kontosprache eine andere ist: Verwandte mit englischem oder
  französischem Konto sehen trotzdem Deutsch (Texte, Beziehungsnamen, Ereignisbezeichnungen); die übrige
  webtrees-Oberfläche folgt weiterhin der Kontosprache.
- Was jemand sieht, bestimmen die Datenschutzregeln von webtrees (Rolle, Beziehungs-Datenschutz, Lebende); verborgene
  Personen erscheinen als Fenster „nicht sichtbar“ ohne Namen, Daten und Bild.
- Die Testkonten (`test-…`, siehe unten) gibt es **nur lokal**; auf der Produktion werden sie nicht angelegt.

### Kartenkacheln (OpenStreetMap)

Die Karte im Lebensweg lädt Kacheln von `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (mit „© OpenStreetMap-Mitwirkende“).
Das ist die einzige externe Verbindung des Moduls; alles andere (Leaflet, Schrift, Bilder) wird vom eigenen Server
geliefert. Bei diesen Kachelanfragen sendet der Browser die **Herkunft der Seite** (z. B. `https://stammbaum.example.org`)
als Referer mit, ohne Pfad. OSM verlangt das (Kacheln ohne Herkunftsangabe werden gesperrt); webtrees selbst sendet sonst
`Referrer-Policy: same-origin`, deshalb setzt die Karte `referrerPolicy: 'strict-origin'` ausdrücklich. Außerdem sieht
OSM die IP-Adresse der Besucher. Die Karte wird erst beim ersten Lebensweg mit Koordinaten geladen.

## Entwicklung

```bash
composer install          # nur PHPUnit (require-dev); im Betrieb wird kein vendor/ gebraucht
vendor/bin/phpunit        # Unit-Tests (laden webtrees' vendor/autoload.php aus ../../vendor)
npm test                  # JS-Tests der DOM-freien Logik (node --test tests/js/*.test.mjs)
bin/paket.sh              # baut ahnen-schaufenster-<version>.zip aus HEAD (ohne vendor/, tests/ usw.)
```

## Versionen

[Semantic Versioning](https://semver.org/lang/de/): **MAJOR** wenn Links, Konten oder Einstellungen angepasst werden
müssen, **MINOR** für neue Funktionen, **PATCH** für Fehlerbehebungen. Vor 1.0.0 darf auch MINOR noch brechen.

Die Version steht an drei Stellen, `tests/Unit/VersionTest.php` hält sie gleich:
`SchaufensterModule::VERSION`, `latest-version.txt` und die Überschrift in `CHANGELOG.md`.

Arbeitsweise:
1. Entwicklung auf Zweigen, Pull Request nach `main`; Änderungen unter „Unveröffentlicht“ im CHANGELOG sammeln.
2. Release: Version an den drei Stellen erhöhen, „Unveröffentlicht“ zur neuen Versionsüberschrift mit Datum machen,
   nach `main` bringen, dann `git tag -a vX.Y.Z -m "vX.Y.Z"` und `git push origin vX.Y.Z`.
3. `bin/paket.sh` bauen und das ZIP mit `gh release create vX.Y.Z ahnen-schaufenster-X.Y.Z.zip --notes-file …` anhängen.

Update-Hinweis: webtrees liest `latest-version.txt` aus `main` auf GitHub
(`customModuleLatestVersionUrl`) und zeigt in der Modulverwaltung an, wenn eine neuere Version vorliegt. Deshalb kommt
eine neue Nummer erst mit dem Release nach `main`.

## Smoke-Tests (lokale Instanz `https://privat__webtrees.test`, Baum `tree1`)

Die Smoke-Tests prüfen gegen echte Baumdaten. Kennungen und Namen dafür stehen in `tests/smoke/baum.sh`, die **nicht**
eingecheckt wird. Vorlage mit der Beschreibung jedes Werts: `tests/smoke/baum.beispiel.sh` nach `baum.sh` kopieren und
mit Personen aus dem eigenen Baum füllen. Echte Namen gehören nie ins Repository.

```bash
tests/smoke/setup-testkonten.sh   # legt die Testkonten an (idempotent)
tests/smoke/test-anmeldung.sh     # Anmeldung und Startperson
tests/smoke/test-station.sh       # Station-Endpunkt, Verwandtschaft, verborgene Personen (braucht jq)
tests/smoke/test-leben.sh         # Lebensweg-Endpunkt (Diaschau + Karte), verborgene Personen (braucht jq)
source tests/smoke/lib.sh         # login, get, get_json, get_status, assert_eq
```

Testkonten (Passwort `schaufenster-test`): `test-patrick` (Mitglied, `ICH`),
`test-ohne-person` (Mitglied, keine Person), `test-ohne-rolle` (keine Rolle, `ICH`),
`test-unverifiziert` (E-Mail unbestätigt) und `test-ungenehmigt` (nicht freigeschaltet), beide Mitglied mit `ICH`,
`test-pfad` (Mitglied, `ICH`, Beziehungs-Datenschutz `RELATIONSHIP_PATH_LENGTH` = 1: Lebende nur bis Pfadlänge 1 sichtbar).
Die Konten werden ausschließlich über die webtrees-CLI (`php index.php user …`) angelegt.

## JSON-Endpunkte

- `GET /tree/tree1/schaufenster/api/station/{xref}[?family={xref}]` → `{station: …|null}`: Elternpaar des Kindes `{xref}`
  mit weiteren Ehen (Scheiben), Geschwistern (Seitengasse, `half` für Halbgeschwister) und weiteren Elternfamilien
  (`alternatives`). Verwandtschaft (`relation`, immer deutsch) und `directLine` beziehen sich auf die mit dem Konto
  verknüpfte Person; ohne sie ist `relation` immer `""` und `directLine` immer `false`. Verborgene Personen: nur `{xref, visible:false}`. Unbekanntes oder verborgenes `{xref}`:
  `{station:null, hidden:true}`. Nicht angemeldet: 401 `{error:"anmeldung"}`.
- `GET /tree/tree1/schaufenster/api/leben/{xref}` → `{person, slides, route}`: Lebensweg als Diaschau. Dias aus den
  eigenen Fakten, den Fakten der eigenen Ehen (`own:true`) und den Ereignissen naher Verwandter, wie sie der
  Fakten-Reiter von webtrees zeigt (`own:false`), nur was webtrees dem Benutzer zeigt. Je Dia: `id`, `sortKey`
  (julianischer Tag oder `null`), `date`, `title` (deutsch), `text` (Wert, z. B. Beruf), `place`, `point` (aus
  `PLAC/MAP/LATI/LONG`), `persons` (nur sichtbare: `xref`, `name`, `relation`, `directLine`), `media`
  (`image`/`pdf`/`link`), `notes`, `sources`. Sortiert nach Datum, Dias ohne Datum am Ende; danach „Bilder und
  Dokumente“ (Medien an der Person und an ihren sichtbaren Ehen, die an keinem Dia hängen) und „Geschichte“ (Notizen
  der Person und ihrer sichtbaren Ehen, dazu als `sources` die Quellen am Personendatensatz; ohne Notizen heißt das Dia
  „Quellen“, `id` `quellen`). Notizen, die nur aus Importkennungen bestehen („Referenznummer: MH:…“), entfallen;
  Medientitel, die wie Dateinamen aussehen, werden zu `""` (das Frontend zeigt dann „Foto“/„Dokument“).
  `route`: Punkte der eigenen Dias, gleiche aufeinanderfolgende Punkte einmal. Unbekannt oder verborgen:
  `{person:null, hidden:true}`. Nicht angemeldet: 401 `{error:"anmeldung"}`.

## Frontend (Straße und Lebensweg)

- `resources/js/abmelden.js`: Abmelden per Ajax an webtrees' Logout-Route, danach Schaufenster-Anmeldung; läuft auch
  allein auf den Hinweisseiten. 403 der Endpunkte (kein Zugang mehr) zeigen Straße und Lebensweg als ruhigen Hinweis mit
  „Abmelden“ statt „Nochmal versuchen“.
- `resources/js/main.js` (Einstieg) → `street.js` (`mountStreet(root, {apiBase, start, onOpenPerson, silhouettes, loginUrl})`)
  und `life.js` (`openLife(xref, {apiBase, onNavigate, onRestartFrom, isOnStreet, origin?, inertRoot?, silhouettes?, loginUrl?})`)
  → `map.js` (`createRouteMap(el, route, {onSelect?, onFail?})` → `{highlight, playTo, resize, destroy}` oder `null`),
  `dom.js` (`el()`, `reducedMotion()`, `narrowScreen()`), `model.js` (DOM-freie Logik, `npm test`).
  Die Asset-Route von webtrees trägt den Dateipfad als Query-Parameter, relative ES-Importe lösen dort nicht auf: Die
  Module importieren einander über die Import-Map der Seite (`schaufenster/*.js`), die `StreetPage` mit `assetUrl()` füllt.
- `StreetPage` legt in `#strasse` ab: `data-start-card` (PersonCard der Startperson, JSON), `data-api` (Station-API mit
  `XREF-PLATZHALTER`), `data-leben` (Lebensweg-API, ebenso), `data-leaflet` (`{js, css}`), `data-login`, `data-abmelden` (Logout-Route), `data-silhouetten`.
- Straße: `isOnStreet(xref)`, `navigateTo(xref)` (gleitet zum Fenster, hebt die Karte kurz hervor),
  `restartFrom(xref, card)` (Straße beginnt neu bei `card`; Knopf „Zurück zu dir“ führt heim). Verwandtschaft und direkte
  Linie bleiben auf den angemeldeten Benutzer bezogen.
- Lebensweg: Die angeklickte Karte zoomt (FLIP, 400 ms) zur Vollansicht. Diaschau mit Pfeilen, Punktleiste,
  Pfeiltasten und Wischen; datierte Dias zuerst. Familienereignisse gedämpft mit „in der Familie“. Bilder groß (Klick:
  Großansicht), PDFs im Rahmen mit dem PDF-Betrachter des Browsers (mobil neuer Tab), externe Verweise nur http(s).
  Genannte Personen: auf der Straße → Straße gleitet hin; sonst deren Lebensweg mit „Von hier aus weiterbummeln“ und
  „Zurück zu …“. Schließen: ×, Esc, Wischen nach unten (mobil).
- Karte: Leaflet 1.9.4 (`resources/vendor/leaflet`, BSD-2-Clause, unverändert aus dem offiziellen Release, wird erst
  beim ersten Lebensweg mit Koordinaten geladen). Kacheln von `tile.openstreetmap.org` mit „© OpenStreetMap-Mitwirkende“.
  Weil webtrees `Referrer-Policy: same-origin` sendet, setzen die Kacheln `referrerPolicy: 'strict-origin'` (OSM sperrt
  Kacheln ohne Herkunftsangabe); an OSM geht nur der Ursprung der Seite, kein Pfad.
