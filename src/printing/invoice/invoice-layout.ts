/**
 * Invoice LAYOUT - the ordered list of sections for each invoice type.
 *
 * Reordering sections should be as simple as reordering this array; no
 * renderer changes are required. Each section id maps to a builder in
 * `src/printing/templates/*`.
 *
 * These layouts are pure data. `TEMPLATE_LAYOUTS.full` is used by the full
 * invoice; `butcher` / `cheese` are used for department receipts.
 */

import type { InvoiceSectionId } from "@/printing/invoice/invoice-types";

export type InvoiceType = "full" | "butcher" | "cheese";

/**
 * Full invoice: shop header, the invoice title, meta rows, customer, the
 * department-grouped items, then totals/notes and finally the footer.
 */
export const FULL_INVOICE_LAYOUT: InvoiceSectionId[] = [
  "header",
  "title",
  "invoiceMeta",
  "customer",
  "items",
  "totals",
  "notes",
  "footer",
];

/**
 * Department invoice (butcher/cheese): header, department heading as the
 * title, meta + customer, department items, then footer.
 */
export const DEPARTMENT_INVOICE_LAYOUT: InvoiceSectionId[] = [
  "header",
  "title",
  "invoiceMeta",
  "customer",
  "items",
  "notes",
  "totals",
  "footer",
];

export const TEMPLATE_LAYOUTS: Record<InvoiceType, InvoiceSectionId[]> = {
  full: FULL_INVOICE_LAYOUT,
  butcher: DEPARTMENT_INVOICE_LAYOUT,
  cheese: DEPARTMENT_INVOICE_LAYOUT,
};

export function getLayout(type: InvoiceType): InvoiceSectionId[] {
  return TEMPLATE_LAYOUTS[type] ?? FULL_INVOICE_LAYOUT;
}