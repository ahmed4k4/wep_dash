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
import { fetchOrders, type DateFilter } from "@/lib/orders";
import { OrderDetailModal } from "@/components/order-detail-modal";
import type { Order } from "@/types";
import Link from "next/link";

const FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "today", label: "اليوم" },
  { value: "week", label: "الأسبوع" },
  { value: "month", label: "الشهر" },
  { value: "6months", label: "آخر 6 أشهر" },
  { value: "year", label: "السنة" },
];

const formatDateTime = (iso: string) => {
  const date = new Date(iso);
  return {
    date: date.toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    time: date.toLocaleTimeString("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
};

export default function AdminPage() {
  const [filter, setFilter] = useState<DateFilter>("today");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await fetchOrders(filter);
      if (data) setOrders(data);
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [filter]);

  return (
    <main className="flex flex-1 flex-col">
      <section className="flex-1 p-6 overflow-y-auto">
        {/* Welcome/Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الطلبات اليوم</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orders.length}</div>
              <p className="text-xs text-muted-foreground">
                مرشح: {FILTER_OPTIONS.find((o) => o.value === filter)?.label ?? filter}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إنشاء طلب جديد</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href="/admin/orders">
                <Button className="w-full">الذهاب لإنشاء طلب</Button>
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">سجل الفواتير</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href="/admin/history">
                <Button variant="outline" className="w-full">عرض السجل</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle>أحدث الطلبات ({orders.length})</CardTitle>
            <CardDescription>
              انقر على أي طلب لعرض التفاصيل
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 border-b">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium">تصفية حسب التاريخ:</span>
                {FILTER_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={filter === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                جارٍ التحميل...
              </div>
            ) : orders.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                لا توجد طلبات في هذا النطاق الزمني.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        رقم الفاتورة
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        رقم الطلب
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        العميل
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        الهاتف
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        النافذة
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        التاريخ
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        الوقت
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        تم الإنشاء بواسطة
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const { date, time } = formatDateTime(order.createdAt);
                      return (
                        <tr
                          key={order.id}
                          className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() => setSelectedOrder(order)}
                        >
                          <td className="px-4 py-3 text-sm font-mono">
                            {order.invoiceNumber}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono">
                            {order.orderNumber}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium">
                            {order.customer.name}
                          </td>
                          <td className="px-4 py-3 text-sm" dir="ltr">
                            {order.customer.phone}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {order.windowNumber}
                          </td>
                          <td className="px-4 py-3 text-sm">{date}</td>
                          <td className="px-4 py-3 text-sm">{time}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {order.creator}
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

        {/* Quick Links */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Link href="/admin/users">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="text-3xl">👥</div>
                <h3 className="font-medium mt-2">إدارة المستخدمين</h3>
                <p className="text-sm text-muted-foreground">
                  إنشاء حسابات المدراء والموظفين
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/departments">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="text-3xl">📁</div>
                <h3 className="font-medium mt-2">إدارة الأقسام</h3>
                <p className="text-sm text-muted-foreground">
                  إضافة وتعديل أقسام الطلبات
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/printers">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="text-3xl">🖨️</div>
                <h3 className="font-medium mt-2">إدارة الطابعات</h3>
                <p className="text-sm text-muted-foreground">
                  تكوين الطابعات وتعيينها للأقسام
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Order Detail Modal */}
        <OrderDetailModal
          order={selectedOrder}
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      </section>
    </main>
  );
}
