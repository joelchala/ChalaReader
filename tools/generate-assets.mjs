/**
 * Generador local (cero dependencias externas) de iconos PNG de la extensión
 * en src/icons/ (16, 32, 48, 128 px) y piezas gráficas para store/.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const ICONS_DIR = path.join(ROOT, "src", "icons");
const STORE_DIR = path.join(ROOT, "store");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0))
  ]);
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function mixColor(c1, c2, t) {
  const k = clamp(t, 0, 1);
  return [
    c1[0] + (c2[0] - c1[0]) * k,
    c1[1] + (c2[1] - c1[1]) * k,
    c1[2] + (c2[2] - c1[2]) * k,
    c1[3] + (c2[3] - c1[3]) * k
  ];
}

function blendOver(dst, src, alpha) {
  const a = clamp(alpha * (src[3] / 255), 0, 1);
  if (a <= 0) return dst;
  const outA = a + (dst[3] / 255) * (1 - a);
  if (outA <= 0) return [0, 0, 0, 0];
  const r = (src[0] * a + dst[0] * (dst[3] / 255) * (1 - a)) / outA;
  const g = (src[1] * a + dst[1] * (dst[3] / 255) * (1 - a)) / outA;
  const b = (src[2] * a + dst[2] * (dst[3] / 255) * (1 - a)) / outA;
  return [r, g, b, outA * 255];
}

function sdRoundedBox(px, py, cx, cy, halfW, halfH, r) {
  const dx = Math.abs(px - cx) - (halfW - r);
  const dy = Math.abs(py - cy) - (halfH - r);
  const outDist = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inDist = Math.min(Math.max(dx, dy), 0);
  return outDist + inDist - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const denom = bax * bax + bay * bay || 1;
  const h = clamp((pax * bax + pay * bay) / denom, 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function sdPolygon(px, py, poly) {
  let minDist = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = sdSegment(px, py, a[0], a[1], b[0], b[1]);
    if (d < minDist) minDist = d;
  }
  return pointInPoly(px, py, poly) ? -minDist : minDist;
}

function makeShieldPoly(cx, topY, halfW, midY, bottomY) {
  return [
    [cx, topY],
    [cx + halfW, topY + (midY - topY) * 0.3],
    [cx + halfW, midY],
    [cx + halfW * 0.72, midY + (bottomY - midY) * 0.56],
    [cx, bottomY],
    [cx - halfW * 0.72, midY + (bottomY - midY) * 0.56],
    [cx - halfW, midY],
    [cx - halfW, topY + (midY - topY) * 0.3]
  ];
}

const OUTER_SHIELD = makeShieldPoly(64, 16, 40, 62, 114);
const INNER_SHIELD = makeShieldPoly(64, 23, 33, 61, 106);

const COL_BG_1 = [15, 23, 42, 255];      // #0F172A
const COL_BG_2 = [30, 41, 59, 255];      // #1E293B
const COL_PRIMARY = [16, 185, 129, 255]; // #10B981
const COL_ACCENT = [6, 182, 212, 255];   // #06B6D4
const COL_TEXT = [241, 245, 249, 255];   // #F1F5F9

function coverage(dist, pxScale) {
  const aa = Math.max(0.85, pxScale * 0.75);
  return clamp(0.5 - dist / aa, 0, 1);
}

function sampleIconPixel(ux, uy, pxScale, strokeBoost = 1) {
  let color = [0, 0, 0, 0];

  const dBg = sdRoundedBox(ux, uy, 64, 64, 60, 60, 28);
  const aBg = coverage(dBg, pxScale);
  if (aBg > 0) {
    const bgGrad = mixColor(COL_BG_1, COL_BG_2, (ux + uy) / 256);
    color = blendOver(color, bgGrad, aBg);

    const dTileStroke = Math.abs(dBg) - 2.0;
    const aTileStroke = coverage(dTileStroke, pxScale) * aBg;
    if (aTileStroke > 0) {
      color = blendOver(color, COL_BG_2, aTileStroke);
    }
  }

  const dOuter = sdPolygon(ux, uy, OUTER_SHIELD);
  const aOuter = coverage(dOuter, pxScale);
  if (aOuter > 0) {
    const shieldGrad = mixColor(COL_PRIMARY, COL_ACCENT, (ux + uy - 40) / 176);
    color = blendOver(color, shieldGrad, aOuter);
  }

  const dInner = sdPolygon(ux, uy, INNER_SHIELD);
  const aInner = coverage(dInner, pxScale);
  if (aInner > 0) {
    color = blendOver(color, COL_BG_1, aInner);
  }

  // Contorno del libro abierto dentro del escudo
  const bookHalf = 2.4 * strokeBoost;
  const segments = [
    [40, 46, 52, 48, COL_TEXT],
    [52, 48, 64, 54, COL_TEXT],
    [64, 54, 76, 48, COL_TEXT],
    [76, 48, 88, 46, COL_TEXT],
    [40, 46, 40, 78, COL_TEXT],
    [88, 46, 88, 78, COL_TEXT],
    [40, 78, 52, 79, COL_TEXT],
    [52, 79, 64, 85, COL_TEXT],
    [64, 85, 76, 79, COL_TEXT],
    [76, 79, 88, 78, COL_TEXT],
    [64, 54, 64, 85, COL_PRIMARY],
    [47, 57, 57, 60, COL_PRIMARY],
    [47, 66, 57, 69, COL_ACCENT],
    [71, 60, 81, 57, COL_ACCENT],
    [71, 69, 81, 66, COL_TEXT]
  ];

  for (const [ax, ay, bx, by, segCol] of segments) {
    const d = sdSegment(ux, uy, ax, ay, bx, by) - bookHalf;
    const a = coverage(d, pxScale);
    if (a > 0) {
      color = blendOver(color, segCol, a);
    }
  }

  return color;
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const pxScale = 128 / size;
  const strokeBoost = size <= 16 ? 1.5 : size <= 32 ? 1.15 : 1.0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const ux = ((x + 0.5) / size) * 128;
      const uy = ((y + 0.5) / size) * 128;
      const color = sampleIconPixel(ux, uy, pxScale, strokeBoost);
      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(clamp(color[0], 0, 255));
      rgba[idx + 1] = Math.round(clamp(color[1], 0, 255));
      rgba[idx + 2] = Math.round(clamp(color[2], 0, 255));
      rgba[idx + 3] = Math.round(clamp(color[3], 0, 255));
    }
  }

  return encodePng(size, size, rgba);
}

function fillRect(buf, width, height, x0, y0, rw, rh, col, radius = 0) {
  const xStart = Math.max(0, Math.floor(x0));
  const yStart = Math.max(0, Math.floor(y0));
  const xEnd = Math.min(width, Math.ceil(x0 + rw));
  const yEnd = Math.min(height, Math.ceil(y0 + rh));
  const cx = x0 + rw / 2;
  const cy = y0 + rh / 2;

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      let a = 1;
      if (radius > 0) {
        const d = sdRoundedBox(x + 0.5, y + 0.5, cx, cy, rw / 2, rh / 2, radius);
        a = coverage(d, 1);
      }
      if (a <= 0) continue;
      const idx = (y * width + x) * 4;
      const dst = [buf[idx], buf[idx + 1], buf[idx + 2], buf[idx + 3]];
      const out = blendOver(dst, col, a);
      buf[idx] = Math.round(clamp(out[0], 0, 255));
      buf[idx + 1] = Math.round(clamp(out[1], 0, 255));
      buf[idx + 2] = Math.round(clamp(out[2], 0, 255));
      buf[idx + 3] = Math.round(clamp(out[3], 0, 255));
    }
  }
}

function renderStoreBanner(width, height, withSidebarCard = false) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const grad = mixColor(COL_BG_1, COL_BG_2, (x / width + y / height) * 0.5);
      const idx = (y * width + x) * 4;
      rgba[idx] = Math.round(grad[0]);
      rgba[idx + 1] = Math.round(grad[1]);
      rgba[idx + 2] = Math.round(grad[2]);
      rgba[idx + 3] = 255;
    }
  }

  // Barra superior simulando el progreso de lectura
  fillRect(rgba, width, height, 0, 0, Math.round(width * 0.68), 6, COL_PRIMARY, 0);

  // Tarjeta principal de artículo simulado
  const cardX = Math.round(width * 0.14);
  const cardY = Math.round(height * 0.14);
  const cardW = withSidebarCard ? Math.round(width * 0.54) : Math.round(width * 0.72);
  const cardH = Math.round(height * 0.74);
  fillRect(rgba, width, height, cardX, cardY, cardW, cardH, [30, 41, 59, 248], 18);

  // Barra flotante de controles
  fillRect(rgba, width, height, cardX + 26, cardY + 22, cardW - 52, 42, [15, 23, 42, 235], 10);
  fillRect(rgba, width, height, cardX + 42, cardY + 35, 96, 16, COL_PRIMARY, 6);
  fillRect(rgba, width, height, cardX + 150, cardY + 35, 72, 16, [245, 238, 219, 255], 6);
  fillRect(rgba, width, height, cardX + 234, cardY + 35, 72, 16, [255, 255, 255, 255], 6);
  fillRect(rgba, width, height, cardX + cardW - 140, cardY + 35, 84, 16, COL_ACCENT, 6);

  // Líneas de título y párrafos limpios
  fillRect(rgba, width, height, cardX + 44, cardY + 96, Math.round(cardW * 0.68), 22, COL_TEXT, 6);
  fillRect(rgba, width, height, cardX + 44, cardY + 130, 120, 12, COL_PRIMARY, 5);
  fillRect(rgba, width, height, cardX + 178, cardY + 130, 110, 12, COL_ACCENT, 5);

  for (let row = 0; row < 7; row += 1) {
    const lineY = cardY + 176 + row * 34;
    if (lineY + 14 > cardY + cardH - 24) break;
    const lineW = row % 3 === 2 ? Math.round(cardW * 0.56) : Math.round(cardW * 0.78);
    fillRect(rgba, width, height, cardX + 44, lineY, lineW, 12, [203, 213, 225, 210], 4);
  }

  if (withSidebarCard) {
    const sideX = cardX + cardW + 24;
    const sideW = Math.round(width * 0.2);
    fillRect(rgba, width, height, sideX, cardY, sideW, cardH, [24, 34, 52, 245], 16);
    fillRect(rgba, width, height, sideX + 20, cardY + 26, sideW - 40, 18, COL_ACCENT, 6);
    for (let item = 0; item < 4; item += 1) {
      const iy = cardY + 72 + item * 74;
      fillRect(rgba, width, height, sideX + 20, iy, sideW - 40, 56, [38, 51, 73, 255], 10);
      fillRect(rgba, width, height, sideX + 32, iy + 14, sideW - 76, 10, COL_TEXT, 4);
      fillRect(rgba, width, height, sideX + 32, iy + 32, sideW - 108, 8, COL_PRIMARY, 4);
    }
  }

  // Emblema del icono ChalaReader en esquina inferior derecha
  const iconSize = Math.min(96, Math.round(Math.min(width, height) * 0.22));
  const ix0 = width - iconSize - 24;
  const iy0 = height - iconSize - 24;
  const pxScale = 128 / iconSize;
  for (let y = 0; y < iconSize; y += 1) {
    for (let x = 0; x < iconSize; x += 1) {
      const ux = ((x + 0.5) / iconSize) * 128;
      const uy = ((y + 0.5) / iconSize) * 128;
      const c = sampleIconPixel(ux, uy, pxScale, 1);
      if (c[3] <= 0) continue;
      const idx = ((iy0 + y) * width + (ix0 + x)) * 4;
      const dst = [rgba[idx], rgba[idx + 1], rgba[idx + 2], rgba[idx + 3]];
      const out = blendOver(dst, c, 1);
      rgba[idx] = Math.round(clamp(out[0], 0, 255));
      rgba[idx + 1] = Math.round(clamp(out[1], 0, 255));
      rgba[idx + 2] = Math.round(clamp(out[2], 0, 255));
      rgba[idx + 3] = Math.round(clamp(out[3], 0, 255));
    }
  }

  return encodePng(width, height, rgba);
}

function main() {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  fs.mkdirSync(STORE_DIR, { recursive: true });

  for (const size of [16, 32, 48, 128]) {
    const outPath = path.join(ICONS_DIR, `icon${size}.png`);
    fs.writeFileSync(outPath, renderIcon(size));
    console.log(`Generated ${path.relative(ROOT, outPath)}`);
  }

  const storeAssets = [
    ["logo-300x300.png", renderIcon(300)],
    ["promo-440x280.png", renderStoreBanner(440, 280, false)],
    ["destacada-1400x560.png", renderStoreBanner(1400, 560, true)],
    ["captura-1-lectura.png", renderStoreBanner(1280, 800, false)],
    ["captura-2-temas-tipografia.png", renderStoreBanner(1280, 800, false)],
    ["captura-3-guardados.png", renderStoreBanner(1280, 800, true)]
  ];

  for (const [name, buf] of storeAssets) {
    const outPath = path.join(STORE_DIR, name);
    fs.writeFileSync(outPath, buf);
    console.log(`Generated ${path.relative(ROOT, outPath)}`);
  }
}

main();
