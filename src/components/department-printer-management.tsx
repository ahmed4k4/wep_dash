"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Department } from "@/types";
import {
  fetchDepartments,
  addDepartment,
  updateDepartment,
  deleteDepartment,
} from "@/lib/departments";

/**
 * Department (logical role) management.
 *
 * Departments are LOGICAL business roles (جبنة / جزارة / ...). They are NOT
 * physical printers. Physical printers are owned exclusively by the local
 * Ahmed POS Print Agent and assigned to these roles from Admin → Printers.
 */

// ===== DEPARTMENT MODAL =====

interface DepartmentModalProps {
  departments: Department[];
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  editing?: Department | null;
}

export function DepartmentModal({
  departments,
  open,
  onClose,
  onSave,
  editing,
}: DepartmentModalProps) {
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Defer out of the effect body to avoid cascading renders.
    const t = setTimeout(() => {
      if (editing) {
        setName(editing.name);
        setActive(editing.active);
      } else {
        setName("");
        setActive(true);
      }
      setError("");
    }, 0);
    return () => clearTimeout(t);
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
        await updateDepartment(editing.id, { name: name.trim(), active });
      } else {
        // Departments are logical roles; no physical printer is bound here.
        await addDepartment(name.trim(), null);
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

            <p className="text-xs text-muted-foreground">
              لربط هذا القسم بطابعة محلية، استخدم صفحة «الطابعات» بعد تشغيل
              برنامج Ahmed POS Print Agent.
            </p>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                إلغاء
              </Button>
              <Button type="submit">
                {editing ? "حفظ التعديلات" : "إضافة القسم"}
              </Button>
            </div>
          </CardContent>
        </form>
      </div>
    </div>
  );
}

// ===== MANAGEMENT PANEL =====

export function DepartmentPrinterPanel() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptModal, setDeptModal] = useState<{
    open: boolean;
    editing?: Department | null;
  }>({ open: false });

  const loadData = async () => {
    setLoading(true);
    try {
      setDepartments(await fetchDepartments());
    } catch {
      // handled silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(loadData, 0);
    return () => clearTimeout(t);
  }, []);

  const handleDeleteDepartment = async (id: string) => {
    if (!confirm("هل تريد حذف هذا القسم؟")) return;
    try {
      await deleteDepartment(id);
      loadData();
    } catch {
      alert("حدث خطأ أثناء الحذف.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>إدارة الأقسام</CardTitle>
          <Button onClick={() => setDeptModal({ open: true, editing: undefined })}>
            إضافة قسم
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              جارٍ التحميل...
            </div>
          ) : departments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              لا توجد أقسام.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" role="table">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                      الاسم
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
                  {departments.map((dept) => (
                    <tr key={dept.id} className="border-b">
                      <td className="px-4 py-3 text-sm font-medium">
                        {dept.name}
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DepartmentModal
        departments={departments}
        open={deptModal.open}
        onClose={() => setDeptModal({ open: false })}
        onSave={loadData}
        editing={deptModal.editing}
      />
    </div>
  );
}