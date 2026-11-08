import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    signpost, StreetState, slideGroups, escapeHtml, defaultSide, signpostChoices, surname, firstName, generationLabel,
    eventLine, halfSiblingNote, slideOrder, routeProgress, safeHttpUrl, swipeDirection, relationText, slideSymbol,
} from '../../resources/js/model.js';

const card = (xref, name, visible = true) => (visible ? { xref, visible: true, name } : { xref, visible: false });

const station = (father, mother) => ({ station: { family: 'F1', father, mother } });

test('signpost verbindet Nachnamen mit Pfeil', () => {
    assert.equal(
        signpost([{ side: 'mother', surname: 'Müller' }, { side: 'mother', surname: 'Schmidt' }]),
        'Müller → Schmidt',
    );
});

test('signpost: leer und ein Eintrag', () => {
    assert.equal(signpost([]), '');
    assert.equal(signpost([{ side: 'father', surname: 'Weber' }]), 'Weber');
});

test('choose kürzt Stationen rechts vom Index ab', () => {
    const s = new StreetState();
    s.stations = [station(card('I1', 'Hans /Müller/'), card('I2', 'Anna /Schmidt/')), station(card('I3', 'X /Y/'), null)];
    s.choose(0, 'father');
    assert.equal(s.stations.length, 1);
    assert.equal(s.nextChildXref(0), 'I1');
});

test('nextChildXref: Mutter, ohne Wahl, außerhalb', () => {
    const s = new StreetState();
    s.stations = [station(card('I1', 'Hans /Müller/'), card('I2', 'Anna /Schmidt/'))];
    assert.equal(s.nextChildXref(0), null);
    s.choose(0, 'mother');
    assert.equal(s.nextChildXref(0), 'I2');
    assert.equal(s.nextChildXref(5), null);
});

test('nextChildXref: verborgener oder fehlender Elternteil -> null', () => {
    const s = new StreetState();
    s.stations = [station(card('I1', null, false), null)];
    s.choose(0, 'father');
    assert.equal(s.nextChildXref(0), null);
    s.choose(0, 'mother');
    assert.equal(s.nextChildXref(0), null);
});

test('isEnd und isHidden', () => {
    const s = new StreetState();
    s.stations = [station(card('I1', 'A /B/'), null), { station: null, hidden: true }, { station: null }];
    assert.equal(s.isEnd(0), false);
    assert.equal(s.isEnd(1), true);
    assert.equal(s.isEnd(2), true);
    assert.equal(s.isHidden(0), false);
    assert.equal(s.isHidden(1), true);
    assert.equal(s.isHidden(2), false);
    assert.equal(s.isEnd(9), false);
    assert.equal(s.isHidden(9), false);
});

test('nextChildXref an Straßenende -> null', () => {
    const s = new StreetState();
    s.stations = [{ station: null, hidden: true }];
    s.choose(0, 'father');
    assert.equal(s.nextChildXref(0), null);
});

test('lineChoices liefert Seite und Nachnamen ohne Schrägstriche', () => {
    const s = new StreetState();
    s.stations = [station(card('I1', 'Hans /Müller/'), card('I2', 'Anna /Schmidt/'))];
    s.choose(0, 'mother');
    s.stations.push(station(card('I3', 'Karl /Schmidt/'), card('I4', 'Anna Maria /von der Heide/')));
    s.choose(1, 'father');
    assert.deepEqual(s.lineChoices(), [
        { side: 'mother', surname: 'Schmidt' },
        { side: 'father', surname: 'Schmidt' },
    ]);
    assert.equal(signpost(s.lineChoices()), 'Schmidt → Schmidt');
});

test('lineChoices: Name ohne Schrägstriche, verborgen und gekürzt', () => {
    const s = new StreetState();
    s.stations = [station(card('I1', 'Hans Müller'), card('I2', null, false))];
    s.choose(0, 'father');
    s.stations.push(station(card('I3', 'A /B/'), null));
    s.choose(1, 'father');
    assert.equal(s.lineChoices().length, 2);
    s.choose(0, 'father');
    assert.deepEqual(s.lineChoices(), [{ side: 'father', surname: 'Müller' }]);
    s.choose(0, 'mother');
    assert.deepEqual(s.lineChoices(), [{ side: 'mother', surname: '' }]);
});

test('choose verwirft spätere Wahlen', () => {
    const s = new StreetState();
    s.stations = [station(card('I1', 'A /B/'), card('I2', 'C /D/'))];
    s.choose(0, 'father');
    s.stations.push(station(card('I3', 'E /F/'), card('I4', 'G /H/')));
    s.choose(1, 'mother');
    assert.equal(s.nextChildXref(1), 'I4');
    s.choose(0, 'mother');
    assert.equal(s.stations.length, 1);
    assert.equal(s.nextChildXref(1), null);
    assert.equal(s.lineChoices().length, 1);
});

test('slideGroups trennt datierte und undatierte Dias in Eingabereihenfolge', () => {
    const slides = [
        { id: 'a', sortKey: 5 },
        { id: 'b', sortKey: null },
        { id: 'c', sortKey: 0 },
        { id: 'd' },
        { id: 'e', sortKey: 2 },
    ];
    const g = slideGroups(slides);
    assert.deepEqual(g.dated.map((x) => x.id), ['a', 'c', 'e']);
    assert.deepEqual(g.undated.map((x) => x.id), ['b', 'd']);
    assert.deepEqual(slideGroups([]), { dated: [], undated: [] });
});

test('escapeHtml', () => {
    assert.equal(escapeHtml('<a "b">'), '&lt;a &quot;b&quot;&gt;');
    assert.equal(escapeHtml("Tom & 'Jerry'"), 'Tom &amp; &#39;Jerry&#39;');
    assert.equal(escapeHtml(null), '');
});

test('setStation ersetzt die Station und verwirft Wahl und alles rechts davon', () => {
    const s = new StreetState();
    s.stations = [station(card('I1', 'A /B/'), null), station(card('I3', 'C /D/'), null)];
    s.choose(0, 'father');
    s.stations.push(station(card('I3', 'C /D/'), null));
    s.choose(1, 'father');
    const other = station(card('I9', 'Z /Y/'), null);
    s.setStation(0, other);
    assert.equal(s.stations.length, 1);
    assert.equal(s.stations[0], other);
    assert.deepEqual(s.sides, []);
    assert.equal(s.nextChildXref(0), null);
});

test('defaultSide: sichtbarer Vater, sonst sichtbare Mutter, sonst verborgener Elternteil', () => {
    assert.equal(defaultSide({ father: card('I1', 'A'), mother: card('I2', 'B') }), 'father');
    assert.equal(defaultSide({ father: card('I1', null, false), mother: card('I2', 'B') }), 'mother');
    assert.equal(defaultSide({ father: null, mother: card('I2', 'B') }), 'mother');
    assert.equal(defaultSide({ father: null, mother: card('I2', null, false) }), 'mother');
    assert.equal(defaultSide({ father: null, mother: null }), null);
    assert.equal(defaultSide(null), null);
});

test('signpostChoices: verborgene weg, Wiederholungen einmal', () => {
    const choices = [
        { side: 'father', surname: 'Weber' },
        { side: 'father', surname: 'Weber' },
        { side: 'mother', surname: '' },
        { side: 'mother', surname: 'Müller' },
        { side: 'mother', surname: 'Schmidt' },
    ];
    assert.equal(signpost(signpostChoices(choices)), 'Weber → Müller → Schmidt');
    assert.equal(signpost(signpostChoices([{ side: 'father', surname: '' }])), '');
});

test('surname und firstName', () => {
    assert.equal(surname(card('I1', 'Hans-Peter Weber')), 'Weber');
    assert.equal(surname(card('I1', null, false)), '');
    assert.equal(surname(null), '');
    assert.equal(firstName(card('I2', 'Anna Müller')), 'Anna');
    assert.equal(firstName(card('I2', null, false)), '');
});

test('generationLabel', () => {
    assert.equal(generationLabel(1), 'Eltern');
    assert.equal(generationLabel(3), 'Urgroßeltern');
    assert.equal(generationLabel(5), 'Urururgroßeltern');
    assert.equal(generationLabel(7), '7. Generation');
});

test('eventLine: Datum und Ort, nur eins, nichts', () => {
    assert.equal(eventLine('*', { date: '26. Januar 1935', place: 'Berlin' }), '* 26. Januar 1935 in Berlin');
    assert.equal(eventLine('†', { date: '3. August 2005', place: null }), '† 3. August 2005');
    assert.equal(eventLine('*', { date: null, place: 'Tilsit' }), '* in Tilsit');
    assert.equal(eventLine('*', null), '');
    assert.equal(eventLine('*', { date: null, place: null }), '');
});

test('halfSiblingNote', () => {
    assert.equal(halfSiblingNote({ half: false, sex: 'F' }, 'Anna'), '');
    assert.equal(halfSiblingNote({ half: true, sex: 'F', relation: 'deine Tante' }, 'Anna'), 'Halbschwester von Anna');
    assert.equal(halfSiblingNote({ half: true, sex: 'M', relation: '' }, 'Anna'), 'Halbbruder von Anna');
    assert.equal(halfSiblingNote({ half: true, sex: 'U' }, ''), 'Halbgeschwister');
    assert.equal(halfSiblingNote({ half: true, sex: 'F', relation: 'deine Halbtante' }, 'Anna'), '');
    assert.equal(halfSiblingNote({ half: true, visible: false }, 'Anna'), '');
});

test('slideOrder: datierte zuerst, Index des ersten undatierten', () => {
    const order = slideOrder([{ id: 'a', sortKey: null }, { id: 'b', sortKey: 5 }, { id: 'c', sortKey: 7 }, { id: 'd' }]);
    assert.deepEqual(order.slides.map((s) => s.id), ['b', 'c', 'a', 'd']);
    assert.equal(order.firstUndated, 2);
    assert.deepEqual(slideOrder([{ id: 'x', sortKey: 1 }]).firstUndated, 1);
    assert.deepEqual(slideOrder(undefined), { slides: [], firstUndated: 0 });
});

test('routeProgress: Dias ohne Punkt behalten den Stand, vor dem ersten Punkt -1', () => {
    const slides = [{ id: 'geburt' }, { id: 'beruf' }, { id: 'familie' }, { id: 'heirat' }, { id: 'tod' }];
    const route = [{ slideId: 'beruf' }, { slideId: 'heirat' }];
    assert.deepEqual(routeProgress(slides, route), [-1, 0, 0, 1, 1]);
    assert.deepEqual(routeProgress(slides, []), [-1, -1, -1, -1, -1]);
    assert.deepEqual(routeProgress([], route), []);
});

test('routeProgress geht nie zurück, auch wenn ein späteres Dia einen früheren Punkt trägt', () => {
    assert.deepEqual(routeProgress([{ id: 'b' }, { id: 'a' }], [{ slideId: 'a' }, { slideId: 'b' }]), [1, 1]);
});

test('safeHttpUrl lässt nur http(s) durch', () => {
    assert.equal(safeHttpUrl('https://www.familysearch.org/ark:/61903/1:1:X'), 'https://www.familysearch.org/ark:/61903/1:1:X');
    assert.equal(safeHttpUrl('http://example.org/a b'), 'http://example.org/a%20b');
    assert.equal(safeHttpUrl('javascript:alert(1)'), null);
    assert.equal(safeHttpUrl('data:text/html,x'), null);
    assert.equal(safeHttpUrl('/relativ.pdf'), null);
    assert.equal(safeHttpUrl(null), null);
});

test('swipeDirection erkennt klare Gesten und ignoriert schräge oder kurze', () => {
    assert.equal(swipeDirection(-80, 10), 'left');
    assert.equal(swipeDirection(90, -20), 'right');
    assert.equal(swipeDirection(5, 120), 'down');
    assert.equal(swipeDirection(0, -70), 'up');
    assert.equal(swipeDirection(30, 10), null);
    assert.equal(swipeDirection(70, 60), null);
    assert.equal(swipeDirection(40, 0, 30), 'right');
});

test('relationText', () => {
    assert.equal(relationText('du'), 'das bist du');
    assert.equal(relationText('dein Großvater'), 'dein Großvater');
    assert.equal(relationText(null), '');
});

test('slideSymbol nach Titel', () => {
    assert.equal(slideSymbol('Tod des Vaters'), '†');
    assert.equal(slideSymbol('Begräbnis'), '†');
    assert.equal(slideSymbol('Heirat einer Tochter'), '⚭');
    assert.equal(slideSymbol('Kindstaufe'), '✻');
    assert.equal(slideSymbol('Geburt eines Sohns'), '✻');
    assert.equal(slideSymbol('Beruf'), '❧');
    assert.equal(slideSymbol(undefined), '❧');
});
