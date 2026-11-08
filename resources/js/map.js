// Die Karte zum Lebensweg: alle Orte der eigenen Dias als Weg, der beim Blättern bis zum aktuellen Punkt wächst.
// Leaflet 1.9.4 liegt im Modul (resources/vendor/leaflet) und wird erst beim ersten Kartenaufruf geladen.
// Kacheln kommen von tile.openstreetmap.org (einzige externe Quelle, mit Namensnennung).

import { reducedMotion, narrowScreen } from 'schaufenster/dom.js';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-Mitwirkende</a>';

const GOLD = '#e7c27a';
const SEPIA = '#5a4a38';

let assets = { js: '', css: '' };
let loading = null;

/** Adressen von leaflet.js und leaflet.css (Asset-Route des Moduls); main.js setzt sie aus den Daten der Seite. */
export function useLeaflet(urls) {
    assets = { ...assets, ...urls };
}

function loadLeaflet() {
    if (window.L) {
        return Promise.resolve(window.L);
    }
    if (!loading) {
        loading = new Promise((resolve, reject) => {
            if (assets.css && !document.querySelector('link[data-leaflet]')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = assets.css;
                link.dataset.leaflet = '';
                document.head.append(link);
            }
            const script = document.createElement('script');
            script.src = assets.js;
            script.async = true;
            script.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet fehlt')));
            script.onerror = () => reject(new Error('Leaflet ließ sich nicht laden'));
            document.head.append(script);
        }).catch((error) => {
            loading = null;
            throw error;
        });
    }

    return loading;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

/**
 * Karte mit animierter Route in `el`.
 *
 * @param {HTMLElement} el
 * @param {Array<{lat:number, lng:number, place:string, slideId:string}>} route
 * @param {{onSelect?: (slideId: string) => void, onFail?: () => void}} [options]
 *        onSelect: Klick auf einen Kartenpunkt; onFail: Leaflet ließ sich nicht laden (Karte ausblenden)
 * @returns {{highlight(slideId: string|null, point?: {lat:number,lng:number}|null): void,
 *            playTo(slideId: string|null): void, resize(): void, destroy(): void}|null}
 *          null bei leerer Route (dann bleibt der Kartenbereich ausgeblendet)
 */
export function createRouteMap(el, route, options = {}) {
    if (!Array.isArray(route) || route.length === 0) {
        return null;
    }

    const points = route.map((point) => [point.lat, point.lng]);
    const indexOf = new Map(route.map((point, index) => [point.slideId, index]));

    let L = null;
    let map = null;
    let line = null;
    let head = null;
    let extra = null;
    const markers = [];
    let destroyed = false;
    let observer = null;

    /** Gezeichneter Stand (Kommazahl: 1.5 = halbe Strecke zwischen Punkt 1 und 2), -1 = keine Linie. */
    let drawn = -1;
    let frame = 0;
    let wanted = { play: undefined, highlight: undefined };

    function lineTo(progress) {
        if (progress < 0) {
            line.setLatLngs([]);
            head.setStyle({ opacity: 0, fillOpacity: 0 });

            return;
        }
        const whole = Math.floor(progress);
        const part = progress - whole;
        const latlngs = points.slice(0, whole + 1);
        let tip = points[whole];
        if (part > 0 && whole + 1 < points.length) {
            const [a, b] = [points[whole], points[whole + 1]];
            tip = [a[0] + (b[0] - a[0]) * part, a[1] + (b[1] - a[1]) * part];
            latlngs.push(tip);
        }
        line.setLatLngs(latlngs);
        head.setLatLng(tip).setStyle({ opacity: 1, fillOpacity: 1 });
    }

    function markVisited(progress) {
        markers.forEach((marker, index) => {
            const visited = index <= progress;
            marker.setStyle({
                color: visited ? GOLD : '#a89878',
                fillColor: visited ? '#c8a96a' : '#2a2219',
                fillOpacity: visited ? 0.9 : 0.85,
            });
        });
    }

    function animateTo(target) {
        cancelAnimationFrame(frame);
        const from = drawn;
        const distance = Math.abs(target - from);
        if (distance === 0) {
            lineTo(target);
            markVisited(target);

            return;
        }
        const duration = reducedMotion() ? 0 : Math.min(1400, Math.max(450, 550 * distance));
        const started = performance.now();
        const step = (now) => {
            const t = duration === 0 ? 1 : Math.min(1, (now - started) / duration);
            drawn = from + (target - from) * ease(t);
            lineTo(drawn);
            markVisited(Math.floor(drawn + 1e-6));
            if (t < 1) {
                frame = requestAnimationFrame(step);
            } else {
                drawn = target;
                follow(target);
            }
        };
        frame = requestAnimationFrame(step);
    }

    /** Den aktuellen Punkt im Blick behalten, ohne die Karte bei jedem Dia neu auszurichten. */
    function follow(index) {
        if (index >= 0 && map) {
            map.panInside(points[index], { padding: [48, 48] });
        }
    }

    function applyPlay(slideId) {
        const target = slideId === null ? -1 : (indexOf.get(slideId) ?? drawn);
        animateTo(target);
    }

    function applyHighlight(slideId, point) {
        const index = slideId === null ? undefined : indexOf.get(slideId);
        markers.forEach((marker, i) => marker.setRadius(i === index ? 9 : 6));
        const samePlace = point && points.some(([lat, lng]) => lat === point.lat && lng === point.lng);
        if (index === undefined && point && !samePlace) {
            // Ort eines Familienereignisses: zusätzlich zeigen und den Ausschnitt so wählen, dass der Weg im Blick bleibt.
            const where = [point.lat, point.lng];
            extra.setLatLng(where).setStyle({ opacity: 1, fillOpacity: 0.9 });
            if (!map.getBounds().pad(-0.08).contains(where)) {
                map.flyToBounds(L.latLngBounds([...points, where]), {
                    padding: [48, 48], maxZoom: 11, duration: reducedMotion() ? 0 : 0.8,
                });
            }
        } else {
            extra.setStyle({ opacity: 0, fillOpacity: 0 });
        }
    }

    function build(leaflet) {
        if (destroyed) {
            return;
        }
        L = leaflet;
        const mobile = narrowScreen();
        map = L.map(el, {
            zoomControl: true,
            attributionControl: true,
            // Mobil liegt die Karte in einer senkrecht scrollenden Ansicht: Ein-Finger-Ziehen soll die Seite scrollen.
            dragging: !mobile,
            scrollWheelZoom: !mobile,
            zoomSnap: 0.5,
            fadeAnimation: !reducedMotion(),
            zoomAnimation: !reducedMotion(),
        });
        map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
        L.tileLayer(TILES, {
            maxZoom: 18,
            attribution: ATTRIBUTION,
            // webtrees schickt "Referrer-Policy: same-origin"; OSM verlangt aber eine Herkunftsangabe und sperrt sonst
            // die Kacheln. Nur der Ursprung (ohne Pfad und XREF) geht an tile.openstreetmap.org.
            referrerPolicy: 'strict-origin',
        }).addTo(map);

        // Der ganze Weg blass gestrichelt, darüber die wachsende goldene Linie.
        L.polyline(points, { color: SEPIA, weight: 2, opacity: 0.9, dashArray: '4 6', interactive: false }).addTo(map);
        line = L.polyline([], { color: GOLD, weight: 4, opacity: 0.95, lineCap: 'round', interactive: false }).addTo(map);

        route.forEach((point, index) => {
            const tooltip = document.createElement('span');
            tooltip.textContent = point.place ?? '';
            const marker = L.circleMarker(points[index], {
                radius: 6, weight: 2, color: '#a89878', fillColor: '#2a2219', fillOpacity: 0.85, className: 'karte-punkt',
            }).addTo(map);
            if (point.place) {
                marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -6], className: 'karte-hinweis' });
            }
            marker.on('click', () => options.onSelect?.(point.slideId));
            markers.push(marker);
        });

        extra = L.circleMarker(points[0], {
            radius: 8, weight: 2, color: '#f3e9d8', dashArray: '3 3', fillColor: '#a89878', opacity: 0, fillOpacity: 0,
            interactive: false, className: 'karte-familie',
        }).addTo(map);
        head = L.circleMarker(points[0], {
            radius: 9, weight: 3, color: '#fff6e0', fillColor: GOLD, opacity: 0, fillOpacity: 0,
            interactive: false, className: 'karte-jetzt',
        }).addTo(map);

        if (points.length === 1) {
            map.setView(points[0], 8);
        } else {
            map.fitBounds(points, { padding: [40, 40], maxZoom: 11 });
        }

        observer = new ResizeObserver(() => map?.invalidateSize({ pan: false }));
        observer.observe(el);

        if (wanted.play !== undefined) {
            drawn = -1;
            applyPlay(wanted.play);
        }
        if (wanted.highlight !== undefined) {
            applyHighlight(...wanted.highlight);
        }
    }

    loadLeaflet().then(build, () => {
        if (!destroyed) {
            options.onFail?.();
        }
    });

    return {
        playTo(slideId) {
            wanted.play = slideId;
            if (map) {
                applyPlay(slideId);
            }
        },
        highlight(slideId, point = null) {
            wanted.highlight = [slideId, point];
            if (map) {
                applyHighlight(slideId, point);
            }
        },
        resize() {
            map?.invalidateSize({ pan: false });
        },
        destroy() {
            destroyed = true;
            cancelAnimationFrame(frame);
            observer?.disconnect();
            map?.remove();
            map = null;
            wanted = { play: undefined, highlight: undefined };
        },
    };
}
