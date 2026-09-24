/**
 * Backward-compatibility bridge for the legacy `InvoiceStyle` shape.
 *
 * IMPORTANT: This is NOT a second source of truth. It DERIVES its values
 * from the centralized configuration in `@/printing/invoice`. Edit the
 * invoice design there — never here.
 *
 * The legacy flat `InvoiceStyle` is kept only so older imports keep
 * type-checking. New code should use `InvoiceConfig` / `INVOICE_CONFIG`.
 */

import type { PaperWidth } from "@/printing/config/paper";
import { INVOICE_CONFIG } from "@/printing/invoice/invoice-config";
import { INVOICE_CONTENT } from "@/printing/invoice/invoice-content";
import type { SeparatorStyle } from "@/printing/invoice/invoice-types";

export type { SeparatorStyle } from "@/printing/invoice/invoice-types";

/** Legacy flat style shape (derived, read-only by convention). */
export interface InvoiceStyle {
  shopName: string;
  shopSubtitle: string;
  showLogo: boolean;
  logoSizePx: number;

  paperWidth: PaperWidth;

  headerFontSize: number;
  titleFontSize: number;
  bodyFontSize: number;
  smallFontSize: number;
  lineSpacing: number;
  sectionSpacing: number;
  itemSpacing: number;

  fontFamily: string;
  rtl: boolean;

  showCustomer: boolean;
  showPhone: boolean;
  showAddress: boolean;
  showNotes: boolean;
  showInvoiceNumber: boolean;
  showDate: boolean;
  showTime: boolean;
  showDepartment: boolean;
  showUnitPrice: boolean;
  showQuantity: boolean;
  showWeight: boolean;
  showSubtotal: boolean;
  showDiscount: boolean;
  showTotal: boolean;
  showWindowNumber: boolean;
  showCreator: boolean;

  footerText: string;
  showFooter: boolean;

  separatorStyle: SeparatorStyle;
}

/** Derive the legacy flat style from the centralized configuration. */
export function toLegacyInvoiceStyle(): InvoiceStyle {
  const { shop, paper, typography, spacing, visibility, separators, footer } =
    INVOICE_CONFIG;
  return {
    shopName: shop.name,
    shopSubtitle: shop.subtitle,
    showLogo: shop.logoEnabled,
    logoSizePx: shop.logoSizePx,

    paperWidth: paper.width,

    headerFontSize: typography.headerSize,
    titleFontSize: typography.titleSize,
    bodyFontSize: typography.bodySize,
    smallFontSize: typography.smallSize,
    lineSpacing: typography.lineHeight,
    sectionSpacing: spacing.sections,
    itemSpacing: spacing.rows,

    fontFamily: typography.fontFamily,
    rtl: true,

    showCustomer: visibility.customer,
    showPhone: visibility.phone,
    showAddress: visibility.address,
    showNotes: visibility.notes,
    showInvoiceNumber: visibility.invoiceNumber,
    showDate: visibility.date,
    showTime: visibility.time,
    showDepartment: visibility.department,
    showUnitPrice: visibility.unitPrice,
    showQuantity: visibility.quantity,
    showWeight: visibility.weight,
    showSubtotal: visibility.subtotal,
    showDiscount: visibility.discount,
    showTotal: visibility.total,
    showWindowNumber: visibility.windowNumber,
    showCreator: visibility.creator,

    footerText: footer.text || INVOICE_CONTENT.title,
    showFooter: footer.enabled && visibility.footer,

    separatorStyle: separators.style,
  };
}

/** @deprecated Use INVOICE_CONFIG from `@/printing/invoice` instead. */
export const DEFAULT_INVOICE_STYLE: InvoiceStyle = toLegacyInvoiceStyle();