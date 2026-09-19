"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  exportCustomersToExcel,
  exportOrdersToExcel,
  importCustomersFromFile,
  importOrdersFromFile,
  type ImportResult,
} from "@/lib/excel";
import { Download, Upload } from "lucide-react";

type Entity = "customers" | "orders";

export function ImportExportPanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeEntity, setActiveEntity] = useState<Entity>("customers");

  const handleExport = async (entity: Entity) => {
    setBusy(true);
    setMessage("");
    setErrors([]);
    try {
      if (entity === "customers") {
        await exportCustomersToExcel();
        setMessage("تم تصدير العملاء بنجاح.");
      } else {
        await exportOrdersToExcel();
        setMessage("تم تصدير الطلبات بنجاح.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "حدث خطأ أثناء التصدير.");
    } finally {
      setBusy(false);
    }
  };

  const handleImportClick = (entity: Entity) => {
    setActiveEntity(entity);
    setMessage("");
    setErrors([]);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // reset so same file can be re-selected
    if (!file) return;

    setBusy(true);
    setMessage("");
    setErrors([]);
    try {
      let result: ImportResult;
      if (activeEntity === "customers") {
        result = await importCustomersFromFile(file);
        setMessage(`تم استيراد ${result.imported} عميل بنجاح.`);
      } else {
        result = await importOrdersFromFile(file);
        setMessage(`تم استيراد ${result.imported} طلب بنجاح.`);
      }

      if (result.skipped > 0) {
        setMessage(
          (prev) => `${prev} (تم تخطي ${result.skipped} صف غير صالح).`
        );
      }
      setErrors(result.errors);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "حدث خطأ أثناء الاستيراد.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Customers */}
      <Card>
        <CardHeader>
          <CardTitle>العملاء</CardTitle>
          <CardDescription>
            تصدير أو استيراد بيانات العملاء (الاسم، الهاتف، العنوان).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => handleExport("customers")}
          >
            <Download data-icon="inline-start" />
            تصدير العملاء
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => handleImportClick("customers")}
          >
            <Upload data-icon="inline-start" />
            استيراد العملاء
          </Button>
        </CardContent>
      </Card>

      {/* Orders */}
      <Card>
        <CardHeader>
          <CardTitle>الطلبات</CardTitle>
          <CardDescription>
            تصدير أو استيراد بيانات الطلبات (رقم الفاتورة، العميل، الأصناف،
            الكميات).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => handleExport("orders")}
          >
            <Download data-icon="inline-start" />
            تصدير الطلبات
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => handleImportClick("orders")}
          >
            <Upload data-icon="inline-start" />
            استيراد الطلبات
          </Button>
        </CardContent>
      </Card>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Status message */}
      {busy && (
        <p className="text-sm text-muted-foreground">جارٍ المعالجة...</p>
      )}

      {message && (
        <p className="text-sm rounded-md bg-muted px-3 py-2">{message}</p>
      )}

      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p className="mb-2 text-sm font-medium">أخطاء الاستيراد:</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-destructive">
            {errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}