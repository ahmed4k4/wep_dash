"use client";

import { LocalPrintersPanel } from "@/components/local-printers-panel";

export default function PrintersPage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">الطابعات</h1>
          <p className="text-sm text-muted-foreground">
            الطابعات المحلية التي يكتشفها Ahmed POS Print Agent وربطها بالأدوار
          </p>
        </div>
      </header>
      <section className="flex-1 space-y-6 p-6 overflow-y-auto">
        <LocalPrintersPanel />
      </section>
    </main>
  );
}