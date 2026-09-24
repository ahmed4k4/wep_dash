/**
 * Invoice CONTENT - every user-visible word/string in one place.
 *
 * Keep CONTENT here and STYLE in `invoice-config.ts`. Templates must never
 * hard-code Arabic/Latin literals; they read from `INVOICE_CONTENT` (or a
 * department-specific override) instead.
 */

export interface InvoiceContent {
  /** Default invoice title (used when a template has no more specific title). */
  title: string;
  labels: {
    invoiceNumber: string;
    orderNumber: string;
    date: string;
    time: string;
    customer: string;
    phone: string;
    address: string;
    window: string;
    creator: string;
    department: string;
    quantity: string;
    weight: string;
    unitPrice: string;
    subtotal: string;
    discount: string;
    total: string;
    notes: string;
  };
  /** Fallback department name when an item has none. */
  generalDepartment: string;
  /** Prefix used for VAT/currency if ever needed (kept for extension). */
  currency: string;
}

export const INVOICE_CONTENT: InvoiceContent = {
  title: "فاتورة مبيعات",
  labels: {
    invoiceNumber: "رقم الفاتورة",
    orderNumber: "رقم الطلب",
    date: "التاريخ",
    time: "الوقت",
    customer: "العميل",
    phone: "الهاتف",
    address: "العنوان",
    window: "النافذة",
    creator: "المسؤول",
    department: "القسم",
    quantity: "الكمية",
    weight: "الوزن",
    unitPrice: "السعر",
    subtotal: "المجموع",
    discount: "الخصم",
    total: "الإجمالي",
    notes: "ملاحظات",
  },
  generalDepartment: "عام",
  currency: "جنيه",
};