/**
 * Raster image conversion for ESC/POS printers.
 *
 * Converts a RGBA bitmap (or ImageData) into a 1-bit-per-pixel,
 * column-oriented bit stream that thermal printers print as raster.
 * A pixel is ON when its luminance is below the threshold.
 */

export interface RasterOptions {
  /** Dithering/scaling is intentionally NOT implemented — kept simple. */
  threshold?: number; // 0..255, default 128
}

/**
 * Convert RGBA bytes (4 bytes per pixel, row-major, `width * height`)
 * into a monochrome bitmap. Returns `1` for dark pixels, `0` for light.
 */
export function imageDataToBitmap(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 128
): Uint8Array {
  const bytesPerPixel = 4;
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * bytesPerPixel;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    // Perceptual luminance
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    out[i] = lum < threshold ? 1 : 0;
  }
  return out;
}

/**
 * Pack a monochrome bitmap (values 0/1) into 1bpp bytes ordered as
 * ESC/POS raster data (each byte holds 8 pixels of a single row,
 * MSB = leftmost pixel).
 */
export function bitmapToBytes(bitmap: Uint8Array, width: number): Uint8Array {
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

/**
 * Convert a full RGBA image into a ready-to-print ESC/POS raster payload.
 * Returns { bits: bytes, width, height }.
 */
export function convertImageToRaster(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: RasterOptions = {}
): { bits: Uint8Array; width: number; height: number } {
  const threshold = options.threshold ?? 128;
  const bmp = imageDataToBitmap(rgba, width, height, threshold);
  const bits = bitmapToBytes(bmp, width);
  return { bits, width, height };
}