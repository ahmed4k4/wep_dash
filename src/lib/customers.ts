"use client";

import {
  collection,
  getDocs,
  query,
  orderBy,
  startAt,
  endAt,
  addDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import type { Customer } from "@/types";

export async function searchCustomers(name: string): Promise<Customer[]> {
  const db = getFirebaseDb();
  if (!db || !name.trim()) return [];

  const customersRef = collection(db, "customers");
  const q = query(
    customersRef,
    orderBy("name"),
    startAt(name.trim()),
    endAt(name.trim() + "\uf8ff")
  );

  const snapshot = await getDocs(q);
  const results: Customer[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    results.push({
      id: docSnap.id,
      name: data.name ?? "",
      phone: data.phone ?? "",
      address: data.address ?? "",
    });
  });
  return results;
}

export async function saveCustomer(
  customer: Omit<Customer, "id">,
  existingId?: string
): Promise<string> {
  const db = getFirebaseDb();
  if (!db) throw new Error("Firestore is not configured.");

  if (existingId) {
    await updateDoc(doc(db, "customers", existingId), {
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
    });
    return existingId;
  }

  const docRef = await addDoc(collection(db, "customers"), {
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
  });
  return docRef.id;
}