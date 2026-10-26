import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// Raster PWA icons with 4x supersampling. Node builtins only.
// The ring's outer edge is 30% of the width so it stays in the maskable safe zone.

const BG = [0x0f, 0x0d, 0x0c];
const ACCENT = [0xff, 0x8a, 0x3d];
const SAMPLE = 4;

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(size, rgb) {
  const rowBytes = 1 + size * 3;
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    const dest = y * rowBytes;
    raw[dest] = 0;
    rgb.copy(raw, dest + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function raster(size) {
  const cx = size / 2;
  const cy = size / 2;
  const stroke = size * 0.056;
  const radius = size * 0.3 - stroke / 2;
  const cap = stroke / 2;
  const dot = size * 0.048;
  const sweep = Math.PI * 1.5;
  const start = { x: cx + radius * Math.sin(0), y: cy - radius * Math.cos(0) };
  const end = { x: cx + radius * Math.sin(sweep), y: cy - radius * Math.cos(sweep) };
  const rgb = Buffer.alloc(size * size * 3);

  function covers(px, py) {
    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.hypot(dx, dy);
    if (dist <= dot) return true;
    if (Math.hypot(px - start.x, py - start.y) <= cap) return true;
    if (Math.hypot(px - end.x, py - end.y) <= cap) return true;
    if (Math.abs(dist - radius) > cap) return false;
    let angle = Math.atan2(dx, -dy);
    if (angle < 0) angle += Math.PI * 2;
    return angle <= sweep;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SAMPLE; sy++) {
        for (let sx = 0; sx < SAMPLE; sx++) {
          const px = x + (sx + 0.5) / SAMPLE;
          const py = y + (sy + 0.5) / SAMPLE;
          const color = covers(px, py) ? ACCENT : BG;
          r += color[0];
          g += color[1];
          b += color[2];
        }
      }
      const n = SAMPLE * SAMPLE;
      const i = (y * size + x) * 3;
      rgb[i] = Math.round(r / n);
      rgb[i + 1] = Math.round(g / n);
      rgb[i + 2] = Math.round(b / n);
    }
  }
  return rgb;
}

function assertIcon(file, size) {
  const buf = readFileSync(file);
  if (buf[0] !== 0x89 || buf.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("PNG signature missing: " + file);
  }
  if (buf.readUInt32BE(16) !== size || buf.readUInt32BE(20) !== size) {
    throw new Error("IHDR size mismatch: " + file);
  }
}

const outDir = process.cwd() + "/public/icons";
mkdirSync(outDir, { recursive: true });

const outputs = [
  ["icon-180.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-maskable-512.png", 512],
];

for (const [name, size] of outputs) {
  const file = outDir + "/" + name;
  const png = encodePng(size, raster(size));
  writeFileSync(file, png);
  assertIcon(file, size);
  console.log("wrote", file, png.length);
}
