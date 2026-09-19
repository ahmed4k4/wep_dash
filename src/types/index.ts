export type Role = "admin" | "employee";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
}

// Department for order items (backward compatible)
export type DepartmentName = "جبنة" | "جزارة" | string;

// Firestore Department document
export interface Department {
  id: string;
  name: string;
  printerId: string | null;
  active: boolean;
}

// Printer document
export type PrinterType = "usb" | "network";

export interface Printer {
  id: string;
  name: string;
  type: PrinterType;
  // For network printers
  address?: string;
  port?: string;
  // For USB printers
  usbIdentifier?: string;
  vendorId?: number;
  productId?: number;
  // For full invoice printing
  isFullInvoicePrinter?: boolean;
  // For USB device identification
  manufacturerName?: string;
  productName?: string;
  serialNumber?: string;
}

export interface OrderItem {
  department: DepartmentName | "";
  productName: string;
  quantity: string;
  weight: string;
  notes: string;
}

export interface Order {
  id?: string;
  invoiceNumber: string;
  orderNumber: string;
  customerId?: string;
  customer: {
    name: string;
    phone: string;
    address: string;
  };
  windowNumber: string;
  items: OrderItem[];
  creator: string;
  createdAt: string;
}