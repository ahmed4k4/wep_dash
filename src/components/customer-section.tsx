"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchCustomers } from "@/lib/customers";
import type { Customer } from "@/types";

export interface CustomerFormData {
  id?: string;
  name: string;
  phone: string;
  address: string;
}

export function CustomerSection({
  onChange,
}: {
  onChange: (data: CustomerFormData) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const delay = setTimeout(async () => {
      if (name.trim()) {
        const matches = await searchCustomers(name);
        setResults(matches);
        setShowResults(true);
      } else {
        setResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(delay);
  }, [name]);

  const [id, setId] = useState<string | undefined>(undefined);

  useEffect(() => {
    onChange({ id, name, phone, address });
  }, [id, name, phone, address, onChange]);

  const selectCustomer = (customer: Customer) => {
    setId(customer.id);
    setName(customer.name);
    setPhone(customer.phone);
    setAddress(customer.address);
    setShowResults(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex flex-col gap-2">
        <Label htmlFor="customer-name">اسم العميل</Label>
        <Input
          id="customer-name"
          placeholder="ابدأ بكتابة اسم العميل..."
          value={name}
          onChange={(e) => {
            setId(undefined);
            setName(e.target.value);
          }}
          autoComplete="off"
        />
        {showResults && results.length > 0 && (
          <ul className="absolute top-full z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
            {results.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-right text-sm hover:bg-muted"
                  onClick={() => selectCustomer(customer)}
                >
                  {customer.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {showResults && name.trim() && results.length === 0 && (
          <p className="text-xs text-muted-foreground">
            لا يوجد عملاء مطابقون — أدخل البيانات أدناه لعميل جديد.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="customer-phone">رقم الهاتف</Label>
        <Input
          id="customer-phone"
          dir="ltr"
          placeholder="01xxxxxxxxx"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="customer-address">العنوان</Label>
        <Input
          id="customer-address"
          placeholder="اكتب عنوان العميل"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
          }}
        />
      </div>
    </div>
  );
}