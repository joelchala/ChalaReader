# ChalaReader: ficha para Edge Add-ons

Material listo para copiar y pegar en **Microsoft Partner Center (Edge Add-ons)**. Sirve también para la Chrome Web Store, cambiando el paquete.

## 1. Packages (paquete)

| Tienda | Archivo a subir |
|---|---|
| Edge Add-ons | `store/paquetes/ChalaReader_1.0.0.edge.zip` |
| Chrome Web Store | `store/paquetes/ChalaReader_1.0.0.chromium.zip` |

Ambos se generan localmente con `node tools/make-mv3.mjs` o en GitHub Actions al publicar una etiqueta en <https://github.com/joelchala/ChalaReader/releases>.

## 2. Availability (disponibilidad)

- **Visibility:** Public
- **Markets:** todos

## 3. Properties (propiedades)

- **Category:** Productivity
- **Privacy policy requirements:** la extensión **no** accede, recopila ni transmite información personal → responder **No**
- **Privacy policy URL:** `https://github.com/joelchala/ChalaReader/blob/main/PRIVACY.md`
- **Website URL:** `https://github.com/joelchala/ChalaReader`
- **Support contact details:** `https://github.com/joelchala/ChalaReader/issues`
- **Mature content:** No

## 4. Privacy (privacidad)

**Single purpose (propósito único):**

> ChalaReader transforms cluttered web articles into a clean, isolated Shadow DOM reader view with local typography controls, Markdown/PDF export, and offline saved reading.

**Justificación de permisos** (pegar en el campo de cada permiso):

| Permiso | Justificación |
|---|---|
| `activeTab` | Grants temporary access to the active tab solely when the user clicks the ChalaReader icon or presses `Alt+R` to clone the DOM and extract the readable article locally. |
| `scripting` | Injects the local readability extractor (`lib/readability.js`) and the Shadow DOM reader engine (`content/reader-engine.js`) on demand into the active tab. |
| `storage` | Saves typography preferences, active theme, and user-saved offline articles inside `chrome.storage.local`. |

**Remote code:** No. All code is included in the package.

**Data usage:** the extension does not collect or transmit any user data. No marcar ninguna categoría de datos y aceptar las tres declaraciones de cumplimiento.

## 5. Store listings (ficha)

Crear dos idiomas: **Spanish** y **English**. El nombre y la descripción corta se leen del paquete (`_locales`).

### Imágenes (carpeta `store/`)

| Campo | Archivo | Tamaño |
|---|---|---|
| Extension logo | `logo-300x300.png` | 300×300 |
| Small promotional tile | `promo-440x280.png` | 440×280 |
| Marquee promotional tile | `destacada-1400x560.png` | 1400×560 |
| Screenshots | `captura-1-lectura.png`, `captura-2-temas-tipografia.png`, `captura-3-guardados.png` | 1280×800 |

### Descripción (español)

```
ChalaReader es un modo lectura de código abierto, 100% local y sin distracciones para Chrome y Microsoft Edge. Parte de la Suite Chala junto a Chalablock, ChalaVPN, ChalaTabs y ChalaDev.

CARACTERÍSTICAS
• Activación instantánea sin popup: clic en el icono o atajo Alt+R (salir con Esc)
• Motor heurístico local que extrae el artículo limpio y promueve imágenes lazy-loaded (data-src, data-lazy-src, data-original) sin mutar la web original
• Aislamiento total mediante Shadow DOM para evitar conflictos CSS con cualquier página
• Barra superior de progreso en tiempo real, conteo de palabras y tiempo estimado de lectura (220 palabras/minuto)
• Tres temas visuales al instante: Oscuro Chala («Escudo Cibernético»), Sepia y Claro
• Tipografía personalizable persistente: Sans-Serif, Serif y Alta legibilidad (OpenDyslexic), tamaño de letra, interlineado y ancho de columna (60ch a 85ch)
• Exportar a Markdown (.md) puro generado localmente con Blob
• Imprimir o guardar PDF limpio ocultando el resto de la página
• Guardar para leer luego en chrome.storage.local con panel lateral integrado

PRIVACIDAD Y CÓDIGO ABIERTO
ChalaReader no realiza peticiones de red, no incluye analíticas ni telemetría y solicita únicamente activeTab, scripting y storage (sin tabs ni <all_urls>).

Código fuente bajo licencia MIT: https://github.com/joelchala/ChalaReader
ChalaReader es 100% gratuito. Las donaciones por PayPal son opcionales y no desbloquean funciones.
```

### Description (English)

```
ChalaReader is a 100% local, open-source, distraction-free reader mode for Chrome and Microsoft Edge. Part of Suite Chala alongside Chalablock, ChalaVPN, ChalaTabs, and ChalaDev.

FEATURES
• Instant one-click or Alt+R toggle with zero popup clutter (press Esc or Exit to restore the original page)
• Local heuristic extractor that clones the DOM without mutating the page and resolves lazy-loaded images (data-src, data-lazy-src, data-original)
• Complete Shadow DOM style isolation so host CSS never breaks your reading experience
• Live scroll progress bar, word count, and estimated reading time (220 WPM)
• Instant themes: Chala Dark, Sepia, and Light
• Persistent typography controls: Sans-Serif, Serif, and High Legibility (OpenDyslexic), font size, line height, and column width (60ch–85ch)
• Pure local Markdown (.md) export via Blob download
• Clean Print / Save PDF mode hiding host page clutter
• Offline "Read Later" storage and drawer powered by chrome.storage.local

PRIVACY & OPEN SOURCE
ChalaReader makes zero network requests, includes no analytics or telemetry, and requests only minimal permissions (activeTab, scripting, storage), with no tabs or <all_urls>.

MIT open-source repository: https://github.com/joelchala/ChalaReader
ChalaReader is 100% free. Optional PayPal donations unlock no features.
```

### Search terms (máximo 7)

```
modo lectura
reader mode
lector web
exportar markdown
leer sin distracciones
guardar articulos
pdf limpio
```

## 6. Notes for certification (notas para el revisor)

```
ChalaReader is a 100% free, open-source (MIT) Manifest V3 reader mode extension. Source code: https://github.com/joelchala/ChalaReader

No account or credentials are needed to test it.

How to test:
1. Navigate to any article webpage (e.g. a blog post or news article) and click the ChalaReader toolbar icon or press Alt+R.
2. The Shadow DOM reader overlay (#chalareader-host) appears with reading metrics, scroll progress bar, instant themes (Chala Dark, Sepia, Light), and typography controls.
3. Click "Export .md" to download a local Markdown file, "Print / PDF" for clean printing, or "Save" / "Read later" to test local offline persistence in chrome.storage.local.
4. Click "Exit", press Esc, or click the toolbar icon again to hide the reader and restore the original page.

The extension requests only activeTab, scripting, and storage (no <all_urls> or tabs permission), contains no remote code, and makes zero network requests.
```
