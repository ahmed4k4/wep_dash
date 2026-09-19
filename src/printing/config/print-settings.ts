/**
 * Print job settings and the internal print job structure.
 *
 * The print job is UI-independent: it carries only what the transport
 * layer needs to send a job to a printer. It never knows about React,
 * Firebase, or networking.
 */

import type { PaperWidth } from "@/printing/config/paper";

export type PrintJobType = "full" | "butcher" | "cheese";

/** Visual style settings are defined in styles/invoice-style.ts */
export interface PrintSettings {
  paperWidth: PaperWidth;
  printerId?: string;
  copies: number;
}

/**
 * A fully rendered, transport-ready print job.
 * `payload` holds the raw ESC/POS byte sequence (rendered raster).
 */
export interface PrintJob {
  type: PrintJobType;
  paperWidth: PaperWidth;
  printerId?: string;
  copies: number;
  metadata: {
    invoiceNumber: string;
    printedAt: string;
  };
  payload: Uint8Array;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paperWidth: "58mm",
  copies: 1,
};