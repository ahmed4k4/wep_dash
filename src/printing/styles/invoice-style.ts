/**
 * Central invoice visual style configuration.
 *
 * Changing the receipt design should NEVER require touching networking
 * or printer communication code — only edit values in this file (or
 * pass an override) and the templates/renderer will follow.
 */

import type { PaperWidth } from "@/printing/config/paper";

/** Separator style variants: dashed, solid, double, none */
export type SeparatorStyle = "dashed" | "solid" | "double" | "none";

export interface InvoiceStyle {
  // ---- Shop identity ----
  shopName: string;
  shopSubtitle: string;
  showLogo: boolean;
  logoSizePx: number; // vertical logo height when rendered as image

  // ---- Paper ----
  paperWidth: PaperWidth;

  // ---- Typography ----
  headerFontSize: number;
  titleFontSize: number;
  bodyFontSize: number;
  smallFontSize: number;
  lineSpacing: number; // multiplier applied to each line height
  sectionSpacing: number; // vertical gap between sections
  itemSpacing: number; // vertical gap inside an item block

  // ---- RTL / alignment ----
  fontFamily: string; // bundled Arabic-capable font (e.g. Noto Sans Arabic)
  rtl: boolean;

  // ---- Which fields to show ----
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

  // ---- Footer ----
  footerText: string;
  showFooter: boolean;

  // ---- Graphics ----
  separatorStyle: SeparatorStyle;
}

export const DEFAULT_INVOICE_STYLE: InvoiceStyle = {
  shopName: "محل الجبنة والجزارة",
  shopSubtitle: "SALES INVOICE",
  showLogo: false,
  logoSizePx: 56,

  paperWidth: "58mm",

  headerFontSize: 18,
  titleFontSize: 15,
  bodyFontSize: 12,
  smallFontSize: 10,
  lineSpacing: 1.25,
  sectionSpacing: 10,
  itemSpacing: 4,

  fontFamily: "NotoSansArabic",
  rtl: true,

  showCustomer: true,
  showPhone: true,
  showAddress: true,
  showNotes: true,
  showInvoiceNumber: true,
  showDate: true,
  showTime: true,
  showDepartment: true,
  showUnitPrice: false, // existing data has no unit price — kept false by default
  showQuantity: true,
  showWeight: true,
  showSubtotal: true,
  showDiscount: false,
  showTotal: true,
  showWindowNumber: true,
  showCreator: false,

  footerText: "شكراً لتعاملكم معنا",
  showFooter: true,

  separatorStyle: "dashed",
};