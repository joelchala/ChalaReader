# Iconos de ChalaReader (Suite Chala)

Especificación oficial de iconos para Google Chrome (Chrome Web Store), Microsoft Edge (Edge Add-ons) y barra de herramientas Manifest V3.

## Tamaños Requeridos

| Archivo | Dimensiones | Formato | Uso principal |
|---|---|---|---|
| `icon16.png` | `16 × 16 px` | PNG RGBA | Icono de acción en barra estándar y menús contextuales |
| `icon32.png` | `32 × 32 px` | PNG RGBA | Icono de acción en pantallas HiDPI / Retina |
| `icon48.png` | `48 × 48 px` | PNG RGBA | Administrador de extensiones (`chrome://extensions`, `edge://extensions`) |
| `icon128.png` | `128 × 128 px` | PNG RGBA | Tiendas de extensiones (Chrome Web Store / Edge Add-ons) y diálogo de instalación |
| `icon.svg` | Vectorial (`128 × 128`) | SVG | Fuente maestra vectorial para documentación y escalado |

## Guía Visual («Escudo Cibernético»)

- **Fondo del contenedor:** `#0F172A` → `#1E293B` con esquinas redondeadas (`rx="28"` sobre lienzo `128 × 128`).
- **Emblema:** Escudo exterior con degradado Esmeralda (`#10B981`) → Cian (`#06B6D4`) y núcleo oscuro `#0F172A`.
- **Símbolo central:** Libro abierto minimalista (`#F1F5F9` con lomo/líneas en `#10B981` y `#06B6D4`) que identifica la lectura limpia y protegida sin rastreadores.
- **Margen de seguridad:** Todos los trazos principales respetan margen visual limpio para evitar recortes en fondos claros u oscuros de Chrome y Edge.

## Regeneración Local

Todos los PNG (`src/icons/icon{16,32,48,128}.png`) y los gráficos de tienda en `store/` se generan de forma 100% offline con Node.js (sin dependencias externas):

```bash
node tools/generate-assets.mjs
```
