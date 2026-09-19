"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrderItem } from "@/types";
import { fetchDepartments } from "@/lib/departments";

const emptyItem = (): OrderItem => ({
  department: "",
  productName: "",
  quantity: "",
  weight: "",
  notes: "",
});

export function OrderItems({
  items,
  onChange,
}: {
  items: OrderItem[];
  onChange: (items: OrderItem[]) => void;
}) {
  const [departments, setDepartments] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    fetchDepartments()
      .then((depts) => {
        if (mounted) {
          setDepartments(depts.filter((d) => d.active).map((d) => d.name));
        }
      })
      .catch(() => {
        // ignore; departments stay empty and UI shows a hint
      });
    return () => {
      mounted = false;
    };
  }, []);

  const updateItem = (index: number, field: keyof OrderItem, value: string) => {
    const next = items.map((item, i) =>
      i === index ? { ...item, [field]: value } : item,
    );
    onChange(next);
  };

  const addItem = () => {
    onChange([...items, emptyItem()]);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">عناصر الطلب</h3>
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          إضافة عنصر
        </Button>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          لا توجد عناصر. اضغط «إضافة عنصر» للبدء.
        </p>
      )}

      {items.map((item, index) => (
        <Card key={index} className="border">
          <CardHeader className="flex flex-row items-center justify-between py-2">
            <CardTitle className="text-sm">عنصر {index + 1}</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => removeItem(index)}
            >
              حذف
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>القسم</Label>
              <select
                value={item.department}
                onChange={(e) =>
                  updateItem(index, "department", e.target.value)
                }
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">اختر القسم</option>
                {departments.map((dep) => (
                  <option key={dep} value={dep}>
                    {dep}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>اسم المنتج</Label>
              <Input
                value={item.productName}
                placeholder="اسم المنتج"
                onChange={(e) =>
                  updateItem(index, "productName", e.target.value)
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>الكمية</Label>
              <Input
                value={item.quantity}
                placeholder="الكمية"
                onChange={(e) => updateItem(index, "quantity", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>الوزن</Label>
              <Input
                value={item.weight}
                placeholder="الوزن"
                onChange={(e) => updateItem(index, "weight", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>ملاحظات</Label>
              <Input
                value={item.notes}
                placeholder="ملاحظات"
                onChange={(e) => updateItem(index, "notes", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
