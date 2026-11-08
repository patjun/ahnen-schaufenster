// Kleine DOM-Hilfsmittel für Straße und Lebensweg. Alles aus der API wird per Textknoten bzw. Attribut gesetzt, nie als HTML.

/** el('p', {class: 'x', onclick: fn}, 'Text', kindElement). Strings werden zu Textknoten; null/false/'' entfallen. */
export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) {
            continue;
        }
        if (key === 'class') {
            node.className = value;
        } else if (key.startsWith('on')) {
            node.addEventListener(key.slice(2), value);
        } else {
            node.setAttribute(key, value === true ? '' : String(value));
        }
    }
    for (const child of children.flat()) {
        if (child !== null && child !== undefined && child !== '' && child !== false) {
            node.append(child instanceof Node ? child : document.createTextNode(String(child)));
        }
    }

    return node;
}

export function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Schmales Fenster (Handy): gleicher Umbruch wie im CSS. */
export function narrowScreen() {
    return window.matchMedia('(max-width: 760px)').matches;
}
