/**
 * Invoice configuration types.
 *
 * This is the SINGLE SOURCE OF TRUTH for invoice appearance & content.
 * Everything a developer needs to change about the receipt design is
 * expressed through these types and the values in `invoice-config.ts`.
 *
 * Design principle (mandatory):
 *   CONTENT  (what words appear)  -> invoice-content.ts
 *   STYLE    (fonts/spacing/...)  -> InvoiceConfig (typography/spacing/...)
 *   LAYOUT   (section order)      -> invoice-layout.ts
 *
 * Nothing here imports React, Firebase, or printer networking.
 */

import type { PaperWidth } from "@/printing/config/paper";

/** Divider rendering variants. */
export type SeparatorStyle = "dashed" | "solid" | "double" | "none";

/** Horizontal alignment used by text/lines. */
export type TextAlign = "left" | "center" | "right";

/** Font weight used by the renderer (400 normal, 700 bold). */
export type FontWeight = 400 | 700;

/** Logical invoice sections that can be reordered / toggled. */
export type InvoiceSectionId =
  | "header"
  | "title"
  | "invoiceMeta"
  | "customer"
  | "items"
  | "notes"
  | "totals"
  | "footer";

// ---------------------------------------------------------------------------
// Shop identity
// ---------------------------------------------------------------------------

export interface ShopConfig {
  /** Big shop name printed at the top. */
  name: string;
  /** Smaller line under the name (e.g. "SALES INVOICE" / activity). */
  subtitle: string;
  phone: string;
  address: string;
  /** Logo source (path/URL) - used when `logoEnabled` is true. */
  logo: string;
  logoEnabled: boolean;
  /** Vertical logo height in pixels when rendered as an image. */
  logoSizePx: number;
}

// ---------------------------------------------------------------------------
// Paper / geometry
// ---------------------------------------------------------------------------

export interface PaperLayoutConfig {
  /** 58mm or 80mm - dimensions are derived from PaperConfig, never hardcoded. */
  width: PaperWidth;
  /** Horizontal inset applied by the renderer (px). */
  marginPx: number;
  /** Extra inner padding (px) added on top of the paper margin. */
  paddingPx: number;
}

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export interface TypographyConfig {
  /** Bundled Arabic-capable font family (e.g. NotoSansArabic). */
  fontFamily: string;
  /** Shop name / header. */
  headerSize: number;
  /** Invoice title. */
  titleSize: number;
  /** Section headings (department name...). */
  sectionSize: number;
  /** Regular body text. */
  bodySize: number;
  /** Small labels / footnotes. */
  smallSize: number;
  /** Grand total emphasis. */
  totalSize: number;
  /** Line-height multiplier applied to every font size. */
  lineHeight: number;
  /** Whether the header/title render bold by default. */
  boldHeader: boolean;
}

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

export interface SpacingConfig {
  /** Gap after the header block. */
  header: number;
  /** Gap between major sections. */
  sections: number;
  /** Gap between item rows. */
  rows: number;
  /** Gap around the totals block. */
  totals: number;
  /** Gap before the footer. */
  footer: number;
}

// ---------------------------------------------------------------------------
// Visibility (show / hide fields)
// ---------------------------------------------------------------------------

export interface InvoiceVisibilityConfig {
  logo: boolean;
  customer: boolean;
  phone: boolean;
  address: boolean;
  invoiceNumber: boolean;
  orderNumber: boolean;
  date: boolean;
  time: boolean;
  department: boolean;
  notes: boolean;
  quantity: boolean;
  weight: boolean;
  unitPrice: boolean;
  subtotal: boolean;
  discount: boolean;
  total: boolean;
  windowNumber: boolean;
  creator: boolean;
  footer: boolean;
}

// ---------------------------------------------------------------------------
// Separators
// ---------------------------------------------------------------------------

export interface SeparatorsConfig {
  enabled: boolean;
  style: SeparatorStyle;
  /** Reference character count used to size the divider to the paper. */
  thickness: number;
  /** Vertical spacing around a divider (px). */
  spacing: number;
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

export interface FooterConfig {
  enabled: boolean;
  text: string;
  alignment: TextAlign;
}

// ---------------------------------------------------------------------------
// Top-level configuration
// ---------------------------------------------------------------------------

export interface InvoiceConfig {
  shop: ShopConfig;
  paper: PaperLayoutConfig;
  typography: TypographyConfig;
  spacing: SpacingConfig;
  visibility: InvoiceVisibilityConfig;
  separators: SeparatorsConfig;
  footer: FooterConfig;
}

/**
 * A recursive partial used for department-specific overrides. A department
 * only specifies what differs from the global configuration - everything
 * else is inherited via `resolveInvoiceConfig`.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type InvoiceConfigOverride = DeepPartial<InvoiceConfig>;