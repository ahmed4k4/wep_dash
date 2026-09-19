"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Order } from "@/types";
import { reprintOrder } from "@/lib/print-client";
import type { PrintConfig } from "@/lib/printing";

// Shop configuration for receipts (same as order pages)
const SHOP_CONFIG: PrintConfig = {
  shopName: "محل الجبنة والجزارة",
  shopAddress: "123 شارع الرئيسي، القاهرة",
  shopPhone: "02-12345678",
};

interface OrderDetailModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

export function OrderDetailModal({
  order,
  isOpen,
  onClose,
}: OrderDetailModalProps) {
  const [reprinting, setReprinting] = useState(false);
  const [reprintMsg, setReprintMsg] = useState("");

  const handleReprint = async () => {
    if (!order) return;
    setReprinting(true);
    setReprintMsg("");
    try {
      await reprintOrder(order, SHOP_CONFIG);
      setReprintMsg("تم إرسال الطلب لإعادة الطباعة.");
    } catch {
      setReprintMsg("فشل إرسال الطلب لإعادة الطباعة.");
    } finally {
      setReprinting(false);
    }
  };

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !order) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-detail-title"
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-background rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
          <CardTitle id="order-detail-title" className="text-lg">
            تفاصيل الطلب
          </CardTitle>
          <CardDescription className="text-sm">
            الفاتورة: <span className="font-mono">{order.invoiceNumber}</span>
          </CardDescription>
          <Button variant="ghost" size="icon" onClick={onClose}>
            ✕
          </Button>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {/* Order Header Info */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-b pb-4">
            <div>
              <p className="text-xs text-muted-foreground">رقم الفاتورة</p>
              <p className="font-mono font-medium">{order.invoiceNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">رقم الطلب اليومي</p>
              <p className="font-mono font-medium">{order.orderNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">التاريخ</p>
              <p>{formatDate(order.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">الوقت</p>
              <p>{formatTime(order.createdAt)}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">العميل</p>
              <p className="font-medium">{order.customer.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">الهاتف</p>
              <p dir="ltr">{order.customer.phone}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">رقم النافذة</p>
              <p>{order.windowNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">تم الإنشاء بواسطة</p>
              <p>{order.creator}</p>
            </div>
          </div>

          {/* Customer Address */}
          {order.customer.address && (
            <div className="border-b pb-4">
              <p className="text-xs text-muted-foreground">العنوان</p>
              <p className="whitespace-pre-wrap">{order.customer.address}</p>
            </div>
          )}

          {/* Items */}
          <div>
            <h3 className="text-sm font-medium mb-2">عناصر الطلب ({order.items.length})</h3>
            {order.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد عناصر</p>
            ) : (
              <div className="space-y-2">
                {order.items.map((item, index) => (
                  <Card key={index} className="border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">
                            {index + 1}. {item.productName}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {item.department}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>الكمية: {item.quantity}</span>
                          <span>الوزن: {item.weight}</span>
                        </div>
                        {item.notes && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            ملاحظات: {item.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2 pt-4 border-t">
            {reprintMsg && (
              <p
                className={
                  reprintMsg.includes("بنجاح")
                    ? "text-sm text-green-600"
                    : "text-sm text-destructive"
                }
              >
                {reprintMsg}
              </p>
            )}
            <div className="flex gap-2 ms-auto">
              <Button
                variant="secondary"
                onClick={handleReprint}
                disabled={reprinting}
              >
                {reprinting ? "جارٍ الطباعة..." : "إعادة طباعة"}
              </Button>
              <Button variant="outline" onClick={onClose}>
                إغلاق
              </Button>
            </div>
          </div>
        </CardContent>
      </div>
    </div>
  );
}