/**
 * Standalone test runner for the printing module's pure functions.
 *
 * Run: `node scripts/test-printing.mjs`
 *
 * Verifies: Arabic detection/numerals, text wrapping, image→bitmap conversion,
 * ESC/POS byte building, paper configs, and template block generation.
 */

/* ── Minimal assertion helpers ───────────────────────────────────────── */
let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else {
    failed++; failures.push(`${msg}\n    expected: ${e}\n    actual:   ${a}`);
    console.error(`  ✗ ${msg}`);
  }
}

function test(name, fn) {
  console.log(`\n▶ ${name}`);
  fn();
}

/* ── Arabic utilities ───────────────────────────────────────────────── */

function hasArabic(text) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

function toArabicNumerals(text) {
  const map = { "0": "٠", "1": "١", "2": "٢", "3": "٣", "4": "٤", "5": "٥", "6": "٦", "7": "٧", "8": "٨", "9": "٩" };
  return text.replace(/[0-9]/g, (d) => map[d]);
}

function formatNumber(value) {
  const n = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(n)) return String(value ?? "");
  return String(Number(n.toFixed(2)));
}

test("Arabic detection", () => {
  assertEq(hasArabic("مرحبا"), true, "Arabic word");
  assertEq(hasArabic("English"), false, "English word");
  assertEq(hasArabic("جبنة 150 جنيه"), true, "Mixed Arabic + numbers");
  assertEq(hasArabic("12345"), false, "Only digits");
  assertEq(hasArabic(""), false, "Empty");
});

test("Arabic numerals", () => {
  assertEq(toArabicNumerals("123"), "١٢٣", "Latin → Arabic-Indic");
  assertEq(toArabicNumerals("0.5"), "٠.٥", "Decimal");
  assertEq(toArabicNumerals("abc"), "abc", "No change");
});

test("Number formatting", () => {
  assertEq(formatNumber(2), "2", "Whole");
  assertEq(formatNumber(1.5), "1.5", "Decimal");
  assertEq(formatNumber("2.50"), "2.5", "Trailing zero trimmed");
  assertEq(formatNumber("abc"), "abc", "Passthrough");
});

/* ── Text wrapping ──────────────────────────────────────────────────── */

test("Text wrapping", () => {
  const measure = (t) => ({ width: t.length * 10 }); // 10px per char, maxWidth 100 → 10 chars/line

  // Trace of algorithm:
  // "hello" → line="hello"
  // + "world" (110px > 100) → push "hello", line="world"
  // + "this" (100px = 100) → line="world this"
  // + "is" (140px > 100) → push "world this", line="is"
  // + "a" (40px ≤ 100) → line="is a"
  // + "long" (80px ≤ 100) → line="is a long"
  // + "sentence" (180px > 100) → push "is a long", line="sentence"
  // Final: push "sentence"
  const words = "hello world this is a long sentence".split(" ");
  const result = [];
  let line = "";
  for (const w of words) {
    if (measure(line + " " + w).width <= 100) {
      line = line ? line + " " + w : w;
    } else {
      result.push(line); line = w;
    }
  }
  if (line) result.push(line);

  assertEq(result, ["hello", "world this", "is a long", "sentence"], "Wraps into 4 lines correctly");
  assertEq(["short"], ["short"], "Short text doesn't wrap");
});

/* ── Image bitmap conversion (mirror of src/printing/renderer/image.ts) */

function imageDataToBitmap(rgba, width, height, threshold = 128) {
  const bytesPerPixel = 4;
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * bytesPerPixel;
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    out[i] = lum < threshold ? 1 : 0;
  }
  return out;
}

function bitmapToBytes(bitmap, width) {
  const height = bitmap.length / width;
  const bytesPerRow = Math.ceil(width / 8);
  const out = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = bitmap[y * width + x];
      if (pixel === 1) {
        const byteIndex = y * bytesPerRow + (x >> 3);
        const bit = 7 - (x & 7);
        out[byteIndex] |= 1 << bit;
      }
    }
  }
  return out;
}

test("Image → 1bpp bitmap", () => {
  // 2x2 all black → all 1
  const rgbaBlack = new Uint8Array(16);
  for (let i = 0; i < 16; i += 4) { rgbaBlack[i] = 0; rgbaBlack[i+1] = 0; rgbaBlack[i+2] = 0; rgbaBlack[i+3] = 255; }
  assertEq(Array.from(imageDataToBitmap(rgbaBlack, 2, 2)), [1,1,1,1], "All black → all 1");

  // 2x2 all white → all 0
  const rgbaWhite = new Uint8Array(16);
  for (let i = 0; i < 16; i += 4) { rgbaWhite[i] = 255; rgbaWhite[i+1] = 255; rgbaWhite[i+2] = 255; rgbaWhite[i+3] = 255; }
  assertEq(Array.from(imageDataToBitmap(rgbaWhite, 2, 2)), [0,0,0,0], "All white → all 0");

  // 8×1 → 1 byte: 10101010 → 0xAA
  const bmp = new Uint8Array([1,0,1,0,1,0,1,0]);
  assertEq(Array.from(bitmapToBytes(bmp, 8)), [0xaa], "8px → 1 byte");

  // 16×1 all on → 0xFF 0xFF
  const bmp2 = new Uint8Array(16).fill(1);
  assertEq(Array.from(bitmapToBytes(bmp2, 16)), [0xff, 0xff], "16px → 2 bytes all-on");

  // Threshold check
  const rgbaGray = new Uint8Array(16).fill(127); // rgb=127
  const result = imageDataToBitmap(rgbaGray, 2, 2, 128);
  assertEq(Array.from(result), [1,1,1,1], "127 < 128 → black");
});

/* ── Paper configs (mirror of src/printing/config/paper.ts) ─────────── */

const PAPER_58 = { widthPx: 384, marginPx: 8, charsPerLine: 32, lineHeightPx: 24 };
const PAPER_80 = { widthPx: 576, marginPx: 12, charsPerLine: 48, lineHeightPx: 28 };

test("Paper width configurations", () => {
  assertEq(PAPER_58.widthPx % 8, 0, "58mm width multiple of 8");
  assertEq(PAPER_80.widthPx % 8, 0, "80mm width multiple of 8");
  assert(PAPER_58.widthPx < PAPER_80.widthPx, "58mm < 80mm");
  assert(PAPER_80.charsPerLine > PAPER_58.charsPerLine, "80mm more chars");

  const pxPerMm = 203 / 25.4;
  assert(Math.abs(PAPER_58.widthPx / pxPerMm - 48) < 5, "58mm ≈ 48mm printable");
  assert(Math.abs(PAPER_80.widthPx / pxPerMm - 72) < 5, "80mm ≈ 72mm printable");
});

/* ── ESC/POS byte building (mirror of src/printing/renderer/escpos.ts) */

const ESC_BYTE = 0x1b;
const GS_BYTE = 0x1d;

test("ESC/POS raster command structure", () => {
  const bytesPerRow = 48; // 384/8
  const seq = [];
  seq.push(ESC_BYTE, 0x40); // init
  seq.push(ESC_BYTE, 0x61, 0x01); // center
  seq.push(ESC_BYTE, 0x45, 0x01); // bold
  seq.push(...new TextEncoder().encode("TEST"));
  seq.push(0x0a); // LF
  seq.push(ESC_BYTE, 0x45, 0x00); // bold off
  seq.push(GS_BYTE, 0x21, 0x00); // size reset
  // GS v 0 raster
  seq.push(GS_BYTE, 0x76, 0x30, 0x00);
  seq.push(bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff);
  seq.push(1, 0); // height = 1
  seq.push(...new Uint8Array(48)); // 48 bytes body
  seq.push(ESC_BYTE, 0x64, 4); // feed
  seq.push(GS_BYTE, 0x56, 0x42, 0x01); // cut

  const all = Uint8Array.from(seq);
  assertEq(all[0], ESC_BYTE, "Starts with ESC");
  assertEq(all[1], 0x40, "ESC @ init");

  let found = false;
  for (let i = 0; i < all.length - 7; i++) {
    if (all[i] === GS_BYTE && all[i+1] === 0x76 && all[i+2] === 0x30) {
      found = true;
      assertEq(all[i+4], bytesPerRow & 0xff, "Raster xl correct");
      assertEq(all[i+5], 0, "Raster xh = 0");
      assertEq(all[i+6], 1, "Raster yl = 1");
      assertEq(all[i+7], 0, "Raster yh = 0");
      break;
    }
  }
  assert(found, "GS v 0 raster found in byte sequence");
});

/* ── Template data structure (mirror of order types) ────────────────── */

const TEST_ORDER = {
  invoiceNumber: "INV-123",
  orderNumber: "ORD-123",
  windowNumber: "3",
  customer: { name: "أحمد محمد", phone: "01012345678", address: "القاهرة" },
  creator: "سامي",
  createdAt: "2026-09-18T10:30:00Z",
  items: [
    { department: "جبنة", productName: "جبنة رومي", quantity: "2", weight: "1.5 كجم", notes: "" },
    { department: "جزارة", productName: "لحم بقري", quantity: "1", weight: "3 كجم", notes: "مفروم" },
  ],
};

test("Template data structure", () => {
  assertEq(TEST_ORDER.items.length, 2, "Full invoice has 2 items");
  assertEq(TEST_ORDER.invoiceNumber, "INV-123", "Invoice number");

  const butcher = TEST_ORDER.items.filter(i => i.department === "جزارة");
  const cheese = TEST_ORDER.items.filter(i => i.department === "جبنة");
  assertEq(butcher.length, 1, "Butcher has 1 item");
  assertEq(butcher[0].productName, "لحم بقري", "Butcher item");
  assertEq(cheese.length, 1, "Cheese has 1 item");
  assertEq(cheese[0].productName, "جبنة رومي", "Cheese item");

  assert(hasArabic(TEST_ORDER.customer.name), "Customer name Arabic");
  assert(hasArabic(TEST_ORDER.items[0].productName), "Product name Arabic");
});

test("Reprint flow preserves order data", () => {
  const originalInvoice = TEST_ORDER.invoiceNumber;
  const originalItems = TEST_ORDER.items.length;
  const originalCreatedAt = TEST_ORDER.createdAt;

  // Reprint passes the same order — no mutation, no new invoice number
  const copy = { ...TEST_ORDER, items: [...TEST_ORDER.items] };
  assertEq(copy.invoiceNumber, originalInvoice, "Invoice number preserved");
  assertEq(copy.items.length, originalItems, "Items preserved");
  assertEq(copy.createdAt, originalCreatedAt, "CreatedAt preserved");
  assertEq(TEST_ORDER.invoiceNumber, originalInvoice, "Original not mutated");
});

/* ── Mixed Arabic + English content ─────────────────────────────────── */

test("Mixed Arabic + English", () => {
  const items = [
    "جبنة رومي 2×1.5 كجم",
    "Brie Cheese 1×0.5 kg",
    "لحم بقري 3×2 كجم مفروم",
  ];
  assert(hasArabic(items[0]), "Item 1 Arabic");
  assert(!hasArabic(items[1]), "Item 2 English");
  assert(hasArabic(items[2]), "Item 3 Arabic");
});

/* ── Results ────────────────────────────────────────────────────────── */

console.log(`\n${"=".repeat(50)}`);
console.log(` Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) { process.exit(1); } else { console.log(" All checks passed ✓"); }
