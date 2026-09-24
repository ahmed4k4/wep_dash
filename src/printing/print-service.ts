"use client";

/**
 * Print service — orchestrates the whole raster pipeline:
 *   Order + printer assignment → template blocks → 1bpp bitmap → ESC/POS
 * returns same shape as legacy `generateAllPrintJobs` ({ printerId, data })
 * so print-client.ts keeps working with only `await`.
 *
 * The invoice DESIGN comes entirely from the centralized configuration in
 * `src/printing/invoice/`. This service only: builds blocks (templates),
 * rasterises them (Canvas), and encodes ESC/POS raster (GS v 0). It must
 * not contain design literals.
 */

import type { Order, Printer, DepartmentName } from "@/types";
import { buildFullInvoice, buildDepartmentInvoice } from "@/printing/templates";
import type { RasterBlock } from "@/printing/renderer/raster";
import { rasterizeBlocks } from "@/printing/renderer/raster";
import { buildRasterJob } from "@/printing/renderer/escpos";
import { getPaperConfig, PAPER_CONFIGS } from "@/printing/config/paper";
import {
  INVOICE_CONFIG,
  resolveInvoiceConfig,
} from "@/printing/invoice/invoice-config";
import type { InvoiceConfigOverride } from "@/printing/invoice/invoice-types";

export interface PrintConfig {
  shopName?: string;
  shopAddress?: string;
  shopPhone?: string;
  /** Optional deep override merged onto the centralized invoice config. */
  invoiceOverride?: InvoiceConfigOverride;
  /** Optional paper width override ("58mm" | "80mm"). */
  paperWidth?: "58mm" | "80mm";
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

/**
 * Build the effective invoice override from the (legacy) PrintConfig so
 * existing callers that pass `shopName` keep working — they now simply
 * override the centralized config's shop name.
 */
function buildOverride(config: PrintConfig): InvoiceConfigOverride | undefined {
  const override: InvoiceConfigOverride = {};
  const shop: InvoiceConfigOverride["shop"] = {};
  if (config.shopName) shop.name = config.shopName;
  if (config.shopAddress) shop.address = config.shopAddress;
  if (config.shopPhone) shop.phone = config.shopPhone;
  if (Object.keys(shop).length) override.shop = shop;
  if (config.paperWidth) {
    override.paper = {
      width: config.paperWidth,
      marginPx: PAPER_CONFIGS[config.paperWidth].marginPx,
    };
  }
  if (config.invoiceOverride) {
    return deepMergeOverride(override, config.invoiceOverride);
  }
  return Object.keys(override).length ? override : undefined;
}

function deepMergeOverride(
  a: InvoiceConfigOverride,
  b: InvoiceConfigOverride
): InvoiceConfigOverride {
  const out: InvoiceConfigOverride = { ...a };
  for (const k of Object.keys(b) as (keyof InvoiceConfigOverride)[]) {
    const bv = b[k];
    const av = out[k];
    if (
      bv && typeof bv === "object" && !Array.isArray(bv) &&
      av && typeof av === "object" && !Array.isArray(av)
    ) {
      out[k] = deepMergeOverride(
        av as InvoiceConfigOverride,
        bv as InvoiceConfigOverride
      ) as never;
    } else {
      out[k] = bv as never;
    }
  }
  return out;
}

export async function generateAllPrintJobs(
  order: Order,
  printers: Map<string, Printer>,
  departmentPrinterMap: Map<DepartmentName, string>,
  config: PrintConfig
): Promise<RenderedJob[]> {
  const override = buildOverride(config);
  const resolved = resolveInvoiceConfig(override);
  const paperWidth = resolved.paper.width;
  const jobs: RenderedJob[] = [];

  // Department jobs
  for (const item of order.items) {
    const dept = item.department || "";
    if (!dept) continue;
    const printerId = departmentPrinterMap.get(dept);
    const printer = printerId ? printers.get(printerId) : undefined;
    if (!printer) continue;
    const bytes = await renderToEscpos(buildDepartmentInvoice(order, dept), paperWidth);
    jobs.push({ printerId: printer.id, data: bytesToBinaryString(bytes) });
  }

  // Full invoice
  const full = Array.from(printers.values()).find((p) => p.isFullInvoicePrinter);
  if (full) {
    const bytes = await renderToEscpos(buildFullInvoice(order), paperWidth);
    jobs.push({ printerId: full.id, data: bytesToBinaryString(bytes) });
  }

  return jobs;
}

/** Expose the effective paper width (used by callers/preview). */
export function currentPaperWidth(): "58mm" | "80mm" {
  return INVOICE_CONFIG.paper.width;
}