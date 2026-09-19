"use client";

import {
  doc,
  getDoc,
  runTransaction,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export async function generateInvoiceNumber(): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore is not configured.");

  // INV-YYYYMMDD-XXXX where XXXX is a simple counter
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `INV-${dateStr}-`;

  // Use a counter document in a "counters" collection
  const counterRef = doc(db, "counters", "invoice");
  
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef);
      const count = snap.exists() ? (snap.data().count ?? 0) : 0;
      const next = count + 1;
      transaction.set(counterRef, { count: next });
    });

    // Get the final count
    const snap = await getDoc(counterRef);
    const count = snap.exists() ? (snap.data().count ?? 1) : 1;
    return `${prefix}${String(count).padStart(4, "0")}`;
  } catch {
    // Fallback: timestamp-based unique number
    const timestamp = Date.now().toString().slice(-4);
    return `${prefix}${timestamp}`;
  }
}

export async function generateOrderNumber(): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore is not configured.");

  // Daily order number: YYYY-MM-DD -> 0001, 0002, 0003...
  const today = new Date().toISOString().slice(0, 10); // 2026-09-08
  const counterRef = doc(db, "counters", `daily-order-${today}`);

  try {
    let orderNum = 1;
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef);
      const count = snap.exists() ? (snap.data().count ?? 0) : 0;
      orderNum = count + 1;
      transaction.set(counterRef, { count: orderNum, date: today });
    });
    return `#${String(orderNum).padStart(4, "0")}`;
  } catch {
    // Fallback (should rarely happen)
    return `#${String(Math.floor(Math.random() * 9999)).padStart(4, "0")}`;
  }
}