/**
 * Local Print Agent HTTP API (127.0.0.1 only).
 *
 * Used by the online POS website (CORS allowlisted). The desktop UI talks
 * to the same data via IPC, but these endpoints are also exposed for the
 * website to read the local printers.
 *
 *   GET    /health            → { ok, status, version, printers }
 *   GET    /printers          → { ok, printers: [...] }  (with status)
 *   POST   /printers          → create
 *   PUT    /printers/:id      → update
 *   DELETE /printers/:id      → delete
 *   POST   /printers/:id/test → self-test print
 *   POST   /print             → send binary ESC/POS payload
 *
 * Security: loopback bind, Origin allowlist, field validation, body-size
 * cap. The server NEVER forwards to arbitrary destinations — the website
 * sends a printerId the agent already knows, and the agent resolves the
 * physical destination from its OWN local config.
 *
 * Chromium Local Network Access (LNA): a public HTTPS page reaching a private
 * / loopback address requires a Private Network Access preflight response
 * (`Access-Control-Allow-Private-Network: true`) for allowed origins only.
 */

const http = require("http");
const {
  MAX_BODY_BYTES,
  isOriginAllowed,
  validatePrintRequest,
  validatePrinterConfig,
} = require("../config/security");
const { dispatchPrint, listUSBPrinters, withStatus } = require("../printer");
const { buildTestPayload } = require("./test-receipt");

const VERSION = "1.2.0";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

/**
 * Apply CORS headers for an allowed Origin.
 *
 * - Echoes the exact request Origin (never `*`).
 * - Always sets `Vary: Origin` so caches never mix origins.
 * - Grants `Access-Control-Allow-Private-Network: true` (Chromium LNA) —
 *   ONLY for an allowed origin.
 */
function applyCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Vary", "Origin");
  if (!origin || !isOriginAllowed(origin)) return false;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");

  // Chromium Private/Local Network Access: only grant for allowed origins.
  const pna = req.headers["access-control-request-private-network"];
  if (pna === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  } else {
    // Safe to always advertise; ignored by browsers that did not ask.
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  return true;
}

/**
 * Handle a CORS preflight (OPTIONS). Validates the Origin before responding:
 * disallowed → 403, allowed → 204 with full CORS + PNA headers.
 */
function handlePreflight(req, res) {
  const origin = req.headers.origin;
  applyCors(req, res);
  if (origin && !isOriginAllowed(origin)) {
    res.writeHead(403, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: false, error: "Origin not allowed" }));
    return;
  }
  res.writeHead(204);
  res.end();
}

/** Public printer shape returned to the website/UI. */
function publicPrinter(p) {
  return {
    id: p.id,
    name: p.name,
    connection: p.connection,
    address: p.connection === "tcp" ? p.address : undefined,
    port: p.connection === "tcp" ? p.port : undefined,
    usbDeviceId: p.connection === "usb" ? p.usbDeviceId : undefined,
    paperWidth: p.paperWidth,
    status: p.status || "unknown",
  };
}

/**
 * Map a locally-stored printer to a dispatch job. The website never supplies
 * address/port/vendorId — the agent resolves them here from its own config.
 */
function printerToDispatchJob(printer, data, jobId) {
  if (printer.connection === "usb") {
    return { printerId: printer.id, jobId, type: "usb", data, usbDeviceId: printer.usbDeviceId };
  }
  return {
    printerId: printer.id,
    jobId,
    type: "network",
    data,
    address: printer.address,
    port: printer.port,
  };
}

function createServer(store) {
  const server = http.createServer(async (req, res) => {
    // CORS preflight (handles POST/PUT/DELETE + Private Network Access).
    if (req.method === "OPTIONS") {
      handlePreflight(req, res);
      return;
    }

    const corsAllowed = applyCors(req, res);
    const url = new URL(req.url, "http://127.0.0.1");
    const origin = req.headers.origin;

    // Origin allowlist for state-changing routes.
    if (req.method !== "GET" && origin && !isOriginAllowed(origin)) {
      sendJson(res, 403, { ok: false, error: "Origin not allowed" });
      return;
    }
    // A cross-origin request from a browser must present an allowed Origin.
    if (!corsAllowed && origin) {
      sendJson(res, 403, { ok: false, error: "Origin not allowed" });
      return;
    }

    try {
      // -------- Health ------------------------------------------------------
      if (url.pathname === "/health" && req.method === "GET") {
        sendJson(res, 200, {
          ok: true,
          status: "ok",
          version: VERSION,
          printers: store.listPrinters().length,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // -------- List printers ----------------------------------------------
      if (url.pathname === "/printers" && req.method === "GET") {
        const configured = await withStatus(store.listPrinters());
        sendJson(res, 200, {
          ok: true,
          printers: configured.map(publicPrinter),
          discovered: listUSBPrinters(),
        });
        return;
      }

      // -------- Create printer ---------------------------------------------
      if (url.pathname === "/printers" && req.method === "POST") {
        const raw = await readBody(req);
        let body;
        try { body = JSON.parse(raw); } catch { body = null; }
        const check = validatePrinterConfig(body);
        if (!check.ok) { sendJson(res, 400, { ok: false, error: check.error }); return; }
        const created = store.addPrinter(check.value);
        sendJson(res, 201, { ok: true, printer: publicPrinter(created) });
        return;
      }

      // -------- Printer-scoped routes --------------------------------------
      const printerMatch = url.pathname.match(/^\/printers\/([^/]+)(\/test)?$/);
      if (printerMatch) {
        const printerId = decodeURIComponent(printerMatch[1]);
        const isTest = Boolean(printerMatch[2]);

        // Update
        if (req.method === "PUT" && !isTest) {
          const raw = await readBody(req);
          let body;
          try { body = JSON.parse(raw); } catch { body = null; }
          const check = validatePrinterConfig({ ...(body || {}), id: printerId });
          if (!check.ok) { sendJson(res, 400, { ok: false, error: check.error }); return; }
          const updated = store.updatePrinter(printerId, check.value);
          if (!updated) { sendJson(res, 404, { ok: false, error: "Printer not found" }); return; }
          sendJson(res, 200, { ok: true, printer: publicPrinter(updated) });
          return;
        }

        // Delete
        if (req.method === "DELETE" && !isTest) {
          const existing = store.getPrinter(printerId);
          if (!existing) { sendJson(res, 404, { ok: false, error: "Printer not found" }); return; }
          store.removePrinter(printerId);
          sendJson(res, 200, { ok: true });
          return;
        }

        // Test print
        if (req.method === "POST" && isTest) {
          const printer = store.getPrinter(printerId);
          if (!printer) { sendJson(res, 404, { ok: false, error: "Printer not found" }); return; }
          const raw = await readBody(req);
          let overrides = {};
          if (raw) { try { overrides = JSON.parse(raw); } catch { overrides = {}; } }
          const payload = buildTestPayload(printer, overrides);
          await dispatchPrint(printerToDispatchJob(printer, payload.data));
          sendJson(res, 200, { ok: true, printerId });
          return;
        }
      }

      // -------- Print (binary payload) -------------------------------------
      if (url.pathname === "/print" && req.method === "POST") {
        const raw = await readBody(req);
        let body;
        try { body = JSON.parse(raw); } catch { body = null; }
        const check = validatePrintRequest(body);
        if (!check.ok) { sendJson(res, 400, { ok: false, error: check.error }); return; }

        // Resolve the physical destination from LOCAL config only.
        const printer = store.getPrinter(check.value.printerId);
        if (!printer) {
          sendJson(res, 404, { ok: false, error: "Printer not found" });
          return;
        }
        const jobId = `job-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        // Serialized per printer; resolves only after the job truly completed.
        await dispatchPrint(
          printerToDispatchJob(printer, check.value.data, jobId)
        );
        sendJson(res, 200, {
          ok: true,
          success: true,
          printerId: printer.id,
          jobId,
          status: "completed",
        });
        return;
      }

      sendJson(res, 404, { ok: false, error: "Not found" });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message || String(err) });
    }
  });

  return server;
}

module.exports = { createServer, VERSION };