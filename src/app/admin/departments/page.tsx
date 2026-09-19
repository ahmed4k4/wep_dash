"use client";

import { DepartmentPrinterPanel } from "@/components/department-printer-management";

export default function DepartmentsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">إدارة الأقسام</h1>
          <p className="text-sm text-muted-foreground">
            إضافة وتعديل وحذف أقسام الطلبات
          </p>
        </div>
      </header>
      <section className="flex-1 p-6 overflow-y-auto">
        <DepartmentPrinterPanel showPrintersTab={false} />
      </section>
    </main>
  );
}