/**
 * Shared helpers for building invoice templates as RasterBlock[].
 * Pure functions: given an Order + InvoiceStyle they return ready-to-render
 * blocks. No React, no Firebase, no printer networking.
 */

import type { Order, OrderItem } from "@/types";
import type { RasterBlock, RasterLine } from "@/printing/renderer/raster";
import type { InvoiceStyle } from "@/printing/styles/invoice-style";

export interface TemplateContext {
  order: Order;
  style: InvoiceStyle;
}

/** Separator string approximating the printable width. */
export function separator(style: InvoiceStyle): string {
  switch (style.separatorStyle) {
    case "solid":
      return "─".repeat(32);
    case "double":
      return "═".repeat(32);
    case "none":
      return "";
    default:
      return "-".repeat(32);
  }
}

export function headerLines(ctx: TemplateContext): RasterLine[] {
  const { style } = ctx;
  const lines: RasterLine[] = [];
  lines.push({
    text: style.shopName,
    align: "center",
    bold: true,
    size: style.headerFontSize,
  });
  if (style.shopSubtitle) {
    lines.push({
      text: style.shopSubtitle,
      align: "center",
      size: Math.round(style.bodyFontSize * 0.9),
    });
  }
  return lines;
}

export function shopInfoLines(ctx: TemplateContext): RasterLine[] {
  const { style, order } = ctx;
  const lines: RasterLine[] = [];
  if (style.showInvoiceNumber && order.invoiceNumber)
    lines.push(metaRow(style, "رقم الفاتورة", order.invoiceNumber));
  if (order.orderNumber) lines.push(metaRow(style, "رقم الطلب", order.orderNumber));
  if (style.showWindowNumber && order.windowNumber)
    lines.push(metaRow(style, "النافذة", order.windowNumber));
  const { date, time } = formatDateTime(order.createdAt);
  if (style.showDate && date) lines.push(metaRow(style, "التاريخ", date));
  if (style.showTime && time) lines.push(metaRow(style, "الوقت", time));
  if (style.showCreator && order.creator) lines.push(metaRow(style, "المسؤول", order.creator));
  return lines;
}

export function customerLines(ctx: TemplateContext): RasterLine[] {
  const { style, order } = ctx;
  const lines: RasterLine[] = [];
  if (style.showCustomer && order.customer?.name)
    lines.push(metaRow(style, "العميل", order.customer.name));
  if (style.showPhone && order.customer?.phone)
    lines.push(metaRow(style, "الهاتف", order.customer.phone));
  if (style.showAddress && order.customer?.address)
    lines.push(metaRow(style, "العنوان", order.customer.address));
  return lines;
}

export function metaRow(style: InvoiceStyle, label: string, value: string): RasterLine {
  return { cells: { label: `${label}:`, value }, size: style.bodyFontSize };
}

/** A single order item rendered as one or two RasterLines. */
export function itemLines(item: OrderItem, style: InvoiceStyle): RasterLine[] {
  const lines: RasterLine[] = [];
  const qty = item.quantity ? `x${item.quantity}` : "";
  lines.push({ cells: { label: item.productName, value: qty }, size: style.bodyFontSize });
  const detail: string[] = [];
  if (style.showWeight && item.weight) detail.push(item.weight);
  if (item.notes) detail.push(item.notes);
  if (detail.length > 0) {
    lines.push({ text: detail.join("  •  "), align: "left", size: style.smallFontSize });
  }
  return lines;
}

export function footerLines(ctx: TemplateContext): RasterLine[] {
  const { style } = ctx;
  if (!style.showFooter || !style.footerText) return [];
  return [{ text: style.footerText, align: "center", bold: true, size: style.bodyFontSize }];
}

export function groupItemsByDepartment(order: Order): { department: string; items: OrderItem[] }[] {
  const groups: { department: string; items: OrderItem[] }[] = [];
  for (const item of order.items) {
    const dept = item.department || "عام";
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