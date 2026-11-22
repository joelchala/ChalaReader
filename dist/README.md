# INSTALACIÓN (dist)

## Google Chrome / Microsoft Edge

1. Descarga y descomprime `ChalaReader_<version>.chromium.zip` (o `ChalaReader_<version>.edge.zip` desde [Releases](https://github.com/joelchala/ChalaReader/releases)), o ejecuta localmente:
   ```bash
   node tools/make-mv3.mjs
   ```
2. Abre `chrome://extensions/` en Chrome o `edge://extensions/` en Microsoft Edge.
3. Activa el **Modo de desarrollador**.
4. Haz clic en **Cargar descomprimida**.
5. Selecciona la carpeta `dist/build/ChalaReader.chromium/` (o directamente `src/`).

## Cómo conservar tus artículos guardados y ajustes al actualizar manualmente

- Conserva la extensión cargada desde la misma ruta local y reemplaza únicamente el contenido de la carpeta cuando actualices manualmente.
- Tus ajustes tipográficos y artículos guardados offline permanecen en `chrome.storage.local` mientras mantengas el mismo ID de extensión.
