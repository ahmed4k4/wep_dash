/**
 * Canvas-based raster renderer for ESC/POS receipts.
 *
 * Draws the styled invoice — Arabic text with native shaping/RTL via the
 * bundled Noto Sans Arabic font — onto an offscreen canvas, converts it
 * into a 1bpp monochrome bitmap, and trims trailing white rows so the
 * receipt stays compact.
 */

import { loadArabicFont, makeFontString } from "@/printing/renderer/font-loader";
import { wrapText } from "@/printing/renderer/text";
import { convertImageToRaster } from "@/printing/renderer/image";

export interface RasterLine {
  /** Free text. When `cells` is set, `text` is ignored. */
  text?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  size?: number; // px (device px when scale=1 is used by print pipeline)
  /**
   * Two-column row: label on the RIGHT, value on the LEFT — the classic
   * Arabic receipt layout. Both are drawn on a single baseline, padded
   * with spaces so they span the printable width.
   */
  cells?: { label: string; value: string };
}

export interface RasterBlock {
  lines: RasterLine[];
  spacing?: number;
  marginTop?: number;
  marginBottom?: number;
}

export interface RasterizeOptions {
  widthPx: number;
  scale: number; // device pixels per CSS px (e.g. 8 @ 203dpi)
  blocks: RasterBlock[];
  renderHeight: number;
  trimWhitespace?: boolean;
  bgColor?: string;
  fgColor?: string;
}

export interface RasterizeResult {
  bits: Uint8Array; // monochrome bitmap, 1 = dark
  width: number;
  height: number;
  rawHeight: number;
}

/**
 * Render blocks to an offscreen canvas and return the 1bpp bitmap.
 * In Node (no Canvas) returns a 1x1 placeholder so imports/tests don't crash.
 */
export async function rasterizeBlocks(
  options: RasterizeOptions
): Promise<RasterizeResult> {
  await loadArabicFont();

  if (typeof document === "undefined") {
    return { bits: Uint8Array.from([0]), width: 1, height: 1, rawHeight: 1 };
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { bits: Uint8Array.from([0]), width: 1, height: 1, rawHeight: 1 };
  }

  const innerW = Math.round(options.widthPx * options.scale);
  canvas.width = innerW;
  canvas.height = options.renderHeight;
  ctx.fillStyle = options.bgColor ?? "#ffffff";
  ctx.fillRect(0, 0, innerW, options.renderHeight);
  ctx.fillStyle = options.fgColor ?? "#000000";

  const xInset = Math.round(0.05 * innerW);
  const maxTextW = innerW - xInset * 2;
  const lineStep = (size: number) => Math.round(size * options.scale * 1.25);
  let cursorY = 0;

  for (const block of options.blocks) {
    cursorY += Math.round((block.marginTop ?? 0) * options.scale);
    for (const line of block.lines) {
      const sizePx = (line.size ?? 12) * options.scale;
      ctx.font = makeFontString(line.bold ? 700 : 400, sizePx);
      ctx.textBaseline = "top";
      ctx.direction = "rtl";

      const wrapped = wrapText(line.text ?? "", {
        maxWidth: maxTextW,
        measure: (t) => ctx.measureText(t),
      });

      // Two-column RTL row — label right-aligned, value left-aligned,
      // both on the same baseline (robust across Arabic shaping).
      if (line.cells) {
        ctx.save();
        ctx.textAlign = "right";
        ctx.fillText(line.cells.label, innerW - xInset, cursorY, maxTextW * 0.55);
        ctx.textAlign = "left";
        ctx.fillText(line.cells.value, xInset, cursorY, maxTextW * 0.55);
        ctx.restore();
        cursorY += lineStep(line.size ?? 12);
        continue;
      }

      for (const sub of wrapped) {
        ctx.save();
        if (line.align === "center") {
          ctx.textAlign = "center";
          ctx.fillText(sub, innerW / 2, cursorY, maxTextW);
        } else if (line.align === "right") {
          ctx.textAlign = "right";
          ctx.fillText(sub, innerW - xInset, cursorY, maxTextW);
        } else {
          ctx.textAlign = "left";
          ctx.fillText(sub, xInset, cursorY, maxTextW);
        }
        ctx.restore();
        cursorY += lineStep(line.size ?? 12);
      }
      cursorY += Math.round((block.spacing ?? 0) * options.scale);
    }
    cursorY += Math.round((block.marginBottom ?? 0) * options.scale);
  }

  const imageData = ctx.getImageData(0, 0, innerW, options.renderHeight);
  const { bits, width, height } = convertImageToRaster(
    imageData.data,
    innerW,
    options.renderHeight
  );

  let lastRow = height - 1;
  if (options.trimWhitespace !== false) {
    const bytesPerRow = Math.ceil(width / 8);
    while (lastRow >= 0) {
      let nonwhite = false;
      for (let x = 0; x < bytesPerRow; x++) {
        if (bits[lastRow * bytesPerRow + x] !== 0) {
          nonwhite = true;
          break;
        }
      }
      if (nonwhite) break;
      lastRow--;
    }
  }

  const trimmed = bits.slice(0, (lastRow + 1) * Math.ceil(width / 8));
  return { bits: trimmed, width, height: lastRow + 1, rawHeight: options.renderHeight };
}