/* ============================================================
   Генератор растровых фавиконов из логотипа AniToki.
   Google в поиске показывает favicon только если он доступен
   в растровом формате, квадратный и кратен 48px. SVG он берёт
   не всегда, поэтому делаем PNG (48/192/512), apple-touch-icon
   и favicon.ico (PNG внутри ICO) — без внешних зависимостей.

   ЗАПУСК:  node tools/gen-favicon.mjs
   ============================================================ */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- Логотип (viewBox 64×64): тёмный фон + два диагональных штриха
//     с градиентом #7c5cff → #19e3ff по диагонали (как в favicon.svg) ---
const BG = [7, 6, 15];
const C1 = [124, 92, 255];   // #7c5cff
const C2 = [25, 227, 255];   // #19e3ff
const BAR1 = [[14, 46], [30, 14], [34, 14], [18, 46]];
const BAR2 = [[34, 18], [50, 50], [46, 50], [30, 18]];
const BAR2_ALPHA = 0.85;

const lerp = (a, b, t) => a + (b - a) * t;
function gradient(px, py) {
  const t = Math.max(0, Math.min(1, (px + py) / 2)); // проекция на диагональ (0,0)->(1,1)
  return [lerp(C1[0], C2[0], t), lerp(C1[1], C2[1], t), lerp(C1[2], C2[2], t)];
}
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Цвет одной точки (u,v) в координатах viewBox 0..64
function sample(u, v) {
  let [r, g, b] = BG;
  if (inPoly(u, v, BAR1)) [r, g, b] = gradient(u / 64, v / 64);
  if (inPoly(u, v, BAR2)) {
    const [gr, gg, gb] = gradient(u / 64, v / 64);
    r = lerp(r, gr, BAR2_ALPHA); g = lerp(g, gg, BAR2_ALPHA); b = lerp(b, gb, BAR2_ALPHA);
  }
  return [r, g, b];
}

// Рендер RGBA-буфера размера S×S с суперсэмплингом SS×SS (сглаживание краёв)
function render(S, SS = 3) {
  const buf = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / S) * 64;
          const v = ((y + (sy + 0.5) / SS) / S) * 64;
          const c = sample(u, v); r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS, o = (y * S + x) * 4;
      buf[o] = Math.round(r / n); buf[o + 1] = Math.round(g / n);
      buf[o + 2] = Math.round(b / n); buf[o + 3] = 255;
    }
  }
  return buf;
}

// --- Минимальный PNG-энкодер (RGBA, без фильтров) ---
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, cr]);
}
function encodePNG(rgba, S) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 бит, RGBA
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0; // фильтр None
    rgba.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
function icoFromPNG(png) {
  const dir = Buffer.alloc(6); dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(1, 4);
  const ent = Buffer.alloc(16);
  ent[0] = 48; ent[1] = 48; ent[2] = 0; ent[3] = 0;
  ent.writeUInt16LE(1, 4); ent.writeUInt16LE(32, 6);
  ent.writeUInt32LE(png.length, 8); ent.writeUInt32LE(22, 12);
  return Buffer.concat([dir, ent, png]);
}

const png48 = encodePNG(render(48), 48);
writeFileSync(join(ROOT, "favicon-48.png"), png48);
writeFileSync(join(ROOT, "favicon-192.png"), encodePNG(render(192), 192));
writeFileSync(join(ROOT, "favicon-512.png"), encodePNG(render(512), 512));
writeFileSync(join(ROOT, "apple-touch-icon.png"), encodePNG(render(180), 180));
writeFileSync(join(ROOT, "favicon.ico"), icoFromPNG(png48));
console.log("Готово: favicon.ico, favicon-48.png, favicon-192.png, favicon-512.png, apple-touch-icon.png");
