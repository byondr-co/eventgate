#!/usr/bin/env node
/**
 * One-shot PNG generator for the PWA placeholder icons.
 *
 * Plan D's manifest only listed `/favicon.ico` (size="any") — that doesn't
 * satisfy Chrome's PWA installability criteria, which requires PNG icons at
 * 192×192 AND 512×512 to fire `beforeinstallprompt`. This script writes both
 * sizes to `public/icons/` so the Install flow can be exercised end-to-end
 * during pre-pilot verification.
 *
 * Branded icons will replace these later — same file paths, no manifest
 * change needed at that point.
 *
 * Implementation: solid dark gray background (#0a0a0a, matching the manifest
 * background_color) with a centered light square for "this is an app icon,
 * not a blank tile." Uses only Node built-ins (no PNG library — Buffer +
 * zlib.deflateSync + manual CRC32 from a precomputed table). Node 18+.
 *
 * Run from the frontend root:
 *   node scripts/generate-placeholder-icons.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, "..");
const ICONS_DIR = path.join(FRONTEND_ROOT, "public", "icons");

// CRC32 (Node's zlib.crc32 is Node 23+; we precompute the table to stay on 18+).
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePng(size, pixelFn) {
  // 1 filter byte per row + RGBA pixels.
  const stride = 1 + size * 4;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter = None
    for (let x = 0; x < size; x++) {
      const { r, g, b, a = 255 } = pixelFn(x, y);
      const o = rowStart + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Dark background + centered light square. Bare minimum so the icon is
// recognizably an app icon (not a blank tile) at install time.
function placeholderPixel(size, x, y) {
  const half = size * 0.3;
  const cx = size / 2;
  const cy = size / 2;
  const inSquare = Math.abs(x - cx) < half && Math.abs(y - cy) < half;
  return inSquare ? { r: 230, g: 230, b: 230 } : { r: 10, g: 10, b: 10 };
}

function main() {
  mkdirSync(ICONS_DIR, { recursive: true });
  for (const size of [192, 512]) {
    const png = makePng(size, (x, y) => placeholderPixel(size, x, y));
    const out = path.join(ICONS_DIR, `icon-${size}.png`);
    writeFileSync(out, png);
    console.log(`✓ wrote ${path.relative(FRONTEND_ROOT, out)} (${png.length} bytes)`);
  }
}

main();
