"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchOrders, type DateFilter } from "@/lib/orders";
import { checkPrintServerHealth } from "@/lib/print-client";
import type { Order } from "@/types";
import { OrderDetailModal } from "@/components/order-detail-modal";

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

export default function HistoryPage() {
  const [filter, setFilter] = useState<DateFilter>("today");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [search, setSearch] = useState("");
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  // Check the print server health once on mount.
  useEffect(() => {
    let cancelled = false;
    checkPrintServerHealth().then((ok) => {
      if (!cancelled) setServerOnline(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter orders by the search term (customer name, phone, invoice/order number).
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      [o.customer.name, o.customer.phone, o.invoiceNumber, o.orderNumber].some(
        (field) => field.toLowerCase().includes(q)
      )
    );
  }, [orders, search]);

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
      <header className="flex items-center justify-between border-b px-6 py-4 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold">سجل الفواتير / الطلبات</h1>
          <p className="text-sm text-muted-foreground">
            مراجعة جميع الطلبات والفواتير السابقة
          </p>
        </div>
        {serverOnline !== null && (
          <Badge variant={serverOnline ? "secondary" : "destructive"}>
            {serverOnline ? "خادم الطباعة متصل" : "خادم الطباعة غير متصل"}
          </Badge>
        )}
      </header>

      <section className="flex-1 p-6 overflow-y-auto">
        {/* Filter Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3">
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
              <div className="max-w-sm">
                <Input
                  type="search"
                  placeholder="بحث بالعميل، الهاتف، رقم الفاتورة أو الطلب..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Orders List */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>
              الطلبات ({filteredOrders.length})
              {search.trim() !== "" && filteredOrders.length !== orders.length
                ? ` من ${orders.length}`
                : ""}
            </CardTitle>
            <CardDescription>
              انقر على أي طلب لعرض التفاصيل
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                جارٍ التحميل...
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {orders.length === 0
                  ? "لا توجد طلبات في هذا النطاق الزمني."
                  : "لا توجد طلبات مطابقة لبحثك."}
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
                    {filteredOrders.map((order) => {
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