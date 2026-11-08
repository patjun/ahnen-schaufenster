// Der Lebensweg: Die angeklickte Karte zoomt zur Vollansicht auf. Darin eine Diaschau über das Leben der Person
// (eigene Ereignisse, Ereignisse der Familie, Fotos, Dokumente, Notizen, Quellen) und daneben – mobil darunter – die
// Karte, auf der der Weg beim Blättern mitwächst.
//
// Alles aus der API wird per textContent bzw. Attribut gesetzt, nie als HTML (el() aus dom.js).

import { el, reducedMotion, narrowScreen } from 'schaufenster/dom.js';
import { slideOrder, routeProgress, safeHttpUrl, swipeDirection, relationText, eventLine, firstName, slideSymbol } from 'schaufenster/model.js';
import { createRouteMap } from 'schaufenster/map.js';
import { logoutForm } from 'schaufenster/abmelden.js';

const ZOOM_MS = 400;

/** Der gerade offene Lebensweg (es gibt immer nur einen). */
let openView = null;

/**
 * Öffnet den Lebensweg von `xref` über der Straße.
 *
 * @param {string} xref
 * @param {{apiBase: string, onNavigate: (xref: string) => void, onRestartFrom: (xref: string, card: object) => void,
 *          isOnStreet: (xref: string) => boolean, origin?: HTMLElement|null, inertRoot?: HTMLElement|null,
 *          silhouettes?: {M?: string, F?: string, U?: string}, loginUrl?: string, logoutUrl?: string}} opts
 *        apiBase: Lebensweg-API mit dem Platzhalter "XREF-PLATZHALTER"; origin: die angeklickte Karte (Zoom-Start);
 *        inertRoot: wird gesperrt, solange der Lebensweg offen ist (die Straße)
 */
export function openLife(xref, opts) {
    if (openView) {
        openView.follow(xref);

        return openView;
    }
    openView = new LifeView(opts);
    openView.open(xref);

    return openView;
}

class LifeView {
    constructor(opts) {
        this.opts = opts;
        this.silhouettes = opts.silhouettes ?? {};
        /** Zuvor angesehene Personen (Verlinkungen), für „Zurück zu …“. */
        this.history = [];
        this.data = null;
        this.order = [];
        this.progress = [];
        this.index = 0;
        this.map = null;
        this.request = 0;
        this.onKey = (event) => this.key(event);
    }

    // ── Öffnen und Schließen ─────────────────────────────────────────────────

    open(xref) {
        this.origin = this.opts.origin ?? null;
        this.backButton = el('button', { type: 'button', class: 'leben-zurueck', hidden: true, onclick: () => this.back() });
        this.restartButton = el('button', { type: 'button', class: 'weiterbummeln', hidden: true, onclick: () => this.restart() },
            el('span', { 'aria-hidden': 'true' }, '↺ '), 'Von hier aus weiterbummeln');
        this.closeButton = el('button', { type: 'button', class: 'leben-schliessen', 'aria-label': 'Lebensweg schließen', onclick: () => this.close() }, '×');
        this.content = el('div', { class: 'leben-inhalt' });
        this.sheet = el('div', { class: 'leben-blatt' },
            el('div', { class: 'leben-leiste' },
                el('span', { class: 'leben-griff', 'aria-hidden': 'true' }),
                this.backButton,
                el('span', { class: 'leben-leiste-raum' }),
                this.restartButton,
                this.closeButton),
            this.content);
        this.backdrop = el('div', { class: 'leben-schleier', onclick: () => this.close() });
        this.overlay = el('div', { class: 'leben', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Lebensweg' },
            this.backdrop, this.sheet);

        this.viewer = null;
        document.body.append(this.overlay);
        document.body.classList.add('leben-offen');
        if (this.opts.inertRoot) {
            this.opts.inertRoot.inert = true;
        }
        document.addEventListener('keydown', this.onKey);
        this.gestures();

        this.zoomIn();
        this.closeButton.focus({ preventScroll: true });
        this.load(xref);
    }

    /** FLIP: das Blatt beginnt dort, wo die angeklickte Karte (ihr Bild) war, und wächst zur Vollansicht. */
    zoomIn() {
        if (reducedMotion()) {
            return;
        }
        this.backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ZOOM_MS, easing: 'ease-out' });
        const from = this.originRect();
        if (!from) {
            this.sheet.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });

            return;
        }
        const to = this.sheet.getBoundingClientRect();
        this.sheet.animate([
            { transformOrigin: 'top left', transform: this.flip(from, to), borderRadius: '6px', opacity: 0.85 },
            { transformOrigin: 'top left', transform: 'none', opacity: 1 },
        ], { duration: ZOOM_MS, easing: 'cubic-bezier(.2,.75,.25,1)' });
        // Inhalt erst einblenden, wenn das Blatt fast groß ist (sonst sieht man ihn verzerrt).
        this.content.animate([{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], { duration: ZOOM_MS + 120, easing: 'ease-out' });
    }

    originRect() {
        const origin = this.origin;
        if (!origin || !origin.isConnected) {
            return null;
        }
        const target = origin.querySelector('.bild') ?? origin;
        const rect = target.getBoundingClientRect();

        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight ? rect : null;
    }

    flip(from, to) {
        return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
    }

    close({ toCard = true } = {}) {
        if (this.closing) {
            return;
        }
        this.closing = true;
        openView = null;
        document.removeEventListener('keydown', this.onKey);
        this.closeViewer();
        if (this.opts.inertRoot) {
            this.opts.inertRoot.inert = false;
        }

        const finish = () => {
            this.map?.destroy();
            this.overlay.remove();
            if (!openView) {
                document.body.classList.remove('leben-offen');
            }
        };

        const from = toCard && this.history.length === 0 ? this.originRect() : null;
        if (reducedMotion()) {
            finish();
        } else {
            const to = this.sheet.getBoundingClientRect();
            this.content.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
            this.backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
            const frames = from
                ? [{ transformOrigin: 'top left', transform: 'none', opacity: 1 },
                    { transformOrigin: 'top left', transform: this.flip(from, to), opacity: 0.4 }]
                : [{ transform: 'none', opacity: 1 }, { transform: 'translateY(24px) scale(.97)', opacity: 0 }];
            this.sheet.animate(frames, { duration: from ? 340 : 260, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' })
                .finished.then(finish, finish);
        }

        if (toCard && this.origin?.isConnected) {
            this.origin.focus({ preventScroll: true });
        }
    }

    // ── Laden ────────────────────────────────────────────────────────────────

    url(xref) {
        return this.opts.apiBase.replace('XREF-PLATZHALTER', encodeURIComponent(xref));
    }

    async load(xref) {
        const request = ++this.request;
        this.showMessage(el('div', { class: 'laterne', 'aria-hidden': 'true' }), 'Der Lebensweg wird aufgeschlagen …');

        let data;
        try {
            const reply = await fetch(this.url(xref), { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            if (request !== this.request) {
                return;
            }
            if (reply.status === 401) {
                this.showMessage(null, 'Deine Anmeldung ist abgelaufen.', 'Neu anmelden', () => {
                    window.location.href = this.opts.loginUrl ?? '';
                });

                return;
            }
            if (reply.status === 403) {
                // Kein Zugang (mehr) zum Baum oder keine sichtbare Person: Wiederholen hilft nicht.
                this.showMessage(null, 'Dein Konto hat im Moment keinen Zugang zu diesen Daten.');
                if (this.opts.logoutUrl) {
                    this.content.querySelector('.leben-meldung')?.append(logoutForm(this.opts.logoutUrl, this.opts.loginUrl ?? ''));
                }

                return;
            }
            if (!reply.ok) {
                throw new Error(`HTTP ${reply.status}`);
            }
            data = await reply.json();
        } catch (error) {
            if (request === this.request) {
                this.showMessage(null, 'Der Lebensweg ließ sich nicht laden.', 'Nochmal versuchen', () => this.load(xref));
            }

            return;
        }
        if (request !== this.request || this.closing) {
            return;
        }
        if (!data.person || data.hidden) {
            this.data = null;
            this.updateBar();
            this.showMessage(null, 'Diese Person ist für dein Konto nicht sichtbar.');

            return;
        }
        this.render(data);
    }

    showMessage(icon, text, action = null, onclick = null) {
        this.map?.destroy();
        this.map = null;
        this.content.replaceChildren(el('div', { class: 'leben-meldung' },
            icon,
            el('p', {}, text),
            action ? el('button', { type: 'button', class: 'leben-knopf', onclick }, action) : null));
    }

    // ── Aufbau ───────────────────────────────────────────────────────────────

    render(data) {
        this.map?.destroy();
        this.map = null;
        this.data = data;
        const { slides, firstUndated } = slideOrder(data.slides);
        this.order = slides;
        this.firstUndated = firstUndated;
        this.progress = routeProgress(slides, data.route ?? []);
        this.index = 0;

        this.overlay.setAttribute('aria-label', `Lebensweg von ${data.person.name ?? 'unbekannt'}`);
        this.updateBar();

        this.stage = el('div', { class: 'dia-buehne', 'aria-live': 'polite' });
        this.prevButton = el('button', { type: 'button', class: 'dia-pfeil dia-zurueck', 'aria-label': 'Voriges Dia', onclick: () => this.go(this.index - 1) }, '‹');
        this.nextButton = el('button', { type: 'button', class: 'dia-pfeil dia-vor', 'aria-label': 'Nächstes Dia', onclick: () => this.go(this.index + 1) }, '›');
        this.counter = el('span', { class: 'dia-zahl' });
        this.dots = el('div', { class: 'dia-punkte', role: 'group', 'aria-label': 'Dias' });

        slides.forEach((slide, i) => {
            if (i === firstUndated && i > 0) {
                this.dots.append(el('span', { class: 'dia-punkte-trenner', 'aria-hidden': 'true' }));
            }
            this.dots.append(el('button', {
                type: 'button',
                class: `dia-punkt${slide.own ? '' : ' familie'}`,
                'aria-label': `Dia ${i + 1}: ${slide.title}${slide.date ? `, ${slide.date}` : ''}`,
                onclick: () => this.go(i),
            }));
        });

        const show = el('section', { class: 'diaschau', 'aria-roledescription': 'Diaschau', 'aria-label': 'Lebensweg in Bildern' },
            this.stage,
            slides.length > 1
                ? el('div', { class: 'dia-fuss' }, this.prevButton, el('div', { class: 'dia-mitte' }, this.counter, this.dots), this.nextButton)
                : null);

        const mapArea = el('div', { class: 'leben-karte', 'aria-label': 'Karte der Lebensorte' });
        const grid = el('div', { class: 'leben-raster' }, show, mapArea);

        this.content.replaceChildren(this.header(data.person), grid);
        this.content.scrollTop = 0;

        this.map = createRouteMap(mapArea, data.route ?? [], {
            onSelect: (slideId) => {
                const target = this.order.findIndex((slide) => slide.id === slideId);
                if (target !== -1) {
                    this.go(target);
                }
            },
            onFail: () => grid.classList.add('ohne-karte'),
        });
        if (!this.map) {
            grid.classList.add('ohne-karte');
        }

        if (slides.length === 0) {
            this.stage.append(el('article', { class: 'dia dia-leer' },
                el('p', { class: 'dia-text' }, 'Zu dieser Person ist noch nichts weiter bekannt.')));
            this.prevButton.hidden = true;
            this.nextButton.hidden = true;

            return;
        }
        this.go(0, { initial: true });
    }

    header(person) {
        const sex = person.sex ?? 'U';
        const image = el('img', {
            src: safeHttpUrl(person.image?.thumb) ?? this.silhouettes[sex] ?? this.silhouettes.U ?? '',
            alt: person.image ? `Foto: ${person.name ?? ''}` : '',
            decoding: 'async',
        });
        if (person.image) {
            image.addEventListener('error', () => {
                image.src = this.silhouettes[sex] ?? this.silhouettes.U ?? '';
                image.alt = '';
            }, { once: true });
        }
        const full = safeHttpUrl(person.image?.full);
        const portrait = full
            ? el('button', { type: 'button', class: 'leben-bild bild', 'aria-label': `Foto von ${person.name ?? ''} groß ansehen`, onclick: () => this.openImage(full, person.name ?? '') }, image)
            : el('span', { class: 'leben-bild bild' }, image);
        const relation = relationText(person.relation);

        return el('header', { class: `leben-kopf${person.directLine ? ' direkt' : ''}${person.image ? ' mit-foto' : ''}` },
            portrait,
            el('div', { class: 'leben-person' },
                el('p', { class: 'leben-ueber' }, 'Lebensweg'),
                el('h2', { class: 'leben-name' }, person.name ?? 'Name nicht sichtbar'),
                el('p', { class: 'lebensdaten' },
                    el('span', {}, eventLine('*', person.birth)),
                    el('span', {}, eventLine('†', person.death))),
                relation || person.directLine
                    ? el('p', { class: 'leben-bezug' },
                        relation ? el('span', { class: 'beziehung' }, relation) : null,
                        person.directLine ? el('span', { class: 'direkt-zeichen' }, '◆ direkte Linie') : null)
                    : null));
    }

    /** Leiste oben: „Zurück zu …“ nach einer Verlinkung, „Von hier aus weiterbummeln“ für Personen abseits der Straße. */
    updateBar() {
        const previous = this.history.at(-1);
        this.backButton.hidden = !previous;
        this.backButton.replaceChildren(el('span', { 'aria-hidden': 'true' }, '‹ '),
            previous ? `Zurück zu ${firstName(previous.person) || 'vorher'}` : '');
        const person = this.data?.person;
        this.restartButton.hidden = !person || this.opts.isOnStreet(person.xref);
    }

    // ── Diaschau ─────────────────────────────────────────────────────────────

    go(target, { initial = false } = {}) {
        if (target < 0 || target >= this.order.length || (!initial && target === this.index)) {
            return;
        }
        const direction = target > this.index ? 'vor' : 'zurueck';
        this.index = target;
        const slide = this.order[target];
        const node = this.slideNode(slide, target);

        this.stage.replaceChildren(node);
        this.stage.scrollTop = 0;
        if (!initial && !reducedMotion()) {
            node.classList.add(`kommt-${direction}`);
        }

        this.counter.textContent = `${target + 1} von ${this.order.length}`;
        this.prevButton.disabled = target === 0;
        this.nextButton.disabled = target === this.order.length - 1;
        // Nur der aktuelle Punkt ist ein Tab-Halt; die Pfeiltasten wechseln das Dia, der Fokus wandert mit.
        const dotHadFocus = document.activeElement?.classList?.contains('dia-punkt');
        this.dots.querySelectorAll('.dia-punkt').forEach((dot, i) => {
            dot.tabIndex = i === target ? 0 : -1;
            if (i === target) {
                dot.setAttribute('aria-current', 'step');
                if (dotHadFocus) {
                    dot.focus({ preventScroll: true });
                }
            } else {
                dot.removeAttribute('aria-current');
            }
        });
        this.dots.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

        if (this.map) {
            const reached = this.progress[target];
            this.map.playTo(reached >= 0 ? this.data.route[reached].slideId : null);
            this.map.highlight(slide.id, slide.point);
        }
    }

    slideNode(slide, index) {
        const undated = index >= this.firstUndated;
        const media = (slide.media ?? []).filter((item) => safeHttpUrl(item.url));

        return el('article', { class: `dia${slide.own ? '' : ' familie'}${media.some((m) => m.kind === 'image') ? ' mit-bild' : ''}` },
            el('span', { class: 'dia-zier', 'aria-hidden': 'true' }, slideSymbol(slide.title)),
            el('header', { class: 'dia-kopf' },
                el('p', { class: `dia-datum${undated ? ' ohne' : ''}` }, slide.date || (undated ? 'ohne Datum' : '')),
                el('h3', { class: 'dia-titel' }, slide.title),
                slide.own ? null : el('span', { class: 'familie-zusatz' }, 'in der Familie')),
            // Medien vor dem Text: auf dem Desktop fließt der Text links am Bild vorbei, mobil steht das Bild oben.
            media.length > 0 ? this.mediaNode(media) : null,
            slide.text ? el('p', { class: 'dia-wert' }, slide.text) : null,
            slide.place ? el('p', { class: 'dia-ort' }, el('span', { class: 'dia-ort-zeichen', 'aria-hidden': 'true' }, '⌖'), slide.place) : null,
            (slide.persons ?? []).length > 0 ? this.personsNode(slide.persons) : null,
            (slide.notes ?? []).length > 0
                ? el('div', { class: 'dia-notizen' }, slide.notes.map((note) => el('p', {}, note)))
                : null,
            (slide.sources ?? []).length > 0
                ? el('details', { class: 'dia-quellen' },
                    el('summary', {}, 'Quellen'),
                    el('ul', {}, slide.sources.map((source) => el('li', {}, source))))
                : null,
        );
    }

    mediaNode(media) {
        const images = media.filter((item) => item.kind === 'image');
        const others = media.filter((item) => item.kind !== 'image');
        const box = el('div', { class: 'dia-medien' });

        if (images.length > 0) {
            const big = el('img', { alt: '', decoding: 'async' });
            const caption = el('figcaption', {});
            const frame = el('button', { type: 'button', class: 'foto-gross' }, big);
            let shown = null;
            const showImage = (item) => {
                shown = item;
                big.src = safeHttpUrl(item.url);
                big.alt = item.title || 'Foto';
                caption.textContent = item.title ?? '';
                frame.setAttribute('aria-label', `${item.title || 'Foto'} groß ansehen`);
                strip?.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(images[i] === item)));
            };
            frame.addEventListener('click', () => this.openImage(safeHttpUrl(shown.url), shown.title ?? ''));
            let strip = null;
            if (images.length > 1) {
                strip = el('div', { class: 'foto-leiste' }, images.map((item) => el('button', {
                    type: 'button', class: 'foto-klein', 'aria-label': item.title || 'Foto', onclick: () => showImage(item),
                }, el('img', { src: safeHttpUrl(item.thumb) ?? safeHttpUrl(item.url), alt: '', loading: 'lazy', decoding: 'async' }))));
            }
            showImage(images[0]);
            box.append(el('figure', { class: 'foto' }, frame, caption));
            if (strip) {
                box.append(strip);
            }
        }

        for (const item of others) {
            const url = safeHttpUrl(item.url);
            if (item.kind === 'pdf') {
                box.append(el('button', { type: 'button', class: 'dokument', onclick: () => this.openPdf(url, item.title ?? '') },
                    el('span', { class: 'dokument-blatt', 'aria-hidden': 'true' }, el('span', {}, 'PDF')),
                    el('span', { class: 'dokument-text' },
                        el('span', { class: 'dokument-titel' }, item.title || 'Dokument'),
                        el('span', { class: 'dokument-aktion' }, 'Dokument ansehen'))));
            } else {
                box.append(el('a', { class: 'extern', href: url, target: '_blank', rel: 'noopener noreferrer' },
                    el('span', { class: 'extern-titel' }, item.title || 'Verweis'),
                    el('span', { class: 'extern-aktion' }, 'Extern ansehen ↗')));
            }
        }

        return box;
    }

    personsNode(persons) {
        return el('ul', { class: 'dia-personen' }, persons.map((person) => {
            const relation = relationText(person.relation);
            const self = person.xref === this.data.person.xref;

            return el('li', {}, el(self ? 'span' : 'button', {
                type: self ? null : 'button',
                class: `person-verweis${person.directLine ? ' direkt' : ''}`,
                onclick: self ? null : () => this.follow(person.xref),
            },
            el('span', { class: 'person-name' }, person.name),
            relation ? el('span', { class: 'person-bezug' }, relation) : null,
            person.directLine ? el('span', { class: 'direkt-zeichen' }, '◆ direkte Linie') : null));
        }));
    }

    // ── Verlinkungen ─────────────────────────────────────────────────────────

    /** Klick auf eine genannte Person: auf der Straße → hingleiten; sonst ihren Lebensweg hier öffnen. */
    follow(xref) {
        if (this.data?.person?.xref === xref) {
            return;
        }
        if (this.opts.isOnStreet(xref)) {
            this.close({ toCard: false });
            this.opts.onNavigate(xref);

            return;
        }
        if (this.data) {
            this.history.push({ person: this.data.person, index: this.index });
        }
        this.swap(() => this.load(xref));
    }

    back() {
        const previous = this.history.pop();
        if (!previous) {
            return;
        }
        this.swap(async () => {
            await this.load(previous.person.xref);
            if (this.data?.person?.xref === previous.person.xref) {
                this.go(previous.index);
            }
        });
    }

    swap(next) {
        this.closeViewer();
        if (!reducedMotion()) {
            this.content.animate([{ opacity: 0, transform: 'translateX(18px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'ease-out' });
        }
        next();
        this.closeButton.focus({ preventScroll: true });
    }

    restart() {
        const person = this.data?.person;
        if (!person) {
            return;
        }
        this.close({ toCard: false });
        this.opts.onRestartFrom(person.xref, person);
    }

    // ── Betrachter für Bilder und PDFs ───────────────────────────────────────

    openPdf(url, title) {
        if (!url) {
            return;
        }
        // Mobil zeigen Browser PDFs in Rahmen oft nicht blätterbar an: dort im neuen Tab.
        if (narrowScreen()) {
            window.open(url, '_blank', 'noopener');

            return;
        }
        this.openViewer(el('iframe', { class: 'betrachter-pdf', src: url, title: title || 'Dokument' }), title, url);
    }

    openImage(url, title) {
        if (url) {
            this.openViewer(el('img', { class: 'betrachter-bild', src: url, alt: title || 'Foto' }), title, null);
        }
    }

    openViewer(content, title, newTabUrl) {
        this.closeViewer();
        const close = el('button', { type: 'button', class: 'leben-schliessen', 'aria-label': 'Ansicht schließen', onclick: () => this.closeViewer() }, '×');
        this.viewer = el('div', { class: 'betrachter', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Ansicht' },
            el('div', { class: 'betrachter-leiste' },
                el('p', { class: 'betrachter-titel' }, title),
                newTabUrl ? el('a', { class: 'leben-knopf klein', href: newTabUrl, target: '_blank', rel: 'noopener' }, 'In neuem Tab öffnen') : null,
                close),
            el('div', { class: 'betrachter-flaeche', onclick: (event) => {
                if (event.target === event.currentTarget) {
                    this.closeViewer();
                }
            } }, content));
        this.returnFocus = document.activeElement;
        this.overlay.append(this.viewer);
        if (!reducedMotion()) {
            this.viewer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
        }
        close.focus();
    }

    closeViewer() {
        if (!this.viewer) {
            return false;
        }
        this.viewer.remove();
        this.viewer = null;
        if (this.returnFocus?.isConnected) {
            this.returnFocus.focus({ preventScroll: true });
        }

        return true;
    }

    // ── Tastatur und Gesten ──────────────────────────────────────────────────

    key(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            if (!this.closeViewer()) {
                this.close();
            }

            return;
        }
        if (this.viewer || event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }
        // Pfeiltasten in der Karte verschieben die Karte, nicht die Diaschau.
        if (event.target.closest?.('.leaflet-container, input, textarea, select')) {
            return;
        }
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            this.go(this.index + 1);
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            this.go(this.index - 1);
        } else if (event.key === 'Tab') {
            this.trapFocus(event);
        }
    }

    /** Tab bleibt im Lebensweg (die Straße dahinter ist ohnehin gesperrt). */
    trapFocus(event) {
        const focusable = [...this.sheet.querySelectorAll('button:not([disabled]):not([hidden]), a[href], summary, [tabindex]')]
            .filter((node) => node.tabIndex >= 0 && (node.offsetParent !== null || node instanceof SVGElement));
        if (focusable.length === 0) {
            return;
        }
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    /** Wischen: links/rechts auf der Diaschau blättert, nach unten (oben am Blatt) schließt. Nicht auf der Karte. */
    gestures() {
        let start = null;
        this.sheet.addEventListener('touchstart', (event) => {
            if (event.touches.length !== 1 || this.viewer || event.target.closest('.leben-karte')) {
                start = null;

                return;
            }
            const touch = event.touches[0];
            start = {
                x: touch.clientX,
                y: touch.clientY,
                atTop: this.content.scrollTop <= 0 && (this.stage?.scrollTop ?? 0) <= 0,
                onShow: Boolean(event.target.closest('.diaschau')),
            };
        }, { passive: true });
        this.sheet.addEventListener('touchend', (event) => {
            if (!start) {
                return;
            }
            const touch = event.changedTouches[0];
            const direction = swipeDirection(touch.clientX - start.x, touch.clientY - start.y, 50);
            if (direction === 'left' && start.onShow) {
                this.go(this.index + 1);
            } else if (direction === 'right' && start.onShow) {
                this.go(this.index - 1);
            } else if (direction === 'down' && start.atTop && narrowScreen() && touch.clientY - start.y > 90) {
                this.close();
            }
            start = null;
        }, { passive: true });
    }
}
