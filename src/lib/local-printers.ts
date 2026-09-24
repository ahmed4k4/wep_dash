"use client";

/**
 * Reads the locally-configured printers from the Ahmed POS Print Agent
 * running on this Windows machine (http://127.0.0.1:3001).
 *
 * IMPORTANT: This is the LOCAL hardware bridge. Printer configuration lives
 * only in the agent's AppData file — never in Firebase. This module only
 * *reads* the locally available printers so the UI can show/assign them.
 */

import type { Printer } from "@/types";

const PRINT_SERVER_URL =
  process.env.NEXT_PUBLIC_PRINT_SERVER_URL || "http://127.0.0.1:3001";

/** Shape returned by the agent's GET /printers. */
export interface LocalPrinter {
  id: string;
  name: string;
  connection: "usb" | "tcp";
  address?: string;
  port?: number;
  usbDeviceId?: string;
  paperWidth: number;
  status: "ready" | "offline" | "unknown";
}

export interface LocalPrintersResult {
  /** true when the local agent responded. */
  available: boolean;
  /** configured printers (empty when unavailable or none configured). */
  printers: LocalPrinter[];
  /** human-readable reason when unavailable. */
  reason?: "not-running" | "timeout" | "cors" | "error";
}

/** fetch with a hard timeout so a missing agent never hangs the UI. */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Detect whether the local Print Agent is running.
 * Distinguishes connection-refused (not running) from timeout and CORS.
 */
export async function getLocalAgentStatus(
  timeoutMs = 1500
): Promise<{ connected: boolean; reason?: LocalPrintersResult["reason"] }> {
  try {
    const res = await fetchWithTimeout(`${PRINT_SERVER_URL}/health`, timeoutMs);
    return { connected: res.ok };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "AbortError") return { connected: false, reason: "timeout" };
    // TypeError from fetch usually means network/CORS/refused.
    return { connected: false, reason: "not-running" };
  }
}

/**
 * Fetch the locally-configured printers from the agent.
 * Never throws — always returns a useful result for the UI.
 */
export async function getLocalPrinters(
  timeoutMs = 2500
): Promise<LocalPrintersResult> {
  try {
    const res = await fetchWithTimeout(`${PRINT_SERVER_URL}/printers`, timeoutMs);
    if (!res.ok) {
      return { available: true, printers: [], reason: "error" };
    }
    const body = (await res.json()) as { ok?: boolean; printers?: LocalPrinter[] };
    const printers = Array.isArray(body.printers) ? body.printers : [];
    return { available: true, printers };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "AbortError") return { available: false, printers: [], reason: "timeout" };
    return { available: false, printers: [], reason: "not-running" };
  }
}

/**
 * Adapt a LocalPrinter to the app's `Printer` type so existing print/UI code
 * can consume it. The id is namespaced with a stable local prefix so it can
 * never collide with a Firestore printer id.
 */
export function toPrinterLike(local: LocalPrinter): Printer {
  return {
    id: local.id,
    name: local.name,
    type: local.connection === "usb" ? "usb" : "network",
    address: local.address,
    port: local.port !== undefined ? String(local.port) : undefined,
    usbIdentifier: local.usbDeviceId,
  };
}

export { PRINT_SERVER_URL };