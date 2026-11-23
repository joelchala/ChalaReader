import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { extractZipEntry } from "../tools/make-mv3.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

let passed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`PASS: ${name}`);
    })
    .catch((err) => {
      console.error(`FAIL: ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

function assertPngDimensions(filePath, expectedWidth, expectedHeight) {
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(fs.existsSync(filePath), `Missing PNG file: ${filePath}`);
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length > 24, `PNG too small: ${filePath}`);
  assert.ok(buf.subarray(0, 8).equals(pngSig), `Invalid PNG signature: ${filePath}`);
  assert.equal(buf.subarray(12, 16).toString("ascii"), "IHDR", `Missing IHDR: ${filePath}`);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.equal(width, expectedWidth, `${path.basename(filePath)} width mismatch`);
  assert.equal(height, expectedHeight, `${path.basename(filePath)} height mismatch`);
}

/**
 * Crea un árbol DOM ligero en memoria para probar ChalaReadability y ChalaReaderEngine
 * sin dependencias externas.
 */
function createMiniDomEnv() {
  class MiniNode {
    constructor(nodeType, nodeValue = "") {
      this.nodeType = nodeType;
      this.nodeValue = nodeValue;
      this.parentNode = null;
      this.childNodes = [];
    }
    get textContent() {
      if (this.nodeType === 3) return this.nodeValue;
      return this.childNodes.map((c) => c.textContent).join("");
    }
    set textContent(val) {
      this.childNodes = [];
      if (val !== "" && val !== null && val !== undefined) {
        this.appendChild(new MiniNode(3, String(val)));
      }
    }
    get firstChild() {
      return this.childNodes[0] || null;
    }
    appendChild(child) {
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    insertBefore(newNode, refNode) {
      if (!refNode) return this.appendChild(newNode);
      if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
      const idx = this.childNodes.indexOf(refNode);
      newNode.parentNode = this;
      if (idx === -1) this.childNodes.push(newNode);
      else this.childNodes.splice(idx, 0, newNode);
      return newNode;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx !== -1) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
  }

  class MiniElement extends MiniNode {
    constructor(tagName, ownerDoc) {
      super(1);
      this.tagName = tagName.toUpperCase();
      this.ownerDocument = ownerDoc;
      this._attrs = new Map();
      this.styleMap = new Map();
      this.style = {
        overflow: "",
        width: "",
        setProperty: (k, v) => this.styleMap.set(k, v)
      };
      this.dataset = {};
      this.hidden = false;
      this.listeners = new Map();
      this.shadowRoot = null;
      this.scrollTop = 0;
      this.scrollHeight = 1000;
      this.clientHeight = 500;
      this.value = "";
      this.classList = {
        toggle: (cls, force) => {
          const set = new Set((this.className || "").split(/\s+/).filter(Boolean));
          const shouldAdd = force === undefined ? !set.has(cls) : Boolean(force);
          if (shouldAdd) set.add(cls);
          else set.delete(cls);
          this.className = [...set].join(" ");
        },
        contains: (cls) => (this.className || "").split(/\s+/).includes(cls)
      };
    }
    get id() {
      return this._attrs.get("id") || "";
    }
    set id(v) {
      this._attrs.set("id", String(v));
    }
    get className() {
      return this._attrs.get("class") || "";
    }
    set className(v) {
      this._attrs.set("class", String(v));
    }
    get href() {
      return this._attrs.get("href") || "";
    }
    set href(v) {
      this._attrs.set("href", String(v));
    }
    get children() {
      return this.childNodes.filter((c) => c.nodeType === 1);
    }
    get firstElementChild() {
      return this.children[0] || null;
    }
    get attributes() {
      return [...this._attrs.entries()].map(([name, value]) => ({ name, value }));
    }
    getAttribute(name) {
      const key = String(name).toLowerCase();
      return this._attrs.has(key) ? this._attrs.get(key) : null;
    }
    setAttribute(name, value) {
      this._attrs.set(String(name).toLowerCase(), String(value));
    }
    hasAttribute(name) {
      return this._attrs.has(String(name).toLowerCase());
    }
    removeAttribute(name) {
      this._attrs.delete(String(name).toLowerCase());
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    removeEventListener() {}
    click() {
      for (const fn of this.listeners.get("click") || []) {
        fn({ target: this });
      }
    }
    attachShadow({ mode }) {
      this.shadowRoot = new MiniElement("#shadow-root", this.ownerDocument);
      this.shadowRoot.mode = mode;
      return this.shadowRoot;
    }
    cloneNode(deep) {
      const copy = new MiniElement(this.tagName, this.ownerDocument);
      for (const [k, v] of this._attrs.entries()) copy._attrs.set(k, v);
      copy.style.overflow = this.style.overflow;
      if (deep) {
        for (const child of this.childNodes) {
          if (child.nodeType === 3) copy.appendChild(new MiniNode(3, child.nodeValue));
          else if (child.nodeType === 1) copy.appendChild(child.cloneNode(true));
        }
      }
      return copy;
    }
    get innerHTML() {
      return this.childNodes
        .map((c) => {
          if (c.nodeType === 3) return c.nodeValue;
          const attrStr = [...c._attrs.entries()]
            .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, "&quot;")}"`)
            .join("");
          if (c.tagName === "IMG" || c.tagName === "BR" || c.tagName === "HR") {
            return `<${c.tagName.toLowerCase()}${attrStr}>`;
          }
          return `<${c.tagName.toLowerCase()}${attrStr}>${c.innerHTML}</${c.tagName.toLowerCase()}>`;
        })
        .join("");
    }
    set innerHTML(html) {
      this.childNodes = [];
      if (!html) return;
      // Parser simple para etiquetas de prueba en verify.mjs
      const tagRegex = /<\/?([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
      const stack = [this];
      let match;
      while ((match = tagRegex.exec(html)) !== null) {
        if (match[3]) {
          stack[stack.length - 1].appendChild(new MiniNode(3, match[3]));
          continue;
        }
        const raw = match[0];
        const tag = match[1].toUpperCase();
        const attrRaw = match[2] || "";
        if (raw.startsWith("</")) {
          if (stack.length > 1 && stack[stack.length - 1].tagName === tag) {
            stack.pop();
          }
          continue;
        }
        const el = new MiniElement(tag, this.ownerDocument);
        const attrRegex = /([a-zA-Z0-9:-]+)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)')?/g;
        let am;
        while ((am = attrRegex.exec(attrRaw)) !== null) {
          el.setAttribute(am[1], am[2] ?? am[3] ?? "");
        }
        stack[stack.length - 1].appendChild(el);
        const selfClosing = raw.endsWith("/>") || ["IMG", "BR", "HR", "META", "LINK", "SOURCE"].includes(tag);
        if (!selfClosing) {
          stack.push(el);
        }
      }
    }
    matchesSelectorPart(part) {
      const p = part.trim();
      if (!p) return false;
      if (p === "*") return true;
      if (p.startsWith("#")) return this.id === p.slice(1);
      if (p.startsWith(".")) return this.classList.contains(p.slice(1));
      const tagAttr = /^([a-zA-Z0-9]+)?(?:\[([^\]]+)\])?$/.exec(p);
      if (!tagAttr) return false;
      if (tagAttr[1] && this.tagName !== tagAttr[1].toUpperCase()) return false;
      if (tagAttr[2]) {
        const eq = /^([a-zA-Z0-9-]+)(?:=['"]?([^'"]+)['"]?(?:\s+i)?)?$/.exec(tagAttr[2].trim());
        if (!eq) return false;
        const val = this.getAttribute(eq[1]);
        if (val === null) return false;
        if (eq[2] !== undefined) return val.toLowerCase() === eq[2].toLowerCase();
      }
      return true;
    }
    querySelectorAll(selector) {
      const groups = selector.split(",").map((s) => s.trim()).filter(Boolean);
      const out = [];
      const visit = (node) => {
        for (const child of node.children) {
          for (const g of groups) {
            const parts = g.split(/\s+/);
            const last = parts[parts.length - 1];
            if (child.matchesSelectorPart(last)) {
              if (parts.length === 1) {
                out.push(child);
                break;
              }
              let anc = child.parentNode;
              let idx = parts.length - 2;
              while (anc && anc.nodeType === 1 && idx >= 0) {
                if (anc.matchesSelectorPart(parts[idx])) idx -= 1;
                anc = anc.parentNode;
              }
              if (idx < 0) {
                out.push(child);
                break;
              }
            }
          }
          visit(child);
        }
      };
      visit(this);
      return out;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
  }

  class MiniDocument {
    constructor(title = "Artículo de prueba", url = "https://ejemplo.test/post") {
      this.title = title;
      this.URL = url;
      this.baseURI = url;
      this.cloneCalls = 0;
      this.listeners = new Map();
      this.documentElement = new MiniElement("html", this);
      this.documentElement.setAttribute("lang", "es");
      this.head = new MiniElement("head", this);
      this.body = new MiniElement("body", this);
      this.documentElement.appendChild(this.head);
      this.documentElement.appendChild(this.body);
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
      const arr = this.listeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx !== -1) arr.splice(idx, 1);
    }
    dispatchKeydown(key) {
      for (const fn of this.listeners.get("keydown") || []) {
        fn({ key });
      }
    }
    createElement(tag) {
      return new MiniElement(tag, this);
    }
    createElementNS(_ns, tag) {
      return new MiniElement(tag, this);
    }
    createTextNode(text) {
      return new MiniNode(3, text);
    }
    adoptNode(node) {
      node.ownerDocument = this;
      return node;
    }
    querySelector(sel) {
      return this.documentElement.querySelector(sel);
    }
    querySelectorAll(sel) {
      return this.documentElement.querySelectorAll(sel);
    }
    getElementById(id) {
      return this.querySelector(`#${id}`);
    }
    cloneNode(deep) {
      this.cloneCalls += 1;
      const cloned = new MiniDocument(this.title, this.URL);
      if (deep) {
        cloned.head = this.head.cloneNode(true);
        cloned.body = this.body.cloneNode(true);
        cloned.documentElement.childNodes = [cloned.head, cloned.body];
        cloned.head.parentNode = cloned.documentElement;
        cloned.body.parentNode = cloned.documentElement;
      }
      return cloned;
    }
  }

  return { MiniDocument, MiniElement, MiniNode };
}

async function run() {
  // 1. Validación sintáctica con node --check
  await test("Syntax check on JS modules (src/ and tools/)", () => {
    const jsFiles = [
      path.join(SRC, "config.js"),
      path.join(SRC, "background.js"),
      path.join(SRC, "lib", "readability.js"),
      path.join(SRC, "content", "reader-engine.js"),
      path.join(ROOT, "tools", "generate-assets.mjs"),
      path.join(ROOT, "tools", "make-mv3.mjs")
    ];
    for (const file of jsFiles) {
      assert.ok(fs.existsSync(file), `Missing JS file: ${file}`);
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    }
  });

  // 2. Validación de src/manifest.json y principios arquitectónicos
  await test("Manifest V3 minimal permissions, Alt+R command, no default_popup, and valid assets", () => {
    const manifestPath = path.join(SRC, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.default_locale, "es");
    assert.deepEqual(
      [...(manifest.permissions || [])].sort(),
      ["activeTab", "scripting", "storage"]
    );
    assert.equal(manifest.host_permissions, undefined, "Must not declare host_permissions");
    assert.equal(manifest.action?.default_popup, undefined, "Must NOT define action.default_popup");
    assert.equal(
      JSON.stringify(manifest).includes("<all_urls>"),
      false,
      "Must not include <all_urls>"
    );
    assert.equal(manifest.commands?.["toggle-reader"]?.suggested_key?.default, "Alt+R");

    const referencedPaths = [
      manifest.background?.service_worker,
      ...Object.values(manifest.icons || {}),
      ...Object.values(manifest.action?.default_icon || {})
    ].filter(Boolean);

    for (const relPath of referencedPaths) {
      const absPath = path.join(SRC, relPath);
      assert.ok(fs.existsSync(absPath), `Referenced asset missing in src/: ${relPath}`);
    }
  });

  // 3. Validación de _locales (es y en) y claves en reader-engine.js
  await test("Locales parity (es & en) and reader-engine i18n coverage", () => {
    const esPath = path.join(SRC, "_locales", "es", "messages.json");
    const enPath = path.join(SRC, "_locales", "en", "messages.json");
    const esMsgs = JSON.parse(fs.readFileSync(esPath, "utf8"));
    const enMsgs = JSON.parse(fs.readFileSync(enPath, "utf8"));

    const esKeys = Object.keys(esMsgs).sort();
    const enKeys = Object.keys(enMsgs).sort();
    assert.deepEqual(esKeys, enKeys, "es and en locale keys must match identically");

    for (const key of esKeys) {
      assert.ok(esMsgs[key]?.message?.trim(), `Empty es message for ${key}`);
      assert.ok(enMsgs[key]?.message?.trim(), `Empty en message for ${key}`);
    }

    const engineJs = fs.readFileSync(path.join(SRC, "content", "reader-engine.js"), "utf8");
    const runtimeKeys = [...engineJs.matchAll(/\bt\("([^"]+)"/g)].map((m) => m[1]);
    assert.ok(runtimeKeys.length > 0, "Expected runtime i18n keys in reader-engine.js");
    for (const key of runtimeKeys) {
      assert.ok(esMsgs[key], `Missing runtime i18n key '${key}' in es`);
      assert.ok(enMsgs[key], `Missing runtime i18n key '${key}' in en`);
    }
  });

  // 4. Validación de iconos PNG y piezas de store/
  await test("Extension PNG icons (16, 32, 48, 128) and store graphics dimensions", () => {
    for (const size of [16, 32, 48, 128]) {
      assertPngDimensions(path.join(SRC, "icons", `icon${size}.png`), size, size);
    }
    assert.ok(fs.existsSync(path.join(SRC, "icons", "README.md")), "Missing src/icons/README.md");

    assertPngDimensions(path.join(ROOT, "store", "logo-300x300.png"), 300, 300);
    assertPngDimensions(path.join(ROOT, "store", "promo-440x280.png"), 440, 280);
    assertPngDimensions(path.join(ROOT, "store", "destacada-1400x560.png"), 1400, 560);
    assertPngDimensions(path.join(ROOT, "store", "captura-1-lectura.png"), 1280, 800);
    assertPngDimensions(path.join(ROOT, "store", "captura-2-temas-tipografia.png"), 1280, 800);
    assertPngDimensions(path.join(ROOT, "store", "captura-3-guardados.png"), 1280, 800);
  });

  // 5. Validación de estructura estilo ChalaBlock (dist/, store/paquetes/, docs/)
  await test("ChalaBlock-style build output, ZIP packages, and store listings", () => {
    const defaultVersion = fs.readFileSync(path.join(ROOT, "dist", "version"), "utf8").trim();
    assert.ok(defaultVersion.length > 0, "dist/version must not be empty");

    const builtDir = path.join(ROOT, "dist", "build", "ChalaReader.chromium");
    const builtManifestPath = path.join(builtDir, "manifest.json");
    assert.ok(
      fs.existsSync(builtManifestPath),
      "Missing dist/build/ChalaReader.chromium/manifest.json (run `npm run build` first)"
    );
    const builtManifest = JSON.parse(fs.readFileSync(builtManifestPath, "utf8"));
    // La versión del paquete puede venir de la CLI (CI: tag x.y.z) o de dist/version
    const version = builtManifest.version;
    assert.match(version, /^\d+\.\d+\.\d+$/, "Built manifest version must be x.y.z");

    for (const rel of [
      "config.js",
      "background.js",
      "lib/readability.js",
      "content/reader-engine.js",
      "content/reader-theme.css",
      "icons/README.md"
    ]) {
      assert.ok(fs.existsSync(path.join(builtDir, rel)), `Missing in unpacked build: ${rel}`);
    }

    const chromiumZip = path.join(ROOT, "store", "paquetes", `ChalaReader_${version}.chromium.zip`);
    const edgeZip = path.join(ROOT, "store", "paquetes", `ChalaReader_${version}.edge.zip`);
    const firefoxZip = path.join(ROOT, "store", "paquetes", `ChalaReader_${version}.firefox.zip`);
    assert.ok(fs.existsSync(chromiumZip), `Missing package: ${chromiumZip}`);
    assert.ok(fs.existsSync(edgeZip), `Missing package: ${edgeZip}`);
    assert.ok(fs.existsSync(firefoxZip), `Missing package: ${firefoxZip}`);
    assert.ok(fs.statSync(chromiumZip).size > 1000, "Chromium zip package appears empty");
    assert.ok(fs.statSync(edgeZip).size > 1000, "Edge zip package appears empty");
    assert.ok(fs.statSync(firefoxZip).size > 1000, "Firefox zip package appears empty");

    const firefoxRawManifest = extractZipEntry(fs.readFileSync(firefoxZip), "manifest.json");
    assert.ok(firefoxRawManifest, "Missing manifest.json inside Firefox ZIP");
    const firefoxManifest = JSON.parse(firefoxRawManifest.toString("utf8"));
    assert.equal(firefoxManifest.version, version);
    assert.equal(firefoxManifest.browser_specific_settings?.gecko?.id, "chalareader@chaladev.site");
    assert.equal(firefoxManifest.browser_specific_settings?.gecko?.strict_min_version, "113.0");
    assert.deepEqual(firefoxManifest.browser_specific_settings?.gecko?.data_collection_permissions, {
      required: ["none"]
    });
    assert.deepEqual(firefoxManifest.background?.scripts, ["background.js"]);
    assert.equal(firefoxManifest.background?.service_worker, undefined);

    assert.ok(fs.existsSync(path.join(ROOT, "store", "ficha-tienda.md")));
    assert.ok(fs.existsSync(path.join(ROOT, "store", "ficha-chrome-web-store.md")));
    assert.ok(fs.existsSync(path.join(ROOT, "docs", "index.html")));
  });

  // 6. Pruebas funcionales de src/background.js con mock de chrome.*
  const executeCalls = [];
  const makeEvent = () => {
    const listeners = [];
    return { listeners, addListener: (fn) => listeners.push(fn) };
  };

  globalThis.chrome = {
    runtime: {
      getURL: (p) => `chrome-extension://chalareader/${p}`,
      onMessage: makeEvent()
    },
    action: {
      onClicked: makeEvent()
    },
    commands: {
      onCommand: makeEvent()
    },
    tabs: {
      query: async () => [{ id: 7, url: "https://noticias.test/articulo" }]
    },
    scripting: {
      executeScript: async (opts) => {
        executeCalls.push(opts);
        return [{ result: true }];
      }
    }
  };

  const bg = await import("../src/background.js");
  const { CONFIG } = await import("../src/config.js");

  await test("CONFIG defines Escudo Cibernetico palette, Suite Chala links, PayPal, and 220 WPM", () => {
    assert.equal(CONFIG.COLORS.BG_DARK, "#0F172A");
    assert.equal(CONFIG.COLORS.SURFACE, "#1E293B");
    assert.equal(CONFIG.COLORS.TEXT_MAIN, "#F1F5F9");
    assert.equal(CONFIG.COLORS.PRIMARY, "#10B981");
    assert.equal(CONFIG.COLORS.ACCENT, "#06B6D4");
    assert.equal(CONFIG.WORDS_PER_MINUTE, 220);
    assert.ok(CONFIG.PAYPAL_DONATE_URL.startsWith("https://www.paypal.com/"));
    assert.ok(CONFIG.SUITE_LINKS.chalablock);
    assert.ok(CONFIG.SUITE_LINKS.chalavpn);
    assert.ok(CONFIG.SUITE_LINKS.chalatabs);
    assert.ok(CONFIG.SUITE_LINKS.chaladev);
  });

  await test("background.js blocks internal protected URLs and injects scripts on valid URLs", async () => {
    assert.equal(chrome.action.onClicked.listeners.length, 1);
    assert.equal(chrome.commands.onCommand.listeners.length, 1);

    for (const protectedUrl of [
      "chrome://extensions",
      "edge://settings",
      "about:blank",
      "chrome-extension://abcdef/popup.html",
      "extension://xyz/index.html",
      "chrome-untrusted://terminal/",
      "edge-untrusted://tab/",
      "data:text/html,<h1>x</h1>",
      "javascript:void(0)",
      "EDGE://flags",
      ""
    ]) {
      executeCalls.length = 0;
      assert.equal(bg.isRestrictedUrl(protectedUrl), true, `Expected restricted: ${protectedUrl}`);
      const res = await bg.toggleReaderOnTab({ id: 99, url: protectedUrl });
      assert.equal(res.ok, false);
      assert.equal(res.restricted, true);
      assert.equal(executeCalls.length, 0, `Must NOT inject into ${protectedUrl}`);
    }

    executeCalls.length = 0;
    const okRes = await bg.toggleReaderOnTab({ id: 42, url: "https://ejemplo.org/articulo" });
    assert.equal(okRes.ok, true);
    assert.equal(okRes.restricted, false);
    assert.equal(executeCalls.length, 2);
    assert.equal(typeof executeCalls[0].func, "function");
    assert.deepEqual(executeCalls[1].files, ["lib/readability.js", "content/reader-engine.js"]);
  });

  // 7. Pruebas de lib/readability.js y content/reader-engine.js en VM aislada
  await test("readability.js and reader-engine.js support idempotent re-injection, lazy-load, metrics, Markdown, and Shadow DOM", async () => {
    const { MiniDocument } = createMiniDomEnv();
    const hostDoc = new MiniDocument(
      "Guía de Arquitectura Offline | Blog Técnico",
      "https://blog.ejemplo.test/arquitectura-offline"
    );
    hostDoc.body.style.overflow = "auto";

    hostDoc.body.innerHTML = [
      "<nav><a href='/inicio'>Inicio</a><a href='/contacto'>Contacto</a></nav>",
      "<aside class='sidebar'><p>Publicidad lateral que debe eliminarse.</p></aside>",
      "<div class='cookie-banner'><p>Acepta las cookies para continuar.</p></div>",
      "<article>",
      "  <h1>Guía de Arquitectura Offline</h1>",
      "  <p>Este artículo describe en detalle cómo construir extensiones Manifest V3 completamente privadas, locales y rápidas sin depender de servidores externos ni peticiones de red.</p>",
      "  <p>El aislamiento con Shadow DOM permite mantener la tipografía limpia, controlar el contraste en temas oscuro, sepia o claro y evitar que el CSS del sitio anfitrión rompa la lectura.</p>",
      "  <blockquote><p>La simplicidad y la privacidad son pilares de diseño.</p></blockquote>",
      "  <img id='img-lazy-1' src='' data-src='/assets/diagrama.png' alt='Diagrama'>",
      "  <img id='img-lazy-2' src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' data-lazy-src='https://cdn.ejemplo.test/foto.jpg' alt='Foto'>",
      "  <img id='img-lazy-3' data-original='https://cdn.ejemplo.test/original.webp' alt='Original'>",
      "  <pre><code>const reader = true;</code></pre>",
      "  <ul><li>Primer punto clave</li><li>Segundo punto clave</li></ul>",
      "</article>"
    ].join("");

    const storageMap = {};
    const printedCalls = [];
    const createdBlobs = [];
    const context = {
      console,
      URL: Object.assign(
        function MockURL(input, base) {
          return new URL(input, base);
        },
        {
          createObjectURL: (blob) => {
            createdBlobs.push(blob);
            return "blob:chalareader-test/1";
          },
          revokeObjectURL: () => {}
        }
      ),
      Set,
      Map,
      Blob: class MockBlob {
        constructor(parts, opts) {
          this.parts = parts;
          this.type = opts?.type || "";
        }
      },
      DOMParser: class MockDOMParser {
        parseFromString(htmlStr) {
          const d = new MiniDocument("parsed", hostDoc.URL);
          d.body.innerHTML = htmlStr.replace(/^<div>|<\/div>$/g, "");
          const wrap = d.createElement("div");
          while (d.body.firstChild) wrap.appendChild(d.body.firstChild);
          d.body.appendChild(wrap);
          return d;
        }
      },
      document: hostDoc,
      window: null,
      location: { href: hostDoc.URL, hostname: "blog.ejemplo.test" },
      addEventListener: () => {},
      removeEventListener: () => {},
      print: () => {
        const printStyle = hostDoc.getElementById("chalareader-print-override");
        printedCalls.push(printStyle ? printStyle.textContent : "");
      },
      chrome: {
        i18n: { getMessage: () => "" },
        storage: {
          local: {
            get: async (k) => (k in storageMap ? { [k]: storageMap[k] } : {}),
            set: async (obj) => Object.assign(storageMap, obj)
          }
        }
      },
      setTimeout,
      clearTimeout
    };
    context.window = context;
    context.globalThis = context;
    context.__CHALAREADER_BOOTSTRAP__ = {
      config: CONFIG,
      cssText: fs.readFileSync(path.join(SRC, "content", "reader-theme.css"), "utf8")
    };

    const vmCtx = vm.createContext(context);
    const readabilityCode = fs.readFileSync(path.join(SRC, "lib", "readability.js"), "utf8");
    const engineCode = fs.readFileSync(path.join(SRC, "content", "reader-engine.js"), "utf8");
    const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 15));

    // Ejecutar dos veces seguidas para garantizar cero errores de redeclaración (idempotencia)
    vm.runInContext(readabilityCode, vmCtx);
    vm.runInContext(engineCode, vmCtx);
    await flushAsync();
    assert.equal(hostDoc.cloneCalls, 1, "First mount must clone DOM once");

    const hostEl = hostDoc.getElementById("chalareader-host");
    assert.ok(hostEl, "#chalareader-host must be created in document.body");
    assert.ok(hostEl.shadowRoot, "#chalareader-host must attach an open shadowRoot");
    assert.equal(hostEl.shadowRoot.mode, "open");
    assert.equal(hostEl.hidden, false);
    assert.equal(hostDoc.body.style.overflow, "hidden");

    // Verificar promoción lazy-loading en el clon sin mutar el DOM original
    assert.equal(
      hostDoc.getElementById("img-lazy-1").getAttribute("src"),
      "",
      "Original host DOM image must remain unmutated"
    );
    const renderedImgs = hostEl.shadowRoot.querySelectorAll("img");
    const renderedSrcs = renderedImgs.map((im) => im.getAttribute("src"));
    assert.ok(renderedSrcs.includes("https://blog.ejemplo.test/assets/diagrama.png"));
    assert.ok(renderedSrcs.includes("https://cdn.ejemplo.test/foto.jpg"));
    assert.ok(renderedSrcs.includes("https://cdn.ejemplo.test/original.webp"));

    // Segunda ejecución: debe ocultar el visor y restaurar overflow sin volver a clonar
    vm.runInContext(readabilityCode, vmCtx);
    vm.runInContext(engineCode, vmCtx);
    await flushAsync();
    assert.equal(hostDoc.cloneCalls, 1, "Second execution must NOT re-clone/re-parse the DOM");
    assert.equal(hostEl.hidden, true, "Second execution must hide #chalareader-host");
    assert.equal(hostDoc.body.style.overflow, "auto", "Original body overflow must be restored");

    // Tercera ejecución: vuelve a mostrarlo y bloquea overflow sin re-clonar
    vm.runInContext(readabilityCode, vmCtx);
    vm.runInContext(engineCode, vmCtx);
    await flushAsync();
    assert.equal(hostDoc.cloneCalls, 1, "Third execution must NOT re-clone/re-parse the DOM");
    assert.equal(hostEl.hidden, false);
    assert.equal(hostDoc.body.style.overflow, "hidden");

    // Verificar tecla Escape para salir del modo lectura
    hostDoc.dispatchKeydown("Escape");
    assert.equal(hostEl.hidden, true, "Pressing Escape must hide #chalareader-host");
    assert.equal(hostDoc.body.style.overflow, "auto", "Pressing Escape must restore body overflow");

    // Verificar cambio de tema y persistencia en chrome.storage.local
    hostEl.__chalaReaderController.show();
    const shadowButtons = hostEl.shadowRoot.querySelectorAll("button");
    const sepiaBtn = shadowButtons.find((b) => b.dataset.themeChoice === "sepia");
    assert.ok(sepiaBtn, "Sepia theme button must exist inside ShadowRoot");
    sepiaBtn.click();
    await flushAsync();
    assert.equal(storageMap[CONFIG.STORAGE_KEYS.SETTINGS]?.theme, "sepia");

    // Verificar botón Guardar para leer luego
    const saveBtn = shadowButtons.find((b) => b.textContent.includes("Guardar"));
    assert.ok(saveBtn, "Save button must exist inside ShadowRoot");
    saveBtn.click();
    await flushAsync();
    const savedList = storageMap[CONFIG.STORAGE_KEYS.SAVED_ARTICLES];
    assert.ok(Array.isArray(savedList) && savedList.length === 1, "Article must be saved in chrome.storage.local");
    assert.equal(savedList[0].url, hostDoc.URL);

    // Verificar botón Exportar .md (generación local con Blob)
    const exportBtn = shadowButtons.find((b) => b.textContent.includes("Exportar .md"));
    assert.ok(exportBtn, "Export .md button must exist");
    exportBtn.click();
    assert.equal(createdBlobs.length, 1);
    assert.match(createdBlobs[0].type, /text\/markdown/);
    assert.match(createdBlobs[0].parts[0], /Guía de Arquitectura Offline/);

    // Verificar botón Imprimir / PDF (regla temporal @media print)
    const printBtn = shadowButtons.find((b) => b.textContent.includes("Imprimir / PDF"));
    assert.ok(printBtn, "Print / PDF button must exist");
    printBtn.click();
    assert.equal(printedCalls.length, 1);
    assert.match(printedCalls[0], /@media print/);
    assert.match(printedCalls[0], /body > \*:not\(#chalareader-host\)/);

    // Métricas (220 palabras/minuto)
    const { calculateReadingMetrics, htmlToMarkdown } = context.ChalaReaderEngine;
    const sample440 = Array.from({ length: 440 }, (_, i) => `palabra${i}`).join(" ");
    const m440 = calculateReadingMetrics(sample440, 220);
    assert.equal(m440.wordCount, 440);
    assert.equal(m440.readingTimeMinutes, 2);

    const sample221 = Array.from({ length: 221 }, () => "texto").join(" ");
    const m221 = calculateReadingMetrics(sample221, 220);
    assert.equal(m221.wordCount, 221);
    assert.equal(m221.readingTimeMinutes, 2);

    // Conversor HTML -> Markdown puro
    const md = htmlToMarkdown(
      "<h2>Subtítulo</h2><p>Hola <strong>mundo</strong> con <a href='https://ejemplo.test'>enlace</a>.</p><blockquote><p>Cita</p></blockquote><ul><li>Uno</li><li>Dos</li></ul><pre><code>let x = 1;</code></pre><img src='https://ejemplo.test/a.png' alt='Foto'>",
      { title: "Título MD", url: "https://ejemplo.test/post" }
    );
    assert.match(md, /^# Título MD/m);
    assert.match(md, /^## Subtítulo/m);
    assert.match(md, /Hola \*\*mundo\*\* con \[enlace\]\(https:\/\/ejemplo\.test\)\./);
    assert.match(md, /^> Cita/m);
    assert.match(md, /^- Uno/m);
    assert.match(md, /```\nlet x = 1;\n```/);
    assert.match(md, /!\[Foto\]\(https:\/\/ejemplo\.test\/a\.png\)/);

    // Regresión: <br> debe producir salto duro de Markdown (antes se perdía al colapsar espacios)
    const mdBr = htmlToMarkdown("<p>Línea uno<br>Línea dos</p>");
    assert.match(mdBr, /Línea uno {2}\nLínea dos/);
    assert.equal(mdBr.includes("\u0000"), false, "No internal markers may leak into Markdown");

    // Regresión: separador de tabla tras la primera fila con celdas aunque rows[0] esté vacía
    const mdTable = htmlToMarkdown("<table><tr></tr><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>");
    assert.match(mdTable, /\| A \| B \|\n\| --- \| --- \|\n\| 1 \| 2 \|/);

    // Regresión: bloques de código con ``` internos usan una valla más larga
    const mdFence = htmlToMarkdown("<pre><code>uso: ```js```</code></pre>");
    assert.match(mdFence, /^````\nuso: ```js```\n````$/m);

    // Regresión: código inline con backticks usa delimitador más largo (no "\`")
    const mdInline = htmlToMarkdown("<p>Ejecuta <code>a`b</code></p>");
    assert.match(mdInline, /``a`b``/);

    // Regresión: URLs con espacios/paréntesis no rompen el enlace Markdown
    const mdLink = htmlToMarkdown("<p><a href='https://ejemplo.test/a (b)'>x</a></p>");
    assert.match(mdLink, /\[x\]\(https:\/\/ejemplo\.test\/a%20%28b%29\)/);

    // Regresión: esquemas javascript: ofuscados con caracteres de control no se exportan como enlace
    const mdJs = htmlToMarkdown("<p><a href='java\tscript:alert(1)'>malo</a></p>");
    assert.equal(/\]\(java/i.test(mdJs), false);

    // Regresión: ChalaReadability descarta javascript: ofuscado y respeta lang/dir del original
    const rtlDoc = new MiniDocument("مقال تجريبي طويل جدا", "https://rtl.ejemplo.test/post");
    rtlDoc.documentElement.setAttribute("lang", "ar");
    rtlDoc.documentElement.setAttribute("dir", "rtl");
    rtlDoc.body.innerHTML =
      "<article><p>Texto suficientemente largo para ser considerado contenido principal del artículo, con varias frases, comas, y puntos.</p>" +
      "<p>Segundo párrafo con <a href='java\tscript:alert(1)'>enlace malicioso</a> y más texto para superar el umbral mínimo de extracción.</p></article>";
    const parsedRtl = context.ChalaReadability.parse(rtlDoc, { baseURI: rtlDoc.URL });
    assert.equal(parsedRtl.lang, "ar");
    assert.equal(parsedRtl.dir, "rtl");
    assert.equal(/javascript:/i.test(parsedRtl.contentHtml), false, "Obfuscated javascript: href must be removed");

    // Regresión: si chrome.storage falla (cuota) no se debe anunciar "guardado"
    const originalSet = context.chrome.storage.local.set;
    context.chrome.storage.local.set = async () => {
      throw new Error("QUOTA_BYTES quota exceeded");
    };
    saveBtn.click();
    await flushAsync();
    const toast = hostEl.shadowRoot.querySelectorAll("div").find((d) => d.className === "cr-toast");
    assert.ok(toast, "Toast element must exist");
    assert.match(toast.textContent, /No se pudo guardar/);
    context.chrome.storage.local.set = originalSet;

    // Regresión SPA: si se cierra el visor, cambia la URL y se vuelve a inyectar, debe re-clonar y re-extraer
    hostEl.__chalaReaderController.hide();
    assert.equal(hostEl.hidden, true);
    context.location.href = "https://blog.ejemplo.test/otro-articulo-spa";
    hostDoc.URL = context.location.href;
    hostDoc.baseURI = context.location.href;
    hostDoc.title = "Otro Artículo SPA";
    hostDoc.body.innerHTML =
      "<article><h1>Otro Artículo SPA</h1><p>Contenido nuevo cargado tras navegación SPA sin recarga completa de página, suficientemente largo para extracción.</p></article>";
    vm.runInContext(readabilityCode, vmCtx);
    vm.runInContext(engineCode, vmCtx);
    await flushAsync();
    assert.equal(hostDoc.cloneCalls, 2, "SPA URL change while hidden must re-clone DOM");
    const newHostEl = hostDoc.getElementById("chalareader-host");
    assert.ok(newHostEl, "New #chalareader-host must be mounted");
    assert.equal(newHostEl.__chalaReaderController.getSourceUrl(), "https://blog.ejemplo.test/otro-articulo-spa");
  });

  if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
  }
  console.log(`\nAll ${passed} checks passed.`);
}

run();
