"use client";

import { collection, addDoc, getDocs, query, where, orderBy, Timestamp } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import type { Order } from "@/types";
import { generateInvoiceNumber, generateOrderNumber } from "@/lib/numbering";

export async function saveOrder(
  order: Omit<Order, "id" | "createdAt" | "invoiceNumber" | "orderNumber">
): Promise<{ id: string; invoiceNumber: string; orderNumber: string }> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore is not configured.");

  // Generate unique numbers
  const invoiceNumber = await generateInvoiceNumber();
  const orderNumber = await generateOrderNumber();

  const docRef = await addDoc(collection(db, "orders"), {
    invoiceNumber,
    orderNumber,
    customerId: order.customerId ?? null,
    customer: order.customer,
    windowNumber: order.windowNumber,
    items: order.items,
    creator: order.creator,
    createdAt: new Date().toISOString(),
  });

  return { id: docRef.id, invoiceNumber, orderNumber };
}

export type DateFilter = "today" | "week" | "month" | "6months" | "year";

const SHOP_TIMEZONE = "Africa/Cairo";

// Format a Date as YYYY-MM-DD in the shop's timezone.
function toShopDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Build a UTC Date for the start of a shop-local day (YYYY-MM-DD).
function shopDayToUtc(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  // Interpret as the shop's local midnight, then convert to UTC.
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+02:00`);
}

function getDateRange(filter: DateFilter): { start: Date; end: Date } {
  const now = new Date();
  const todayKey = toShopDateKey(now); // e.g. "2026-09-14"

  const startKey = (() => {
    switch (filter) {
      case "today":
        return todayKey;
      case "week":
        // 6 days before today (inclusive) in shop-local terms
        return addDaysToShopDateKey(todayKey, -6);
      case "month":
        return `${todayKey.slice(0, 7)}-01`;
      case "6months":
        return subtractMonthsKey(todayKey, 5);
      case "year":
        return `${todayKey.slice(0, 4)}-01-01`;
      default:
        return "1970-01-01";
    }
  })();

  const endKey = addDaysToShopDateKey(todayKey, 1); // start of tomorrow (exclusive end)

  return {
    start: shopDayToUtc(startKey),
    end: shopDayToUtc(endKey),
  };
}

// Add N days to a "YYYY-MM-DD" key (handles month/year boundaries).
function addDaysToShopDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

// Subtract N months from a "YYYY-MM-DD" key, keeping day = 1.
function subtractMonthsKey(dateKey: string, months: number): string {
  const [y, m] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 - months, 1));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}-01`;
}

export async function fetchOrders(filter: DateFilter): Promise<Order[]> {
  const db = getFirebaseDb();
  if (!db) return [];

  const { start, end } = getDateRange(filter);

  const ordersRef = collection(db, "orders");
  const q = query(
    ordersRef,
    where("createdAt", ">=", start.toISOString()),
    where("createdAt", "<", end.toISOString()),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);
  const orders: Order[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    orders.push({
      id: docSnap.id,
      invoiceNumber: data.invoiceNumber ?? "",
      orderNumber: data.orderNumber ?? "",
      customerId: data.customerId ?? undefined,
      customer: data.customer ?? { name: "", phone: "", address: "" },
      windowNumber: data.windowNumber ?? "",
      items: data.items ?? [],
      creator: data.creator ?? "",
      createdAt: data.createdAt ?? "",
    });
  });
  return orders;
}