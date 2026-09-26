"use client";

import { generateAllPrintJobs } from "@/lib/printing";
import type { PrintConfig } from "@/lib/printing";
import type { Order } from "@/types";
import { getLocalPrinters } from "@/lib/local-printers";
import { getAssignment, FULL_INVOICE_ROLE } from "@/lib/local-printer-assignment";

const PRINT_SERVER_URL =
  process.env.NEXT_PUBLIC_PRINT_SERVER_URL || "http://127.0.0.1:3001";

export class PrintServerConnectionError extends Error {
  constructor(url: string) {
    super(`تعذر الاتصال ببرنامج الطباعة المحلي على ${url}`);
    this.name = "PrintServerConnectionError";
  }
}

export class PrinterConnectionError extends Error {
  constructor(target: string, code?: string) {
    super(
      code
        ? `تعذر الاتصال بالطابعة (${code})`
        : `تعذر الاتصال بالطابعة ${target}`
    );
    this.name = "PrinterConnectionError";
  }
}

export class NoLocalPrinterAssignedError extends Error {
  constructor(roleName: string) {
    super(
      `لا توجد طابعة محلية مرتبطة بـ «${roleName}» في Ahmed POS Print Agent.`
    );
    this.name = "NoLocalPrinterAssignedError";
  }
}

/** Friendly Arabic label for a logical role. */
function roleLabel(role: string): string {
  if (role === FULL_INVOICE_ROLE) return "الفاتورة الكاملة";
  return role;
}

/**
 * Resolve a logical role to a LOCAL agent printer id via the per-machine
 * assignment. Returns null when nothing valid is assigned.
 */
async function resolveLocalPrinterId(role: string): Promise<string | null> {
  const assigned = getAssignment(role);
  if (!assigned) return null;
  // Verify it still exists in the local agent BEFORE sending.
  const { printers } = await getLocalPrinters();
  const exists = printers.some((p) => p.id === assigned);
  return exists ? assigned : null;
}

/**
 * Send one binary ESC/POS job to the local agent.
 *
 * SECURITY: we only send the `printerId` (an id the agent already knows) and
 * the binary `data`. We never send IPs/ports, so the website can never use
 * the agent as an arbitrary TCP proxy — the agent resolves the destination
 * from its own local configuration.
 */
async function sendJob(printerId: string, data: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${PRINT_SERVER_URL}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printerId, data }),
    });
  } catch (fetchErr) {
    console.error(
      `[Print Client] Failed to reach print server at ${PRINT_SERVER_URL}:`,
      fetchErr
    );
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
    console.error(
      `[Print Client] Print server error (${response.status}) for ${printerId}:`,
      rawErr
    );
    const codeMatch = rawErr.match(/\b(E[A-Z0-9]+)\b/);
    throw new PrinterConnectionError(printerId, codeMatch ? codeMatch[1] : undefined);
  }
}

export async function printOrder(order: Order, config: PrintConfig): Promise<void> {
  const jobs = await generateAllPrintJobs(order, config);

  if (jobs.length === 0) {
    console.warn("[Print Client] No print jobs generated for order");
    return;
  }

  for (const job of jobs) {
    const localPrinterId = await resolveLocalPrinterId(job.role);
    if (!localPrinterId) {
      throw new NoLocalPrinterAssignedError(roleLabel(job.role));
    }

    try {
      console.log(
        `[Print Client] POST → ${PRINT_SERVER_URL}/print (role: ${job.role}, local: ${localPrinterId})`
      );
      await sendJob(localPrinterId, job.data);
      console.log(`[Print Client] Sent job to local printer ${localPrinterId}`);
    } catch (err) {
      if (
        err instanceof PrintServerConnectionError ||
        err instanceof PrinterConnectionError
      ) {
        throw err;
      }
      console.error(`[Print Client] Failed to print to ${localPrinterId}:`, err);
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
    const response = await fetch(`${PRINT_SERVER_URL}/health`, {
      method: "GET",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    console.warn(
      `[Print Client] Print server health check FAILED for ${PRINT_SERVER_URL}`
    );
    return false;
  }
}