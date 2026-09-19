/**
 * Font loading for the raster renderer.
 *
 * Registers the bundled Noto Sans Arabic font (TrueType, variable) with
 * the browser's FontFace API so Canvas rasterisation uses proper Arabic
 * shaping and RTL layout natively. No internet or printer font needed.
 */

export const ARABIC_FONT_FAMILY = "NotoSansArabic";

export function makeFontString(
  weight: number,
  sizePx: number,
  family: string = ARABIC_FONT_FAMILY
): string {
  return `${weight} ${sizePx}px ${family}, "Segoe UI", Arial, sans-serif`;
}

let fontLoadPromise: Promise<void> | null = null;

/**
 * Load and register the bundled Arabic font. Safe to call multiple times.
 * Resolves once loaded; never rejects — falls back to system fonts if
 * the font file is missing or the API is unavailable.
 */
export function loadArabicFont(): Promise<void> {
  if (fontLoadPromise) return fontLoadPromise;

  const fontUrl = "/fonts/NotoSansArabic.ttf";

  fontLoadPromise = new Promise((resolve) => {
    try {
      if (typeof document === "undefined") {
        resolve();
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const F = (globalThis as any).FontFace;
      if (!F) {
        resolve();
        return;
      }
      const font = new F(ARABIC_FONT_FAMILY, `url(${fontUrl})`);
      font
        .load()
        .then(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (document as any).fonts.add(font);
          resolve();
        })
        .catch(() => resolve());
    } catch {
      resolve();
    }
  });

  return fontLoadPromise;
}
