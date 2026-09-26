/**
 * Production-style end-to-end test of the local Print Agent HTTP API.
 *
 * Drives the REAL server module (print-agent/src/server/server.js) exactly as
 * a browser on the deployed website would:
 *   1. A Chromium Local Network Access (LNA/PNA) CORS preflight (OPTIONS).
 *   2. GET /printers (read-only local discovery).
 *   3. POST /print with { printerId, data } only (no address/port).
 *
 * Prints the actual response headers and the bytes the printer received so the
 * transport can be verified by hand.
 *
 * Run: `node scripts/test-agent-e2e.mjs`
 */

import { createRequire } from "node:module";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const { ConfigStore } = require(join(root, "print-agent/src/config/store"));
const { createServer } = require(join(root, "print-agent/src/server/server"));

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error(`  x ${msg}`); }
}

function httpRequest(port, method, p, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: "127.0.0.1", port, method, path: p,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(data); } catch { json = data; }
          resolve({ status: res.statusCode, body: json, headers: res.headers });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const PORT = 3955;
  const PRINT_PORT = 3966;

  // Mock thermal printer capturing the exact bytes.
  let received = Buffer.alloc(0);
  const mockPrinter = net.createServer((socket) => {
    socket.on("data", (chunk) => { received = Buffer.concat([received, chunk]); });
  });
  await new Promise((r) => mockPrinter.listen(PRINT_PORT, "127.0.0.1", r));

  const tmp = path.join(os.tmpdir(), `agent-e2e-${Date.now()}`);
  const store = new ConfigStore(tmp);
  const server = createServer(store);
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

  const PROD_ORIGIN = "https://wep-dash.vercel.app";

  // 1. Browser LNA/PNA preflight for POST /print.
  console.log("\n--- OPTIONS /print (LNA preflight) ---");
  const preflight = await httpRequest(PORT, "OPTIONS", "/print", undefined, {
    Origin: PROD_ORIGIN,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type",
    "Access-Control-Request-Private-Network": "true",
  });
  console.log("Status:", preflight.status);
  console.log("access-control-allow-origin:", preflight.headers["access-control-allow-origin"]);
  console.log("access-control-allow-private-network:", preflight.headers["access-control-allow-private-network"]);
  console.log("vary:", preflight.headers["vary"]);

  ok(preflight.status === 204, "LNA preflight returns 204");
  ok(preflight.headers["access-control-allow-origin"] === PROD_ORIGIN, "preflight allows the production origin");
  ok(preflight.headers["access-control-allow-private-network"] === "true", "preflight grants Private Network Access");
  ok((preflight.headers["vary"] || "").includes("Origin"), "preflight sets Vary: Origin");

  // 2. Register a printer LOCALLY (this is what the desktop agent does).
  console.log("\n--- Setup: create a local TCP printer (agent-owned) ---");
  const create = await httpRequest(PORT, "POST", "/printers", {
    name: "Ahmed POS - E2E", connection: "tcp",
    address: "127.0.0.1", port: PRINT_PORT, paperWidth: 58,
  }, { Origin: PROD_ORIGIN });
  console.log("Created printer id:", create.body?.printer?.id);
  ok(create.status === 201 && create.body.printer.id, "TCP printer created locally");
  const printerId = create.body.printer.id;

  // 3. GET /printers (read-only discovery).
  const list = await httpRequest(PORT, "GET", "/printers", undefined, { Origin: PROD_ORIGIN });
  ok(list.status === 200 && list.body.printers.length === 1, "GET /printers lists the local printer");
  console.log("Discovered:", list.body.printers.map((p) => `${p.name} [${p.connection}] ${p.status}`).join(", "));

  // 4. POST /print with ONLY { printerId, data } — the website contract.
  console.log("\n--- POST /print { printerId, data } (the website contract) ---");
  // A realistic mini ESC/POS raster payload: init + GS v 0 raster + cut.
  const escpos = Buffer.from([
    0x1b, 0x40,                   // ESC @  (init)
    0x1d, 0x76, 0x30, 0x00,       // GS v 0 (raster)
    0x02, 0x00,                   // width  = 2 bytes (16 px)
    0x02, 0x00,                   // height = 2 rows
    0b10101010, 0b01010101,       // row 0
    0b01010101, 0b10101010,       // row 1
    0x1d, 0x56, 0x42, 0x00,       // GS V B (cut)
  ]);
  const dataStr = escpos.toString("binary");
  received = Buffer.alloc(0);
  const print = await httpRequest(PORT, "POST", "/print", { printerId, data: dataStr }, { Origin: PROD_ORIGIN });
  console.log("Status:", print.status, "| body:", JSON.stringify(print.body));
  await new Promise((r) => setTimeout(r, 120));
  console.log("Bytes the printer received:", received.length);
  console.log("Received (hex):", received.toString("hex"));
  console.log("Expected (hex):", escpos.toString("hex"));

  ok(print.status === 200 && print.body.success === true, "POST /print succeeded");
  ok(received.length === escpos.length && Buffer.compare(received, escpos) === 0,
    "Printer received the EXACT bytes (GS v 0 raster + 0x00 preserved, no text conversion)");
  ok(received.includes(0x1d) && received[3] === 0x76 && received[4] === 0x30,
    "Payload contains the ESC/POS raster command GS v 0 (1D 76 30)");

  // 5. The website CANNOT send an arbitrary destination.
  console.log("\n--- Security: trying to send a foreign address ---");
  received = Buffer.alloc(0);
  const spoof = await httpRequest(PORT, "POST", "/print", {
    printerId, address: "10.255.255.1", port: 1, data: dataStr,
  }, { Origin: PROD_ORIGIN });
  await new Promise((r) => setTimeout(r, 120));
  ok(spoof.status === 200 && Buffer.compare(received, escpos) === 0,
    "Agent ignored the client-supplied address/port (used its OWN config)");

  // 6. Disallowed origin rejected at preflight.
  console.log("\n--- Security: disallowed origin ---");
  const evil = await httpRequest(PORT, "OPTIONS", "/print", undefined, {
    Origin: "https://evil.example.com",
    "Access-Control-Request-Method": "POST",
  });
  console.log("Status:", evil.status, "| allow-origin:", evil.headers["access-control-allow-origin"]);
  ok(evil.status === 403, "Disallowed-origin preflight rejected (403)");
  ok(!evil.headers["access-control-allow-origin"], "No Allow-Origin for disallowed origin");

  server.close();
  mockPrinter.close();

  console.log(`\n${"=".repeat(52)}`);
  console.log(` Agent end-to-end tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log(" All checks passed");
})().catch((err) => {
  console.error("E2E test crashed:", err);
  process.exit(1);
});