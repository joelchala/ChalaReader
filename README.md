<h1 align="center">
<img src="src/icons/icon.svg" height="48" width="48" alt="">
<br>
ChalaReader
</h1>

<p align="center">
Modo lectura limpio, privado y 100% offline para Chrome, Edge y otros navegadores Chromium.<br>
Extracción heurística local, aislamiento en Shadow DOM, exportación a Markdown, PDF y lectura guardada sin rastreadores.
</p>

***

## Qué es

ChalaReader elimina anuncios, barras laterales, popups y ruido visual con un solo clic en el icono de la barra o presionando **`Alt+R`**. Funciona 100% offline con Manifest V3: sin servidores externos, sin telemetría y sin permisos invasivos (`activeTab`, `scripting` y `storage` únicamente).

- **Autor y mantenimiento:** Joel Chala
- **Licencia:** [MIT](LICENSE.txt)
- **Privacidad:** [no recopila ningún dato](PRIVACY.md)

## Características

- **Activación instantánea sin popup (`Alt+R` o clic):** alterna de forma idempotente el visor `#chalareader-host` sin volver a parsear la página y restaurando exactamente el scroll original al salir (`Esc` o botón Salir).
- **Motor heurístico local (`lib/readability.js`):** clona el DOM sin mutar la web original, promueve imágenes lazy-loaded (`data-src`, `data-lazy-src`, `data-original`) y extrae el artículo limpio puntuando bloques DOM y densidad de enlaces.
- **Aislamiento total con Shadow DOM (`mode: 'open'`):** la hoja `reader-theme.css` vive encapsulada dentro del ShadowRoot para que los estilos de la web anfitriona nunca rompan la lectura.
- **Tres temas instantáneos:** **Oscuro Chala** («Escudo Cibernético» `#0F172A` / `#1E293B` / `#F1F5F9` con acentos `#10B981` y `#06B6D4`), **Sepia** y **Claro**.
- **Tipografía persistente:** familia Sans-Serif, Serif o Alta legibilidad (`OpenDyslexic`), tamaño (`14px`–`28px`), interlineado y ancho de columna (`60ch`–`85ch`) guardados en `chrome.storage.local`.
- **Métricas de lectura y barra de progreso:** conteo de palabras, tiempo estimado a 220 palabras/minuto y progreso de scroll en tiempo real.
- **Exportar Markdown (`.md`):** conversor puro en JavaScript que genera y descarga el artículo limpio en local mediante `Blob` y `URL.createObjectURL`.
- **Imprimir / Guardar PDF:** inyecta temporalmente reglas `@media print` que ocultan la página anfitriona para imprimir o exportar un PDF limpio.
- **Guardar para leer luego:** almacena título, URL, fecha y contenido limpio en `chrome.storage.local` con un panel lateral integrado en el Shadow DOM.
- **Bilingüe (`_locales`):** español (`es`, predeterminado) e inglés (`en`).

## Instalación

1. Descarga una versión compilada desde las [versiones publicadas](https://github.com/joelchala/ChalaReader/releases) o genera la carpeta localmente (ver más abajo).
2. Abre `chrome://extensions` (Chrome) o `edge://extensions` (Edge).
3. Activa el **Modo de desarrollador**.
4. Pulsa **Cargar descomprimida** y elige la carpeta `dist/build/ChalaReader.chromium` (o `src/`).

## Compilar / Empaquetar

Requisitos: Node.js 22 o superior (cero dependencias externas).

```bash
git clone https://github.com/joelchala/ChalaReader.git
cd ChalaReader && node tools/make-mv3.mjs
```

También puedes usar el script Bash:

```bash
bash tools/make-mv3.sh
```

Para regenerar los iconos PNG y piezas de tienda:

```bash
node tools/generate-assets.mjs
```

Para ejecutar todas las pruebas automatizadas:

```bash
node tests/verify.mjs
```

La extensión desempaquetada queda en `dist/build/ChalaReader.chromium/` y los paquetes listos para subir a tiendas quedan en `store/paquetes/ChalaReader_1.0.0.chromium.zip` y `store/paquetes/ChalaReader_1.0.0.edge.zip`. El código fuente de la extensión está en [`src/`](src/).

## Apoyar el proyecto

ChalaReader es 100% gratuito y de código abierto. Si te resulta útil, puedes hacer una [donación opcional por PayPal](https://www.paypal.com/ncp/payment/VSWPSS7D4ZRH2). Donar no desbloquea ninguna función.

## Suite Chala y licencia

ChalaReader forma parte de la **Suite Chala** de herramientas gratuitas y privadas junto a [Chalablock](https://github.com/joelchala/Chalablock), [ChalaVPN](https://github.com/joelchala/ChalaVPN), [ChalaTabs](https://github.com/joelchala/ChalaTabs) y [ChalaDev](https://github.com/joelchala/ChalaDev).

Todo el proyecto se distribuye bajo la [Licencia MIT](LICENSE.txt): puedes usarlo, estudiarlo, modificarlo y redistribuirlo libremente.
