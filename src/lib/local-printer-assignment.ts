"use client";

/**
 * Local printer assignment (per Windows machine / browser profile).
 *
 * The POS keeps *logical roles* (departments such as جزارة / جبنة, plus the
 * full-invoice role) in Firebase. This module maps each logical ROLE to one of
 * the printers that the local Ahmed POS Print Agent actually exposes on THIS
 * machine.
 *
 * The mapping lives in localStorage only — raw USB handles, IPs and other
 * machine-specific hardware state are NEVER stored in Firebase. As a result
 * many customers can share the same website: each machine assigns its own
 * physical printers to the same logical roles.
 */

/** Constant role key for the "full invoice" logical printer. */
export const FULL_INVOICE_ROLE = "__full_invoice__";

const STORAGE_KEY = "ahmed-pos:local-printer-assignments";

export interface LocalAssignment {
  /** Logical role key (department name, or FULL_INVOICE_ROLE). */
  role: string;
  /** Local agent printer id (from GET /printers). */
  localPrinterId: string;
}

function readMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota/serialization errors */
  }
}

/** Returns the local printer id assigned to a role, if any. */
export function getAssignment(role: string): string | undefined {
  return readMap()[role];
}

/** Assign a role to a local agent printer. */
export function setAssignment(role: string, localPrinterId: string): void {
  const map = readMap();
  map[role] = localPrinterId;
  writeMap(map);
}

/** Remove a single assignment. */
export function clearAssignment(role: string): void {
  const map = readMap();
  delete map[role];
  writeMap(map);
}

/** Remove all assignments (e.g. on sign-out or machine reset). */
export function clearAllAssignments(): void {
  writeMap({});
}

/** All current assignments as an array. */
export function listAssignments(): LocalAssignment[] {
  return Object.entries(readMap()).map(([role, localPrinterId]) => ({
    role,
    localPrinterId,
  }));
}

/** Reverse lookup: which role (if any) a local printer is assigned to. */
export function getRoleForLocalPrinter(
  localPrinterId: string
): string | undefined {
  const map = readMap();
  return Object.keys(map).find((role) => map[role] === localPrinterId);
}