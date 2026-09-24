/**
 * Generic department invoice builder.
 *
 * Builds a receipt for ANY department (butcher, cheese, or future ones).
 * Known departments (جزارة / جبنة) get their specific overrides via
 * `resolveInvoiceConfigForDepartment`; unknown departments use the global
 * configuration. Pure - no I/O.
 */

import type { Order } from "@/types";
import type { RasterBlock } from "@/printing/renderer/raster";
import { resolveInvoiceConfigForDepartment } from "@/printing/invoice/invoice-config";
import { INVOICE_CONTENT } from "@/printing/invoice/invoice-content";
import { DEPARTMENT_INVOICE_LAYOUT } from "@/printing/invoice/invoice-layout";
import { composeInvoice } from "@/printing/templates/compose";
import type { TemplateContext } from "@/printing/templates/shared";

/**
 * Build a department-only receipt (only the items belonging to
 * `department`). The department name is used as the receipt title.
 */
export function buildDepartmentInvoice(
  order: Order,
  department: string
): RasterBlock[] {
  const config = resolveInvoiceConfigForDepartment(department);
  const ctx: TemplateContext = {
    order,
    config,
    content: INVOICE_CONTENT,
    department,
    title: department || config.shop.subtitle || INVOICE_CONTENT.title,
  };
  return composeInvoice(DEPARTMENT_INVOICE_LAYOUT, ctx);
}