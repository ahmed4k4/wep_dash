"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CustomerSection,
  type CustomerFormData,
} from "@/components/customer-section";
import { OrderItems } from "@/components/order-items";
import { saveCustomer } from "@/lib/customers";
import { saveOrder } from "@/lib/orders";
import { listenToAuth } from "@/lib/auth";
import { printOrder } from "@/lib/print-client";
import type { PrintConfig } from "@/lib/printing";
import type { Order, OrderItem } from "@/types";

// Shop configuration for receipts
const SHOP_CONFIG: PrintConfig = {
  shopName: "محل الجبنة والجزارة",
  shopAddress: "123 شارع الرئيسي، القاهرة",
  shopPhone: "02-12345678",
};

export default function AdminOrdersPage() {
  const [customer, setCustomer] = useState<CustomerFormData>({
    name: "",
    phone: "",
    address: "",
  });
  const [windowNumber, setWindowNumber] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [creator, setCreator] = useState("");
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState("");
  const [lastOrderNumber, setLastOrderNumber] = useState("");

  // Listen to auth to get the creator name
  useEffect(() => {
    const unsubscribe = listenToAuth(async (user) => {
      if (user) {
        setCreator(user.email ?? "مستخدم");
      }
    });
    return unsubscribe;
  }, []);

  const handleCreateOrder = async () => {
    if (!customer.name.trim()) {
      setMessage("يرجى إدخال اسم العميل.");
      return;
    }
    if (!windowNumber.trim()) {
      setMessage("يرجى إدخال رقم النافذة.");
      return;
    }
    if (items.length === 0) {
      setMessage("يرجى إضافة عنصر واحد على الأقل للطلب.");
      return;
    }
    if (items.some((item) => !item.department || !item.productName.trim())) {
      setMessage("يرجى تعبئة جميع حقول العناصر (القسم، اسم المنتج).");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      // Save customer first (creates or updates)
      const customerId = await saveCustomer(
        { name: customer.name, phone: customer.phone, address: customer.address },
        customer.id
      );

      // Then save the order (generates invoiceNumber and orderNumber)
      const { invoiceNumber, orderNumber } = await saveOrder({
        customerId,
        customer: { name: customer.name, phone: customer.phone, address: customer.address },
        windowNumber,
        items,
        creator,
      });

      setLastInvoiceNumber(invoiceNumber);
      setLastOrderNumber(orderNumber);
      setMessage(`تم إنشاء الطلب بنجاح. الفاتورة: ${invoiceNumber}، الطلب: ${orderNumber}`);

      // Build full order object for printing
      const order: Order = {
        id: "",
        invoiceNumber,
        orderNumber,
        customerId,
        customer: { name: customer.name, phone: customer.phone, address: customer.address },
        windowNumber,
        items,
        creator,
        createdAt: new Date().toISOString(),
      };

      // Print after successful save
      try {
        await printOrder(order, SHOP_CONFIG);
        setMessage((prev) => prev + " | تم الإرسال للطباعة.");
      } catch (printErr) {
        console.error("[AdminOrdersPage] Print failed:", printErr);
        setMessage((prev) => prev + " | فشل في الإرسال للطابعة.");
      }

      // Reset form
      setCustomer({ name: "", phone: "", address: "" });
      setWindowNumber("");
      setItems([]);
    } catch {
      setMessage("حدث خطأ أثناء إنشاء الطلب.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">إنشاء فاتورة / طلب</h1>
          <p className="text-sm text-muted-foreground">
            إنشاء طلب جديد للعميل (نفس وظيفة الموظف)
          </p>
        </div>
      </header>

      <section className="flex flex-1 flex-col gap-4 p-6 lg:flex-row">
        {/* Left column: Order creation */}
        <Card className="flex-1 flex flex-col">
          <CardHeader>
            <CardTitle>طلب جديد</CardTitle>
            <CardDescription>إنشاء طلب جديد للعميل</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 flex-1 overflow-y-auto">
            {/* Last generated numbers display */}
            {(lastInvoiceNumber || lastOrderNumber) && (
              <div className="rounded-md bg-muted/50 p-3 text-sm border">
                <p className="font-medium">آخر طلب محفوظ:</p>
                {lastInvoiceNumber && (
                  <p>رقم الفاتورة: <span className="font-mono">{lastInvoiceNumber}</span></p>
                )}
                {lastOrderNumber && (
                  <p>رقم الطلب اليومي: <span className="font-mono">{lastOrderNumber}</span></p>
                )}
              </div>
            )}

            {/* Customer Section */}
            <div className="border-b pb-4">
              <h3 className="text-sm font-medium mb-3">بيانات العميل</h3>
              <CustomerSection onChange={setCustomer} />
            </div>

            {/* Window Number */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="window-number">رقم النافذة</Label>
              <Input
                id="window-number"
                dir="ltr"
                placeholder="مثال: 1"
                value={windowNumber}
                onChange={(e) => setWindowNumber(e.target.value)}
              />
            </div>

            {/* Order Items */}
            <OrderItems items={items} onChange={setItems} />

            {/* Messages */}
            {message && (
              <p
                className={
                  message.includes("بنجاح")
                    ? "text-sm text-green-600"
                    : "text-sm text-destructive"
                }
              >
                {message}
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button onClick={handleCreateOrder} disabled={saving}>
                {saving ? "جارٍ الحفظ..." : "إنشاء الطلب"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right column: Current orders list */}
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>الطلبات الحالية</CardTitle>
            <CardDescription>عرض ومتابعة الطلبات</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            سيتم إضافة عرض الطلبات هنا.
          </CardContent>
        </Card>
      </section>
    </main>
  );
}