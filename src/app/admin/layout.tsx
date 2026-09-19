"use client";

import { RoleGuard } from "@/components/role-guard";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/mobile-nav";
import { logoutUser, listenToAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "الرئيسية", icon: "🏠" },
  { href: "/admin/orders", label: "إنشاء فاتورة / طلب", icon: "📝" },
  { href: "/admin/history", label: "سجل الفواتير", icon: "📋" },
  { href: "/admin/users", label: "المستخدمين", icon: "👥" },
  { href: "/admin/departments", label: "الأقسام", icon: "📁" },
  { href: "/admin/printers", label: "الطابعات", icon: "🖨️" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard role="admin">
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </RoleGuard>
  );
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email: string | null }>({ email: null });

  useEffect(() => {
    const unsubscribe = listenToAuth((u) => {
      setUser({ email: u?.email ?? null });
    });
    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3 bg-card">
        <div className="flex items-center gap-2">
          <MobileNav items={NAV_ITEMS} title="لوحة تحكم المدير" />
          <h1 className="text-lg font-semibold">لوحة تحكم المدير</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground" dir="ltr">
            {user.email}
          </span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            تسجيل الخروج
          </Button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-l bg-card/50 hidden lg:block">
          <nav className="p-4 space-y-1" role="navigation" aria-label="Admin navigation">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-auto">{children}</main>
      </div>
    </div>
  );
}
