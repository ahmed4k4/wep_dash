"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Department, Printer, PrinterType } from "@/types";
import {
  fetchDepartments,
  addDepartment,
  updateDepartment,
  deleteDepartment,
  fetchPrinters,
  addPrinter,
  updatePrinter,
  deletePrinter,
  initializeDefaults,
} from "@/lib/departments";

// ===== DEPARTMENT MODAL =====

interface DepartmentModalProps {
  departments: Department[];
  printers: Printer[];
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  editing?: Department | null;
}

export function DepartmentModal({
  departments,
  printers,
  open,
  onClose,
  onSave,
  editing,
}: DepartmentModalProps) {
  const [name, setName] = useState("");
  const [printerId, setPrinterId] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setPrinterId(editing.printerId);
      setActive(editing.active);
    } else {
      setName("");
      setPrinterId(null);
      setActive(true);
    }
    setError("");
  }, [editing, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("يرجى إدخال اسم القسم.");
      return;
    }

    const duplicate = departments.some(
      (d) => d.name === name.trim() && d.id !== editing?.id
    );
    if (duplicate) {
      setError("يوجد قسم بهذا الاسم بالفعل.");
      return;
    }

    try {
      if (editing) {
        await updateDepartment(editing.id, { name: name.trim(), printerId, active });
      } else {
        await addDepartment(name.trim(), printerId);
      }
      onSave();
      onClose();
    } catch {
      setError("حدث خطأ أثناء الحفظ.");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="department-modal-title"
    >
      <div
        className="w-full max-w-md bg-background rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
            <CardTitle id="department-modal-title" className="text-lg">
              {editing ? "تعديل القسم" : "إضافة قسم"}
            </CardTitle>
            <Button type="button" variant="ghost" size="icon" onClick={onClose}>
              ✕
            </Button>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dept-name">اسم القسم</Label>
              <Input
                id="dept-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: مخبوزات"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dept-printer">الطابعة المخصصة</Label>
              <select
                id="dept-printer"
                value={printerId ?? ""}
                onChange={(e) => setPrinterId(e.target.value || null)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">بدون طابعة</option>
                {printers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type === "usb" ? "USB" : "Network"})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="dept-active"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="dept-active" className="cursor-pointer">
                نشط
              </Label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                إلغاء
              </Button>
              <Button type="submit">{editing ? "حفظ التعديلات" : "إضافة القسم"}</Button>
            </div>
          </CardContent>
        </form>
      </div>
    </div>
  );
}

// ===== PRINTER MODAL =====

interface USBDevice {
  vendorId: number;
  productId: number;
  manufacturerName: string;
  productName: string;
  serialNumber?: string;
  deviceClass: number;
  hasOutEndpoint: boolean;
}

interface PrinterModalProps {
  printers: Printer[];
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  editing?: Printer | null;
}

export function PrinterModal({
  printers,
  open,
  onClose,
  onSave,
  editing,
}: PrinterModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PrinterType>("usb");
  const [address, setAddress] = useState("");
  const [port, setPort] = useState("");
  const [usbIdentifier, setUsbIdentifier] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [productId, setProductId] = useState("");
  const [isFullInvoicePrinter, setIsFullInvoicePrinter] = useState(false);
  const [error, setError] = useState("");
  const [detectedDevices, setDetectedDevices] = useState<USBDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<USBDevice | null>(null);
  const [detecting, setDetecting] = useState(false);

  // Sync form state with editing prop using separate useEffects to avoid synchronous setState in effect
  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setType(editing.type);
      setAddress(editing.address ?? "");
      setPort(editing.port ?? "");
      setUsbIdentifier(editing.usbIdentifier ?? "");
      setVendorId(editing.vendorId?.toString(16) ?? "");
      setProductId(editing.productId?.toString(16) ?? "");
      setIsFullInvoicePrinter(editing.isFullInvoicePrinter ?? false);
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) {
      setName("");
      setType("usb");
      setAddress("");
      setPort("");
      setUsbIdentifier("");
      setVendorId("");
      setProductId("");
      setIsFullInvoicePrinter(false);
      setDetectedDevices([]);
      setSelectedDevice(null);
    }
    setError("");
  }, [editing, open]);

  const detectUSBPrinters = async () => {
    setDetecting(true);
    setError("");
    try {
      const PRINT_SERVER_URL = process.env.NEXT_PUBLIC_PRINT_SERVER_URL || "http://127.0.0.1:3001";
      const response = await fetch(`${PRINT_SERVER_URL}/printers/usb`);
      if (!response.ok) {
        throw new Error("فشل في الاتصال بخادم الطباعة");
      }
      const data = await response.json();
      setDetectedDevices(data.devices || []);
      if (data.devices?.length === 0) {
        setError("لم يتم العثور على طابعات USB متصلة.");
      }
    } catch (err) {
      setError("تعذر اكتشاف الطابعات: " + (err instanceof Error ? err.message : "خطأ غير معروف"));
      setDetectedDevices([]);
    } finally {
      setDetecting(false);
    }
  };

  const selectDevice = (device: USBDevice) => {
    setSelectedDevice(device);
    setVendorId(device.vendorId.toString(16).padStart(4, '0'));
    setProductId(device.productId.toString(16).padStart(4, '0'));
    // Auto-generate a name if not editing
    if (!editing) {
      setName(`${device.manufacturerName} ${device.productName}`.trim() || "طابعة USB");
    }
    // Use vendorId:productId as usbIdentifier
    setUsbIdentifier(`${device.vendorId.toString(16)}:${device.productId.toString(16)}`);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("يرجى إدخال اسم الطابعة.");
      return;
    }

    const duplicate = printers.some(
      (p) => p.name === name.trim() && p.id !== editing?.id
    );
    if (duplicate) {
      setError("يوجد طابعة بهذا الاسم بالفعل.");
      return;
    }

    if (type === "network" && (!address.trim() || !port.trim())) {
      setError("العنوان والمنفذ مطلوبان للطابعات الشبكية.");
      return;
    }

    if (type === "usb" && !usbIdentifier.trim()) {
      setError("معرف USB مطلوب للطابعات المحلية.");
      return;
    }

    const data: Partial<Omit<Printer, "id">> = {
      name: name.trim(),
      type,
      address: type === "network" ? address.trim() : undefined,
      port: type === "network" ? port.trim() : undefined,
      usbIdentifier: type === "usb" ? usbIdentifier.trim() : undefined,
      vendorId: type === "usb" && vendorId.trim() ? parseInt(vendorId.trim(), 16) : undefined,
      productId: type === "usb" && productId.trim() ? parseInt(productId.trim(), 16) : undefined,
      isFullInvoicePrinter: isFullInvoicePrinter,
      manufacturerName: selectedDevice?.manufacturerName,
      productName: selectedDevice?.productName,
      serialNumber: selectedDevice?.serialNumber,
    };

    // Ensure only one printer is marked as full invoice printer
    if (isFullInvoicePrinter) {
      const existingFullInvoice = printers.find((p) => p.isFullInvoicePrinter && p.id !== editing?.id);
      if (existingFullInvoice) {
        await updatePrinter(existingFullInvoice.id, { isFullInvoicePrinter: false });
      }
    }

    try {
      if (editing) {
        await updatePrinter(editing.id, data);
      } else {
        await addPrinter(data as Omit<Printer, "id">);
      }
      onSave();
      onClose();
    } catch (err) {
      console.error("[PrinterModal] Save printer failed:", err);
      const detail =
        err instanceof Error && err.message
          ? err.message
          : "خطأ غير معروف";
      setError(`حدث خطأ أثناء الحفظ: ${detail}`);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="printer-modal-title"
    >
      <div
        className="w-full max-w-md bg-background rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
            <CardTitle id="printer-modal-title" className="text-lg">
              {editing ? "تعديل الطابعة" : "إضافة طابعة"}
            </CardTitle>
            <Button type="button" variant="ghost" size="icon" onClick={onClose}>
              ✕
            </Button>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="printer-name">اسم الطابعة</Label>
              <Input
                id="printer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: طابعة مخبوزات"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>نوع الطابعة</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="usb"
                    checked={type === "usb"}
                    onChange={(e) => setType(e.target.value as PrinterType)}
                    className="h-4 w-4"
                  />
                  <span>USB</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="network"
                    checked={type === "network"}
                    onChange={(e) => setType(e.target.value as PrinterType)}
                    className="h-4 w-4"
                  />
                  <span>Network</span>
                </label>
              </div>
            </div>

            {type === "network" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="printer-address">عنوان IP / Hostname</Label>
                  <Input
                    id="printer-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="مثال: 192.168.1.100"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="printer-port">المنفذ</Label>
                  <Input
                    id="printer-port"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="مثال: 9100"
                  />
                </div>
              </>
            )}

            {type === "usb" && (
              <>
                {/* USB Detection Section */}
                <div className="flex flex-col gap-1.5 p-3 bg-muted/30 rounded-md">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium">اكتشاف الطابعات المتصلة</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={detectUSBPrinters}
                      disabled={detecting}
                    >
                      {detecting ? "جاري البحث..." : "البحث عن الطابعات"}
                    </Button>
                  </div>
                  
                  {detectedDevices.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm">الطابعات المكتشفة:</Label>
                      {detectedDevices.map((device, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 border rounded bg-background"
                          onClick={() => selectDevice(device)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && selectDevice(device)}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {device.manufacturerName} {device.productName}
                            </span>
                            <span className="text-xs text-muted-foreground dir-ltr">
                              Vendor ID: 0x{device.vendorId.toString(16).padStart(4, '0')} | 
                              Product ID: 0x{device.productId.toString(16).padStart(4, '0')}
                              {device.serialNumber && ` | S/N: ${device.serialNumber}`}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); selectDevice(device); }}
                          >
                            {selectedDevice?.vendorId === device.vendorId && selectedDevice?.productId === device.productId ? "محدد" : "اختيار"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="printer-usb">معرف USB</Label>
                  <Input
                    id="printer-usb"
                    value={usbIdentifier}
                    onChange={(e) => setUsbIdentifier(e.target.value)}
                    placeholder="مثال: 04b8:0e15"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="printer-vendor-id">Vendor ID (Hex)</Label>
                  <Input
                    id="printer-vendor-id"
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    placeholder="مثال: 04b8"
                    dir="ltr"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="printer-product-id">Product ID (Hex)</Label>
                  <Input
                    id="printer-product-id"
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    placeholder="مثال: 0e15"
                    dir="ltr"
                  />
                </div>
              </>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="printer-full-invoice"
                checked={isFullInvoicePrinter}
                onChange={(e) => setIsFullInvoicePrinter(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="printer-full-invoice" className="cursor-pointer">
                استخدام هذه الطابعة للفاتورة الكاملة (جميع الأقسام)
              </Label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                إلغاء
              </Button>
              <Button type="submit">{editing ? "حفظ التعديلات" : "إضافة الطابعة"}</Button>
            </div>
          </CardContent>
        </form>
      </div>
    </div>
  );
}

// ===== MANAGEMENT PANEL =====

interface DepartmentPrinterPanelProps {
  showPrintersTab?: boolean;
  showDepartmentsTab?: boolean;
}

export function DepartmentPrinterPanel({
  showPrintersTab = true,
  showDepartmentsTab = true,
}: DepartmentPrinterPanelProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"departments" | "printers">(
    showDepartmentsTab ? "departments" : "printers"
  );
  const [deptModal, setDeptModal] = useState<{ open: boolean; editing?: Department | null }>({
    open: false,
  });
  const [printerModal, setPrinterModal] = useState<{ open: boolean; editing?: Printer | null }>({
    open: false,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      // Do NOT call initializeDefaults here - it recreates deleted items
      const [depts, prts] = await Promise.all([fetchDepartments(), fetchPrinters()]);
      setDepartments(depts);
      setPrinters(prts);
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeptSave = () => loadData();
  const handlePrinterSave = () => loadData();

  const handleDeleteDepartment = async (id: string) => {
    if (!confirm("هل تريد حذف هذا القسم؟")) return;
    try {
      await deleteDepartment(id);
      loadData();
    } catch {
      alert("حدث خطأ أثناء الحذف.");
    }
  };

  const handleDeletePrinter = async (id: string) => {
    if (!confirm("هل تريد حذف هذه الطابعة؟")) return;
    try {
      await deletePrinter(id);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "حدث خطأ أثناء الحذف.");
    }
  };

  // If only one tab is shown, don't render tabs
  const showTabs = showPrintersTab && showDepartmentsTab;

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs - only show if both tabs are enabled */}
      {showTabs && (
        <div className="flex border-b">
          <Button
            variant={activeTab === "departments" ? "default" : "ghost"}
            onClick={() => setActiveTab("departments")}
          >
            الأقسام ({departments.length})
          </Button>
          <Button
            variant={activeTab === "printers" ? "default" : "ghost"}
            onClick={() => setActiveTab("printers")}
          >
            الطابعات ({printers.length})
          </Button>
        </div>
      )}

      {/* Departments Tab */}
      {showDepartmentsTab && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>إدارة الأقسام</CardTitle>
            <Button onClick={() => setDeptModal({ open: true, editing: undefined })}>
              إضافة قسم
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">جارٍ التحميل...</div>
            ) : departments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">لا توجد أقسام.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        الاسم
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        الطابعة
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        الحالة
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        الإجراءات
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {departments.map((dept) => {
                      const printer = printers.find((p) => p.id === dept.printerId);
                      return (
                        <tr key={dept.id} className="border-b">
                          <td className="px-4 py-3 text-sm font-medium">{dept.name}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {printer ? printer.name : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={dept.active ? "default" : "secondary"}>
                              {dept.active ? "نشط" : "غير نشط"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setDeptModal({ open: true, editing: dept })
                                }
                              >
                                تعديل
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => handleDeleteDepartment(dept.id)}
                              >
                                حذف
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Printers Tab */}
      {showPrintersTab && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>إدارة الطابعات</CardTitle>
            <Button onClick={() => setPrinterModal({ open: true, editing: undefined })}>
              إضافة طابعة
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">جارٍ التحميل...</div>
            ) : printers.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">لا توجد طابعات.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        الاسم
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        النوع
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        التفاصيل
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        الأقسام المرتبطة
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        الإجراءات
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {printers.map((printer) => {
                      const linkedDepts = departments.filter(
                        (d) => d.printerId === printer.id
                      );
                      return (
                        <tr key={printer.id} className="border-b">
                          <td className="px-4 py-3 text-sm font-medium">{printer.name}</td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary">
                              {printer.type === "usb" ? "USB" : "Network"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {printer.type === "network"
                              ? `${printer.address}:${printer.port}`
                              : printer.usbIdentifier}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {linkedDepts.length > 0
                              ? linkedDepts.map((d) => d.name).join("، ")
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setPrinterModal({ open: true, editing: printer })
                                }
                              >
                                تعديل
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => handleDeletePrinter(printer.id)}
                              >
                                حذف
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      <DepartmentModal
        departments={departments}
        printers={printers}
        open={deptModal.open}
        onClose={() => setDeptModal({ open: false })}
        onSave={handleDeptSave}
        editing={deptModal.editing}
      />
      <PrinterModal
        printers={printers}
        open={printerModal.open}
        onClose={() => setPrinterModal({ open: false })}
        onSave={handlePrinterSave}
        editing={printerModal.editing}
      />
    </div>
  );
}
