"use client";

/**
 * Local printer assignment (per Windows machine / browser session).
 *
 * The POS keeps *logical* printers (butcher / cheese / full invoice) in
 * Firebase. This module maps those logical ids to one of the printers that
 * the local Ahmed POS Print Agent actually exposes on THIS machine.
 *
 * The mapping lives in localStorage only — raw USB handles, IPs and other
 * machine-specific hardware state are NEVER stored in Firebase.
 */

export interface LocalAssignment {
  /** Firestore/logical printer id (e.g. the department's printerId). */
  logicalPrinterId: string;
  /** Local agent printer id (from GET /printers). */
  localPrinterId: string;
}

const STORAGE_KEY = "ahmed-pos:local-printer-assignments";

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

/** Returns the local printer id assigned to a logical printer, if any. */
export function getAssignment(logicalPrinterId: string): string | undefined {
  return readMap()[logicalPrinterId];
}

/** Assign a logical printer to a local agent printer. */
export function setAssignment(logicalPrinterId: string, localPrinterId: string): void {
  const map = readMap();
  map[logicalPrinterId] = localPrinterId;
  writeMap(map);
}

/** Remove a single assignment. */
export function clearAssignment(logicalPrinterId: string): void {
  const map = readMap();
  delete map[logicalPrinterId];
  writeMap(map);
}

/** Remove all assignments (e.g. on sign-out or machine reset). */
export function clearAllAssignments(): void {
  writeMap({});
}

/** All current assignments as an array. */
export function listAssignments(): LocalAssignment[] {
  return Object.entries(readMap()).map(([logicalPrinterId, localPrinterId]) => ({
    logicalPrinterId,
    localPrinterId,
  }));
}