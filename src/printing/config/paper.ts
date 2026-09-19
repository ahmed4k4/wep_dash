/**
 * Paper width configuration for thermal receipt printers.
 *
 * All invoice layout dimensions derive from these values so there are
 * no magic numbers sprinkled across the templates.
 */

export type PaperWidth = "58mm" | "80mm";

export interface PaperConfig {
  /** Canonical paper identifier, e.g. "58mm" */
  id: PaperWidth;
  /** Physical paper width in millimetres */
  widthMm: number;
  /**
   * Printable raster width in pixels at the target DPI.
   * ESC/POS raster (GS v 0) requires a width that is a multiple of 8.
   */
  widthPx: number;
  /** DPI used when rasterising the receipt */
  dpi: number;
  /** Left/right margin (in printable pixels) applied by the renderer */
  marginPx: number;
  /**
   * Approximate reference width in "characters" used for legacy text
   * fallbacks and preview only. Not used for raster layout.
   */
  charsPerLine: number;
  /** Number of vertical pixels per text line, used for spacing math */
  lineHeightPx: number;
}

export const PAPER_CONFIGS: Record<PaperWidth, PaperConfig> = {
  "58mm": {
    id: "58mm",
    widthMm: 58,
    widthPx: 384, // 58mm @ ~203dpi ≈ 384px; multiple of 8 ✓
    dpi: 203,
    marginPx: 8,
    charsPerLine: 32,
    lineHeightPx: 24,
  },
  "80mm": {
    id: "80mm",
    widthMm: 80,
    widthPx: 576, // 80mm @ ~203dpi ≈ 576px; multiple of 8 ✓
    dpi: 203,
    marginPx: 12,
    charsPerLine: 48,
    lineHeightPx: 28,
  },
};

/** Get a paper config, defaulting to 58mm when the width is unsupported. */
export function getPaperConfig(width: PaperWidth): PaperConfig {
  return PAPER_CONFIGS[width] ?? PAPER_CONFIGS["58mm"];
}