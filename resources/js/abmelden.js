// Abmelden: Formulare `form.abmelden` posten an die Logout-Route von webtrees (ohne CSRF-Token, webtrees nimmt sie davon
// aus). Ohne JavaScript leitet webtrees danach auf seine Startseite; mit JavaScript schickt das Skript die Abmeldung als
// Ajax-Anfrage (webtrees antwortet dann ohne Umleitung) und führt auf die Schaufenster-Anmeldeseite (`data-login`).
//
// Keine Importe: die Datei läuft auch allein auf den Hinweisseiten (ohne Import-Map).

/** Anmeldeseite mit dem Merker „abgemeldet“ (die Seite zeigt dann „Du bist abgemeldet.“). */
function loginAfterLogout(loginUrl) {
    return loginUrl + (loginUrl.includes('?') ? '&' : '?') + 'abgemeldet=1';
}

/**
 * Meldet ab und öffnet danach die Schaufenster-Anmeldeseite. Scheitert die Ajax-Anfrage, wird das Formular normal
 * abgeschickt (webtrees leitet dann auf seine Startseite).
 *
 * @param {string} logoutUrl Logout-Route von webtrees
 * @param {string} loginUrl  Schaufenster-Anmeldeseite
 * @param {HTMLFormElement|null} form Rückfall für den normalen Versand
 */
export async function logout(logoutUrl, loginUrl, form = null) {
    try {
        const reply = await fetch(logoutUrl, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
        });
        if (!reply.ok) {
            throw new Error(`HTTP ${reply.status}`);
        }
        window.location.href = loginAfterLogout(loginUrl);
    } catch (error) {
        if (form) {
            form.submit();
        } else {
            window.location.href = loginAfterLogout(loginUrl);
        }
    }
}

/**
 * Ein Abmelde-Formular (für die Straße und Hinweise im Lebensweg).
 *
 * @param {string} logoutUrl
 * @param {string} loginUrl
 * @returns {HTMLFormElement}
 */
export function logoutForm(logoutUrl, loginUrl) {
    const form = document.createElement('form');
    form.method = 'post';
    form.action = logoutUrl;
    form.className = 'abmelden';
    form.dataset.login = loginUrl;
    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Abmelden';
    form.append(button);

    return form;
}

if (!window.schaufensterAbmelden) {
    window.schaufensterAbmelden = true;
    document.addEventListener('submit', (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || !form.classList.contains('abmelden') || !form.dataset.login) {
            return;
        }
        event.preventDefault();
        form.querySelector('button')?.setAttribute('disabled', '');
        logout(form.action, form.dataset.login, form);
    });
}
