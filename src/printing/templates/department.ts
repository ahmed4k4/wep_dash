/**
 * Department (jubnah/butcher) receipt template.
 *
 * Returns RasterBlock[] describing ONLY the department's items, plus the
 * standard order header/footer. Handed to the raster renderer in the print
 * service. Pure — no I/O.
 */
import type { Order, OrderItem } from "@/types";
import type { RasterBlock, RasterLine } from "@/printing/renderer/raster";
import type { InvoiceStyle } from "@/printing/styles/invoice-style";
import {
  headerLines,
  shopInfoLines,
  customerLines,
  footerLines,
  separator,
} from "@/printing/templates/shared";

export interface TemplateContext {
  order: Order;
  style: InvoiceStyle;
}

/** Full invoice blocks including all departments. */
export function fullInvoiceBlocks(order: Order, style: InvoiceStyle): RasterBlock[] {
  const ctx: TemplateContext = { order, style };
  const blocks: RasterBlock[] = [];

  blocks.push({ lines: headerLines(ctx) });
  blocks.push({ lines: [{ text: separator(style), align: "center", size: style.smallFontSize }] });
  blocks.push({ lines: shopInfoLines(ctx) });
  blocks.push({ lines: customerLines(ctx) });
  blocks.push({ lines: [{ text: separator(style), align: "center", size: style.smallFontSize }] });

  if (order.items.length) {
    const itemLines: RasterLine[] = [];
    for (const item of order.items) itemLines.push(...formatItem(item, style));
    blocks.push({ lines: itemLines });
  }

  blocks.push({ lines: [{ text: separator(style), align: "center", size: style.smallFontSize }] });
  blocks.push({ lines: footerLines(ctx) });

  return blocks;
}

/** Department-only blocks. */
export function departmentBlocks(
  order: Order,
  department: string,
  style: InvoiceStyle
): RasterBlock[] {
  const ctx: TemplateContext = { order, style };
  const items = order.items.filter((i) => (i.department ?? "") === department);
  const blocks: RasterBlock[] = [];

  blocks.push({ lines: headerLines(ctx) });
  if (style.showDepartment) {
    blocks.push({
      lines: [{ text: `${department}`, align: "center", bold: true, size: style.titleFontSize }],
    });
  }
  blocks.push({ lines: [{ text: separator(style), align: "center", size: style.smallFontSize }] });
  blocks.push({ lines: shopInfoLines(ctx) });
  blocks.push({ lines: customerLines(ctx) });

  if (items.length) {
    const itemLines: RasterLine[] = [];
    for (const item of items) itemLines.push(...formatItem(item, style));
    blocks.push({ lines: itemLines });
  }

  blocks.push({ lines: [{ text: separator(style), align: "center", size: style.smallFontSize }] });
  blocks.push({ lines: footerLines(ctx) });

  return blocks;
}

function formatItem(item: OrderItem, style: InvoiceStyle): RasterLine[] {
  const qty = item.quantity ? ` ${item.quantity}` : "";
  const weight = style.showWeight && item.weight ? ` / ${item.weight}` : "";
  const notes = item.notes ? ` / ${item.notes}` : "";
  const line = `${item.productName}${weight}${notes}${qty}`;
  return [{ text: line, align: "right", size: style.bodyFontSize }];
}