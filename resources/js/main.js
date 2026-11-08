// Einstieg: liest die Daten, die StreetPage in #strasse ablegt, baut die Straße auf und öffnet beim Klick auf eine
// Person ihren Lebensweg.
import { mountStreet } from 'schaufenster/street.js';
import { openLife } from 'schaufenster/life.js';
import { useLeaflet } from 'schaufenster/map.js';
// Abmelden über Ajax, danach auf die Schaufenster-Anmeldeseite (auch für Formulare, die street.js/life.js bauen).
import 'schaufenster/abmelden.js';

const root = document.getElementById('strasse');

if (root && root.dataset.startCard) {
    const silhouettes = JSON.parse(root.dataset.silhouetten ?? '{}');
    const loginUrl = root.dataset.login ?? '';
    const logoutUrl = root.dataset.abmelden ?? '';
    useLeaflet(JSON.parse(root.dataset.leaflet ?? '{}'));

    const street = mountStreet(root, {
        apiBase: root.dataset.api,
        start: JSON.parse(root.dataset.startCard),
        silhouettes,
        loginUrl,
        logoutUrl,
        onOpenPerson: (xref, origin) => {
            root.dispatchEvent(new CustomEvent('schaufenster:person', { detail: { xref }, bubbles: true }));
            openLife(xref, {
                apiBase: root.dataset.leben,
                origin,
                inertRoot: root,
                silhouettes,
                loginUrl,
                logoutUrl,
                isOnStreet: (other) => street.isOnStreet(other),
                onNavigate: (other) => street.navigateTo(other),
                onRestartFrom: (other, card) => street.restartFrom(other, card),
            });
        },
    });
}
