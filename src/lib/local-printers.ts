"use client";

/**
 * Reads the locally-configured printers from the Ahmed POS Print Agent
 * running on this Windows machine.
 *
 * IMPORTANT: This is the LOCAL hardware bridge. Printer configuration lives
 * only in the agent's AppData file — never in Firebase. This module only
 * *reads* the locally available printers so the UI can show/assign them.
 *
 * Chromium Local Network Access (LNA / "Private Network Access"):
 * a public HTTPS page reaching loopback/private addresses is governed by
 * Chromium's LNA permission. The agent grants it server-side
 * (`Access-Control-Allow-Private-Network: true`), but Chrome additionally
 * requires a *user gesture* to raise its own permission prompt.
 *
 * That means the first loopback fetch of a session MUST be started
 * synchronously inside a click handler — NOT after other awaits — or the
 * transient user activation is lost and Chrome silently denies the request.
 * `requestLocalNetworkAccess()` below does exactly that.
 */

import type { Printer } from "@/types";

const HOSTS = ["127.0.0.1", "localhost"];
const PORT = 3001;

/** Primary URL (kept stable for callers). */
const PRINT_SERVER_URL =
  process.env.NEXT_PUBLIC_PRINT_SERVER_URL || `http://${HOSTS[0]}:${PORT}`;

/** Shape returned by the agent's GET /printers. */
export interface LocalPrinter {
  id: string;
  name: string;
  connection: "usb" | "tcp";
  address?: string;
  port?: number;
  usbDeviceId?: string;
  paperWidth: number;
  status: "ready" | "offline" | "unknown" | "printing";
}

/**
 * Distinct outcomes the UI must not conflate:
 *  - "connected"          : agent reachable
 *  - "no-printers"        : agent reachable but no printers configured
 *  - "not-installed"      : never reachable in an environment without LNA
 *  - "not-running"        : connection refused / agent stopped
 *  - "permission-required": Chromium LNA permission must be granted
 *  - "permission-denied"  : user (or policy) denied local network access
 *  - "blocked"            : loopback fetch failed and the browser would not
 *                           confirm whether it was LNA or a stopped agent
 *  - "timeout"            : agent host reachable but slow
 *  - "error"              : other error
 */
export type AgentState =
  | "connected"
  | "no-printers"
  | "not-installed"
  | "not-running"
  | "permission-required"
  | "permission-denied"
  | "blocked"
  | "timeout"
  | "error";

export interface LocalPrintersResult {
  /** true when the local agent responded. */
  available: boolean;
  /** configured printers (empty when unavailable or none configured). */
  printers: LocalPrinter[];
  /** machine-readable state for the UI. */
  state: AgentState;
  /** which host actually answered (127.0.0.1 or localhost). */
  host?: string;
}

export interface AgentStatusResult {
  connected: boolean;
  state: AgentState;
  host?: string;
}

// ---------------------------------------------------------------------------
// Chromium Local Network Access (LNA) permission helpers
// ---------------------------------------------------------------------------

export type PermissionState = "granted" | "denied" | "prompt" | "unknown";

/**
 * Query the LNA permission where the browser actually exposes it.
 * Chrome's permission descriptor name has changed over versions; we try the
 * known names and treat any failure as "unknown" (never throw).
 */
export async function queryLocalNetworkPermission(): Promise<PermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unknown";
  }
  const names = ["local-network-access", "private-network-access"];
  for (const name of names) {
    try {
      const status = await (
        navigator.permissions.query as unknown as (d: {
          name: string;
        }) => Promise<{ state: PermissionState }>
      )({ name });
      if (status && status.state) return status.state;
    } catch {
      // descriptor not supported; try the next name
    }
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

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
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
      // No credentials: the agent never needs cookies/auth and CORS without
      // credentials is the safest, most compatible configuration.
      credentials: "omit",
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Try each candidate host until one answers. Returns the first successful
 * response together with the host that produced it.
 */
async function fetchFirstAvailable(
  path: string,
  timeoutMs: number
): Promise<{ res: Response; host: string } | null> {
  for (const host of HOSTS) {
    try {
      const res = await fetchWithTimeout(
        `http://${host}:${PORT}${path}`,
        timeoutMs
      );
      return { res, host };
    } catch {
      // try the next host
    }
  }
  return null;
}

/**
 * Classify a total failure into a precise state for the UI.
 *
 * A blocked loopback request and a stopped agent both surface as an opaque
 * `TypeError: Failed to fetch`, so we cannot tell them apart from the error
 * alone. We use the permission API when available and otherwise return the
 * explicit "blocked" state (which the UI renders as "grant local network
 * access OR start the agent") instead of mislabelling it "not running".
 */
export async function classifyFailure(): Promise<AgentState> {
  const perm = await queryLocalNetworkPermission();
  if (perm === "denied") return "permission-denied";
  if (perm === "prompt") return "permission-required";
  return "blocked";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect whether the local Print Agent is running, with a precise state.
 */
export async function getLocalAgentStatus(
  timeoutMs = 2500
): Promise<AgentStatusResult> {
  const hit = await fetchFirstAvailable("/health", timeoutMs);
  if (hit && hit.res.ok) {
    return { connected: true, state: "connected", host: hit.host };
  }
  if (hit) {
    return { connected: true, state: "error", host: hit.host };
  }
  return { connected: false, state: await classifyFailure() };
}

/**
 * Fetch the locally-configured printers from the agent.
 * Never throws — always returns a useful result for the UI.
 */
export async function getLocalPrinters(
  timeoutMs = 2500
): Promise<LocalPrintersResult> {
  const hit = await fetchFirstAvailable("/printers", timeoutMs);
  if (!hit) {
    return { available: false, printers: [], state: await classifyFailure() };
  }
  if (!hit.res.ok) {
    return { available: true, printers: [], state: "error", host: hit.host };
  }
  try {
    const body = (await hit.res.json()) as { printers?: LocalPrinter[] };
    const printers = Array.isArray(body.printers) ? body.printers : [];
    return {
      available: true,
      printers,
      state: printers.length > 0 ? "connected" : "no-printers",
      host: hit.host,
    };
  } catch {
    return { available: true, printers: [], state: "error", host: hit.host };
  }
}

export interface LnaAttemptResult {
  /** final state after the attempt. */
  state: AgentState;
  /** true when the agent answered. */
  connected: boolean;
  /** configured printers when available. */
  printers: LocalPrinter[];
  /** browser-level permission reading, when the browser exposes it. */
  permission: PermissionState;
}

/**
 * Perform a REAL local-network connection attempt from a user gesture.
 *
 * MUST be called synchronously inside a click/keydown handler: Chrome only
 * raises the Local Network Access permission prompt while transient user
 * activation is present, and that activation is consumed by any `await`
 * before the loopback fetch. This function therefore starts the fetch
 * immediately (the returned promise may be awaited by the caller).
 *
 * It returns a precise result so the UI can show "تم السماح" / "تم رفض
 * الوصول" / "لم يتمكن الموقع من الوصول إلى Print Agent" instead of a
 * no-op button.
 */
export function requestLocalNetworkAccess(): Promise<LnaAttemptResult> {
  // Kick off the loopback fetch SYNCHRONOUSLY so the user gesture applies.
  const attempt = getLocalPrinters(4000);

  return (async () => {
    const [result, permission] = await Promise.all([
      attempt,
      queryLocalNetworkPermission(),
    ]);

    let state = result.state;
    // If the fetch failed while the browser reports a pending/permission
    // state, prefer the explicit permission states for clear messaging.
    if (!result.available) {
      if (permission === "denied") state = "permission-denied";
      else if (permission === "prompt") state = "permission-required";
    }

    return {
      state,
      connected: result.available,
      printers: result.printers,
      permission,
    };
  })();
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

export { PRINT_SERVER_URL, HOSTS as PRINT_SERVER_HOSTS };