/**
 * Full invoice template - all departments in one receipt.
 *
 * Consumes the centralized invoice configuration + content and the FULL
 * layout. Change the design in `src/printing/invoice/*`, not here.
 */

import type { Order } from "@/types";
import type { RasterBlock } from "@/printing/renderer/raster";
import {
  resolveInvoiceConfig,
} from "@/printing/invoice/invoice-config";
import {
  INVOICE_CONTENT,
  type InvoiceContent,
} from "@/printing/invoice/invoice-content";
import { FULL_INVOICE_LAYOUT } from "@/printing/invoice/invoice-layout";
import type {
  InvoiceConfig,
  InvoiceConfigOverride,
} from "@/printing/invoice/invoice-types";
import { composeInvoice } from "@/printing/templates/compose";
import type { TemplateContext } from "@/printing/templates/shared";

export interface InvoiceBuildOptions {
  /** Fully-resolved config (highest priority). */
  config?: InvoiceConfig;
  /** Content override (words/labels). */
  content?: InvoiceContent;
  /** Partial override merged onto the global config. */
  override?: InvoiceConfigOverride;
}

/** Build the full invoice as raster blocks. */
export function buildFullInvoice(
  order: Order,
  options: InvoiceBuildOptions = {}
): RasterBlock[] {
  const config = options.config ?? resolveInvoiceConfig(options.override);
  const ctx: TemplateContext = {
    order,
    config,
    content: options.content ?? INVOICE_CONTENT,
  };
  return composeInvoice(FULL_INVOICE_LAYOUT, ctx);
}