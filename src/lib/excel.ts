"use client";

import ExcelJS from "exceljs";
import { getFirebaseDb } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { generateInvoiceNumber, generateOrderNumber } from "@/lib/numbering";
import type { Order, OrderItem } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function triggerDownload(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Export: Customers
// ---------------------------------------------------------------------------

export async function exportCustomersToExcel(): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore is not configured.");

  const snapshot = await getDocs(
    query(collection(db, "customers"), orderBy("name"))
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("العملاء");

  sheet.columns = [
    { header: "الاسم", key: "name", width: 30 },
    { header: "الهاتف", key: "phone", width: 20 },
    { header: "العنوان", key: "address", width: 40 },
  ];

  sheet.getRow(1).font = { bold: true };

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    sheet.addRow({
      name: data.name ?? "",
      phone: data.phone ?? "",
      address: data.address ?? "",
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, `customers-${todayStamp()}.xlsx`);
}

// ---------------------------------------------------------------------------
// Export: Orders
// ---------------------------------------------------------------------------

export async function exportOrdersToExcel(): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore is not configured.");

  const snapshot = await getDocs(
    query(collection(db, "orders"), orderBy("createdAt", "asc"))
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("الطلبات");

  sheet.columns = [
    { header: "رقم الفاتورة", key: "invoiceNumber", width: 24 },
    { header: "رقم الطلب", key: "orderNumber", width: 16 },
    { header: "اسم العميل", key: "customerName", width: 24 },
    { header: "هاتف العميل", key: "customerPhone", width: 18 },
    { header: "عنوان العميل", key: "customerAddress", width: 30 },
    { header: "النافذة", key: "windowNumber", width: 12 },
    { header: "القسم", key: "department", width: 16 },
    { header: "المنتج", key: "productName", width: 24 },
    { header: "الكمية", key: "quantity", width: 10 },
    { header: "الوزن", key: "weight", width: 10 },
    { header: "ملاحظات", key: "notes", width: 24 },
    { header: "تم الإنشاء بواسطة", key: "creator", width: 20 },
    { header: "تاريخ الإنشاء", key: "createdAt", width: 24 },
  ];

  sheet.getRow(1).font = { bold: true };

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() as Order;
    const items: OrderItem[] = data.items ?? [];

    if (items.length === 0) {
      sheet.addRow({
        invoiceNumber: data.invoiceNumber ?? "",
        orderNumber: data.orderNumber ?? "",
        customerName: data.customer?.name ?? "",
        customerPhone: data.customer?.phone ?? "",
        customerAddress: data.customer?.address ?? "",
        windowNumber: data.windowNumber ?? "",
        department: "",
        productName: "",
        quantity: "",
        weight: "",
        notes: "",
        creator: data.creator ?? "",
        createdAt: data.createdAt ?? "",
      });
      return;
    }

    items.forEach((item) => {
      sheet.addRow({
        invoiceNumber: data.invoiceNumber ?? "",
        orderNumber: data.orderNumber ?? "",
        customerName: data.customer?.name ?? "",
        customerPhone: data.customer?.phone ?? "",
        customerAddress: data.customer?.address ?? "",
        windowNumber: data.windowNumber ?? "",
        department: item.department ?? "",
        productName: item.productName ?? "",
        quantity: item.quantity ?? "",
        weight: item.weight ?? "",
        notes: item.notes ?? "",
        creator: data.creator ?? "",
        createdAt: data.createdAt ?? "",
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, `orders-${todayStamp()}.xlsx`);
}

// ---------------------------------------------------------------------------
// Import: Customers
// ---------------------------------------------------------------------------

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export async function importCustomersFromFile(file: File): Promise<ImportResult> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore is not configured.");

  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("الملف لا يحتوي على أي ورقة بيانات.");

  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header

    const values = row.values as unknown[];
    // columns: 1=name, 2=phone, 3=address
    const name = String(values?.[1] ?? "").trim();
    const phone = String(values?.[2] ?? "").trim();
    const address = String(values?.[3] ?? "").trim();

    if (!name) {
      result.skipped++;
      result.errors.push(`صف ${rowNumber}: اسم العميل مطلوب.`);
      return;
    }
    if (!phone) {
      result.skipped++;
      result.errors.push(`صف ${rowNumber}: هاتف العميل مطلوب.`);
      return;
    }

    addDoc(collection(db, "customers"), { name, phone, address });
    result.imported++;
  });

  return result;
}

// ---------------------------------------------------------------------------
// Import: Orders
// ---------------------------------------------------------------------------

export async function importOrdersFromFile(file: File): Promise<ImportResult> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore is not configured.");

  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("الملف لا يحتوي على أي ورقة بيانات.");

  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  // Group rows by invoice number so a single order with multiple items
  // maps back to one Order document.
  interface Group {
    invoiceNumber: string;
    orderNumber: string;
    customer: { name: string; phone: string; address: string };
    windowNumber: string;
    creator: string;
    createdAt: string;
    items: OrderItem[];
  }

  const groups = new Map<string, Group>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header

    const values = row.values as unknown[];
    const invoiceNumber = String(values?.[1] ?? "").trim();
    const orderNumber = String(values?.[2] ?? "").trim();
    const customerName = String(values?.[3] ?? "").trim();
    const customerPhone = String(values?.[4] ?? "").trim();
    const customerAddress = String(values?.[5] ?? "").trim();
    const windowNumber = String(values?.[6] ?? "").trim();
    const department = String(values?.[7] ?? "").trim();
    const productName = String(values?.[8] ?? "").trim();
    const quantity = String(values?.[9] ?? "").trim();
    const weight = String(values?.[10] ?? "").trim();
    const notes = String(values?.[11] ?? "").trim();
    const creator = String(values?.[12] ?? "").trim();
    const createdAt = String(values?.[13] ?? "").trim();

    // Validate required fields
    if (!customerName) {
      result.skipped++;
      result.errors.push(`صف ${rowNumber}: اسم العميل مطلوب.`);
      return;
    }
    if (!customerPhone) {
      result.skipped++;
      result.errors.push(`صف ${rowNumber}: هاتف العميل مطلوب.`);
      return;
    }
    if (!productName) {
      result.skipped++;
      result.errors.push(`صف ${rowNumber}: اسم المنتج مطلوب.`);
      return;
    }

    const key = invoiceNumber || `${customerName}-${customerPhone}-${rowNumber}`;
    const item: OrderItem = {
      department,
      productName,
      quantity,
      weight,
      notes,
    };

    if (!groups.has(key)) {
      groups.set(key, {
        invoiceNumber,
        orderNumber,
        customer: {
          name: customerName,
          phone: customerPhone,
          address: customerAddress,
        },
        windowNumber,
        creator,
        createdAt,
        items: [item],
      });
    } else {
      groups.get(key)!.items.push(item);
    }
  });

  for (const group of groups.values()) {
    const invoiceNumber = group.invoiceNumber || (await generateInvoiceNumber());
    const orderNumber = group.orderNumber || (await generateOrderNumber());
    const createdAt = group.createdAt || new Date().toISOString();

    await addDoc(collection(db, "orders"), {
      invoiceNumber,
      orderNumber,
      customer: group.customer,
      windowNumber: group.windowNumber,
      items: group.items,
      creator: group.creator || "استيراد",
      createdAt,
    });
    result.imported++;
  }

  return result;
}