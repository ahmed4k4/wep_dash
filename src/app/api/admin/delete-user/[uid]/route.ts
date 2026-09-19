import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/firebase-admin";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const { uid } = await params;

    if (!uid) {
      return NextResponse.json(
        { message: "معرف المستخدم مطلوب" },
        { status: 400 }
      );
    }

    const auth = getFirebaseAdminAuth();
    const db = getFirebaseAdminDb();

    // Check if user exists in Firestore first
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { message: "المستخدم غير موجود" },
        { status: 404 }
      );
    }

    // Delete from Firebase Authentication
    await auth.deleteUser(uid);

    // Delete from Firestore
    await db.collection("users").doc(uid).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    const message = error instanceof Error ? error.message : "فشل حذف المستخدم";
    return NextResponse.json({ message }, { status: 500 });
  }
}
