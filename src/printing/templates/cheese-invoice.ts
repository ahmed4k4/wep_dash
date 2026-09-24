/**
 * Cheese (جبنة) invoice template.
 *
 * Uses the SAME centralized configuration system as the full invoice, but
 * applies ONLY the cheese-specific overrides (see CHEESE_INVOICE_CONFIG in
 * `src/printing/invoice/invoice-config.ts`). Nothing is duplicated -
 * everything else is inherited from the global config.
 */

import type { Order } from "@/types";
import type { RasterBlock } from "@/printing/renderer/raster";
import {
  CHEESE_INVOICE_CONFIG,
  resolveInvoiceConfig,
} from "@/printing/invoice/invoice-config";
import { INVOICE_CONTENT } from "@/printing/invoice/invoice-content";
import { DEPARTMENT_INVOICE_LAYOUT } from "@/printing/invoice/invoice-layout";
import { composeInvoice } from "@/printing/templates/compose";
import type { TemplateContext } from "@/printing/templates/shared";

export const CHEESE_DEPARTMENT = "جبنة";

/** Build the cheese receipt (only cheese items). */
export function buildCheeseInvoice(order: Order): RasterBlock[] {
  const config = resolveInvoiceConfig(CHEESE_INVOICE_CONFIG);
  const ctx: TemplateContext = {
    order,
    config,
    content: INVOICE_CONTENT,
    department: CHEESE_DEPARTMENT,
    title: config.shop.subtitle || INVOICE_CONTENT.title,
  };
  return composeInvoice(DEPARTMENT_INVOICE_LAYOUT, ctx);
}