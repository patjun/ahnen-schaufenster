// Frontend-Logik des Ahnen-Schaufensters ohne DOM: Straßenzustand, Wegweiser, Dia-Gruppen, HTML-Escaping.
// Reines ES-Modul; der Browser lädt diese Datei direkt.

/**
 * Wegweiser über der Straße: die Nachnamen der gewählten Linie, z. B. "Müller → Schmidt".
 *
 * @param {Array<{side:string, surname:string}>} lineChoices
 * @returns {string}
 */
export function signpost(lineChoices) {
    return lineChoices.map((choice) => choice.surname).join(' → ');
}

/** Letztes Wort eines webtrees-Namens ("Hans /Müller/" -> "Müller"), Schrägstriche entfernt. */
function surnameOf(name) {
    const words = String(name ?? '').replace(/\//g, ' ').trim().split(/\s+/).filter(Boolean);

    return words.length > 0 ? words[words.length - 1] : '';
}

export class StreetState {
    constructor() {
        /** Rohe API-Antworten, Index 0 = Station der Eltern der Startperson. */
        this.stations = [];
        /** Gewählte Seite je Stationsindex. */
        this.sides = [];
    }

    /** Setzt die Station `index` (z. B. eine andere Elternfamilie) und verwirft sie samt Wahl und allem rechts davon. */
    setStation(index, response) {
        this.stations = this.stations.slice(0, index);
        this.sides = this.sides.slice(0, index);
        this.stations[index] = response;
    }

    /** Wählt die Seite an Station `index` und verwirft alles rechts davon. */
    choose(index, side) {
        this.stations = this.stations.slice(0, index + 1);
        this.sides = this.sides.slice(0, index);
        this.sides[index] = side;
    }

    /** Das Elternteil auf der gewählten Seite (Card) oder null. */
    #chosenParent(index) {
        const side = this.sides[index];
        const station = this.stations[index]?.station;
        if (!side || !station) {
            return null;
        }

        return station[side] ?? null;
    }

    /** xref des gewählten Elternteils; null, wenn nichts gewählt, Straßenende, fehlend oder verborgen. */
    nextChildXref(index) {
        const parent = this.#chosenParent(index);
        if (!parent || parent.visible === false) {
            return null;
        }

        return parent.xref ?? null;
    }

    /** Straßenende: keine Station (verborgen oder keine Elternfamilie). */
    isEnd(index) {
        const entry = this.stations[index];

        return entry !== undefined && entry !== null && entry.station === null;
    }

    /** Elternfamilie vorhanden, aber nichts davon sichtbar. */
    isHidden(index) {
        return this.stations[index]?.hidden === true;
    }

    /** Gewählte Linie für den Wegweiser: [{side, surname}] in Reihenfolge der Stationen. */
    lineChoices() {
        const choices = [];
        for (let index = 0; index < this.sides.length; index++) {
            const side = this.sides[index];
            if (!side) {
                break;
            }
            const parent = this.#chosenParent(index);
            choices.push({ side, surname: parent && parent.visible !== false ? surnameOf(parent.name) : '' });
        }

        return choices;
    }
}

/**
 * Seite, der die Straße ohne Wahl folgt: der sichtbare Vater, sonst die sichtbare Mutter, sonst ein vorhandener
 * (verborgener) Elternteil; null ohne Eltern.
 *
 * @param {object|null} station  Inhalt von `station` einer API-Antwort
 * @returns {'father'|'mother'|null}
 */
export function defaultSide(station) {
    if (!station) {
        return null;
    }
    for (const side of ['father', 'mother']) {
        if (station[side] && station[side].visible !== false) {
            return side;
        }
    }
    for (const side of ['father', 'mother']) {
        if (station[side]) {
            return side;
        }
    }

    return null;
}

/**
 * Wegweiser-Einträge für die Anzeige: verborgene (leerer Nachname) weg, gleiche Nachnamen hintereinander einmal.
 *
 * @param {Array<{side:string, surname:string}>} lineChoices
 */
export function signpostChoices(lineChoices) {
    const result = [];
    for (const choice of lineChoices) {
        if (choice.surname !== '' && result.at(-1)?.surname !== choice.surname) {
            result.push(choice);
        }
    }

    return result;
}

/** Nachname einer Karte (letztes Wort des Namens) oder ''. */
export function surname(card) {
    return card && card.visible !== false ? surnameOf(card.name) : '';
}

/** Rufname einer Karte (erstes Wort des Namens) oder ''. */
export function firstName(card) {
    if (!card || card.visible === false) {
        return '';
    }

    return String(card.name ?? '').replace(/\//g, ' ').trim().split(/\s+/)[0] ?? '';
}

const GENERATIONS = ['Eltern', 'Großeltern', 'Urgroßeltern', 'Ururgroßeltern', 'Urururgroßeltern'];

/** Bezeichnung der Generation `n` (1 = Eltern der Startperson). */
export function generationLabel(n) {
    return GENERATIONS[n - 1] ?? `${n}. Generation`;
}

/**
 * Lebensdatum als Text, z. B. "* 26. Januar 1935 in Berlin"; '' ohne Datum und Ort.
 *
 * @param {string} symbol  "*", "†" oder "⚭"
 * @param {{date:string|null, place:string|null}|null} event
 */
export function eventLine(symbol, event) {
    if (!event || (!event.date && !event.place)) {
        return '';
    }
    const parts = [symbol];
    if (event.date) {
        parts.push(event.date);
    }
    if (event.place) {
        parts.push(`in ${event.place}`);
    }

    return parts.join(' ');
}

/**
 * Zusatz für Halbgeschwister in der Seitengasse, z. B. "Halbschwester von Anna". Leer bei vollen Geschwistern
 * und wenn die Verwandtschaft (`relation`) das Halb schon nennt.
 *
 * @param {{half?:boolean, sex?:string, relation?:string, visible?:boolean}} card
 * @param {string} childName  Rufname des Kindes der Station
 */
export function halfSiblingNote(card, childName) {
    if (!card.half || card.visible === false || /halb/i.test(card.relation ?? '')) {
        return '';
    }
    const word = { F: 'Halbschwester', M: 'Halbbruder' }[card.sex] ?? 'Halbgeschwister';

    return childName ? `${word} von ${childName}` : word;
}

/**
 * Teilt Dias in datierte (sortKey vorhanden) und undatierte, jeweils in Eingabereihenfolge.
 *
 * @param {Array<{sortKey?: number|null}>} slides
 */
export function slideGroups(slides) {
    const dated = [];
    const undated = [];
    for (const slide of slides) {
        (slide.sortKey === null || slide.sortKey === undefined ? undated : dated).push(slide);
    }

    return { dated, undated };
}

/** Maskiert HTML-Sonderzeichen. */
export function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Reihenfolge der Diaschau: datierte Dias zuerst, dann undatierte; `firstUndated` = Index des ersten undatierten
 * Dias (= Länge, wenn alle datiert sind).
 *
 * @param {Array<{sortKey?: number|null}>} slides
 */
export function slideOrder(slides) {
    const { dated, undated } = slideGroups(slides ?? []);

    return { slides: [...dated, ...undated], firstUndated: dated.length };
}

/**
 * Wie weit die Kartenlinie bei jedem Dia reicht: Index des letzten Routenpunkts, der zu diesem oder einem früheren
 * Dia gehört (-1 = noch keiner). Dias ohne eigenen Punkt behalten so den Stand des vorigen.
 *
 * @param {Array<{id: string}>} slides  in Anzeigereihenfolge
 * @param {Array<{slideId: string}>} route
 * @returns {number[]} je Dia ein Routenindex
 */
export function routeProgress(slides, route) {
    const byId = new Map((route ?? []).map((point, index) => [point.slideId, index]));
    let current = -1;

    return (slides ?? []).map((slide) => {
        const index = byId.get(slide.id);
        if (index !== undefined && index > current) {
            current = index;
        }

        return current;
    });
}

/** Nur http(s)-Adressen durchlassen (externe Medienverweise); sonst null. */
export function safeHttpUrl(url) {
    try {
        const parsed = new URL(String(url ?? ''));

        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
    } catch {
        return null;
    }
}

/**
 * Wischgeste aus der Verschiebung (Pixel): 'left' | 'right' | 'up' | 'down' | null. Eine Richtung zählt erst ab
 * `min` Pixeln und wenn sie die andere Achse deutlich (Faktor 1,5) überwiegt.
 */
export function swipeDirection(dx, dy, min = 50) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax >= min && ax > ay * 1.5) {
        return dx < 0 ? 'left' : 'right';
    }
    if (ay >= min && ay > ax * 1.5) {
        return dy < 0 ? 'up' : 'down';
    }

    return null;
}

/** Anzeigetext der Verwandtschaft: "du" wird zu "das bist du"; leer bleibt leer. */
export function relationText(relation) {
    return relation === 'du' ? 'das bist du' : String(relation ?? '');
}

/** Zierzeichen eines Dias nach seinem Titel: † Tod/Begräbnis, ⚭ Heirat, ✻ Geburt/Taufe, sonst ❧. */
export function slideSymbol(title) {
    const text = String(title ?? '');
    if (/Tod|Begräbnis|Beerdigung|Bestattung/i.test(text)) {
        return '†';
    }
    if (/Heirat|Ehe|Verlobung|Hochzeit/i.test(text)) {
        return '⚭';
    }
    if (/Geburt|Taufe/i.test(text)) {
        return '✻';
    }

    return '❧';
}
