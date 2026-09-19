"use client";

/**
 * Print service — orchestrates the whole raster pipeline:
 *   Order + printer assignment → template blocks → 1bpp bitmap → ESC/POS
 * returns same shape as legacy `generateAllPrintJobs` ({ printerId, data })
 * so print-client.ts keeps working with only `await`.
 */

import type { Order, Printer, DepartmentName } from "@/types";
import { fullInvoiceBlocks, departmentBlocks } from "@/printing/templates";
import type { RasterBlock } from "@/printing/renderer/raster";
import { rasterizeBlocks } from "@/printing/renderer/raster";
import { buildRasterJob } from "@/printing/renderer/escpos";
import { getPaperConfig } from "@/printing/config/paper";
import { DEFAULT_INVOICE_STYLE } from "@/printing/styles/invoice-style";

export interface PrintConfig {
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
}

export type PrintJob = RenderedJob;

export interface RenderedJob {
  printerId: string;
  data: string;
}

/** Convert byte[] → binary string (NULL bytes preserved for transport). */
function bytesToBinaryString(bytes: Uint8Array): string {
  let out = "";
  const step = 8192;
  for (let i = 0; i < bytes.length; i += step) {
    out += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return out;
}

/** Rough height estimate; rasterizer trims trailing white afterward. */
function estimateHeight(blocks: RasterBlock[], lineHeight: number): number {
  let total = 0;
  for (const b of blocks) {
    total += Math.max(0, (b.marginTop ?? 0) + (b.marginBottom ?? 0));
    for (const l of b.lines) total += Math.max(1, Math.ceil((l.size ?? 12) * 1.25) + (b.spacing ?? 0));
  }
  return Math.max(32, Math.ceil(total) * lineHeight);
}

async function renderToEscpos(
  blocks: RasterBlock[],
  paperWidth: "58mm" | "80mm"
): Promise<Uint8Array> {
  const paper = getPaperConfig(paperWidth);
  const meta = await rasterizeBlocks({
    widthPx: paper.widthPx,
    scale: 1,
    blocks,
    renderHeight: estimateHeight(blocks, paper.lineHeightPx),
  });
  return buildRasterJob({
    header: [],
    body: meta,
    footer: [],
    cut: true,
    feedLines: 4,
    dotsPerLine: paper.widthPx,
  });
}

export async function generateAllPrintJobs(
  order: Order,
  printers: Map<string, Printer>,
  departmentPrinterMap: Map<DepartmentName, string>,
  config: PrintConfig
): Promise<RenderedJob[]> {
  const style = {
    ...DEFAULT_INVOICE_STYLE,
    shopName: config.shopName || DEFAULT_INVOICE_STYLE.shopName,
  };
  const jobs: RenderedJob[] = [];

  // Department jobs
  for (const item of order.items) {
    const dept = item.department || "";
    if (!dept) continue;
    const printerId = departmentPrinterMap.get(dept);
    const printer = printerId ? printers.get(printerId) : undefined;
    if (!printer) continue;
    const bytes = await renderToEscpos(departmentBlocks(order, dept, style), style.paperWidth);
    jobs.push({ printerId: printer.id, data: bytesToBinaryString(bytes) });
  }

  // Full invoice
  const full = Array.from(printers.values()).find((p) => p.isFullInvoicePrinter);
  if (full) {
    const bytes = await renderToEscpos(fullInvoiceBlocks(order, style), style.paperWidth);
    jobs.push({ printerId: full.id, data: bytesToBinaryString(bytes) });
  }

  return jobs;
}