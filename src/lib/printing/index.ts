/**
 * Bridge re-exports between legacy `@/lib/printing` and the new `@/printing/*` module.
 */
export { generateAllPrintJobs } from "@/printing/print-service";
export type { PrintConfig, PrintJob } from "@/printing/print-service";