"use client";

import type { Order, OrderItem, DepartmentName, Printer } from "@/types";

// ESC/POS Commands
const ESC = "\x1B";
const GS = "\x1D";

const INIT = ESC + "@"; // Initialize printer
const ALIGN_LEFT = ESC + "a" + "\x00";
const ALIGN_CENTER = ESC + "a" + "\x01";
const ALIGN_RIGHT = ESC + "a" + "\x02";
const BOLD_ON = ESC + "E" + "\x01";
const BOLD_OFF = ESC + "E" + "\x00";
const DOUBLE_HEIGHT_ON = ESC + "!" + "\x10";
const DOUBLE_HEIGHT_OFF = ESC + "!" + "\x00";
const UNDERLINE_ON = ESC + "-" + "\x01";
const UNDERLINE_OFF = ESC + "-" + "\x00";
const CUT_PAPER = GS + "V" + "\x00";
const FEED_LINE = "\n";
const FEED_LINES = (n: number) => "\n".repeat(n);

const CODEPAGE_ARABIC = ESC + "t" + "\x0D"; // Arabic codepage (CP864) - may need adjustment

// Convert Arabic text to visual order for thermal printers
function shapeArabic(text: string): string {
  // For thermal printers that don't support Arabic shaping,
  // we return the text as-is. In production, you'd use a library like arabic-reshaper.
  return text;
}

export interface PrintConfig {
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
}

export interface PrintJob {
  printerId: string;
  data: string;
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return {
    date: date.toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
    time: date.toLocaleTimeString("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}

function formatLine(label: string, value: string, width = 32): string {
  const labelPart = shapeArabic(label);
  const valuePart = shapeArabic(value);
  const padding = Math.max(1, width - labelPart.length - valuePart.length);
  return labelPart + " ".repeat(padding) + valuePart;
}

function formatItemLine(item: OrderItem, width = 32): string {
  const name = shapeArabic(item.productName);
  const qty = item.quantity || "1";
  const weight = item.weight ? ` (${item.weight})` : "";
  const notes = item.notes ? ` - ${item.notes}` : "";
  const line = `${name}${weight}${notes}`;
  const qtyStr = `x${qty}`;
  const padding = Math.max(1, width - line.length - qtyStr.length);
  return line + " ".repeat(padding) + qtyStr;
}

export function generateDepartmentReceipt(
  order: Order,
  department: DepartmentName,
  config: PrintConfig
): string {
  const { date, time } = formatDateTime(order.createdAt);
  const items = order.items.filter((item) => item.department === department);
  
  if (items.length === 0) return "";

  let output = "";
  output += INIT;
  output += CODEPAGE_ARABIC;
  output += ALIGN_CENTER;
  output += DOUBLE_HEIGHT_ON;
  output += BOLD_ON;
  output += shapeArabic(config.shopName) + FEED_LINE;
  output += DOUBLE_HEIGHT_OFF;
  output += BOLD_OFF;
  
  if (config.shopAddress) {
    output += shapeArabic(config.shopAddress) + FEED_LINE;
  }
  if (config.shopPhone) {
    output += shapeArabic(config.shopPhone) + FEED_LINE;
  }
  
  output += FEED_LINE;
  output += UNDERLINE_ON;
  output += shapeArabic("=".repeat(32)) + FEED_LINE;
  output += UNDERLINE_OFF;
  
  output += ALIGN_LEFT;
  output += shapeArabic(`القسم: ${department}`) + FEED_LINE;
  output += shapeArabic("-".repeat(32)) + FEED_LINE;
  
  output += formatLine("رقم الفاتورة:", order.invoiceNumber) + FEED_LINE;
  output += formatLine("رقم الطلب:", order.orderNumber) + FEED_LINE;
  output += formatLine("النافذة:", order.windowNumber) + FEED_LINE;
  output += formatLine("التاريخ:", date) + FEED_LINE;
  output += formatLine("الوقت:", time) + FEED_LINE;
  output += FEED_LINE;
  
  output += formatLine("العميل:", order.customer.name) + FEED_LINE;
  if (order.customer.phone) {
    output += formatLine("الهاتف:", order.customer.phone) + FEED_LINE;
  }
  if (order.customer.address) {
    output += formatLine("العنوان:", order.customer.address) + FEED_LINE;
  }
  output += FEED_LINE;
  
  output += UNDERLINE_ON;
  output += shapeArabic("-".repeat(32)) + FEED_LINE;
  output += UNDERLINE_OFF;
  
  items.forEach((item, index) => {
    output += formatItemLine(item) + FEED_LINE;
  });
  
  output += FEED_LINE;
  output += UNDERLINE_ON;
  output += shapeArabic("=".repeat(32)) + FEED_LINE;
  output += UNDERLINE_OFF;
  output += ALIGN_CENTER;
  output += shapeArabic("شكراً لتعاملكم معنا") + FEED_LINE;
  output += FEED_LINES(3);
  output += CUT_PAPER;
  
  return output;
}

export function generateFullInvoiceReceipt(order: Order, config: PrintConfig): string {
  const { date, time } = formatDateTime(order.createdAt);
  
  let output = "";
  output += INIT;
  output += CODEPAGE_ARABIC;
  output += ALIGN_CENTER;
  output += DOUBLE_HEIGHT_ON;
  output += BOLD_ON;
  output += shapeArabic(config.shopName) + FEED_LINE;
  output += DOUBLE_HEIGHT_OFF;
  output += BOLD_OFF;
  
  if (config.shopAddress) {
    output += shapeArabic(config.shopAddress) + FEED_LINE;
  }
  if (config.shopPhone) {
    output += shapeArabic(config.shopPhone) + FEED_LINE;
  }
  
  output += FEED_LINE;
  output += UNDERLINE_ON;
  output += shapeArabic("=".repeat(32)) + FEED_LINE;
  output += UNDERLINE_OFF;
  
  output += ALIGN_LEFT;
  output += formatLine("رقم الفاتورة:", order.invoiceNumber) + FEED_LINE;
  output += formatLine("رقم الطلب:", order.orderNumber) + FEED_LINE;
  output += formatLine("النافذة:", order.windowNumber) + FEED_LINE;
  output += formatLine("التاريخ:", date) + FEED_LINE;
  output += formatLine("الوقت:", time) + FEED_LINE;
  output += FEED_LINE;
  
  output += formatLine("العميل:", order.customer.name) + FEED_LINE;
  if (order.customer.phone) {
    output += formatLine("الهاتف:", order.customer.phone) + FEED_LINE;
  }
  if (order.customer.address) {
    output += formatLine("العنوان:", order.customer.address) + FEED_LINE;
  }
  output += FEED_LINE;
  
  output += UNDERLINE_ON;
  output += shapeArabic("-".repeat(32)) + FEED_LINE;
  output += UNDERLINE_OFF;
  
  // Group items by department (in order of appearance)
  const departments = Array.from(
    new Set(order.items.map((item) => item.department).filter(Boolean))
  ) as DepartmentName[];
  departments.forEach((dept) => {
    const deptItems = order.items.filter((item) => item.department === dept);
    if (deptItems.length > 0) {
      output += BOLD_ON;
      output += shapeArabic(`--- ${dept} ---`) + FEED_LINE;
      output += BOLD_OFF;
      deptItems.forEach((item) => {
        output += formatItemLine(item) + FEED_LINE;
      });
      output += FEED_LINE;
    }
  });
  
  output += UNDERLINE_ON;
  output += shapeArabic("=".repeat(32)) + FEED_LINE;
  output += UNDERLINE_OFF;
  output += ALIGN_CENTER;
  output += shapeArabic("شكراً لتعاملكم معنا") + FEED_LINE;
  output += FEED_LINES(3);
  output += CUT_PAPER;
  
  return output;
}

export function generateAllPrintJobs(
  order: Order,
  printers: Map<string, Printer>,
  departmentPrinterMap: Map<DepartmentName, string>,
  config: PrintConfig
): PrintJob[] {
  const jobs: PrintJob[] = [];

  // Deduplicate departments present in this order
  const departments = Array.from(
    new Set(order.items.map((item) => item.department).filter(Boolean))
  ) as DepartmentName[];

  // Department printers
  for (const department of departments) {
    const printerId = departmentPrinterMap.get(department);
    const printer = printerId ? printers.get(printerId) : undefined;
    if (printer) {
      const data = generateDepartmentReceipt(order, department, config);
      if (data) jobs.push({ printerId: printer.id, data });
    }
  }

  // Full invoice printer (use the designated full invoice printer)
  const fullInvoiceData = generateFullInvoiceReceipt(order, config);
  if (fullInvoiceData) {
    const fullInvoicePrinter = Array.from(printers.values()).find(
      (p) => p.isFullInvoicePrinter
    );
    if (fullInvoicePrinter) {
      jobs.push({ printerId: fullInvoicePrinter.id, data: fullInvoiceData });
    }
  }

  return jobs;
}
