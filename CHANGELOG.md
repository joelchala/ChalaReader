# Historial de cambios

## 1.0.0

- Lanzamiento inicial de **ChalaReader** (Manifest V3) para Google Chrome y Microsoft Edge.
- Toggle directo sin popup desde el icono de la extensión o el atajo de teclado `Alt+R`, con validación segura contra URLs internas protegidas.
- Motor heurístico local `ChalaReadability` para extracción limpia de artículos sin dependencias externas ni red.
- Clonación del DOM sin mutar la página original y promoción automática de imágenes `data-src`, `data-lazy-src` y `data-original`.
- Aislamiento completo mediante Shadow DOM (`#chalareader-host`) y hoja de estilos encapsulada `reader-theme.css`.
- Barra superior de progreso en tiempo real, métricas de palabras y tiempo estimado de lectura (220 palabras/minuto).
- Tres temas instantáneos (**Oscuro Chala**, **Sepia** y **Claro**) y controles de tipografía persistentes (Sans-Serif, Serif, Alta legibilidad, tamaño, interlineado y ancho de columna de `60ch` a `85ch`).
- Exportación pura a Markdown (`.md`), impresión/guardado PDF limpio mediante regla temporal `@media print` y panel offline de artículos guardados en `chrome.storage.local`.
- Internacionalización completa en español (`es`, predeterminado) e inglés (`en`).
