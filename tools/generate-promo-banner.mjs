/**
 * Generador de banner promocional grande (1400x560) para ChalaReader.
 * Renderiza HTML/CSS real vía Edge/Chrome Headless (CDP + WebSocket nativo).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "store", "destacada-1400x560.png");
const ICON_SVG_PATH = path.join(ROOT, "src", "icons", "icon.svg");

function getIconDataUri() {
  const svg = fs.readFileSync(ICON_SVG_PATH, "utf8");
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function findBrowserBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/microsoft-edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium"
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error("No local Edge or Chrome binary found.");
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function waitForTargetWsUrl(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const targets = await res.json();
        const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch {
      // Starting
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error("Timed out waiting for headless browser DevTools.");
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.readyPromise = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", (err) => reject(err));
    });
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (typeof msg.id === "number" && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`CDP ${msg.error.code}: ${msg.error.message}`));
        else resolve(msg.result);
      }
    });
  }
  async connect() { await this.readyPromise; }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

function assertPngDimensions(filePath, expectedWidth, expectedHeight) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const buf = fs.readFileSync(filePath);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error(`Invalid PNG: ${filePath}`);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== expectedWidth || h !== expectedHeight) {
    throw new Error(`Dimension mismatch ${filePath}: ${w}x${h} != ${expectedWidth}x${expectedHeight}`);
  }
}

function buildHtml(iconUri) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 1400px;
    height: 560px;
    overflow: hidden;
    font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif;
    background: radial-gradient(circle at 75% 42%, rgba(16, 185, 129, 0.16), transparent 50%),
                radial-gradient(circle at 22% 75%, rgba(6, 182, 212, 0.14), transparent 46%),
                linear-gradient(135deg, #0B1220 0%, #0F172A 55%, #162338 100%);
    color: #F1F5F9;
    -webkit-font-smoothing: antialiased;
  }
  .canvas {
    width: 1400px;
    height: 560px;
    padding: 52px 64px;
    display: grid;
    grid-template-columns: 1.02fr 1.18fr;
    gap: 44px;
    align-items: center;
  }
  .left {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .brand img {
    width: 68px;
    height: 68px;
    border-radius: 16px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
  }
  .brand-name {
    font-size: 46px;
    font-weight: 800;
    letter-spacing: -0.025em;
    color: #FFFFFF;
  }
  .headline {
    font-size: 36px;
    font-weight: 700;
    line-height: 1.18;
    color: #E2E8F0;
    max-width: 530px;
  }
  .headline strong {
    color: #34D399;
    font-weight: 800;
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 4px;
  }
  .pill {
    padding: 8px 16px;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 600;
    border: 1px solid rgba(52, 211, 153, 0.45);
    background: rgba(16, 185, 129, 0.14);
    color: #6EE7B7;
  }
  .pill.cyan {
    border-color: rgba(6, 182, 212, 0.45);
    background: rgba(6, 182, 212, 0.14);
    color: #67E8F9;
  }
  .pill.soft {
    border-color: rgba(148, 163, 184, 0.3);
    background: rgba(30, 41, 59, 0.72);
    color: #CBD5E1;
  }

  /* Right mockup stage */
  .stage {
    position: relative;
    height: 456px;
    display: grid;
    grid-template-columns: 1fr 236px;
    gap: 16px;
    align-items: stretch;
  }
  .reader-card {
    background: #141E30;
    border: 1px solid #2A3A54;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 24px 56px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
  }
  .progress-bar {
    height: 4px;
    width: 100%;
    background: #1E293B;
  }
  .progress-fill {
    height: 100%;
    width: 68%;
    background: linear-gradient(90deg, #10B981, #06B6D4);
  }
  .toolbar-wrap {
    padding: 16px 22px 10px;
    display: flex;
    justify-content: center;
  }
  .toolbar {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    padding: 8px 18px;
    border-radius: 999px;
    background: #1E293B;
    border: 1px solid #334155;
    font-size: 13px;
    font-weight: 600;
    color: #CBD5E1;
  }
  .toolbar .active-pill {
    background: rgba(16, 185, 129, 0.18);
    color: #34D399;
    padding: 3px 9px;
    border-radius: 999px;
  }
  .article {
    padding: 10px 28px 24px;
    display: flex;
    flex-direction: column;
    gap: 13px;
  }
  .article h2 {
    font-size: 22px;
    font-weight: 700;
    color: #F8FAFC;
  }
  .article p {
    font-size: 14.5px;
    line-height: 1.56;
    color: #CBD5E1;
  }
  .quote {
    padding: 10px 14px;
    border-left: 3px solid #10B981;
    background: rgba(16, 185, 129, 0.08);
    border-radius: 0 8px 8px 0;
    font-size: 13.5px;
    color: #A7F3D0;
  }
  .meta-line {
    margin-top: auto;
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: #94A3B8;
  }
  .meta-tag {
    padding: 3px 9px;
    border-radius: 6px;
    background: #1E293B;
    border: 1px solid #334155;
  }

  /* Side stack: Sepia card + Saved Articles card without covering text */
  .side-col {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .sepia-card {
    background: #F4ECD8;
    color: #433422;
    border: 1px solid #DFD2B5;
    border-radius: 14px;
    padding: 18px 18px 20px;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sepia-badge {
    align-self: flex-start;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 3px 8px;
    border-radius: 6px;
    background: rgba(180, 83, 9, 0.14);
    color: #92400E;
  }
  .sepia-card h3 {
    font-size: 17px;
    font-weight: 700;
    color: #2E2215;
  }
  .sepia-card p {
    font-size: 13px;
    line-height: 1.48;
    color: #5C4934;
  }

  .saved-card {
    flex: 1;
    background: #141E30;
    border: 1px solid #2A3A54;
    border-radius: 14px;
    padding: 16px 18px;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .saved-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
    font-weight: 700;
    color: #F1F5F9;
  }
  .saved-dot {
    width: 8px;
    height: 14px;
    border-radius: 2px;
    background: #10B981;
  }
  .saved-item {
    background: #1B273C;
    border: 1px solid #2C3D5A;
    border-radius: 9px;
    padding: 9px 11px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .saved-title {
    font-size: 12.5px;
    font-weight: 600;
    color: #E2E8F0;
  }
  .saved-sub {
    font-size: 11px;
    color: #94A3B8;
  }
</style>
</head>
<body>
  <div class="canvas">
    <section class="left">
      <div class="brand">
        <img src="${iconUri}" alt="" />
        <div class="brand-name">ChalaReader</div>
      </div>
      <h1 class="headline">Modo lectura limpio, <strong>privado</strong> y 100% offline</h1>
      <div class="pills">
        <span class="pill">Un clic o Alt+R</span>
        <span class="pill cyan">3 Temas + OpenDyslexic</span>
        <span class="pill soft">Markdown · PDF · Offline</span>
      </div>
    </section>

    <section class="stage">
      <article class="reader-card">
        <div class="progress-bar"><div class="progress-fill"></div></div>
        <div class="toolbar-wrap">
          <div class="toolbar">
            <span>Aa</span>
            <span class="active-pill">Oscuro</span>
            <span>Sepia</span>
            <span>Exportar .md</span>
            <span>PDF</span>
          </div>
        </div>
        <div class="article">
          <h2>Lectura sin distracciones</h2>
          <p>
            Elimina anuncios, menús laterales y ventanas emergentes con un solo clic
            para disfrutar tus artículos favoritos en una vista aislada con Shadow DOM.
          </p>
          <p>
            Personaliza la tipografía, ajusta el ancho de columna y cambia al instante
            entre los temas Oscuro, Sepia y Claro sin enviar datos a internet.
          </p>
          <div class="quote">
            Atajo instantáneo con <strong>Alt+R</strong> y restauración exacta del scroll al salir.
          </div>
          <div class="meta-line">
            <span class="meta-tag">1,240 palabras</span>
            <span class="meta-tag">6 min de lectura</span>
            <span class="meta-tag">100% local</span>
          </div>
        </div>
      </article>

      <aside class="side-col">
        <div class="sepia-card">
          <span class="sepia-badge">Tema Sepia</span>
          <h3>Sepia cálido</h3>
          <p>
            Lectura cómoda para tus ojos, ideal para sesiones largas de estudio o lectura nocturna.
          </p>
        </div>

        <div class="saved-card">
          <div class="saved-head">
            <span class="saved-dot"></span>
            <span>Artículos guardados</span>
          </div>
          <div class="saved-item">
            <div class="saved-title">Arquitectura Manifest V3</div>
            <div class="saved-sub">Guardado offline · .md / PDF</div>
          </div>
          <div class="saved-item">
            <div class="saved-title">Guía de Shadow DOM</div>
            <div class="saved-sub">6 min · Sin conexión</div>
          </div>
        </div>
      </aside>
    </section>
  </div>
</body>
</html>`;
}

async function main() {
  const browserBin = findBrowserBinary();
  const port = await getFreePort();
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), "chalareader-banner-"));
  const htmlPath = path.join(tmpProfile, "banner.html");
  fs.writeFileSync(htmlPath, buildHtml(getIconDataUri()), "utf8");

  const browserProc = spawn(browserBin, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tmpProfile}`,
    "about:blank"
  ], { stdio: "ignore" });

  let cdp;
  try {
    const wsUrl = await waitForTargetWsUrl(port);
    cdp = new CdpClient(wsUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1400,
      height: 560,
      deviceScaleFactor: 1,
      mobile: false
    });
    await cdp.send("Page.navigate", { url: pathToFileURL(htmlPath).href });
    await new Promise((r) => setTimeout(r, 350));
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true
    });
    fs.writeFileSync(OUT_FILE, Buffer.from(data, "base64"));
    assertPngDimensions(OUT_FILE, 1400, 560);
    console.log(`Generated ${OUT_FILE} (1400x560)`);
  } finally {
    if (cdp) cdp.close();
    await new Promise((r) => {
      browserProc.once("exit", r);
      browserProc.kill();
      setTimeout(r, 1500);
    });
    try { fs.rmSync(tmpProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); } catch {}
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
