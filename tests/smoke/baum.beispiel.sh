# Vorlage für tests/smoke/baum.sh: die baumspezifischen Testwerte der Smoke-Tests.
# Kopieren nach baum.sh (steht in .gitignore) und mit Kennungen und Namen aus dem eigenen Baum füllen.
# Echte Namen gehören nur in baum.sh, nie ins Repository.
#
# Die Testkonten sind mit ICH verknüpft; test-pfad sieht Lebende nur bis Pfadlänge 1.

ICH=I1                      # Person der Testkonten; hat Vater und Mutter, keine Geschwister, keine weiteren Elternfamilien
ERSATZ_START=I2             # irgendeine sichtbare Person (Lebensweg ohne Betrachter)
VATER_NACHNAME="Muster"     # Teil des Namens des Vaters
VATER_TOD_JAHR=2000
VATER_WEITERE_EHE=F2        # weitere Ehe des Vaters (Familie)
STIEFMUTTER=I3              # Ehefrau dieser weiteren Ehe, lebend, für test-pfad verborgen
STIEFMUTTER_NAME="Erika"    # Teil ihres Namens
MUTTER_VORNAME="Anna"
MUTTER_NACHNAME="Beispiel"
MUTTER_GEBURT_JAHR=1940
MUTTER_GEBURT_ORT="Hamburg" # Geburtsort genau wie im Baum
ELTERNFAMILIE=F1            # Familie der Eltern
ELTERN_HEIRAT_JAHR=1960
MUTTER_ELTERNFAMILIE=F3     # Familie der Großeltern mütterlicherseits
OPA_M_VORNAME="Karl"        # Großvater mütterlicherseits, verstorben
OPA_M_GEBURT_JAHR=1900
OPA_M_GEBURT_ORT="Dorf"     # Teil des Geburtsorts
OPA_M_BERUF="Arbeiter"      # Berufsangabe mit Ort/Koordinaten
OPA_M_NOTIZ="Text"          # Teil seiner Personennotiz; außerdem: mehrere Personenquellen, eine davon „Geburtsurkunde“
ONKEL_M_VORNAME="Peter"     # Bruder der Mutter (voller Bruder)
PARTNERIN=I4                # Ehepartner(in) von ICH
PARTNERIN_ELTERNFAMILIE=F4  # deren lebende Eltern (für test-pfad verborgen, Pfadlänge 2)
PARTNERIN_VATER_NACHNAME="Vatername"
PARTNERIN_VATER_VORNAMEN="Vorname"
SCHWIEGERMUTTER=I5
SCHWIEGERMUTTER_VORNAME="Vorname"
SCHWIEGERMUTTER_NACHNAME="Nachname"
SCHWIEGERVATER=I6
SCHWIEGEROMA=I7             # Mutter der Schwiegermutter, verstorben
SCHWIEGEROMA_NACHNAME="Nachname"
EHE_PERSON=I8               # Person, deren Ehe eine Notiz und ein Medium hat, und die selbst eine Notiz hat
EHE_NOTIZ="Text"            # Teil der Notiz an der Familie
EHE_MEDIUM="Titel"          # Teil des Medientitels an der Familie
EHE_PERSON_NOTIZ="Text"     # Teil der eigenen Notiz der Person
EHE_KIND_LEBEND=I9          # Kind dieser Ehe ohne Daten (gilt als lebend, für test-pfad verborgen)
DATEINAMEN_PERSON=I10       # Person mit Medien, deren Titel ein Dateiname ist
DATEINAMEN_MUSTER="_"       # Teil dieses Dateinamens
