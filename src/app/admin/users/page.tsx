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
import { createUser, fetchUsers, deleteUser } from "@/lib/auth";
import type { Role } from "@/types";

export default function UsersPage() {
  const [users, setUsers] = useState<Array<{ uid: string; name: string; email: string; role: Role }>>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<{ uid: string; name: string; email: string; role: Role } | null>(null);
  const [formData, setFormData] = useState({ name: "", email: "", password: "", role: "employee" as Role });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openCreateModal = () => {
    setEditing(null);
    setFormData({ name: "", email: "", password: "", role: "employee" });
    setError("");
    setModalOpen(true);
  };

  const openEditModal = (user: { uid: string; name: string; email: string; role: Role }) => {
    setEditing(user);
    setFormData({ name: user.name, email: user.email, password: "", role: user.role });
    setError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.name.trim() || !formData.email.trim()) {
      setError("الاسم والبريد الإلكتروني مطلوبان.");
      return;
    }

    if (!editing && !formData.password.trim()) {
      setError("كلمة المرور مطلوبة للمستخدم الجديد.");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        // For editing, we'd need an update API - for now just recreate
        // In a real app, you'd have an updateUser function
        alert("تعديل المستخدم يتطلب إعادة إنشاؤه. سيتم إضافة هذه الميزة لاحقاً.");
      } else {
        await createUser(formData.email.trim(), formData.password, formData.name.trim(), formData.role);
        loadUsers();
        closeModal();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ أثناء الحفظ.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (uid: string) => {
    if (!confirm("هل تريد حذف هذا المستخدم؟")) return;
    try {
      await deleteUser(uid);
      loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "حدث خطأ أثناء الحذف.");
    }
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">إدارة المستخدمين</h1>
          <p className="text-sm text-muted-foreground">
            إنشاء حسابات المدراء والموظفين
          </p>
        </div>
        <Button onClick={openCreateModal}>إضافة مستخدم</Button>
      </header>

      <section className="flex-1 p-6 overflow-y-auto">
        <Card>
          <CardHeader>
            <CardTitle>المستخدمون ({users.length})</CardTitle>
            <CardDescription>
              انقر على تعديل لتغيير الدور أو البيانات
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">جارٍ التحميل...</div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">لا يوجد مستخدمين.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        الاسم
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        البريد الإلكتروني
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        الدور
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                        الإجراءات
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.uid} className="border-b">
                        <td className="px-4 py-3 text-sm font-medium">{user.name}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground" dir="ltr">{user.email}</td>
                        <td className="px-4 py-3">
                          <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                            {user.role === "admin" ? "مدير" : "موظف"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditModal(user)}
                            >
                              تعديل
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => handleDelete(user.uid)}
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

        {/* Create/Edit User Modal */}
        {modalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={closeModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-modal-title"
          >
            <div
              className="w-full max-w-md bg-background rounded-lg shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <form onSubmit={handleSubmit}>
                <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
                  <CardTitle id="user-modal-title" className="text-lg">
                    {editing ? "تعديل المستخدم" : "إضافة مستخدم"}
                  </CardTitle>
                  <Button type="button" variant="ghost" size="icon" onClick={closeModal}>
                    ✕
                  </Button>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="user-name">الاسم</Label>
                    <Input
                      id="user-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="مثال: أحمد محمد"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="user-email">البريد الإلكتروني</Label>
                    <Input
                      id="user-email"
                      type="email"
                      dir="ltr"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="example@company.com"
                      required
                    />
                  </div>

                  {!editing && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="user-password">كلمة المرور</Label>
                      <Input
                        id="user-password"
                        type="password"
                        dir="ltr"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="••••••••"
                        required
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <Label>الدور</Label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          value="admin"
                          checked={formData.role === "admin"}
                          onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                          className="h-4 w-4"
                        />
                        <span>مدير</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          value="employee"
                          checked={formData.role === "employee"}
                          onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                          className="h-4 w-4"
                        />
                        <span>موظف</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={closeModal}>
                      إلغاء
                    </Button>
                    <Button type="submit" disabled={saving}>
                      {saving ? "جارٍ الحفظ..." : editing ? "حفظ التعديلات" : "إضافة المستخدم"}
                    </Button>
                  </div>
                </CardContent>
              </form>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}