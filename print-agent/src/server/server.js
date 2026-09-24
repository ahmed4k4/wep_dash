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
 * cap. The server NEVER forwards to arbitrary destinations.
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

const VERSION = "1.1.0";

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

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
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

function createServer(store) {
  const server = http.createServer(async (req, res) => {
    applyCors(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, "http://127.0.0.1");
    const origin = req.headers.origin;

    // Origin allowlist for state-changing routes.
    if (req.method !== "GET" && origin && !isOriginAllowed(origin)) {
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
          const check = validatePrintRequest(payload);
          if (!check.ok) { sendJson(res, 400, { ok: false, error: check.error }); return; }
          await dispatchPrint({ ...check.value, usbDeviceId: printer.usbDeviceId });
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
        await dispatchPrint(check.value);
        sendJson(res, 200, { ok: true, success: true, printerId: check.value.printerId });
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