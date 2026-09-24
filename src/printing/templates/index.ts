/**
 * Template registry & dispatcher.
 *
 * The single place that maps an invoice type ("full" | "butcher" | "cheese")
 * to its builder. All builders consume the centralized invoice
 * configuration (`src/printing/invoice/`), so changing the design never
 * touches this file.
 */

import type { Order } from "@/types";
import type { RasterBlock } from "@/printing/renderer/raster";
import type { InvoiceType } from "@/printing/invoice/invoice-layout";
import { buildFullInvoice } from "@/printing/templates/full-invoice";
import { buildButcherInvoice } from "@/printing/templates/butcher-invoice";
import { buildCheeseInvoice } from "@/printing/templates/cheese-invoice";
import { buildDepartmentInvoice } from "@/printing/templates/department";

export { buildFullInvoice } from "@/printing/templates/full-invoice";
export type { InvoiceBuildOptions } from "@/printing/templates/full-invoice";
export { buildButcherInvoice, BUTCHER_DEPARTMENT } from "@/printing/templates/butcher-invoice";
export { buildCheeseInvoice, CHEESE_DEPARTMENT } from "@/printing/templates/cheese-invoice";
export { buildDepartmentInvoice } from "@/printing/templates/department";
export { composeInvoice } from "@/printing/templates/compose";
export type { TemplateContext } from "@/printing/templates/shared";

/** Build any invoice type from an order. */
export function buildInvoice(type: InvoiceType, order: Order): RasterBlock[] {
  switch (type) {
    case "butcher":
      return buildButcherInvoice(order);
    case "cheese":
      return buildCheeseInvoice(order);
    case "full":
    default:
      return buildFullInvoice(order);
  }
}

/**
 * Legacy aliases kept for backward compatibility with older call sites that
 * imported `fullInvoiceBlocks` / `departmentBlocks`.
 */
export const fullInvoiceBlocks = (order: Order): RasterBlock[] =>
  buildFullInvoice(order);

export const departmentBlocks = (
  order: Order,
  department: string
): RasterBlock[] => buildDepartmentInvoice(order, department);