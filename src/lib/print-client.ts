"use client";

import { generateAllPrintJobs } from "@/lib/printing";
import type { PrintConfig } from "@/lib/printing";
import type { Order, Printer } from "@/types";
import { fetchPrinters, fetchDepartments } from "@/lib/departments";

const PRINT_SERVER_URL = process.env.NEXT_PUBLIC_PRINT_SERVER_URL || "http://127.0.0.1:3001";

export class PrintServerConnectionError extends Error {
  constructor(url: string) {
    super(`تعذر الاتصال بخادم الطباعة على ${url}`);
    this.name = "PrintServerConnectionError";
  }
}

export class PrinterConnectionError extends Error {
  constructor(address: string, port?: string | number, code?: string) {
    const target = port ? `${address}:${port}` : address;
    super(
      code
        ? `تعذر الاتصال بالطابعة ${target} (${code})`
        : `تعذر الاتصال بالطابعة ${target}`
    );
    this.name = "PrinterConnectionError";
  }
}

async function fetchPrinterData(): Promise<{
  printers: Map<string, Printer>;
  departmentPrinterMap: Map<string, string>;
}> {
  const [printers, departments] = await Promise.all([fetchPrinters(), fetchDepartments()]);
  const printersById = new Map<string, Printer>();
  const departmentPrinterMap = new Map<string, string>();

  printers.forEach((printer) => {
    printersById.set(printer.id, printer);
  });

  departments.forEach((dept) => {
    if (dept.printerId) {
      departmentPrinterMap.set(dept.name, dept.printerId);
    }
  });

  return { printers: printersById, departmentPrinterMap };
}

export async function printOrder(order: Order, config: PrintConfig): Promise<void> {
  // Get printer assignments from departments
  const { printers, departmentPrinterMap } = await fetchPrinterData();
  
  // Generate print jobs
  const jobs = await generateAllPrintJobs(order, printers, departmentPrinterMap, config);
  
  if (jobs.length === 0) {
    console.warn("[Print Client] No print jobs generated for order");
    return;
  }
  
  // Send each job to the print server
  for (const job of jobs) {
    const printer = printers.get(job.printerId);
    
    if (!printer) {
      console.warn(`[Print Client] Printer not found for job: ${job.printerId}`);
      continue;
    }
    
    try {
      console.log(`[Print Client] POST → ${PRINT_SERVER_URL}/print (printer: ${printer.id}, type: ${printer.type})`);

      let response: Response;
      try {
        response = await fetch(`${PRINT_SERVER_URL}/print`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            printerId: printer.id,
            data: job.data,
            type: printer.type,
            address: printer.address,
            port: printer.port,
            vendorId: printer.type === "usb" ? `0x${printer.vendorId?.toString(16) || "0"}` : undefined,
            productId: printer.type === "usb" ? `0x${printer.productId?.toString(16) || "0"}` : undefined,
          }),
        });
      } catch (fetchErr) {
        // Browser could not reach the print server (network-level failure)
        console.error(`[Print Client] Failed to reach print server at ${PRINT_SERVER_URL}:`, fetchErr);
        throw new PrintServerConnectionError(PRINT_SERVER_URL);
      }

      if (!response.ok) {
        let errorPayload: { error?: string; code?: string } = {};
        try {
          errorPayload = await response.json();
        } catch {
          // ignore JSON parse failures
        }
        const rawErr = errorPayload.error || `HTTP ${response.status}`;
        console.error(`[Print Client] Print server error (${response.status}) for ${printer.id}:`, rawErr);

        // Extract a TCP error code if present (e.g. ECONNREFUSED, ETIMEDOUT)
        const codeMatch = rawErr.match(/\b(E[A-Z0-9]+)\b/);
        const code = codeMatch ? codeMatch[1] : undefined;

        throw new PrinterConnectionError(
          printer.address ?? "unknown",
          printer.port,
          code
        );
      }

      console.log(`[Print Client] Sent job to ${printer.id} via ${PRINT_SERVER_URL}`);
    } catch (err) {
      if (
        err instanceof PrintServerConnectionError ||
        err instanceof PrinterConnectionError
      ) {
        throw err;
      }
      console.error(`[Print Client] Failed to print to ${printer.id}:`, err);
      throw err;
    }
  }
}

// Re-print an existing order without saving it again.
export async function reprintOrder(order: Order, config: PrintConfig): Promise<void> {
  await printOrder(order, config);
}

export async function checkPrintServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PRINT_SERVER_URL}/health`, { method: "GET" });
    return response.ok;
  } catch {
    console.warn(`[Print Client] Print server health check FAILED for ${PRINT_SERVER_URL}`);
    return false;
  }
}
