"use client";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import type { Role } from "@/types";

export async function getUserRole(uid: string): Promise<Role | null> {
  const db = getFirebaseDb();
  if (!db) return null;

  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) return null;
  return (userDoc.data().role as Role) ?? null;
}

export async function loginUser(email: string, password: string) {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error("Firebase Auth is not configured.");
  }

  const { user } = await signInWithEmailAndPassword(auth, email, password);
  const role = await getUserRole(user.uid);
  return { user, role };
}

export async function logoutUser() {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

export function listenToAuth(callback: (user: FirebaseUser | null) => void) {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

// Server-side user creation via API route (to avoid client-side session issues)
export async function createUser(
  email: string,
  password: string,
  name: string,
  role: Role
): Promise<{ uid: string }> {
  const response = await fetch("/api/admin/create-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, role }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "فشل إنشاء المستخدم");
  }

  return response.json();
}

export async function fetchUsers(): Promise<Array<{ uid: string; name: string; email: string; role: Role }>> {
  const db = getFirebaseDb();
  if (!db) return [];

  const { collection, getDocs, orderBy, query } = await import("firebase/firestore");
  const q = query(collection(db, "users"), orderBy("name"));
  const snapshot = await getDocs(q);
  const users: Array<{ uid: string; name: string; email: string; role: Role }> = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    users.push({
      uid: docSnap.id,
      name: data.name ?? "",
      email: data.email ?? "",
      role: (data.role as Role) ?? "employee",
    });
  });
  return users;
}

export async function deleteUser(uid: string): Promise<void> {
  const response = await fetch(`/api/admin/delete-user/${uid}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "فشل حذف المستخدم");
  }
}
