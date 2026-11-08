// Die Straße: Gegenwart links, Vergangenheit rechts. Ein Fenster pro Elternpaar, Gabelung in Vater- und Mutterlinie,
// Scheiben für weitere Ehen, Seitengasse für Geschwister. Stationen werden beim Weiterbummeln nachgeladen.
//
// Alles aus der API wird per textContent bzw. Attribut gesetzt, nie als HTML (el() aus dom.js).

import {
    StreetState,
    signpost,
    signpostChoices,
    defaultSide,
    surname,
    firstName,
    generationLabel,
    eventLine,
    halfSiblingNote,
} from 'schaufenster/model.js';
import { el, reducedMotion } from 'schaufenster/dom.js';
import { logoutForm } from 'schaufenster/abmelden.js';

const SIDES = {
    father: { arrow: '↗', line: 'Vaterlinie', missing: 'Vater unbekannt' },
    mother: { arrow: '↘', line: 'Mutterlinie', missing: 'Mutter unbekannt' },
};

/**
 * Baut die Straße in `root` auf.
 *
 * @param {HTMLElement} root
 * @param {{apiBase: string, start: object, onOpenPerson: (xref: string) => void,
 *          silhouettes?: {M?: string, F?: string, U?: string}, loginUrl?: string, logoutUrl?: string}} opts
 *        apiBase: Station-API mit dem Platzhalter "XREF-PLATZHALTER" für die XREF des Kindes
 *        logoutUrl: Logout-Route von webtrees; dann trägt der Kopf „Abmelden“
 */
export function mountStreet(root, opts) {
    const street = new Street(root, opts);
    street.mount();

    return street;
}

class Street {
    constructor(root, opts) {
        this.root = root;
        this.apiBase = opts.apiBase;
        this.start = opts.start;
        /** Die Startperson beim Aufruf (der angemeldete Benutzer); `start` wechselt mit restartFrom(). */
        this.home = opts.start;
        this.onOpenPerson = opts.onOpenPerson ?? (() => {});
        this.silhouettes = opts.silhouettes ?? {};
        this.loginUrl = opts.loginUrl ?? '';
        this.logoutUrl = opts.logoutUrl ?? '';
        this.state = new StreetState();
        /** Erhöht sich bei jeder Wahl; ältere Antworten werden verworfen. */
        this.epoch = 0;
    }

    mount() {
        this.root.replaceChildren();
        this.root.classList.add('strasse');

        this.signpostText = el('span', { class: 'wegweiser-text' });
        const header = el('header', { class: 'kopf' },
            el('div', { class: 'kopf-links' },
                el('p', { class: 'kopf-titel' }, 'Ahnen-Schaufenster'),
                this.homeButton = el('button', { type: 'button', class: 'heimweg', hidden: true, onclick: () => this.restartFrom(this.home.xref, this.home) },
                    el('span', { 'aria-hidden': 'true' }, '↺ '), this.home.relation === 'du' ? 'Zurück zu dir' : 'Zurück zum Anfang')),
            el('p', { class: 'wegweiser', 'aria-live': 'polite' },
                el('span', { class: 'wegweiser-label' }, this.home.relation === 'du' ? 'Dein Weg' : 'Der Weg'),
                this.signpostText),
            el('div', { class: 'kopf-rechts' },
                this.logoutUrl ? logoutForm(this.logoutUrl, this.loginUrl) : null,
                el('p', { class: 'richtung', 'aria-hidden': 'true' },
                    el('span', {}, 'Heute'), el('span', { class: 'richtung-linie' }), el('span', {}, 'Vergangenheit'))),
        );

        this.lane = el('main', { class: 'bahn', tabindex: '0', 'aria-label': 'Straße der Vorfahren, nach rechts in die Vergangenheit' });
        this.root.append(header, this.lane,
            el('button', { type: 'button', class: 'blaettern zurueck', 'aria-label': 'Zurück in die Gegenwart', onclick: () => this.page(-1) }, '‹'),
            el('button', { type: 'button', class: 'blaettern vor', 'aria-label': 'Weiter in die Vergangenheit', onclick: () => this.page(1) }, '›'),
        );

        this.observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting && entry.target.dataset.status === 'wartet') {
                    this.load(entry.target);
                }
            }
        }, { root: this.lane, rootMargin: '0px 320px 0px 0px' });

        this.lane.addEventListener('wheel', (event) => this.wheel(event), { passive: false });
        this.lane.addEventListener('scroll', () => this.updateArrows(), { passive: true });
        window.addEventListener('resize', () => this.updateArrows());

        this.lane.append(this.startStation());
        this.continueAfter(-1);
        this.updateSignpost();
        this.updateArrows();
    }

    // ── Von außen: Lebensweg ↔ Straße ──────────────────────────────────────

    /** Station (Index, -1 = Startfenster), in deren Fenster die Person als Elternteil steht; undefined = nicht auf der Straße. */
    stationOf(xref) {
        if (this.start.xref === xref) {
            return -1;
        }
        const index = this.state.stations.findIndex((entry) => ['father', 'mother']
            .some((side) => entry?.station?.[side]?.visible !== false && entry?.station?.[side]?.xref === xref));

        return index === -1 ? undefined : index;
    }

    /** Steht die Person gerade als Fenster auf der Straße (Startperson oder Elternteil einer geladenen Station)? */
    isOnStreet(xref) {
        return this.stationOf(xref) !== undefined;
    }

    /** Lässt die Straße sanft zum Fenster der Person gleiten und hebt ihre Karte kurz hervor. */
    navigateTo(xref) {
        const index = this.stationOf(xref);
        if (index === undefined) {
            return;
        }
        const node = this.lane.querySelector(`.station[data-index="${index}"]:not(.station-laden)`);
        if (!node) {
            return;
        }
        this.reveal(node);
        const card = node.querySelector(`.karte[data-xref="${CSS.escape(xref)}"]:not(.karte-klein)`);
        if (card) {
            card.focus({ preventScroll: true });
            card.classList.remove('gefunden');
            void card.offsetWidth;
            card.classList.add('gefunden');
            card.addEventListener('animationend', () => card.classList.remove('gefunden'), { once: true });
        }
    }

    /**
     * Beginnt die Straße neu bei `card` (PersonCard aus dem Lebensweg). Verwandtschaft und direkte Linie bleiben auf
     * den angemeldeten Benutzer bezogen, denn sie kommen so vom Server.
     */
    restartFrom(xref, card) {
        if (!card || card.xref !== xref || card.visible === false) {
            return;
        }
        this.epoch++;
        this.observer.disconnect();
        this.start = card;
        this.state = new StreetState();
        const first = this.startStation();
        this.lane.replaceChildren(first);
        this.lane.scrollTo({ left: 0 });
        this.enter(first);
        this.continueAfter(-1);
        this.updateSignpost();
        this.updateArrows();
        this.homeButton.hidden = this.start.xref === this.home.xref;
    }

    // ── Laden ────────────────────────────────────────────────────────────────

    url(xref, family) {
        let url = this.apiBase.replace('XREF-PLATZHALTER', encodeURIComponent(xref));
        if (family) {
            url += `${url.includes('?') ? '&' : '?'}family=${encodeURIComponent(family)}`;
        }

        return url;
    }

    /** Die Karte des Kindes, dessen Eltern Station `index` zeigt. */
    childOf(index) {
        if (index === 0) {
            return this.start;
        }
        const previous = this.state.stations[index - 1]?.station;
        const side = this.state.sides[index - 1];

        return previous && side ? previous[side] : null;
    }

    /** Was nach Station `index` kommt (-1 = nach dem Startfenster): Platzhalter zum Nachladen oder ein Ende. */
    continueAfter(index, { eager = false, reveal = false } = {}) {
        let next;
        if (index === -1) {
            next = this.placeholder(0, this.start.xref, null);
        } else {
            const side = this.state.sides[index];
            const parent = this.state.stations[index]?.station?.[side];
            if (!parent) {
                next = this.endSign();
            } else if (parent.visible === false) {
                next = this.hiddenStation(index + 1);
            } else {
                next = this.placeholder(index + 1, parent.xref, null);
            }
        }

        this.append(next, reveal);
        if (next.dataset.status === 'wartet') {
            if (eager) {
                this.load(next, reveal);
            } else {
                this.observer.observe(next);
            }
        }
    }

    placeholder(index, xref, family) {
        return el('section', {
            class: 'station station-laden',
            'data-index': index,
            'data-xref': xref,
            'data-family': family,
            'data-status': 'wartet',
            'aria-label': 'Wird geladen',
        }, el('div', { class: 'laterne', 'aria-hidden': 'true' }), el('p', { class: 'laden-text' }, 'Die nächste Generation …'));
    }

    async load(placeholder, reveal = false) {
        placeholder.dataset.status = 'laedt';
        this.observer.unobserve(placeholder);
        const epoch = this.epoch;
        const index = Number(placeholder.dataset.index);

        let response;
        try {
            const reply = await fetch(this.url(placeholder.dataset.xref, placeholder.dataset.family), {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });
            if (reply.status === 401) {
                if (epoch === this.epoch) {
                    placeholder.replaceWith(this.messageStation('Deine Anmeldung ist abgelaufen.', 'Neu anmelden', () => {
                        window.location.href = this.loginUrl;
                    }));
                }

                return;
            }
            if (reply.status === 403) {
                // Kein Zugang (mehr) zum Baum oder keine sichtbare Person: Wiederholen hilft nicht.
                if (epoch === this.epoch) {
                    placeholder.replaceWith(this.noAccessStation());
                }

                return;
            }
            if (!reply.ok) {
                throw new Error(`HTTP ${reply.status}`);
            }
            response = await reply.json();
        } catch (error) {
            if (epoch === this.epoch && placeholder.isConnected) {
                placeholder.replaceWith(this.messageStation('Diese Station ließ sich nicht laden.', 'Nochmal versuchen', (event) => {
                    const retry = this.placeholder(index, placeholder.dataset.xref, placeholder.dataset.family || null);
                    event.target.closest('.station').replaceWith(retry);
                    this.load(retry, true);
                }));
            }

            return;
        }

        // Inzwischen anders gewählt: diese Antwort gehört nicht mehr zur Straße.
        if (epoch !== this.epoch || !placeholder.isConnected) {
            return;
        }

        this.state.setStation(index, response);

        let node;
        if (response.station) {
            this.state.choose(index, defaultSide(response.station));
            node = this.stationNode(index);
        } else if (response.hidden) {
            node = this.hiddenStation(index);
        } else {
            node = this.endSign();
        }

        this.enter(node);
        placeholder.replaceWith(node);
        this.updateSignpost();
        this.updateArrows();
        if (reveal) {
            this.reveal(node);
        }
        if (response.station) {
            this.continueAfter(index);
        }
    }

    // ── Wahl ─────────────────────────────────────────────────────────────────

    choose(index, side) {
        const stationNode = this.lane.querySelector(`.station[data-index="${index}"]:not(.station-laden)`);
        if (this.state.sides[index] === side) {
            const next = stationNode?.nextElementSibling;
            if (next) {
                this.reveal(next);
            }

            return;
        }

        this.epoch++;
        this.state.choose(index, side);
        this.removeAfter(stationNode);
        for (const button of stationNode.querySelectorAll('.gabel')) {
            const chosen = button.dataset.side === side;
            button.classList.toggle('gewaehlt', chosen);
            button.setAttribute('aria-pressed', String(chosen));
        }
        this.updateSignpost();
        this.continueAfter(index, { eager: true, reveal: true });
    }

    /** Andere Elternfamilie (Adoption, Pflege …) an Station `index`. */
    chooseFamily(index, family) {
        const stationNode = this.lane.querySelector(`.station[data-index="${index}"]`);
        const child = this.childOf(index);
        if (!stationNode || !child) {
            return;
        }

        this.epoch++;
        this.removeAfter(stationNode);
        this.state.setStation(index, null);
        this.state.stations.length = index;   // Station `index` kommt mit der Antwort neu
        const placeholder = this.placeholder(index, child.xref, family);
        stationNode.replaceWith(placeholder);
        this.updateSignpost();
        this.load(placeholder);
    }

    removeAfter(node) {
        while (node?.nextElementSibling) {
            this.observer.unobserve(node.nextElementSibling);
            node.nextElementSibling.remove();
        }
    }

    // ── Bausteine ────────────────────────────────────────────────────────────

    startStation() {
        const card = this.start;
        const frame = el('article', { class: 'fenster fenster-start' },
            el('header', { class: 'schild' },
                el('span', { class: 'schild-name' }, card.relation === 'du' ? 'Hier beginnt dein Weg' : 'Hier beginnt der Weg'),
                el('span', { class: 'schild-gen' }, card.xref === this.home.xref ? 'Heute' : 'Neuer Ausgangspunkt')),
            el('div', { class: 'paar paar-allein' }, this.card(card)),
        );

        return el('section', { class: 'station station-start', 'data-index': '-1' },
            el('div', { class: 'station-raster' },
                frame,
                el('div', { class: 'gabelung gabelung-start' },
                    el('button', {
                        type: 'button', class: 'gabel gewaehlt', onclick: (event) => {
                            const next = event.target.closest('.station').nextElementSibling;
                            if (next) {
                                this.reveal(next);
                            }
                        },
                    }, el('span', { class: 'gabel-pfeil', 'aria-hidden': 'true' }, '→'),
                    el('span', { class: 'gabel-text' }, el('span', { class: 'gabel-linie' }, 'Zu den Eltern'),
                        el('span', { class: 'gabel-name' }, 'in die Vergangenheit'))),
                ),
            ),
        );
    }

    stationNode(index) {
        const data = this.state.stations[index].station;
        const child = this.childOf(index);
        const side = this.state.sides[index];

        const shopName = surname(data.father) || surname(data.mother);
        const panes = this.panes(data);
        const paneHost = el('div', { class: 'scheibe' });
        const frame = el('article', { class: 'fenster', 'aria-label': `${generationLabel(index + 1)}${shopName ? ` – Familie ${shopName}` : ''}` },
            el('header', { class: 'schild' },
                el('span', { class: 'schild-name' }, shopName ? `Familie ${shopName}` : 'Familie'),
                el('span', { class: 'schild-gen' }, generationLabel(index + 1))),
            paneHost,
        );

        let current = 0;
        const counter = el('span', { class: 'scheiben-zahl' });
        const showPane = (next) => {
            current = (next + panes.length) % panes.length;
            paneHost.replaceChildren(this.paneNode(panes[current]));
            counter.textContent = `${current + 1}/${panes.length}`;
            paneHost.classList.remove('wechsel');
            if (!reducedMotion()) {
                void paneHost.offsetWidth;
                paneHost.classList.add('wechsel');
            }
        };
        showPane(0);

        if (panes.length > 1) {
            frame.append(el('nav', { class: 'scheiben-nav', 'aria-label': 'Ehen umblättern' },
                el('button', { type: 'button', class: 'scheiben-knopf', 'aria-label': 'Vorige Ehe', onclick: () => showPane(current - 1) }, '‹'),
                counter,
                el('button', { type: 'button', class: 'scheiben-knopf', 'aria-label': 'Nächste Ehe', onclick: () => showPane(current + 1) }, '›'),
            ));
        }

        for (const alternative of data.alternatives ?? []) {
            frame.append(el('button', {
                type: 'button',
                class: 'abzweig',
                onclick: () => this.chooseFamily(index, alternative.family),
            }, el('span', { 'aria-hidden': 'true' }, '↳ '), `Abzweig: ${alternative.label}`));
        }

        const fork = el('nav', { class: 'gabelung', 'aria-label': 'Welcher Linie folgen?' });
        for (const which of ['father', 'mother']) {
            const parent = data[which];
            if (!parent) {
                continue;
            }
            const chosen = which === side;
            fork.append(el('button', {
                type: 'button',
                class: `gabel gabel-${which}${chosen ? ' gewaehlt' : ''}`,
                'data-side': which,
                'aria-pressed': String(chosen),
                onclick: () => this.choose(index, which),
            },
            el('span', { class: 'gabel-pfeil', 'aria-hidden': 'true' }, SIDES[which].arrow),
            el('span', { class: 'gabel-text' },
                el('span', { class: 'gabel-linie' }, SIDES[which].line),
                el('span', { class: 'gabel-name' }, parent.visible === false ? 'nicht sichtbar' : surname(parent) || firstName(parent)))));
        }

        return el('section', { class: 'station', 'data-index': index },
            el('div', { class: 'station-raster' }, frame, fork, this.alley(data.siblings ?? [], child)),
        );
    }

    /** Scheiben eines Fensters: zuerst das Elternpaar, dann weitere Ehen von Vater und Mutter. */
    panes(data) {
        const panes = [{ left: data.father, right: data.mother, marriage: data.marriage, caption: '' }];
        for (const other of data.fatherOtherMarriages ?? []) {
            panes.push({ left: data.father, right: other.spouse, marriage: other.marriage, caption: `Weitere Ehe von ${firstName(data.father) || 'ihm'}` });
        }
        for (const other of data.motherOtherMarriages ?? []) {
            panes.push({ left: other.spouse, right: data.mother, marriage: other.marriage, caption: `Weitere Ehe von ${firstName(data.mother) || 'ihr'}` });
        }

        return panes;
    }

    paneNode(pane) {
        return el('div', { class: 'scheibe-inhalt' },
            pane.caption ? el('p', { class: 'scheibe-titel' }, pane.caption) : null,
            el('div', { class: 'paar' },
                this.card(pane.left, 'M'),
                el('span', { class: 'ehe-zeichen', 'aria-hidden': 'true' }, '⚭'),
                this.card(pane.right, 'F')),
            el('p', { class: 'heirat' }, eventLine('⚭', pane.marriage) || (pane.caption ? '' : ' ')),
        );
    }

    /** Seitengasse: Geschwister des Kindes dieser Station, nach unten aufklappbar. */
    alley(siblings, child) {
        if (siblings.length === 0) {
            return null;
        }
        const childName = firstName(child);
        const list = el('ul', { class: 'gasse-liste' });
        for (const sibling of siblings) {
            list.append(el('li', {}, this.card(sibling, 'U', { small: true, note: halfSiblingNote(sibling, childName) })));
        }
        const body = el('div', { class: 'gasse-koerper', id: `gasse-${Math.random().toString(36).slice(2)}` },
            el('div', { class: 'gasse-innen' },
                el('p', { class: 'gasse-titel' }, childName ? `Geschwister von ${childName}` : 'Geschwister'),
                list));
        const button = el('button', {
            type: 'button',
            class: 'gasse-knopf',
            'aria-expanded': 'false',
            'aria-controls': body.id,
            onclick: () => {
                const open = button.getAttribute('aria-expanded') !== 'true';
                button.setAttribute('aria-expanded', String(open));
                body.classList.toggle('offen', open);
                body.inert = !open;
            },
        }, el('span', { class: 'gasse-pfeil', 'aria-hidden': 'true' }, '▾'), `Geschwister (${siblings.length})`);
        body.inert = true;

        return el('div', { class: 'gasse' }, button, body);
    }

    /**
     * Personenkarte. Sichtbar: Knopf mit Bild/Silhouette, Name, Lebensdaten, Verwandtschaft, Zeichen der direkten Linie.
     * Verborgen: neutrale Karte „nicht sichtbar“ ohne Daten. Fehlend: „unbekannt“.
     */
    card(card, fallbackSex = 'U', { small = false, note = '' } = {}) {
        const size = small ? ' karte-klein' : '';
        if (!card || card.visible === false) {
            const label = card ? 'nicht sichtbar' : 'unbekannt';

            return el('div', { class: `karte karte-leer${size}` },
                el('span', { class: 'bild' }, el('img', { src: this.silhouettes.U ?? '', alt: '' })),
                el('span', { class: 'karte-text' }, el('span', { class: 'name' }, label)));
        }

        const sex = card.sex ?? fallbackSex;
        const image = el('img', {
            src: card.image?.thumb ?? this.silhouettes[sex] ?? this.silhouettes.U ?? '',
            alt: card.image ? `Foto: ${card.name ?? ''}` : '',
            loading: 'lazy',
            decoding: 'async',
        });
        if (card.image) {
            image.addEventListener('error', () => {
                image.src = this.silhouettes[sex] ?? this.silhouettes.U ?? '';
                image.alt = '';
            }, { once: true });
        }

        const relation = card.relation === 'du' ? 'das bist du' : card.relation;

        return el('button', {
            type: 'button',
            class: `karte${size}${card.directLine ? ' direkt' : ''}${card.image ? ' mit-foto' : ''}`,
            'data-xref': card.xref,
            onclick: (event) => this.onOpenPerson(card.xref, event.currentTarget),
        },
        el('span', { class: 'bild' }, image),
        el('span', { class: 'karte-text' },
            el('span', { class: 'name' }, card.name ?? 'Name nicht sichtbar'),
            el('span', { class: 'lebensdaten' },
                el('span', {}, eventLine('*', card.birth)),
                el('span', {}, eventLine('†', card.death))),
            relation ? el('span', { class: 'beziehung' }, relation) : null,
            note ? el('span', { class: 'halb' }, note) : null,
            card.directLine ? el('span', { class: 'direkt-zeichen' }, '◆ direkte Linie') : null));
    }

    hiddenStation(index) {
        return el('section', { class: 'station station-ende', 'data-index': index },
            el('article', { class: 'fenster fenster-verborgen' },
                el('header', { class: 'schild' },
                    el('span', { class: 'schild-name' }, 'nicht sichtbar'),
                    el('span', { class: 'schild-gen' }, generationLabel(index + 1))),
                el('div', { class: 'paar paar-allein' }, this.card({ visible: false })),
                el('p', { class: 'fenster-hinweis' }, 'Diese Vorfahren sind für dein Konto nicht sichtbar. Hier endet der Weg.')));
    }

    endSign() {
        return el('section', { class: 'station station-ende' },
            el('div', { class: 'endschild' },
                el('span', { class: 'endschild-zier', 'aria-hidden': 'true' }, '❧'),
                el('p', { class: 'endschild-titel' }, 'Hier endet das Bekannte'),
                el('p', { class: 'endschild-text' }, 'Weiter zurück ist noch nichts erforscht.')));
    }

    /** Hinweis bei 403: ruhig, ohne „Nochmal versuchen“, mit der Möglichkeit, sich abzumelden. */
    noAccessStation() {
        return el('section', { class: 'station station-ende' },
            el('div', { class: 'endschild' },
                el('p', { class: 'endschild-text' }, 'Dein Konto hat im Moment keinen Zugang zu diesen Daten.'),
                this.logoutUrl ? logoutForm(this.logoutUrl, this.loginUrl) : null));
    }

    messageStation(text, action, onclick) {
        return el('section', { class: 'station station-ende' },
            el('div', { class: 'endschild' },
                el('p', { class: 'endschild-text' }, text),
                el('button', { type: 'button', class: 'gabel gewaehlt', onclick }, action)));
    }

    // ── Bewegung ─────────────────────────────────────────────────────────────

    append(node, reveal) {
        this.enter(node);
        this.lane.append(node);
        if (reveal && node.dataset.status !== 'wartet') {
            this.reveal(node);
        }
    }

    /** Einblenden mit leichtem Hereingleiten (CSS-Übergang, bei reduzierter Bewegung ohne). */
    enter(node) {
        if (reducedMotion()) {
            return;
        }
        node.classList.add('kommt');
        requestAnimationFrame(() => requestAnimationFrame(() => node.classList.remove('kommt')));
    }

    reveal(node) {
        node.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
    }

    page(direction) {
        this.lane.scrollBy({ left: direction * this.lane.clientWidth * 0.8, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }

    /** Mausrad: senkrechtes Drehen bewegt die Straße waagerecht, außer über einer Spalte, die selbst noch scrollt. */
    wheel(event) {
        if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
            return;
        }
        const column = event.target.closest?.('.station');
        if (column && column.scrollHeight > column.clientHeight + 1) {
            const atTop = column.scrollTop <= 0;
            const atBottom = column.scrollTop + column.clientHeight >= column.scrollHeight - 1;
            if ((event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)) {
                return;
            }
        }
        event.preventDefault();
        this.lane.scrollLeft += event.deltaY;
    }

    updateArrows() {
        const max = this.lane.scrollWidth - this.lane.clientWidth;
        this.root.querySelector('.blaettern.zurueck').disabled = this.lane.scrollLeft <= 2;
        this.root.querySelector('.blaettern.vor').disabled = this.lane.scrollLeft >= max - 2;
    }

    updateSignpost() {
        const text = signpost(signpostChoices(this.state.lineChoices()));
        this.signpostText.textContent = text || surname(this.start) || '…';
    }
}
