# Contribuciones

Gracias por tu interés en contribuir a **ChalaReader**.

---

### Reportar errores o proponer mejoras

Si encuentras algún error de extracción en un sitio web o quieres proponer una mejora para el modo lectura, abre un reporte en [GitHub Issues](https://github.com/joelchala/ChalaReader/issues).

---

### Desarrollo local y pruebas

1. Clona el repositorio y modifica los archivos dentro de `src/`.
2. Si actualizas iconos o piezas gráficas, regenera los PNG localmente:
   ```bash
   node tools/generate-assets.mjs
   ```
3. Ejecuta las pruebas automatizadas:
   ```bash
   node tests/verify.mjs
   ```
4. Genera la compilación desempaquetada y los paquetes `.zip` para Chrome y Edge:
   ```bash
   node tools/make-mv3.mjs
   ```
5. Carga `dist/build/ChalaReader.chromium` (o `src/`) como extensión descomprimida en `chrome://extensions` o `edge://extensions`.

---

### Traducciones

Las cadenas de la interfaz se encuentran en `src/_locales/es/messages.json` y `src/_locales/en/messages.json`. Toda nueva clave debe existir en ambos archivos y pasar la verificación de `tests/verify.mjs`.
