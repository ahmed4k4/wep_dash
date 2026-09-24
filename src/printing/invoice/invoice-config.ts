/**
 * Central invoice configuration.
 *
 * This is the place a developer edits to change how EVERY invoice looks.
 * It holds global defaults plus department-specific OVERRIDES (butcher /
 * cheese). Departments only declare what differs - use
 * `resolveInvoiceConfig()` to merge them onto the global config.
 *
 * Changing the design should NEVER require touching the renderer, the
 * ESC/POS encoder, or the print server. Those layers consume the resolved
 * config; they must not contain design literals.
 */

import { PAPER_CONFIGS } from "@/printing/config/paper";
import { INVOICE_CONTENT } from "@/printing/invoice/invoice-content";
import type {
  InvoiceConfig,
  InvoiceConfigOverride,
} from "@/printing/invoice/invoice-types";

// ---------------------------------------------------------------------------
// GLOBAL CONFIG - change these to restyle every invoice
// ---------------------------------------------------------------------------

export const INVOICE_CONFIG: InvoiceConfig = {
  shop: {
    name: "محل الجبنة والجزارة",
    subtitle: "SALES INVOICE",
    phone: "01000000000",
    address: "القاهرة، مصر",
    logo: "/logo.png",
    logoEnabled: false,
    logoSizePx: 56,
  },

  paper: {
    width: "58mm",
    marginPx: PAPER_CONFIGS["58mm"].marginPx,
    paddingPx: 4,
  },

  typography: {
    fontFamily: "NotoSansArabic",
    headerSize: 18,
    titleSize: 16,
    sectionSize: 15,
    bodySize: 12,
    smallSize: 10,
    totalSize: 15,
    lineHeight: 1.25,
    boldHeader: true,
  },

  spacing: {
    header: 8,
    sections: 8,
    rows: 4,
    totals: 8,
    footer: 8,
  },

  visibility: {
    logo: false,
    customer: true,
    phone: true,
    address: true,
    invoiceNumber: true,
    orderNumber: true,
    date: true,
    time: true,
    department: true,
    notes: true,
    quantity: true,
    weight: true,
    unitPrice: false, // order data has no unit price yet
    subtotal: false, // derived data not present in Order type
    discount: false,
    total: false,
    windowNumber: true,
    creator: false,
    footer: true,
  },

  separators: {
    enabled: true,
    style: "dashed",
    thickness: 32,
    spacing: 4,
  },

  footer: {
    enabled: true,
    text: "شكراً لتعاملكم معنا",
    alignment: "center",
  },
};

// ---------------------------------------------------------------------------
// DEPARTMENT OVERRIDES - only what differs from the global config
// ---------------------------------------------------------------------------

/**
 * Butcher (جزارة) invoice: emphasises weight, shows the department heading,
 * and uses a solid divider. Everything else is inherited.
 */
export const BUTCHER_INVOICE_CONFIG: InvoiceConfigOverride = {
  shop: { subtitle: "فاتورة الجزارة" },
  visibility: { weight: true, unitPrice: false },
  separators: { style: "solid" },
  footer: { text: "شكراً لتعاملكم معنا - الجزارة" },
};

/**
 * Cheese (جبنة) invoice: emphasises weight + quantity, dashed divider.
 * Everything else is inherited.
 */
export const CHEESE_INVOICE_CONFIG: InvoiceConfigOverride = {
  shop: { subtitle: "فاتورة الجبنة" },
  visibility: { weight: true, quantity: true },
  separators: { style: "dashed" },
  footer: { text: "شكراً لتعاملكم معنا - الجبنة" },
};

/** Default invoice title comes from content, kept centralised here too. */
export const DEFAULT_INVOICE_TITLE = INVOICE_CONTENT.title;

// ---------------------------------------------------------------------------
// Merge helper
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge an override object onto a base config without mutating either.
 * Arrays and primitives are replaced; plain objects are merged recursively.
 */
export function resolveInvoiceConfig(
  override?: InvoiceConfigOverride
): InvoiceConfig {
  if (!override) return INVOICE_CONFIG;
  return mergeDeep(
    INVOICE_CONFIG as unknown as Record<string, unknown>,
    override as Record<string, unknown>
  ) as unknown as InvoiceConfig;
}

/**
 * Resolve the config for a given department name (Arabic or key). Unknown
 * departments receive the global config unchanged.
 */
export function resolveInvoiceConfigForDepartment(
  department: string
): InvoiceConfig {
  const dept = department.trim();
  if (dept === "جزارة" || dept.toLowerCase() === "butcher") {
    return resolveInvoiceConfig(BUTCHER_INVOICE_CONFIG);
  }
  if (dept === "جبنة" || dept.toLowerCase() === "cheese") {
    return resolveInvoiceConfig(CHEESE_INVOICE_CONFIG);
  }
  return INVOICE_CONFIG;
}

function mergeDeep(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const o = override[key];
    const b = base[key];
    if (isPlainObject(o) && isPlainObject(b)) {
      out[key] = mergeDeep(b, o);
    } else if (o !== undefined) {
      out[key] = o;
    }
  }
  return out;
}