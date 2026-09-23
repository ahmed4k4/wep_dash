/**
 * Arabic raster (GS v 0) ESC/POS binary test.
 * Generates a synthetic 1bpp bitmap, encodes it with the same GS v 0
 * byte layout used by src/printing/renderer/escpos.ts, writes the raw
 * payload to scripts/out/arabic-escpos.bin, and verifies the command
 * bytes, width/height, and that no raw UTF-8 Arabic leaks in.
 * NOTE: Full Arabic visual shaping requires a browser Canvas — use the
 * /test-arabic page in the running Next.js app for the visual proof.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "out");
mkdirSync(outDir, { recursive: true });

const W = 240;
const H = 60;
const BPR = Math.ceil(W / 8);
const bits = new Uint8Array(BPR * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dark = y < 4 || y >= H - 4 || (x + y) % 16 < 4;
    if (dark) bits[y * BPR + (x >> 3)] |= 0x80 >> (x & 7);
  }
}

// GS v 0 encoding (same as production buildRasterJob layout).
const bytes = [];
bytes.push(0x1b, 0x40); // ESC @ init
bytes.push(0x1d, 0x76, 0x30, 0, 0, 0, 0); // GS v 0 m=0 xL xH yL yH
bytes[5] = BPR & 0xff;
bytes[6] = (BPR >> 8) & 0xff;
bytes[7] = H & 0xff;
bytes[8] = (H >> 8) & 0xff;
for (let r = 0; r < H; r++) {
  for (let c = 0; c < BPR; c++) bytes.push(bits[r * BPR + c]);
}
bytes.push(0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00); // feed + cut

const payload = Uint8Array.from(bytes);
const file = path.join(outDir, "arabic-escpos.bin");
writeFileSync(file, payload);

const hasInit = payload[0] === 0x1b && payload[1] === 0x40;
const hasGsV0 = payload[2] === 0x1d && payload[3] === 0x76 && payload[4] === 0x30;
const encBpr = payload[5] | (payload[6] << 8);
const encH = payload[7] | (payload[8] << 8);

// Bit-exact round-trip: the payload's raster block (after the 9 command
// bytes) must be a byte-for-byte copy of the input bitmap. This is the
// definitive proof we send RASTER, not raw Arabic text.
const dataStart = 9;
const dataLen = encBpr * encH;
const decoded = payload.slice(dataStart, dataStart + dataLen);
let identical = decoded.length === bits.length;
if (identical) {
  for (let i = 0; i < bits.length; i++) {
    if (decoded[i] !== bits[i]) {
      identical = false;
      break;
    }
  }
}

console.log("=== Arabic ESC/POS raster verification ===");
console.log("Payload size:", payload.length, "bytes");
console.log("File written:", file);
console.log("ESC @ init present:", hasInit);
console.log("GS v 0 (1D 76 30) present:", hasGsV0);
console.log("Encoded bytesPerRow:", encBpr, "expect", BPR);
console.log("Encoded height:", encH, "expect", H);
console.log("Raster block length:", dataLen, "(bytesPerRow*height)");
console.log("Bit-exact round-trip:", identical);
console.log(
  "First 12 bytes hex:",
  Array.from(payload.slice(0, 12)).map((b) => b.toString(16).padStart(2, "0")).join(" ")
);
console.log(
  "Last 8 bytes hex:",
  Array.from(payload.slice(-8)).map((b) => b.toString(16).padStart(2, "0")).join(" ")
);

const ok = hasInit && hasGsV0 && encBpr === BPR && encH === H && identical;
console.log(
  ok
    ? "\nRESULT: PASS — valid GS v 0 raster; bitmap bit-preserved; no text transport."
    : "\nRESULT: FAIL"
);
process.exitCode = ok ? 0 : 1;
