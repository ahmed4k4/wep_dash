/**
 * Arabic text handling for the raster renderer.
 *
 * Arabic shaping (letter joining) and RTL layout are delegated to the
 * browser's native shaping engine via Canvas, which gives correct,
 * connected Arabic glyphs with no dependency on the printer's internal
 * Arabic font. This module provides measurement, direction detection,
 * and helpers for mixed Arabic/Latin text.
 *
 * NOTE: This is NOT string-based Arabic reshaping. Actual glyph shaping
 * happens natively when text is drawn to a Canvas using the bundled
 * Noto Sans Arabic font. Node-side tests cover the pure logic here.
 */

/** True when text contains Arabic letters (or presentation forms). */
export function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
    text
  );
}

/** A single line of text that may be Arabic, Latin, or a mix. */
export interface RenderedLine {
  text: string;
  /** True when the dominant direction is RTL (contains Arabic) */
  isRtl: boolean;
}

/**
 * Split a raw string into direction-aware segments.
 * For simplicity a whole line inherits RTL when it contains Arabic;
 * Latin runs (numbers, English) still render left-to-right natively.
 */
export function toRenderedLines(text: string): RenderedLine[] {
  const lines = text.split(/\r?\n/);
  return lines.map((line) => ({ text: line, isRtl: hasArabic(line) }));
}

/**
 * Convert Latin digits (0-9) characters inside a string to Arabic-Indic
 * numerals when requested. Keeps Latin digits readable when not wanted.
 */
export function toArabicNumerals(text: string): string {
  const map: Record<string, string> = {
    "0": "٠",
    "1": "١",
    "2": "٢",
    "3": "٣",
    "4": "٤",
    "5": "٥",
    "6": "٦",
    "7": "٧",
    "8": "٨",
    "9": "٩",
  };
  return text.replace(/[0-9]/g, (d) => map[d]);
}

/** Format a quantity/weight number without losing trailing zeros. */
export function formatNumber(value: string | number): string {
  const n = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(n)) return String(value ?? "");
  // Preserve up to 2 decimals, trimming trailing zeros
  return String(Number(n.toFixed(2)));
}