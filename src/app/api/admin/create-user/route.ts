import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, role } = await request.json();

    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { message: "جميع الحقول مطلوبة" },
        { status: 400 }
      );
    }

    if (!["admin", "employee"].includes(role)) {
      return NextResponse.json(
        { message: "دور غير صحيح" },
        { status: 400 }
      );
    }

    const auth = getFirebaseAdminAuth();
    const db = getFirebaseAdminDb();

    // Create user in Firebase Authentication
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
    });

    // Create user document in Firestore
    await db.collection("users").doc(userRecord.uid).set({
      name,
      email,
      role,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ uid: userRecord.uid });
  } catch (error) {
    console.error("Create user error:", error);
    const message = error instanceof Error ? error.message : "فشل إنشاء المستخدم";
    return NextResponse.json({ message }, { status: 500 });
  }
}
