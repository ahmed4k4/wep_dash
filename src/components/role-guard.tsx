"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listenToAuth } from "@/lib/auth";
import { getUserRole } from "@/lib/auth";
import type { Role } from "@/types";

export function RoleGuard({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "allowed" | "denied">(
    "loading"
  );

  useEffect(() => {
    const unsubscribe = listenToAuth(async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const userRole = await getUserRole(user.uid);
        if (userRole === role) {
          setStatus("allowed");
        } else {
          // Route to the correct home based on their actual role
          router.replace(userRole === "admin" ? "/admin" : "/employee");
        }
      } catch {
        setStatus("denied");
        router.replace("/login");
      }
    });

    return unsubscribe;
  }, [role, router]);

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
      </div>
    );
  }

  return <>{children}</>;
}