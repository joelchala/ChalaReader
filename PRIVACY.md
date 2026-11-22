# Política de privacidad de ChalaReader

*Última actualización: 16 de noviembre de 2026* · [English version below](#chalareader-privacy-policy)

ChalaReader es una extensión de navegador de código abierto que transforma artículos web en una vista de lectura limpia, aislada mediante Shadow DOM y con herramientas locales de exportación y lectura offline. Publicada por Joel Chala bajo la licencia MIT.

## Resumen

**ChalaReader no recopila, transmite, vende ni comparte ningún dato personal ni de navegación.** Funciona 100% offline, no tiene servidores propios, no incluye analíticas ni telemetría y no requiere crear una cuenta.

## Qué datos se manejan y dónde

- **Tus preferencias tipográficas y tema visual** (Oscuro Chala, Sepia, Claro, familia de fuente, tamaño, interlineado y ancho de columna) se guardan únicamente en tu navegador mediante `chrome.storage.local`.
- **Tus artículos guardados para leer luego** (título, URL, fecha y HTML limpio del artículo) se almacenan exclusivamente en `chrome.storage.local` dentro de tu dispositivo y nunca salen de él, salvo que exportes manualmente un archivo `.md` o imprimas un PDF local.
- **La extracción del artículo** ocurre localmente en la pestaña activa clonando el DOM sin enviar URLs ni contenido a servidores externos.

## Conexiones de red

En su uso normal, ChalaReader **no realiza ninguna conexión a servidores externos**.

Las únicas conexiones externas ocurren por una acción directa tuya al hacer clic en los enlaces del pie del lector:

- **Suite Chala y repositorio de código abierto (GitHub):** abre la página del proyecto en GitHub. Aplica la política de privacidad de GitHub.
- **Donaciones (PayPal):** el enlace «Apoyar en PayPal» abre una página de PayPal. ChalaReader no recibe ni procesa datos de pago; aplica la política de privacidad de PayPal. Donar es opcional y no desbloquea ninguna función.

## Permisos que solicita la extensión

| Permiso | Para qué se usa |
|---|---|
| `activeTab` | Acceder temporalmente al DOM de la pestaña activa únicamente cuando pulsas el icono de ChalaReader o presionas `Alt+R` |
| `scripting` | Inyectar bajo demanda el extractor local (`lib/readability.js`) y el visor Shadow DOM (`content/reader-engine.js`) en la pestaña activa |
| `storage` | Guardar tus ajustes de lectura y tu lista offline de artículos en `chrome.storage.local` |

ChalaReader **no** solicita `tabs`, `<all_urls>` ni permisos persistentes sobre los sitios web. Ninguno de los permisos solicitados se utiliza para recopilar información.

## Cambios a esta política

Cualquier cambio se publicará en este mismo archivo; el historial completo es público en el [repositorio](https://github.com/joelchala/ChalaReader/commits/main/PRIVACY.md).

## Contacto

Para preguntas sobre privacidad, abre un reporte en <https://github.com/joelchala/ChalaReader/issues>.

---

# ChalaReader Privacy Policy

*Last updated: November 16, 2026*

ChalaReader is an open-source browser extension that turns cluttered web pages into a clean, distraction-free reader view encapsulated inside a Shadow DOM with local Markdown/PDF export and offline saved articles. Published by Joel Chala under the MIT license.

## Summary

**ChalaReader does not collect, transmit, sell, or share any personal or browsing data.** It runs 100% offline, has no servers of its own, includes no analytics or telemetry, and requires no account.

## What data is handled, and where

- **Your theme and typography preferences** (Chala Dark, Sepia, Light, font family, size, line height, and column width) are stored solely in your browser via `chrome.storage.local`.
- **Your saved "Read Later" articles** (title, URL, date, and cleaned article content) are stored locally in `chrome.storage.local` on your device and never leave it, unless you manually export a `.md` file or print a local PDF.
- **Article extraction** executes locally in the active tab by cloning the DOM without sending URLs or page content anywhere.

## Network connections

In normal use, ChalaReader **makes no connections to external servers**.

External connections only happen when you directly click footer links inside the reader:

- **Suite Chala & GitHub repository:** opens the project page on GitHub. GitHub's privacy policy applies.
- **Donations (PayPal):** the "Support on PayPal" link opens a PayPal page. ChalaReader does not receive or process payment data; PayPal's privacy policy applies. Donating is optional and unlocks no features.

## Permissions requested by the extension

| Permission | What it is used for |
|---|---|
| `activeTab` | Temporarily accessing the active tab only when you click the ChalaReader toolbar icon or press `Alt+R` |
| `scripting` | Injecting the local readability extractor (`lib/readability.js`) and Shadow DOM reader engine (`content/reader-engine.js`) on demand |
| `storage` | Storing typography preferences and offline saved articles inside `chrome.storage.local` |

ChalaReader does **not** request `tabs`, `<all_urls>`, or broad host permissions. None of the requested permissions is used to collect information.

## Changes to this policy

Any change will be published in this same file; the full history is public in the [repository](https://github.com/joelchala/ChalaReader/commits/main/PRIVACY.md).

## Contact

For privacy questions, open an issue at <https://github.com/joelchala/ChalaReader/issues>.
