# ChalaReader: ficha para Chrome Web Store

Material listo para pegar en <https://chrome.google.com/webstore/devconsole>. Los textos largos de descripción son los mismos de [ficha-tienda.md](ficha-tienda.md), sección 5.

## 1. Package (paquete)

Subir `store/paquetes/ChalaReader_1.0.0.chromium.zip` (o descargarlo desde Releases de GitHub).

## 2. Store listing (ficha)

| Campo | Valor |
|---|---|
| Title / Summary | Se leen del paquete (`_locales`: «ChalaReader» y descripción corta) |
| Description | Texto en español de `ficha-tienda.md`; añadir English como segundo idioma |
| Category | **Productivity > Workflow & Planning** (o **Productivity > Tools**) |
| Language | Español (añadir English como segundo idioma) |
| Store icon (128×128) | `src/icons/icon128.png` (y `store/logo-300x300.png` si se solicita logo 300×300) |
| Screenshots (1280×800) | `captura-1-lectura.png`, `captura-2-temas-tipografia.png`, `captura-3-guardados.png` |
| Small promo tile (440×280) | `promo-440x280.png` |
| Marquee promo tile (1400×560) | `destacada-1400x560.png` (opcional) |
| Homepage URL | `https://github.com/joelchala/ChalaReader` |
| Support URL | `https://github.com/joelchala/ChalaReader/issues` |
| Mature content | No |

## 3. Privacy practices (prácticas de privacidad)

**Single purpose:**

```
ChalaReader transforms cluttered web articles into a clean, isolated Shadow DOM reader view with local typography controls, Markdown/PDF export, and offline saved reading.
```

**Permission justifications:**

| Permiso | Texto |
|---|---|
| `activeTab` | Grants temporary access to the active tab solely when the user clicks the ChalaReader icon or presses `Alt+R` to clone the DOM and render the clean reader view locally. |
| `scripting` | Injects the local readability extractor (`lib/readability.js`) and Shadow DOM reader UI (`content/reader-engine.js`) on demand into the active tab. |
| `storage` | Stores typography settings, selected theme, and user-saved offline articles in `chrome.storage.local`. Nothing leaves the device. |

**Are you using remote code?** No, I am not using remote code.

**Data usage:** no marcar ninguna categoría de datos. Marcar las tres certificaciones.

**Privacy policy URL:** `https://github.com/joelchala/ChalaReader/blob/main/PRIVACY.md`

## 4. Distribution (distribución)

- **Payments:** Free of charge
- **Visibility:** Public
- **Regions:** All regions

## 5. Test instructions (instrucciones de prueba)

```
No login needed.
1. Open any article webpage and click the ChalaReader icon or press Alt+R.
2. Switch themes (Chala Dark, Sepia, Light), adjust typography/column width, export Markdown (.md), test Print/PDF, or save for offline reading.
3. Press Esc, click Exit, or click the icon again to toggle off and restore the original page.
MIT open source, minimal permissions (activeTab, scripting, storage; no <all_urls>), no remote code or telemetry.
Source: https://github.com/joelchala/ChalaReader
```
