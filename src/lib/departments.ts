"use client";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  runTransaction,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import type { Department, Printer } from "@/types";

const DEPARTMENTS_COLLECTION = "departments";
const PRINTERS_COLLECTION = "printers";

// ===== DEPARTMENTS =====

export async function fetchDepartments(): Promise<Department[]> {
  const db = getFirebaseDb();
  if (!db) return [];

  const q = query(collection(db, DEPARTMENTS_COLLECTION), orderBy("name"));
  const snapshot = await getDocs(q);
  const departments: Department[] = [];
  snapshot.forEach((docSnap) => {
    departments.push({ id: docSnap.id, ...docSnap.data() } as Department);
  });
  return departments;
}

export async function addDepartment(
  name: string,
  printerId: string | null = null
): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore is not configured.");

  const docRef = await addDoc(collection(db, DEPARTMENTS_COLLECTION), {
    name,
    printerId,
    active: true,
  });
  return docRef.id;
}

export async function updateDepartment(
  id: string,
  data: Partial<Pick<Department, "name" | "printerId" | "active">>
): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore is not configured.");

  await updateDoc(doc(db, DEPARTMENTS_COLLECTION, id), data);
}

export async function deleteDepartment(id: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore is not configured.");

  await deleteDoc(doc(db, DEPARTMENTS_COLLECTION, id));
}

// ===== PRINTERS =====

export async function fetchPrinters(): Promise<Printer[]> {
  const db = getFirebaseDb();
  if (!db) return [];

  const q = query(collection(db, PRINTERS_COLLECTION), orderBy("name"));
  const snapshot = await getDocs(q);
  const printers: Printer[] = [];
  snapshot.forEach((docSnap) => {
    printers.push({ id: docSnap.id, ...docSnap.data() } as Printer);
  });
  return printers;
}

/**
 * Strip undefined values from an object because Firestore rejects
 * documents that contain `undefined` field values.
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export async function addPrinter(
  printer: Omit<Printer, "id">
): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore is not configured.");

  const docRef = await addDoc(
    collection(db, PRINTERS_COLLECTION),
    stripUndefined(printer as Record<string, unknown>)
  );
  return docRef.id;
}

export async function updatePrinter(
  id: string,
  data: Partial<Omit<Printer, "id">>
): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore is not configured.");

  await updateDoc(
    doc(db, PRINTERS_COLLECTION, id),
    stripUndefined(data as Record<string, unknown>)
  );
}

export async function deletePrinter(id: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore is not configured.");

  // Check if any department uses this printer
  const departments = await fetchDepartments();
  const inUse = departments.some((d) => d.printerId === id);
  if (inUse) {
    throw new Error("لا يمكن حذف طابعة مستخدمة من قبل قسم.");
  }

  await deleteDoc(doc(db, PRINTERS_COLLECTION, id));
}

// ===== INITIALIZATION =====

/**
 * Initialize default departments and printers ONLY if both collections are completely empty.
 * This prevents auto-recreation of deleted items.
 */
export async function initializeDefaults(): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;

  const [departments, printers] = await Promise.all([
    fetchDepartments(),
    fetchPrinters(),
  ]);

  // Only initialize if BOTH collections are completely empty (first-time setup)
  if (departments.length > 0 || printers.length > 0) return;

  // Create default printers
  const printersRef = collection(db, PRINTERS_COLLECTION);
  const defaultPrinters = [
    { name: "طابعة جبنة", type: "usb" as const, usbIdentifier: "USB001" },
    { name: "طابعة جزارة", type: "network" as const, address: "192.168.1.100", port: "9100" },
  ];

  const printerIds: string[] = [];
  for (const printer of defaultPrinters) {
    const docRef = await addDoc(printersRef, printer);
    printerIds.push(docRef.id);
  }

  // Create default departments assigned to printers
  const departmentsRef = collection(db, DEPARTMENTS_COLLECTION);
  const defaultDepartments = [
    { name: "جبنة", printerId: printerIds[0], active: true },
    { name: "جزارة", printerId: printerIds[1], active: true },
  ];

  for (const dept of defaultDepartments) {
    await addDoc(departmentsRef, dept);
  }
}
