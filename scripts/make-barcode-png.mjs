import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

/**
 * Draw an EAN-13 barcode as a PNG.
 *
 * `pnpm barcode <code> <out.png>` — 12 digits and the check digit is computed,
 * 13 and it is verified.
 *
 * This exists to test the scanner without hardware. The Android emulator's
 * virtual scene has a wall poster whose image can be swapped at runtime, so a
 * generated barcode hung on that wall is the only way `expo-camera` actually
 * decodes something in an automated run — see
 * [apps/mobile/CLAUDE.md](../apps/mobile/CLAUDE.md). It is also useful on paper:
 * printing one is a faster way to try a phone than finding a packet whose
 * barcode is already in the household.
 *
 * No dependency, because every barcode library in reach is either a browser
 * canvas renderer or brings a PNG encoder along for a job that is 40 lines.
 */

/** The left-hand odd, left-hand even and right-hand digit encodings. */
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];

/**
 * The first digit is not drawn. It is carried by *which* of L and G encodes
 * each of the next six — which is why an EAN-13 is 12 digits wide and 13 long,
 * and why a mirrored image does not decode to a different product but to
 * nothing at all.
 */
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

function checkDigit(twelve) {
  const sum = [...twelve].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

function modules(code) {
  const digits = [...code].map(Number);
  let bits = "101";
  for (let i = 0; i < 6; i++) bits += (PARITY[digits[0]][i] === "L" ? L : G)[digits[i + 1]];
  bits += "01010";
  for (let i = 7; i < 13; i++) bits += R[digits[i]];
  return `${bits}101`;
}

/**
 * Eleven modules of quiet zone each side — the symbology's minimum. It is
 * tempting to be generous, but the poster is a fixed size in the scene, so
 * every module of margin is taken out of the width of the bars, and the bars
 * are what has to survive being 200 pixels wide in a camera frame.
 */
const QUIET = 11;
const SCALE = 6;
const BAR_HEIGHT = 260;
const PAD = 60;

function renderPng(code) {
  const bits = modules(code);
  const width = (bits.length + QUIET * 2) * SCALE;
  const height = BAR_HEIGHT + PAD * 2;

  // 8-bit greyscale: one filter byte then one byte per pixel, per row.
  const raw = Buffer.alloc((width + 1) * height, 0xff);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // filter: none
    if (y < PAD || y >= PAD + BAR_HEIGHT) continue;
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] !== "1") continue;
      const start = (QUIET + i) * SCALE;
      for (let x = start; x < start + SCALE; x++) raw[y * (width + 1) + 1 + x] = 0x00;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: greyscale

  return {
    width,
    height,
    png: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  };
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function normalise(input) {
  if (/^\d{12}$/.test(input)) return input + checkDigit(input);
  if (!/^\d{13}$/.test(input)) throw new Error(`not an EAN-13: ${input}`);
  const expected = checkDigit(input.slice(0, 12));
  if (input[12] !== expected) {
    throw new Error(`check digit is ${input[12]}, should be ${expected} — a scanner would reject this`);
  }
  return input;
}

const [, , input, out] = process.argv;
if (!input || !out) {
  console.error("usage: node scripts/make-barcode-png.mjs <12-or-13-digit-code> <out.png>");
  process.exit(1);
}

try {
  const code = normalise(input);
  const { width, height, png } = renderPng(code);
  writeFileSync(out, png);
  console.log(`${code}  ${width}×${height}  → ${out}`);
} catch (cause) {
  // A stack trace for "you typed the wrong check digit" is noise.
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
}
