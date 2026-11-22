/**
 * ChalaReader — Motor de lectura encapsulado en Shadow DOM (Suite Chala).
 * Clona el DOM sin mutar la página anfitriona, promueve imágenes con lazy-loading,
 * extrae el contenido limpio mediante ChalaReadability, calcula métricas (220 PPM),
 * renderiza la interfaz aislada en #chalareader-host y ofrece exportación a Markdown,
 * impresión/PDF y lectura offline persistida en chrome.storage.local.
 *
 * IIFE idempotente: múltiples ejecuciones alternan la visibilidad sin re-parsear.
 */
(function (globalScope) {
  "use strict";

  var HOST_ID = "chalareader-host";
  var PRINT_STYLE_ID = "chalareader-print-override";

  var FALLBACK_CONFIG = {
    APP_NAME: "ChalaReader",
    VERSION: "1.0.0",
    PAYPAL_DONATE_URL: "https://www.paypal.com/ncp/payment/VSWPSS7D4ZRH2",
    GITHUB_REPO_URL: "https://github.com/joelchala/ChalaReader",
    SUITE_LINKS: {
      chalablock: "https://github.com/joelchala/Chalablock",
      chalavpn: "https://github.com/joelchala/ChalaVPN",
      chalatabs: "https://github.com/joelchala/ChalaTabs",
      chaladev: "https://github.com/joelchala/ChalaDev"
    },
    WORDS_PER_MINUTE: 220,
    DEFAULT_SETTINGS: {
      theme: "dark",
      fontFamily: "sans",
      fontSize: 19,
      lineHeight: 1.75,
      maxWidth: 70
    },
    STORAGE_KEYS: {
      SETTINGS: "chalareader_settings",
      SAVED_ARTICLES: "chalareader_saved_articles"
    }
  };

  var FALLBACK_MESSAGES = {
    themeDark: "Oscuro Chala",
    themeSepia: "Sepia",
    themeLight: "Claro",
    themeGroupLabel: "Tema visual",
    fontGroupLabel: "Tipografía",
    fontSans: "Sans-Serif",
    fontSerif: "Serif",
    fontReadable: "Alta legibilidad",
    fontSizeDecrease: "Reducir tamaño de letra",
    fontSizeIncrease: "Aumentar tamaño de letra",
    lineHeightLabel: "Interlineado",
    columnWidthLabel: "Ancho",
    wordsLabel: "palabras",
    minReadLabel: "min de lectura",
    btnExportMd: "Exportar .md",
    btnExportMdTitle: "Descargar artículo limpio en formato Markdown (.md)",
    btnPrintPdf: "Imprimir / PDF",
    btnPrintPdfTitle: "Imprimir o guardar como PDF sin distracciones",
    btnSaveLater: "Guardar",
    btnSavedLater: "Guardado",
    btnSaveLaterTitle: "Guardar artículo localmente para leer luego",
    btnSavedList: "Leer luego",
    btnSavedListTitle: "Abrir lista de artículos guardados offline",
    btnExit: "Salir",
    btnExitTitle: "Salir del modo lectura (Esc)",
    savedDrawerTitle: "Artículos guardados offline",
    savedDrawerClose: "Cerrar panel",
    savedDrawerEmpty:
      "Todavía no has guardado artículos. Pulsa «Guardar» para almacenar lecturas limpias en tu navegador.",
    savedOpenInReader: "Leer aquí",
    savedOpenOriginal: "Abrir web",
    savedDelete: "Eliminar",
    suiteCredit: "Suite Chala — 100% local y sin telemetría",
    paypalDonate: "Apoyar en PayPal",
    githubRepo: "Código abierto",
    statusSaved: "Artículo guardado en almacenamiento local.",
    statusSaveError: "No se pudo guardar el artículo (almacenamiento local lleno o no disponible).",
    statusRemoved: "Artículo eliminado de guardados.",
    statusExportedMd: "Archivo Markdown (.md) generado localmente.",
    statusFallbackNotice:
      "No se detectó un artículo extenso; mostrando el contenido principal disponible.",
    originalLinkLabel: "Ver página original",
    mdSourceLabel: "Fuente",
    mdAuthorLabel: "Autor",
    untitledLabel: "Sin título"
  };

  function t(key) {
    try {
      if (typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getMessage === "function") {
        var msg = chrome.i18n.getMessage(key);
        if (msg) return msg;
      }
    } catch {
      // Fallback a cadenas embebidas si chrome.i18n no está disponible en pruebas
    }
    return FALLBACK_MESSAGES[key] || key;
  }

  function clampNumber(value, min, max, fallback) {
    var num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  }

  function isTinyPlaceholderSrc(src) {
    var val = String(src || "").trim().toLowerCase();
    if (!val) return true;
    if (val === "about:blank") return true;
    if (val.startsWith("data:image/")) {
      // Placeholders base64 diminutos (ej. gif/png 1x1 o svg inline vacío)
      if (val.length < 360) return true;
      if (val.includes("r0lgodlhaqab") || val.includes("aaaauh5baeaaaaal")) return true;
    }
    if (/(?:^|\/)(?:1x1|blank|spacer|placeholder|pixel|lazy|spinner)\.(?:gif|png|jpg|webp|svg)(?:[?#]|$)/i.test(val)) {
      return true;
    }
    return false;
  }

  // El parser de URL descarta tabs/saltos/control: "java\tscript:" equivale a "javascript:"
  function hasUnsafeScheme(value) {
    var compact = String(value || "").replace(/[\u0000-\u0020\u007f]+/g, "").toLowerCase();
    return /^(javascript|vbscript):/.test(compact);
  }

  function resolveImageUrl(rawUrl, baseURI) {
    var val = String(rawUrl || "").trim();
    if (!val || hasUnsafeScheme(val)) return "";
    if (val.startsWith("data:") || val.startsWith("blob:")) return val;
    try {
      var resolved = new URL(val, baseURI).href;
      return hasUnsafeScheme(resolved) ? "" : resolved;
    } catch {
      return "";
    }
  }

  function extractFirstSrcFromSrcset(srcset) {
    var first = String(srcset || "").split(",")[0];
    if (!first) return "";
    return first.trim().split(/\s+/)[0] || "";
  }

  /**
   * Recorre las imágenes del clon DOM y promueve data-src, data-lazy-src y data-original
   * hacia src cuando src está vacío o contiene un placeholder base64 diminuto.
   * @param {Document|Element} root
   * @param {string} [baseURI]
   * @returns {number} Número de imágenes promovidas
   */
  function promoteLazyImages(root, baseURI) {
    if (!root || !root.querySelectorAll) return 0;
    var resolvedBase = baseURI || (root.baseURI || (typeof location !== "undefined" ? location.href : "https://localhost/"));
    var promoted = 0;

    var imgs = root.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i += 1) {
      var img = imgs[i];
      var currentSrc = (img.getAttribute("src") || "").trim();
      var lazyCandidates = [
        img.getAttribute("data-src"),
        img.getAttribute("data-lazy-src"),
        img.getAttribute("data-original"),
        img.getAttribute("data-actualsrc"),
        img.getAttribute("data-echo"),
        extractFirstSrcFromSrcset(img.getAttribute("data-srcset"))
      ];

      if (isTinyPlaceholderSrc(currentSrc)) {
        for (var k = 0; k < lazyCandidates.length; k += 1) {
          var candidate = String(lazyCandidates[k] || "").trim();
          if (candidate && !isTinyPlaceholderSrc(candidate)) {
            var finalUrl = resolveImageUrl(candidate, resolvedBase);
            if (finalUrl) {
              img.setAttribute("src", finalUrl);
              promoted += 1;
              break;
            }
          }
        }
      }

      var dataSrcset = (img.getAttribute("data-srcset") || "").trim();
      if (dataSrcset && !img.getAttribute("srcset")) {
        img.setAttribute("srcset", dataSrcset);
      }
    }

    var sources = root.querySelectorAll("picture source[data-srcset]");
    for (var s = 0; s < sources.length; s += 1) {
      var source = sources[s];
      var sVal = (source.getAttribute("data-srcset") || "").trim();
      if (sVal && !source.getAttribute("srcset")) {
        source.setAttribute("srcset", sVal);
      }
    }

    return promoted;
  }

  /**
   * Calcula conteo de palabras y tiempo estimado de lectura (base 220 palabras/minuto).
   * @param {string} cleanText
   * @param {number} [wpm=220]
   */
  function calculateReadingMetrics(cleanText, wpm) {
    var rate = typeof wpm === "number" && wpm > 0 ? wpm : 220;
    var normalized = String(cleanText || "").replace(/\s+/g, " ").trim();
    var words = normalized ? normalized.split(" ").filter(Boolean) : [];
    var wordCount = words.length;
    var readingTimeMinutes = wordCount > 0 ? Math.max(1, Math.ceil(wordCount / rate)) : 1;
    return {
      wordCount: wordCount,
      readingTimeMinutes: readingTimeMinutes
    };
  }

  function slugifyFilename(title) {
    var base = String(title || "articulo-chalareader")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72);
    return (base || "articulo-chalareader") + ".md";
  }

  // Marcador interno para <br>: sobrevive al colapso de espacios y luego se convierte
  // en salto de línea duro de Markdown ("  \n"). El parser HTML nunca deja U+0000 en el texto.
  var MD_BR = "\u0000BR\u0000";
  var MD_BR_RE = /\s*\u0000BR\u0000\s*/g;

  function escapeMarkdownText(text) {
    return String(text || "").replace(/\s+/g, " ");
  }

  /**
   * Normaliza la salida inline: colapsa espacios y convierte los <br> en saltos duros
   * (o en espacios cuando el contexto no admite saltos, p. ej. encabezados o celdas).
   */
  function normalizeInlineMarkdown(text, allowBreaks) {
    var collapsed = escapeMarkdownText(text).trim();
    if (!allowBreaks) {
      return collapsed.replace(MD_BR_RE, " ").trim();
    }
    return collapsed
      .replace(/^(?:\s*\u0000BR\u0000\s*)+|(?:\s*\u0000BR\u0000\s*)+$/g, "")
      .replace(MD_BR_RE, "  \n");
  }

  function longestBacktickRun(text) {
    var runs = String(text || "").match(/`+/g) || [];
    return runs.reduce(function (max, run) { return Math.max(max, run.length); }, 0);
  }

  function markdownCodeSpan(text) {
    var fence = "`".repeat(longestBacktickRun(text) + 1);
    var pad = /^`|`$/.test(text) ? " " : "";
    return fence + pad + text + pad + fence;
  }

  function escapeMarkdownUrl(url) {
    return String(url || "")
      .trim()
      .replace(/ /g, "%20")
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29");
  }

  function serializeInlineMarkdown(node) {
    if (!node) return "";
    if (node.nodeType === 3) {
      return String(node.nodeValue || "").replace(/\s+/g, " ");
    }
    if (node.nodeType !== 1) return "";

    var tag = node.tagName;
    if (tag === "BR") return MD_BR;
    if (tag === "IMG") {
      var alt = (node.getAttribute("alt") || "").replace(/[\[\]]/g, "");
      var src = node.getAttribute("src") || "";
      return src ? "![" + alt + "](" + escapeMarkdownUrl(src) + ")" : "";
    }
    if (tag === "CODE" && (!node.parentNode || node.parentNode.tagName !== "PRE")) {
      var codeText = (node.textContent || "").replace(/\s+/g, " ").trim();
      return codeText ? markdownCodeSpan(codeText) : "";
    }

    var childrenMd = "";
    var children = node.childNodes || [];
    for (var i = 0; i < children.length; i += 1) {
      childrenMd += serializeInlineMarkdown(children[i]);
    }

    if (tag === "STRONG" || tag === "B") {
      var bold = childrenMd.trim();
      return bold ? "**" + bold + "**" : "";
    }
    if (tag === "EM" || tag === "I") {
      var italic = childrenMd.trim();
      return italic ? "*" + italic + "*" : "";
    }
    if (tag === "DEL" || tag === "S") {
      var strike = childrenMd.trim();
      return strike ? "~~" + strike + "~~" : "";
    }
    if (tag === "A") {
      var href = (node.getAttribute("href") || "").trim();
      var label = childrenMd.trim() || href;
      if (!href || hasUnsafeScheme(href)) return label;
      return "[" + label + "](" + escapeMarkdownUrl(href) + ")";
    }

    return childrenMd;
  }

  function serializeListMarkdown(listNode, ordered, depth) {
    var lines = [];
    var indent = "  ".repeat(depth);
    var index = Number(listNode.getAttribute("start")) || 1;
    var items = listNode.children || [];

    for (var i = 0; i < items.length; i += 1) {
      var li = items[i];
      if (!li || li.tagName !== "LI") continue;

      var inlineParts = [];
      var nestedLists = [];
      var liChildren = li.childNodes || [];
      for (var c = 0; c < liChildren.length; c += 1) {
        var child = liChildren[c];
        if (child.nodeType === 1 && (child.tagName === "UL" || child.tagName === "OL")) {
          nestedLists.push(child);
        } else {
          inlineParts.push(serializeInlineMarkdown(child));
        }
      }

      var prefix = ordered ? String(index) + ". " : "- ";
      index += 1;
      var continuation = "\n" + indent + " ".repeat(prefix.length);
      var lineText = normalizeInlineMarkdown(inlineParts.join(""), true).replace(/\n/g, continuation);
      if (lineText) {
        lines.push(indent + prefix + lineText);
      }

      for (var n = 0; n < nestedLists.length; n += 1) {
        var nested = nestedLists[n];
        lines.push(serializeListMarkdown(nested, nested.tagName === "OL", depth + 1));
      }
    }

    return lines.filter(Boolean).join("\n");
  }

  function serializeTableMarkdown(tableNode) {
    var rows = Array.from(tableNode.querySelectorAll("tr"));
    if (rows.length === 0) return "";
    var mdRows = [];

    for (var r = 0; r < rows.length; r += 1) {
      var cells = Array.from(rows[r].querySelectorAll("th, td"));
      if (cells.length === 0) continue;
      var cellValues = cells.map(function (cell) {
        return normalizeInlineMarkdown(serializeInlineMarkdown(cell), false).replace(/\|/g, "\\|");
      });
      mdRows.push("| " + cellValues.join(" | ") + " |");
      // El separador va tras la primera fila con celdas (no necesariamente rows[0])
      if (mdRows.length === 1) {
        mdRows.push("| " + cellValues.map(function () { return "---"; }).join(" | ") + " |");
      }
    }
    return mdRows.join("\n");
  }

  function serializeBlockNode(node) {
    if (!node) return "";
    if (node.nodeType === 3) {
      return escapeMarkdownText(node.nodeValue || "").trim();
    }
    if (node.nodeType !== 1) return "";

    var tag = node.tagName;

    if (/^H[1-6]$/.test(tag)) {
      var level = Number(tag.slice(1));
      var headingText = normalizeInlineMarkdown(serializeInlineMarkdown(node), false);
      return headingText ? "#".repeat(level) + " " + headingText : "";
    }

    if (tag === "P") {
      return normalizeInlineMarkdown(serializeInlineMarkdown(node), true);
    }

    if (tag === "HR") {
      return "---";
    }

    if (tag === "PRE") {
      var codeEl = node.querySelector("code");
      var rawCode = ((codeEl ? codeEl.textContent : node.textContent) || "").replace(/\n+$/, "");
      // La valla debe ser más larga que cualquier secuencia de backticks del bloque
      var codeFence = "`".repeat(Math.max(3, longestBacktickRun(rawCode) + 1));
      return codeFence + "\n" + rawCode + "\n" + codeFence;
    }

    if (tag === "BLOCKQUOTE") {
      var innerBlocks = [];
      var bqChildren = node.childNodes || [];
      for (var i = 0; i < bqChildren.length; i += 1) {
        var chunk = serializeBlockNode(bqChildren[i]);
        if (chunk) innerBlocks.push(chunk);
      }
      var joined = innerBlocks.join("\n\n").trim();
      if (!joined) return "";
      return joined
        .split("\n")
        .map(function (line) { return line ? "> " + line : ">"; })
        .join("\n");
    }

    if (tag === "UL" || tag === "OL") {
      return serializeListMarkdown(node, tag === "OL", 0);
    }

    if (tag === "FIGURE") {
      var figParts = [];
      var img = node.querySelector("img");
      if (img) figParts.push(serializeInlineMarkdown(img));
      var caption = node.querySelector("figcaption");
      if (caption) {
        var capText = normalizeInlineMarkdown(serializeInlineMarkdown(caption), false);
        if (capText) figParts.push("*" + capText + "*");
      }
      return figParts.filter(Boolean).join("\n\n");
    }

    if (tag === "IMG") {
      return serializeInlineMarkdown(node);
    }

    if (tag === "TABLE") {
      return serializeTableMarkdown(node);
    }

    // Contenedores genéricos (div, section, article, etc.)
    var hasBlockKids = Boolean(
      node.querySelector &&
        node.querySelector("h1,h2,h3,h4,h5,h6,p,blockquote,ul,ol,pre,figure,table,hr,div,section,article")
    );
    if (!hasBlockKids) {
      return normalizeInlineMarkdown(serializeInlineMarkdown(node), true);
    }

    var blocks = [];
    var kids = node.childNodes || [];
    for (var k = 0; k < kids.length; k += 1) {
      var res = serializeBlockNode(kids[k]);
      if (res) blocks.push(res);
    }
    return blocks.join("\n\n");
  }

  /**
   * Convierte nodos HTML limpios en Markdown puro (GithHub-flavored).
   * @param {Element|string} input
   * @param {{ title?: string, url?: string, byline?: string, siteName?: string }} [meta]
   * @returns {string}
   */
  function htmlToMarkdown(input, meta) {
    var rootNode = null;
    if (typeof input === "string") {
      var doc = new DOMParser().parseFromString("<div>" + input + "</div>", "text/html");
      rootNode = doc.body.firstElementChild;
    } else {
      rootNode = input;
    }

    var blocks = [];
    var info = meta || {};
    if (info.title) {
      blocks.push("# " + String(info.title).trim());
    }
    var metaLines = [];
    if (info.siteName) metaLines.push("**" + t("mdSourceLabel") + ":** " + info.siteName);
    if (info.byline) metaLines.push("**" + t("mdAuthorLabel") + ":** " + info.byline);
    if (info.url) metaLines.push("**URL:** " + info.url);
    if (metaLines.length > 0) {
      blocks.push(metaLines.join(" · "));
      blocks.push("---");
    }

    if (rootNode) {
      var children = rootNode.childNodes || [];
      for (var i = 0; i < children.length; i += 1) {
        var md = serializeBlockNode(children[i]);
        if (md) blocks.push(md);
      }
    }

    return blocks
      .join("\n\n")
      .replace(MD_BR_RE, "  \n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n";
  }

  function createSvgIcon(pathD, size) {
    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", String(size || 15));
    svg.setAttribute("height", String(size || 15));
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", pathD);
    svg.appendChild(path);
    return svg;
  }

  async function resolveBootstrap() {
    var inlineBootstrap = globalScope.__CHALAREADER_BOOTSTRAP__;
    if (inlineBootstrap && inlineBootstrap.config) {
      return inlineBootstrap;
    }
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        var reply = await chrome.runtime.sendMessage({ type: "CHALAREADER_GET_BOOTSTRAP" });
        if (reply && reply.ok) {
          return { config: reply.config || FALLBACK_CONFIG, cssText: reply.cssText || "" };
        }
      }
    } catch {
      // Continuar con configuración local por defecto
    }
    return { config: FALLBACK_CONFIG, cssText: "" };
  }

  async function storageGet(key, fallbackValue) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        var res = await chrome.storage.local.get(key);
        if (res && key in res) {
          return res[key];
        }
      }
    } catch {
      // Fallback silencioso
    }
    return fallbackValue;
  }

  /**
   * Persiste un valor en chrome.storage.local.
   * @returns {Promise<boolean>} true si se guardó; false si falló (p. ej. cuota excedida)
   */
  async function storageSet(key, value) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        var payload = {};
        payload[key] = value;
        await chrome.storage.local.set(payload);
        return true;
      }
    } catch {
      // Error controlado: el llamador decide cómo informarlo
    }
    return false;
  }

  var UNSAFE_FRAGMENT_SELECTOR =
    "script, style, link, meta, base, iframe, frame, frameset, object, embed, applet, form, " +
    "input, button, textarea, select, template, noscript, svg, math";
  var URL_ATTRS = ["href", "src", "xlink:href", "action", "formaction", "poster", "background", "cite", "data"];

  function sanitizeHtmlFragmentInto(container, htmlString) {
    container.textContent = "";
    if (!htmlString) return;
    var parsed = new DOMParser().parseFromString("<div>" + htmlString + "</div>", "text/html");
    var wrapper = parsed.body.firstElementChild;
    if (!wrapper) return;

    // Eliminar cualquier nodo ejecutable/activo antes de insertar en el Shadow DOM
    // (también se aplica a artículos guardados leídos desde chrome.storage.local)
    var unsafe = wrapper.querySelectorAll(UNSAFE_FRAGMENT_SELECTOR);
    for (var i = 0; i < unsafe.length; i += 1) {
      if (unsafe[i].parentNode) unsafe[i].parentNode.removeChild(unsafe[i]);
    }
    var all = wrapper.querySelectorAll("*");
    for (var j = 0; j < all.length; j += 1) {
      var attrs = Array.from(all[j].attributes || []);
      for (var a = 0; a < attrs.length; a += 1) {
        var name = attrs[a].name.toLowerCase();
        var val = attrs[a].value || "";
        var isUrlAttr = URL_ATTRS.indexOf(name) !== -1;
        if (
          name.startsWith("on") ||
          name === "srcdoc" ||
          name === "style" ||
          (isUrlAttr && hasUnsafeScheme(val)) ||
          (name === "srcset" && /(?:^|,)\s*(?:javascript|vbscript):/i.test(val.replace(/[\u0000-\u0020\u007f]+/g, " ")))
        ) {
          all[j].removeAttribute(attrs[a].name);
        }
      }
      // Los enlaces externos siempre abren en pestaña nueva sin referrer ni opener
      if (all[j].tagName === "A" && all[j].getAttribute("href") && !/^#/.test(all[j].getAttribute("href"))) {
        all[j].setAttribute("target", "_blank");
        all[j].setAttribute("rel", "noopener noreferrer");
      }
    }

    while (wrapper.firstChild) {
      container.appendChild(document.adoptNode(wrapper.firstChild));
    }
  }

  function buildEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (typeof text === "string") el.textContent = text;
    return el;
  }

  function currentPageUrl() {
    try {
      return String(window.location.href || "");
    } catch {
      return "";
    }
  }

  async function mountReader() {
    // 1. Idempotencia estricta: si #chalareader-host ya existe, alternar sin re-parsear
    var existingHost = document.getElementById(HOST_ID);
    if (existingHost) {
      var existingController = existingHost.__chalaReaderController;
      if (existingController) {
        // En SPAs (pushState) la URL cambia sin recargar: si el lector está oculto y la
        // página ya es otra, se destruye y se vuelve a extraer en lugar de mostrar contenido viejo.
        var isStale =
          !existingController.isVisible() &&
          typeof existingController.getSourceUrl === "function" &&
          existingController.getSourceUrl() !== currentPageUrl();
        if (!isStale) {
          return existingController.toggle();
        }
        existingController.destroy();
      } else {
        var nextHidden = !existingHost.hidden;
        existingHost.hidden = nextHidden;
        return !nextHidden;
      }
    }

    if (!document.body || globalScope.__CHALAREADER_MOUNTING__) {
      return false;
    }

    globalScope.__CHALAREADER_MOUNTING__ = true;
    try {
      var bootstrap = await resolveBootstrap();
      var config = bootstrap.config || FALLBACK_CONFIG;
      var cssText = bootstrap.cssText || "";
      var storageKeys = config.STORAGE_KEYS || FALLBACK_CONFIG.STORAGE_KEYS;
      var defaultSettings = config.DEFAULT_SETTINGS || FALLBACK_CONFIG.DEFAULT_SETTINGS;

      // 2. Clonar DOM sin mutar la página original y resolver lazy-loading en imágenes
      var docClone = document.cloneNode(true);
      var baseURI = document.baseURI || window.location.href;
      promoteLazyImages(docClone, baseURI);

      // 3. Extraer contenido limpio y métricas (220 palabras/minuto)
      var readability = globalScope.ChalaReadability;
      var extracted = readability
        ? readability.parse(docClone, {
            baseURI: baseURI,
            wordsPerMinute: config.WORDS_PER_MINUTE || 220
          })
        : {
            title: document.title || "ChalaReader",
            byline: "",
            siteName: window.location.hostname,
            publishedTime: "",
            contentHtml: "<p></p>",
            textContent: "",
            wordCount: 0,
            readingTimeMinutes: 1,
            isFallback: true
          };

      var metrics = calculateReadingMetrics(extracted.textContent, config.WORDS_PER_MINUTE || 220);
      var sourceUrl = currentPageUrl();
      var currentArticle = {
        id: sourceUrl,
        title: extracted.title || document.title || t("untitledLabel"),
        url: sourceUrl,
        siteName: extracted.siteName || window.location.hostname || "",
        byline: extracted.byline || "",
        publishedTime: extracted.publishedTime || "",
        lang: extracted.lang || "",
        dir: extracted.dir || "",
        contentHtml: extracted.contentHtml || "<p></p>",
        textContent: extracted.textContent || "",
        wordCount: metrics.wordCount,
        readingTimeMinutes: metrics.readingTimeMinutes,
        isFallback: Boolean(extracted.isFallback)
      };

      var savedSettings = await storageGet(storageKeys.SETTINGS, {});
      var state = {
        visible: true,
        typoOpen: false,
        drawerOpen: false,
        prevBodyOverflow: document.body.style.overflow || "",
        prevHtmlOverflow: document.documentElement ? document.documentElement.style.overflow || "" : "",
        settings: {
          theme: ["dark", "sepia", "light"].includes(savedSettings?.theme) ? savedSettings.theme : defaultSettings.theme,
          fontFamily: ["sans", "serif", "readable"].includes(savedSettings?.fontFamily)
            ? savedSettings.fontFamily
            : defaultSettings.fontFamily,
          fontSize: clampNumber(savedSettings?.fontSize, 14, 28, defaultSettings.fontSize),
          lineHeight: clampNumber(savedSettings?.lineHeight, 1.4, 2.2, defaultSettings.lineHeight),
          maxWidth: clampNumber(savedSettings?.maxWidth, 60, 85, defaultSettings.maxWidth)
        }
      };

      // 4. Crear #chalareader-host con Shadow DOM abierto e inyectar reader-theme.css
      var host = document.createElement("div");
      host.id = HOST_ID;
      host.setAttribute("role", "dialog");
      host.setAttribute("aria-modal", "true");
      host.setAttribute("aria-label", config.APP_NAME || "ChalaReader");

      var shadow = host.attachShadow({ mode: "open" });

      var styleEl = document.createElement("style");
      styleEl.textContent = cssText;
      shadow.appendChild(styleEl);

      var shell = buildEl("div", "cr-shell");
      shell.setAttribute("data-theme", state.settings.theme);
      shell.setAttribute("data-font", state.settings.fontFamily);
      shadow.appendChild(shell);

      // Barra superior de progreso
      var progressTrack = buildEl("div", "cr-progress-track");
      var progressFill = buildEl("div", "cr-progress-fill");
      progressTrack.appendChild(progressFill);
      shell.appendChild(progressTrack);

      // Viewport desplazable
      var viewport = buildEl("div", "cr-viewport");
      // Enfocable por programa para que Espacio/flechas/AvPág desplacen el lector y no la página
      viewport.tabIndex = -1;
      shell.appendChild(viewport);

      // Barra flotante de control
      var toolbarWrap = buildEl("header", "cr-toolbar-wrap");
      var toolbar = buildEl("div", "cr-toolbar");
      toolbarWrap.appendChild(toolbar);

      // Marca
      var brand = buildEl("div", "cr-brand");
      var brandBadge = buildEl("span", "cr-brand-badge");
      brandBadge.appendChild(createSvgIcon("M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z", 14));
      brand.appendChild(brandBadge);
      brand.appendChild(buildEl("span", "", config.APP_NAME || "ChalaReader"));
      toolbar.appendChild(brand);

      // Selector de temas
      var themeGroup = buildEl("div", "cr-toolbar-group");
      themeGroup.setAttribute("role", "group");
      themeGroup.setAttribute("aria-label", t("themeGroupLabel"));
      var themeOptions = [
        { id: "dark", label: t("themeDark") },
        { id: "sepia", label: t("themeSepia") },
        { id: "light", label: t("themeLight") }
      ];
      var themeButtons = {};
      for (var th = 0; th < themeOptions.length; th += 1) {
        (function (opt) {
          var btn = buildEl("button", "cr-btn");
          btn.type = "button";
          btn.dataset.themeChoice = opt.id;
          var dot = buildEl("span", "cr-theme-dot cr-theme-dot--" + opt.id);
          btn.appendChild(dot);
          btn.appendChild(document.createTextNode(opt.label));
          btn.addEventListener("click", function () {
            state.settings.theme = opt.id;
            applySettings(true);
          });
          themeButtons[opt.id] = btn;
          themeGroup.appendChild(btn);
        })(themeOptions[th]);
      }
      toolbar.appendChild(themeGroup);

      toolbar.appendChild(buildEl("span", "cr-divider"));

      // Controles rápidos de tamaño + botón de tipografía avanzada
      var fontQuickGroup = buildEl("div", "cr-toolbar-group");
      var btnFontDec = buildEl("button", "cr-btn", "A-");
      btnFontDec.type = "button";
      btnFontDec.title = t("fontSizeDecrease");
      btnFontDec.setAttribute("aria-label", t("fontSizeDecrease"));

      var fontSizeReadout = buildEl("span", "cr-font-size-readout");

      var btnFontInc = buildEl("button", "cr-btn", "A+");
      btnFontInc.type = "button";
      btnFontInc.title = t("fontSizeIncrease");
      btnFontInc.setAttribute("aria-label", t("fontSizeIncrease"));

      var btnTypoToggle = buildEl("button", "cr-btn", "Aa ▾");
      btnTypoToggle.type = "button";
      btnTypoToggle.setAttribute("aria-expanded", "false");

      fontQuickGroup.appendChild(btnFontDec);
      fontQuickGroup.appendChild(fontSizeReadout);
      fontQuickGroup.appendChild(btnFontInc);
      fontQuickGroup.appendChild(btnTypoToggle);
      toolbar.appendChild(fontQuickGroup);

      toolbar.appendChild(buildEl("span", "cr-divider"));

      // Acciones del artículo: Exportar .md, Imprimir/PDF, Guardar, Leer luego, Salir
      var actionGroup = buildEl("div", "cr-toolbar-group");

      var btnExportMd = buildEl("button", "cr-btn");
      btnExportMd.type = "button";
      btnExportMd.title = t("btnExportMdTitle");
      btnExportMd.appendChild(createSvgIcon("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3", 14));
      btnExportMd.appendChild(document.createTextNode(t("btnExportMd")));

      var btnPrintPdf = buildEl("button", "cr-btn");
      btnPrintPdf.type = "button";
      btnPrintPdf.title = t("btnPrintPdfTitle");
      btnPrintPdf.appendChild(createSvgIcon("M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z", 14));
      btnPrintPdf.appendChild(document.createTextNode(t("btnPrintPdf")));

      var btnSaveArticle = buildEl("button", "cr-btn cr-btn-primary");
      btnSaveArticle.type = "button";
      btnSaveArticle.title = t("btnSaveLaterTitle");
      var saveBtnLabel = buildEl("span", "", t("btnSaveLater"));
      btnSaveArticle.appendChild(createSvgIcon("M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z", 14));
      btnSaveArticle.appendChild(saveBtnLabel);

      var btnSavedDrawer = buildEl("button", "cr-btn");
      btnSavedDrawer.type = "button";
      btnSavedDrawer.title = t("btnSavedListTitle");
      var savedCountSpan = buildEl("span", "", t("btnSavedList"));
      btnSavedDrawer.appendChild(createSvgIcon("M4 6h16 M4 12h16 M4 18h10", 14));
      btnSavedDrawer.appendChild(savedCountSpan);

      var btnExit = buildEl("button", "cr-btn cr-btn-exit");
      btnExit.type = "button";
      btnExit.title = t("btnExitTitle");
      btnExit.appendChild(createSvgIcon("M18 6L6 18 M6 6l12 12", 14));
      btnExit.appendChild(document.createTextNode(t("btnExit")));

      actionGroup.appendChild(btnExportMd);
      actionGroup.appendChild(btnPrintPdf);
      actionGroup.appendChild(btnSaveArticle);
      actionGroup.appendChild(btnSavedDrawer);
      actionGroup.appendChild(btnExit);
      toolbar.appendChild(actionGroup);

      // Panel desplegable de tipografía, interlineado y ancho de columna
      var typoPanel = buildEl("div", "cr-typo-panel");
      typoPanel.hidden = true;

      var fontFamilyBlock = buildEl("div", "cr-control-block");
      fontFamilyBlock.appendChild(buildEl("span", "cr-control-label", t("fontGroupLabel")));
      var fontOptions = [
        { id: "sans", label: t("fontSans") },
        { id: "serif", label: t("fontSerif") },
        { id: "readable", label: t("fontReadable") }
      ];
      var fontButtons = {};
      for (var ff = 0; ff < fontOptions.length; ff += 1) {
        (function (opt) {
          var fBtn = buildEl("button", "cr-btn", opt.label);
          fBtn.type = "button";
          fBtn.dataset.fontChoice = opt.id;
          fBtn.addEventListener("click", function () {
            state.settings.fontFamily = opt.id;
            applySettings(true);
          });
          fontButtons[opt.id] = fBtn;
          fontFamilyBlock.appendChild(fBtn);
        })(fontOptions[ff]);
      }
      typoPanel.appendChild(fontFamilyBlock);

      var lineHeightBlock = buildEl("div", "cr-control-block");
      lineHeightBlock.appendChild(buildEl("label", "cr-control-label", t("lineHeightLabel")));
      var lineHeightRange = document.createElement("input");
      lineHeightRange.type = "range";
      lineHeightRange.className = "cr-range";
      lineHeightRange.min = "1.4";
      lineHeightRange.max = "2.2";
      lineHeightRange.step = "0.05";
      lineHeightRange.setAttribute("aria-label", t("lineHeightLabel"));
      var lineHeightVal = buildEl("span", "cr-value-pill");
      lineHeightBlock.appendChild(lineHeightRange);
      lineHeightBlock.appendChild(lineHeightVal);
      typoPanel.appendChild(lineHeightBlock);

      var widthBlock = buildEl("div", "cr-control-block");
      widthBlock.appendChild(buildEl("label", "cr-control-label", t("columnWidthLabel")));
      var widthRange = document.createElement("input");
      widthRange.type = "range";
      widthRange.className = "cr-range";
      widthRange.min = "60";
      widthRange.max = "85";
      widthRange.step = "1";
      widthRange.setAttribute("aria-label", t("columnWidthLabel"));
      var widthVal = buildEl("span", "cr-value-pill");
      widthBlock.appendChild(widthRange);
      widthBlock.appendChild(widthVal);
      typoPanel.appendChild(widthBlock);

      toolbarWrap.appendChild(typoPanel);
      viewport.appendChild(toolbarWrap);

      // Tarjeta principal del artículo
      var articleCard = buildEl("main", "cr-article-card");
      var articleHeader = buildEl("div", "cr-article-header");
      var metaBadges = buildEl("div", "cr-meta-badges");
      var titleEl = buildEl("h1", "cr-title");
      var bylineRow = buildEl("div", "cr-byline-row");

      articleHeader.appendChild(metaBadges);
      articleHeader.appendChild(titleEl);
      articleHeader.appendChild(bylineRow);
      articleCard.appendChild(articleHeader);

      var fallbackNotice = buildEl("div", "cr-notice", t("statusFallbackNotice"));
      fallbackNotice.hidden = true;
      articleCard.appendChild(fallbackNotice);

      var articleBody = buildEl("article", "cr-article");
      articleCard.appendChild(articleBody);

      // Pie con créditos Suite Chala y donación PayPal
      var footer = buildEl("footer", "cr-footer");
      footer.appendChild(buildEl("span", "", t("suiteCredit")));
      var footerLinks = buildEl("div", "cr-footer-links");

      var suiteNames = [
        { label: "Chalablock", url: config.SUITE_LINKS?.chalablock },
        { label: "ChalaVPN", url: config.SUITE_LINKS?.chalavpn },
        { label: "ChalaTabs", url: config.SUITE_LINKS?.chalatabs },
        { label: "ChalaDev", url: config.SUITE_LINKS?.chaladev },
        { label: t("githubRepo"), url: config.GITHUB_REPO_URL }
      ];
      for (var sl = 0; sl < suiteNames.length; sl += 1) {
        if (!suiteNames[sl].url) continue;
        var sLink = buildEl("a", "cr-link", suiteNames[sl].label);
        sLink.href = suiteNames[sl].url;
        sLink.target = "_blank";
        sLink.rel = "noopener noreferrer";
        footerLinks.appendChild(sLink);
      }

      var donateLink = buildEl("a", "cr-link cr-link--donate", t("paypalDonate"));
      donateLink.href = config.PAYPAL_DONATE_URL || FALLBACK_CONFIG.PAYPAL_DONATE_URL;
      donateLink.target = "_blank";
      donateLink.rel = "noopener noreferrer";
      footerLinks.appendChild(donateLink);

      footer.appendChild(footerLinks);
      articleCard.appendChild(footer);
      viewport.appendChild(articleCard);

      // Cajón lateral de artículos guardados
      var drawerBackdrop = buildEl("div", "cr-drawer-backdrop");
      drawerBackdrop.hidden = true;
      var drawer = buildEl("aside", "cr-drawer");
      drawer.setAttribute("aria-label", t("savedDrawerTitle"));

      var drawerHeader = buildEl("div", "cr-drawer-header");
      drawerHeader.appendChild(buildEl("h2", "cr-drawer-title", t("savedDrawerTitle")));
      var btnCloseDrawer = buildEl("button", "cr-btn", "✕");
      btnCloseDrawer.type = "button";
      btnCloseDrawer.title = t("savedDrawerClose");
      btnCloseDrawer.setAttribute("aria-label", t("savedDrawerClose"));
      drawerHeader.appendChild(btnCloseDrawer);

      var drawerBody = buildEl("div", "cr-drawer-body");
      drawer.appendChild(drawerHeader);
      drawer.appendChild(drawerBody);
      drawerBackdrop.appendChild(drawer);
      shell.appendChild(drawerBackdrop);

      // Toast discreto de confirmación
      var toastEl = buildEl("div", "cr-toast");
      toastEl.hidden = true;
      toastEl.setAttribute("role", "status");
      shell.appendChild(toastEl);

      var toastTimer = null;
      function showToast(message) {
        toastEl.textContent = message;
        toastEl.hidden = false;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
          toastEl.hidden = true;
        }, 2600);
      }

      function applySettings(persist) {
        shell.setAttribute("data-theme", state.settings.theme);
        shell.setAttribute("data-font", state.settings.fontFamily);
        shell.style.setProperty("--cr-font-size", state.settings.fontSize + "px");
        shell.style.setProperty("--cr-line-height", String(state.settings.lineHeight));
        shell.style.setProperty("--cr-max-width", state.settings.maxWidth + "ch");

        fontSizeReadout.textContent = state.settings.fontSize + "px";
        lineHeightRange.value = String(state.settings.lineHeight);
        lineHeightVal.textContent = state.settings.lineHeight.toFixed(2);
        widthRange.value = String(state.settings.maxWidth);
        widthVal.textContent = state.settings.maxWidth + "ch";

        Object.keys(themeButtons).forEach(function (id) {
          themeButtons[id].classList.toggle("is-active", state.settings.theme === id);
        });
        Object.keys(fontButtons).forEach(function (id) {
          fontButtons[id].classList.toggle("is-active", state.settings.fontFamily === id);
        });

        if (persist) {
          storageSet(storageKeys.SETTINGS, state.settings);
        }
      }

      function updateProgressBar() {
        var scrollable = viewport.scrollHeight - viewport.clientHeight;
        var pct = scrollable > 0 ? Math.min(100, Math.max(0, (viewport.scrollTop / scrollable) * 100)) : 100;
        progressFill.style.width = pct.toFixed(1) + "%";
      }

      function renderArticle(articleObj) {
        currentArticle = articleObj;
        titleEl.textContent = articleObj.title || "ChalaReader";

        metaBadges.textContent = "";
        if (articleObj.siteName) {
          metaBadges.appendChild(buildEl("span", "cr-badge", articleObj.siteName));
        }
        metaBadges.appendChild(
          buildEl("span", "cr-badge cr-badge--accent", articleObj.wordCount + " " + t("wordsLabel"))
        );
        metaBadges.appendChild(
          buildEl("span", "cr-badge cr-badge--accent", articleObj.readingTimeMinutes + " " + t("minReadLabel"))
        );

        bylineRow.textContent = "";
        if (articleObj.byline) {
          bylineRow.appendChild(buildEl("span", "", articleObj.byline));
        }
        if (articleObj.publishedTime) {
          bylineRow.appendChild(buildEl("span", "", articleObj.publishedTime));
        }
        if (articleObj.url) {
          var origLink = buildEl("a", "cr-original-link", t("originalLinkLabel"));
          origLink.href = articleObj.url;
          origLink.target = "_blank";
          origLink.rel = "noopener noreferrer";
          bylineRow.appendChild(origLink);
        }

        fallbackNotice.hidden = !articleObj.isFallback;
        sanitizeHtmlFragmentInto(articleBody, articleObj.contentHtml);
        // Respetar idioma y dirección del original (artículos RTL: árabe, hebreo, etc.)
        if (articleObj.lang) articleBody.setAttribute("lang", articleObj.lang);
        else articleBody.removeAttribute("lang");
        if (articleObj.dir) articleBody.setAttribute("dir", articleObj.dir);
        else articleBody.removeAttribute("dir");
        viewport.scrollTop = 0;
        updateProgressBar();
        refreshSavedStateButton();
      }

      async function getSavedArticles() {
        var list = await storageGet(storageKeys.SAVED_ARTICLES, []);
        return Array.isArray(list) ? list : [];
      }

      async function refreshSavedStateButton() {
        var list = await getSavedArticles();
        var exists = list.some(function (item) {
          return item && item.url === currentArticle.url;
        });
        saveBtnLabel.textContent = exists ? t("btnSavedLater") : t("btnSaveLater");
        savedCountSpan.textContent =
          list.length > 0 ? t("btnSavedList") + " (" + list.length + ")" : t("btnSavedList");
      }

      async function renderSavedDrawer() {
        var list = await getSavedArticles();
        drawerBody.textContent = "";

        if (list.length === 0) {
          drawerBody.appendChild(buildEl("div", "cr-saved-empty", t("savedDrawerEmpty")));
          return;
        }

        for (var i = 0; i < list.length; i += 1) {
          (function (item) {
            var card = buildEl("div", "cr-saved-item");
            card.appendChild(buildEl("h3", "cr-saved-item-title", item.title || item.url));

            var savedDate = item.savedAt
              ? new Date(item.savedAt).toLocaleDateString()
              : "";
            var metaStr = [
              item.siteName || "",
              (item.wordCount || 0) + " " + t("wordsLabel"),
              (item.readingTimeMinutes || 1) + " " + t("minReadLabel"),
              savedDate
            ]
              .filter(Boolean)
              .join(" · ");
            card.appendChild(buildEl("div", "cr-saved-item-meta", metaStr));

            var actions = buildEl("div", "cr-saved-item-actions");
            var btnRead = buildEl("button", "cr-btn cr-btn-primary", t("savedOpenInReader"));
            btnRead.type = "button";
            btnRead.addEventListener("click", function () {
              renderArticle({
                id: item.id || item.url,
                title: item.title,
                url: item.url,
                siteName: item.siteName || "",
                byline: item.byline || "",
                publishedTime: item.publishedTime || "",
                lang: item.lang || "",
                dir: item.dir || "",
                contentHtml: item.contentHtml || "<p></p>",
                textContent: item.textContent || "",
                wordCount: item.wordCount || 0,
                readingTimeMinutes: item.readingTimeMinutes || 1,
                isFallback: false
              });
              setDrawerOpen(false);
            });

            var linkOrig = buildEl("a", "cr-btn", t("savedOpenOriginal"));
            linkOrig.href = item.url;
            linkOrig.target = "_blank";
            linkOrig.rel = "noopener noreferrer";
            linkOrig.style.textDecoration = "none";

            var btnDel = buildEl("button", "cr-btn cr-btn-exit", t("savedDelete"));
            btnDel.type = "button";
            btnDel.addEventListener("click", async function () {
              var currentList = await getSavedArticles();
              var filtered = currentList.filter(function (entry) {
                return entry && entry.url !== item.url;
              });
              var removed = await storageSet(storageKeys.SAVED_ARTICLES, filtered);
              await refreshSavedStateButton();
              await renderSavedDrawer();
              showToast(removed ? t("statusRemoved") : t("statusSaveError"));
            });

            actions.appendChild(btnRead);
            actions.appendChild(linkOrig);
            actions.appendChild(btnDel);
            card.appendChild(actions);
            drawerBody.appendChild(card);
          })(list[i]);
        }
      }

      function setDrawerOpen(open) {
        state.drawerOpen = Boolean(open);
        drawerBackdrop.hidden = !state.drawerOpen;
        if (state.drawerOpen) {
          renderSavedDrawer();
        }
      }

      function lockHostScroll() {
        state.prevBodyOverflow = document.body.style.overflow || "";
        state.prevHtmlOverflow = document.documentElement ? document.documentElement.style.overflow || "" : "";
        document.body.style.overflow = "hidden";
        if (document.documentElement) {
          document.documentElement.style.overflow = "hidden";
        }
      }

      function restoreHostScroll() {
        document.body.style.overflow = state.prevBodyOverflow;
        if (document.documentElement) {
          document.documentElement.style.overflow = state.prevHtmlOverflow;
        }
      }

      var previouslyFocused = null;

      function focusReader() {
        try {
          previouslyFocused = document.activeElement && document.activeElement !== host ? document.activeElement : null;
          if (typeof viewport.focus === "function") viewport.focus({ preventScroll: true });
        } catch {
          // Entornos sin soporte de foco
        }
      }

      function restoreFocus() {
        try {
          if (previouslyFocused && typeof previouslyFocused.focus === "function" && previouslyFocused.isConnected !== false) {
            previouslyFocused.focus({ preventScroll: true });
          }
        } catch {
          // Ignorar: el elemento pudo desaparecer del DOM
        }
        previouslyFocused = null;
      }

      function setVisible(shouldShow) {
        var nextVisible = Boolean(shouldShow);
        if (nextVisible === state.visible && host.hidden === !nextVisible) {
          return state.visible;
        }
        state.visible = nextVisible;
        host.hidden = !state.visible;
        host.setAttribute("aria-hidden", state.visible ? "false" : "true");

        if (state.visible) {
          lockHostScroll();
          updateProgressBar();
          focusReader();
        } else {
          setDrawerOpen(false);
          restoreHostScroll();
          restoreFocus();
        }
        return state.visible;
      }

      // Listeners de UI
      btnFontDec.addEventListener("click", function () {
        state.settings.fontSize = clampNumber(state.settings.fontSize - 1, 14, 28, defaultSettings.fontSize);
        applySettings(true);
      });

      btnFontInc.addEventListener("click", function () {
        state.settings.fontSize = clampNumber(state.settings.fontSize + 1, 14, 28, defaultSettings.fontSize);
        applySettings(true);
      });

      btnTypoToggle.addEventListener("click", function () {
        state.typoOpen = !state.typoOpen;
        typoPanel.hidden = !state.typoOpen;
        btnTypoToggle.classList.toggle("is-active", state.typoOpen);
        btnTypoToggle.setAttribute("aria-expanded", state.typoOpen ? "true" : "false");
      });

      // "input" = vista previa en vivo; "change" = persistir una sola vez al soltar el control
      lineHeightRange.addEventListener("input", function () {
        state.settings.lineHeight = clampNumber(lineHeightRange.value, 1.4, 2.2, defaultSettings.lineHeight);
        applySettings(false);
      });
      lineHeightRange.addEventListener("change", function () {
        applySettings(true);
      });

      widthRange.addEventListener("input", function () {
        state.settings.maxWidth = clampNumber(widthRange.value, 60, 85, defaultSettings.maxWidth);
        applySettings(false);
      });
      widthRange.addEventListener("change", function () {
        applySettings(true);
      });

      btnExportMd.addEventListener("click", function () {
        var markdown = htmlToMarkdown(articleBody, {
          title: currentArticle.title,
          url: currentArticle.url,
          byline: currentArticle.byline,
          siteName: currentArticle.siteName
        });
        var blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
        var blobUrl = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = blobUrl;
        a.download = slugifyFilename(currentArticle.title);
        shadow.appendChild(a);
        a.click();
        shadow.removeChild(a);
        setTimeout(function () {
          URL.revokeObjectURL(blobUrl);
        }, 1500);
        showToast(t("statusExportedMd"));
      });

      btnPrintPdf.addEventListener("click", function () {
        var existingPrintStyle = document.getElementById(PRINT_STYLE_ID);
        if (existingPrintStyle && existingPrintStyle.parentNode) {
          existingPrintStyle.parentNode.removeChild(existingPrintStyle);
        }

        var printStyle = document.createElement("style");
        printStyle.id = PRINT_STYLE_ID;
        printStyle.textContent =
          "@media print {\n" +
          "  html, body { height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; background: #FFFFFF !important; }\n" +
          "  body > *:not(#" + HOST_ID + ") { display: none !important; }\n" +
          "  #" + HOST_ID + " { position: static !important; display: block !important; width: auto !important; height: auto !important; overflow: visible !important; }\n" +
          "}";
        (document.head || document.documentElement).appendChild(printStyle);

        var cleaned = false;
        function cleanupPrintStyle() {
          if (cleaned) return;
          cleaned = true;
          window.removeEventListener("afterprint", cleanupPrintStyle);
          if (printStyle.parentNode) {
            printStyle.parentNode.removeChild(printStyle);
          }
        }

        window.addEventListener("afterprint", cleanupPrintStyle);
        try {
          window.print();
        } finally {
          setTimeout(cleanupPrintStyle, 1200);
        }
      });

      btnSaveArticle.addEventListener("click", async function () {
        var list = await getSavedArticles();
        var withoutDup = list.filter(function (item) {
          return item && item.url !== currentArticle.url;
        });
        var record = {
          id: currentArticle.url,
          title: currentArticle.title,
          url: currentArticle.url,
          siteName: currentArticle.siteName,
          byline: currentArticle.byline,
          publishedTime: currentArticle.publishedTime,
          lang: currentArticle.lang || "",
          dir: currentArticle.dir || "",
          savedAt: new Date().toISOString(),
          wordCount: currentArticle.wordCount,
          readingTimeMinutes: currentArticle.readingTimeMinutes,
          contentHtml: currentArticle.contentHtml,
          textContent: currentArticle.textContent
        };
        withoutDup.unshift(record);
        var ok = await storageSet(storageKeys.SAVED_ARTICLES, withoutDup.slice(0, 100));
        await refreshSavedStateButton();
        if (state.drawerOpen) {
          await renderSavedDrawer();
        }
        // Antes se mostraba "guardado" aunque chrome.storage fallara (p. ej. cuota llena)
        showToast(ok ? t("statusSaved") : t("statusSaveError"));
      });

      btnSavedDrawer.addEventListener("click", function () {
        setDrawerOpen(!state.drawerOpen);
      });

      btnCloseDrawer.addEventListener("click", function () {
        setDrawerOpen(false);
      });

      drawerBackdrop.addEventListener("click", function (event) {
        if (event.target === drawerBackdrop) {
          setDrawerOpen(false);
        }
      });

      btnExit.addEventListener("click", function () {
        setVisible(false);
      });

      viewport.addEventListener("scroll", updateProgressBar, { passive: true });

      function handleEscape() {
        if (state.drawerOpen) {
          setDrawerOpen(false);
        } else if (state.typoOpen) {
          state.typoOpen = false;
          typoPanel.hidden = true;
          btnTypoToggle.classList.toggle("is-active", false);
          btnTypoToggle.setAttribute("aria-expanded", "false");
        } else {
          setVisible(false);
        }
      }

      // Teclas pulsadas dentro del lector: no deben disparar atajos de la página anfitriona
      // (los eventos de teclado son "composed" y cruzan el límite del Shadow DOM).
      function onHostKeydown(event) {
        if (!state.visible) return;
        if (event.key === "Escape") {
          handleEscape();
        }
        if (typeof event.stopPropagation === "function") event.stopPropagation();
      }

      // Respaldo cuando el foco sigue en la página (p. ej. tras hacer clic fuera del lector)
      function onDocumentKeydown(event) {
        if (event.key === "Escape" && state.visible) {
          handleEscape();
        }
      }

      host.addEventListener("keydown", onHostKeydown);
      document.addEventListener("keydown", onDocumentKeydown);

      var controller = {
        host: host,
        shadowRoot: shadow,
        isVisible: function () {
          return state.visible;
        },
        show: function () {
          return setVisible(true);
        },
        hide: function () {
          return setVisible(false);
        },
        toggle: function () {
          return setVisible(!state.visible);
        },
        getArticle: function () {
          return currentArticle;
        },
        getSourceUrl: function () {
          return sourceUrl;
        },
        destroy: function () {
          if (state.visible) setVisible(false);
          if (toastTimer) clearTimeout(toastTimer);
          document.removeEventListener("keydown", onDocumentKeydown);
          if (host.parentNode) host.parentNode.removeChild(host);
          host.__chalaReaderController = null;
        }
      };

      host.__chalaReaderController = controller;
      document.body.appendChild(host);

      applySettings(false);
      renderArticle(currentArticle);
      lockHostScroll();
      focusReader();

      return true;
    } finally {
      globalScope.__CHALAREADER_MOUNTING__ = false;
    }
  }

  globalScope.ChalaReaderEngine = {
    HOST_ID: HOST_ID,
    PRINT_STYLE_ID: PRINT_STYLE_ID,
    promoteLazyImages: promoteLazyImages,
    calculateReadingMetrics: calculateReadingMetrics,
    htmlToMarkdown: htmlToMarkdown,
    slugifyFilename: slugifyFilename,
    isTinyPlaceholderSrc: isTinyPlaceholderSrc,
    mountOrToggle: mountReader
  };

  // Auto-ejecución únicamente cuando el script se inyecta en un documento web real con ChalaReadability cargado
  if (
    typeof document !== "undefined" &&
    document.body &&
    globalScope.ChalaReadability &&
    !globalScope.__CHALAREADER_DISABLE_AUTO_MOUNT__
  ) {
    mountReader();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
