import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let adminApp: ReturnType<typeof initializeApp> | null = null;

export function getFirebaseAdminApp() {
  if (adminApp) return adminApp;
  
  if (!getApps().length) {
    // Use service account credentials from environment variables
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
    
    const missing: string[] = [];
    if (!projectId) missing.push("FIREBASE_ADMIN_PROJECT_ID");
    if (!clientEmail) missing.push("FIREBASE_ADMIN_CLIENT_EMAIL");
    if (!privateKey) missing.push("FIREBASE_ADMIN_PRIVATE_KEY");
    
    if (missing.length > 0) {
      throw new Error(
        `Firebase Admin credentials are missing. The following environment variables are not set in .env.local: ${missing.join(", ")}`
      );
    }
    
    // Placeholder detection: credentials that were copied from .env.example but never replaced
    const email = clientEmail as string;
    const key = privateKey as string;
    const isPlaceholder =
      !email.includes("@") ||
      email.includes("firebase-adminsdk-xxxxx") ||
      key.includes("YOUR_PRIVATE_KEY_HERE") ||
      key.includes("YOUR PRIVATE KEY HERE");
    
    if (isPlaceholder) {
      throw new Error(
        "Firebase Admin credentials are placeholders, not real values. Generate a service account private key from Firebase Console > Project Settings > Service Accounts and paste the real values into .env.local."
      );
    }
    
    try {
      adminApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } catch (err) {
      // Do not hide the real Firebase error - rethrow with context
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Firebase Admin initialization failed: ${detail}`);
    }
  } else {
    adminApp = getApps()[0];
  }
  
  return adminApp;
}

export function getFirebaseAdminAuth() {
  const app = getFirebaseAdminApp();
  return getAuth(app);
}

export function getFirebaseAdminDb() {
  const app = getFirebaseAdminApp();
  return getFirestore(app);
}