/**
 * Legacy entry-point that callers import as `@/lib/printing`.
 *
 * IMPORTANT: This file MUST re-export the raster pipeline from
 * `@/printing/print-service`. TypeScript/Node resolution gives this `.ts`
 * file priority over the sibling directory `src/lib/printing/index.ts`, so if
 * this file contained the OLD raw-UTF-8-as-ESC/POS-text implementation, the
 * printer would receive mojibake instead of a raster image.
 *
 * The production pipeline is:
 *   Order data → template → Canvas raster renderer (Noto Sans Arabic,
 *   native glyph shaping + RTL) → ESC/POS GS v 0 raster command → local
 *   print server (byte-preserving) → USB/TCP printer.
 */
export { generateAllPrintJobs } from "@/printing/print-service";
export type { PrintConfig, PrintJob } from "@/printing/print-service";