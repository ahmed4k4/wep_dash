/**
 * Printer configuration.
 *
 * Transport-level printer settings live here, separate from invoice layout.
 * The renderer never touches this — it only produces ESC/POS bytes.
 */

export type PrinterTransport = "network" | "usb" | "local";

export interface PrinterConfig {
  /** Unique identifier used by department-printer-map lookups */
  id: string;
  /** Human-readable display name */
  name: string;
  /** How the printer is connected */
  type: PrinterTransport;
  /** For `network` printers: hostname or IP */
  address?: string;
  /** For `network` printers: TCP port (typical raw ESC/POS is 9100) */
  port?: number;
  /** Connection timeout in milliseconds */
  timeoutMs: number;
  /** For `usb` printers */
  vendorId?: number;
  productId?: number;
  /** Whether this printer receives full invoices (multi-department) */
  isFullInvoicePrinter?: boolean;
}

export const DEFAULT_PRINTER: PrinterConfig = {
  id: "default",
  name: "Receipt Printer",
  type: "network",
  address: "127.0.0.1",
  port: 9100,
  timeoutMs: 3000,
};

/** Create a printer config with defaults applied. */
export function createPrinterConfig(
  partial: Partial<PrinterConfig> & { id: string }
): PrinterConfig {
  return { ...DEFAULT_PRINTER, ...partial, id: partial.id };
}