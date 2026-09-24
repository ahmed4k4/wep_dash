/**
 * Shared invoice section builders.
 *
 * Pure functions: given an Order + resolved InvoiceConfig (+ content) they
 * return ready-to-render `RasterBlock[]`. No React, no Firebase, no printer
 * networking. All literals come from `INVOICE_CONTENT`; all sizing/spacing/
 * visibility comes from `InvoiceConfig`. Section order lives in
 * `invoice-layout.ts` and is applied by `composeInvoice`.
 */

import type { Order, OrderItem } from "@/types";
import type { RasterBlock, RasterLine } from "@/printing/renderer/raster";
import type {
  InvoiceConfig,
  SeparatorStyle,
} from "@/printing/invoice/invoice-types";
import type { InvoiceContent } from "@/printing/invoice/invoice-content";

export interface TemplateContext {
  order: Order;
  config: InvoiceConfig;
  content: InvoiceContent;
  /** For department templates: the department name to filter on. */
  department?: string;
  /** Optional title override (e.g. department name). */
  title?: string;
}

// ---------------------------------------------------------------------------
// Dividers
// ---------------------------------------------------------------------------

function separatorGlyph(style: SeparatorStyle): string {
  switch (style) {
    case "solid":
      return "─";
    case "double":
      return "═";
    case "none":
      return "";
    default:
      return "-";
  }
}

/** A single divider block sized to the configured thickness/paper. */
export function separatorBlock(ctx: TemplateContext): RasterBlock {
  const { separators, typography } = ctx.config;
  if (!separators.enabled) return { lines: [] };
  const glyph = separatorGlyph(separators.style);
  const text = glyph ? glyph.repeat(separators.thickness) : "";
  return {
    lines: [{ text, align: "center", size: typography.smallSize }],
    marginTop: separators.spacing,
    marginBottom: separators.spacing,
  };
}

// ---------------------------------------------------------------------------
// Section builders  (CONTENT + STYLE -> blocks)
// ---------------------------------------------------------------------------

/** Shop header: name (+ subtitle). */
export function renderHeader(ctx: TemplateContext): RasterBlock[] {
  const { shop, typography } = ctx.config;
  const lines: RasterLine[] = [];
  lines.push({
    text: shop.name,
    align: "center",
    bold: typography.boldHeader,
    size: typography.headerSize,
  });
  if (shop.subtitle) {
    lines.push({
      text: shop.subtitle,
      align: "center",
      size: typography.bodySize,
    });
  }
  return [{ lines, marginBottom: ctx.config.spacing.header }];
}

/** Invoice title / department heading. */
export function renderTitle(ctx: TemplateContext): RasterBlock[] {
  const { typography } = ctx.config;
  const text = ctx.title ?? ctx.content.title;
  if (!text) return [];
  return [
    {
      lines: [
        {
          text,
          align: "center",
          bold: true,
          size: typography.titleSize,
        },
      ],
    },
  ];
}

function metaRow(ctx: TemplateContext, label: string, value: string): RasterLine {
  return { cells: { label: `${label}:`, value }, size: ctx.config.typography.bodySize };
}

/** Invoice meta: number / order / window / date / time / creator. */
export function renderInvoiceMeta(ctx: TemplateContext): RasterBlock[] {
  const { order, config, content } = ctx;
  const v = config.visibility;
  const lines: RasterLine[] = [];

  if (v.invoiceNumber && order.invoiceNumber)
    lines.push(metaRow(ctx, content.labels.invoiceNumber, order.invoiceNumber));
  if (v.orderNumber && order.orderNumber)
    lines.push(metaRow(ctx, content.labels.orderNumber, order.orderNumber));
  if (v.windowNumber && order.windowNumber)
    lines.push(metaRow(ctx, content.labels.window, order.windowNumber));
  const { date, time } = formatDateTime(order.createdAt);
  if (v.date && date) lines.push(metaRow(ctx, content.labels.date, date));
  if (v.time && time) lines.push(metaRow(ctx, content.labels.time, time));
  if (v.creator && order.creator)
    lines.push(metaRow(ctx, content.labels.creator, order.creator));

  if (!lines.length) return [];
  return [{ lines, marginBottom: config.spacing.sections }];
}

/** Customer block. */
export function renderCustomer(ctx: TemplateContext): RasterBlock[] {
  const { order, config, content } = ctx;
  const v = config.visibility;
  const lines: RasterLine[] = [];
  if (v.customer && order.customer?.name)
    lines.push(metaRow(ctx, content.labels.customer, order.customer.name));
  if (v.phone && order.customer?.phone)
    lines.push(metaRow(ctx, content.labels.phone, order.customer.phone));
  if (v.address && order.customer?.address)
    lines.push(metaRow(ctx, content.labels.address, order.customer.address));
  if (!lines.length) return [];
  return [{ lines, marginBottom: config.spacing.sections }];
}

/** One item rendered as 1-2 lines. */
function itemLines(item: OrderItem, ctx: TemplateContext): RasterLine[] {
  const { config, content } = ctx;
  const v = config.visibility;
  const lines: RasterLine[] = [];

  const qty = (v.quantity && item.quantity) ? `x${item.quantity}` : "";
  lines.push({
    cells: { label: item.productName, value: qty },
    size: config.typography.bodySize,
  });

  const detail: string[] = [];
  if (v.weight && item.weight)
    detail.push(`${content.labels.weight}: ${item.weight}`);
  if (v.notes && item.notes) detail.push(item.notes);
  if (detail.length) {
    lines.push({
      text: detail.join("  •  "),
      align: "left",
      size: config.typography.smallSize,
    });
  }
  return lines;
}

/** Items section (all items for full; filtered for department). */
export function renderItems(ctx: TemplateContext): RasterBlock[] {
  const items = ctx.department
    ? ctx.order.items.filter((i) => (i.department ?? "") === ctx.department)
    : ctx.order.items;
  if (!items.length) return [];
  const lines: RasterLine[] = [];
  items.forEach((item, idx) => {
    if (idx > 0) lines.push({ text: "", size: ctx.config.spacing.rows });
    lines.push(...itemLines(item, ctx));
  });
  return [{ lines, marginBottom: ctx.config.spacing.sections }];
}

/** Notes lines (aggregated item notes not already shown). */
export function renderNotes(ctx: TemplateContext): RasterBlock[] {
  const { config, content } = ctx;
  if (!config.visibility.notes) return [];
  const notes = ctx.order.items
    .map((i) => i.notes)
    .filter((n): n is string => Boolean(n && n.trim()));
  if (!notes.length) return [];
  return [
    {
      lines: notes.map((n) => ({
        text: `${content.labels.notes}: ${n}`,
        align: "right" as const,
        size: config.typography.smallSize,
      })),
      marginBottom: config.spacing.sections,
    },
  ];
}

/** Totals block (only shown when a total field is available/enabled). */
export function renderTotals(ctx: TemplateContext): RasterBlock[] {
  const { config, content } = ctx;
  if (!config.visibility.total) return [];
  // Order has no computed total yet; render a label row so the section exists
  // and can be populated when totals are added to the data model.
  return [
    {
      lines: [
        {
          cells: { label: `${content.labels.total}:`, value: "" },
          size: config.typography.totalSize,
        },
      ],
      marginTop: config.spacing.totals,
      marginBottom: config.spacing.totals,
    },
  ];
}

/** Footer / thank-you message. */
export function renderFooter(ctx: TemplateContext): RasterBlock[] {
  const { footer, typography, spacing, visibility } = ctx.config;
  if (!visibility.footer || !footer.enabled || !footer.text) return [];
  return [
    {
      lines: [{ text: footer.text, align: footer.alignment, bold: true, size: typography.bodySize }],
      marginTop: spacing.footer,
    },
  ];
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function groupItemsByDepartment(
  order: Order
): { department: string; items: OrderItem[] }[] {
  const groups: { department: string; items: OrderItem[] }[] = [];
  for (const item of order.items) {
    const dept = item.department || "";
    let g = groups.find((x) => x.department === dept);
    if (!g) {
      g = { department: dept, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }
  return groups;
}

export function gapBlock(points: number): RasterBlock {
  return { lines: [], marginTop: points, marginBottom: 0 };
}

export interface DateParts {
  date: string;
  time: string;
}

export function formatDateTime(iso: string): DateParts {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: "", time: "" };
  const fmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return { date: fmt.format(d), time: timeFmt.format(d) };
}