/**
 * Pure ESC/POS command builder (Node-safe, no DOM).
 *
 * Produces the raw byte sequence sent to thermal printers. The invoice
 * body is rasterised in the browser (Canvas) as a 1bpp bitmap and sent
 * via the GS v 0 raster command for pixel-perfect Arabic. The header and
 * footer use native ESC/POS text commands for common Latin/Numbers.
 */

export const ESC = 0x1b;
export const GS = 0x1d;

export interface EscposTextLine {
  text: string;
  weight?: "normal" | "bold" | "double";
  align?: "left" | "center" | "right";
}

export interface RasterRenderInput {
  header: EscposTextLine[];
  body: { bits: Uint8Array; width: number; height: number };
  footer: EscposTextLine[];
  cut: boolean;
  feedLines: number;
  dotsPerLine: number;
}

export function byte(n: number): number {
  return n & 0xff;
}

/**
 * Build the complete ESC/POS byte sequence for a receipt.
 * Order: init → header text → raster body → footer text → feed → cut.
 */
export function buildRasterJob(input: RasterRenderInput): Uint8Array {
  const parts: Uint8Array[] = [];

  parts.push(Uint8Array.from([ESC, 0x40])); // ESC @ initialize printer

  // --- Header (native text, Latin/numbers typically) ---
  for (const line of input.header) {
    parts.push(escposTextLine(line));
  }

  // --- Body: GS v 0 monochrome bitmap ---
  const { bits, width, height } = input.body;
  const bytesPerRow = Math.ceil(width / 8);
  const command = new Uint8Array(8);
  command[0] = GS;
  command[1] = 0x76;
  command[2] = 0x30;
  command[3] = 0; // mode: normal 1:1
  command[4] = byte(bytesPerRow);
  command[5] = byte(bytesPerRow >> 8);
  command[6] = byte(height);
  command[7] = byte(height >> 8);

  parts.push(command);
  parts.push(bits);

  // --- Footer ---
  for (const line of input.footer) {
    parts.push(escposTextLine(line));
  }

  // --- Feed + cut ---
  if (input.feedLines > 0) {
    const feed = input.feedLines & 0xff;
    parts.push(Uint8Array.from([ESC, 0x64, feed])); // ESC d n — feed n lines
  }
  if (input.cut) {
    parts.push(Uint8Array.from([GS, 0x56, 0x42, 0x01])); // GS V B 1 — partial cut
  }

  return concatBytes(parts);
}

/** Encode a single text line with alignment and emphasis. */
export function escposTextLine(line: EscposTextLine): Uint8Array {
  const chunks: Uint8Array[] = [];

  switch (line.align) {
    case "center":
      chunks.push(Uint8Array.from([ESC, 0x61, 0x01])); // ESC a 1
      break;
    case "right":
      chunks.push(Uint8Array.from([ESC, 0x61, 0x02])); // ESC a 2
      break;
    default:
      chunks.push(Uint8Array.from([ESC, 0x61, 0x00])); // left
  }

  if (line.weight === "bold") {
    chunks.push(Uint8Array.from([ESC, 0x45, 0x01])); // ESC E 1
  } else if (line.weight === "double") {
    chunks.push(Uint8Array.from([GS, 0x21, 0x11])); // GS ! 0x11 double size
  }

  // Encode as UTF-8.
  const textBytes = new TextEncoder().encode(line.text);
  chunks.push(textBytes);

  chunks.push(Uint8Array.from([0x0a])); // LF
  chunks.push(Uint8Array.from([ESC, 0x45, 0x00])); // reset emphasis
  chunks.push(Uint8Array.from([GS, 0x21, 0x00])); // reset char size

  return concatBytes(chunks);
}

/** Concatenate byte arrays efficiently. */
export function concatBytes(arrays: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}