/**
 * Print Agent self-test — plain Node (no Electron).
 * Verifies all HTTP endpoints, security validation, CRUD, test print, and
 * bit-exact binary transport through a mock TCP printer.
 *
 * Run: node test/selftest.js
 */

const net = require("net");
const http = require("http");
const os = require("os");
const path = require("path");

const { ConfigStore } = require("../src/config/store");
const { createServer } = require("../src/server/server");

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error(`  x ${msg}`); }
}

function request(port, method, p, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: "127.0.0.1", port, method, path: p,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
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
  const PORT = 3902;
  const PRINT_PORT = 3911;

  // Mock TCP thermal printer capturing bytes.
  let received = Buffer.alloc(0);
  const mockPrinter = net.createServer((socket) => {
    socket.on("data", (chunk) => { received = Buffer.concat([received, chunk]); });
  });
  await new Promise((r) => mockPrinter.listen(PRINT_PORT, "127.0.0.1", r));

  const tmp = path.join(os.tmpdir(), `print-agent-selftest-${Date.now()}`);
  const store = new ConfigStore(tmp);
  const server = createServer(store);
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

  const allowed = { Origin: "http://localhost:3000" };
  const prod = { Origin: "https://wep-dash.vercel.app" };

  // --- Health ---
  const health = await request(PORT, "GET", "/health");
  ok(health.status === 200 && health.body.status === "ok", "GET /health returns ok");

  // --- List printers (empty) ---
  let list = await request(PORT, "GET", "/printers");
  ok(list.status === 200 && Array.isArray(list.body.printers), "GET /printers returns array");
  ok(list.body.printers.length === 0, "GET /printers starts empty");

  // --- Create printers (POST /printers) ---
  const created = await request(PORT, "POST", "/printers",
    { name: "Butcher Printer", connection: "tcp", address: "127.0.0.1", port: PRINT_PORT, paperWidth: 80 }, allowed);
  ok(created.status === 201 && created.body.printer.id, "POST /printers creates a TCP printer");
  ok(created.body.printer.paperWidth === 80, "POST /printers stores paperWidth");
  const tcpId = created.body.printer.id;

  const usbCreate = await request(PORT, "POST", "/printers",
    { name: "Cheese Printer", connection: "usb", usbDeviceId: "0x04b8:0x0e15", paperWidth: 58 }, prod);
  ok(usbCreate.status === 201, "POST /printers creates a USB printer (prod origin)");

  // --- New response format ---
  list = await request(PORT, "GET", "/printers");
  ok(list.body.printers.length === 2, "GET /printers returns both printers");
  const first = list.body.printers.find((p) => p.id === tcpId);
  ok(first.connection === "tcp" && first.address === "127.0.0.1" && first.port === PRINT_PORT,
    "GET /printers exposes tcp address/port");
  ok(typeof first.status === "string", "GET /printers includes status");
  ok(first.status === "ready", "TCP printer status is ready (mock listening)");

  // --- Update printer (PUT /printers/:id) ---
  const updated = await request(PORT, "PUT", `/printers/${tcpId}`,
    { name: "Butcher Printer 2", connection: "tcp", address: "127.0.0.1", port: PRINT_PORT, paperWidth: 58 }, allowed);
  ok(updated.status === 200 && updated.body.printer.name === "Butcher Printer 2",
    "PUT /printers/:id updates");

  // --- Invalid configuration rejected ---
  const badIp = await request(PORT, "POST", "/printers",
    { name: "Bad", connection: "tcp", address: "999.1.1.1", port: 9100 }, allowed);
  ok(badIp.status === 400, "POST /printers rejects invalid IP (400)");

  const badPaper = await request(PORT, "POST", "/printers",
    { name: "Bad", connection: "tcp", address: "10.0.0.1", port: 9100, paperWidth: 42 }, allowed);
  ok(badPaper.status === 400, "POST /printers rejects invalid paperWidth (400)");

  const badUsb = await request(PORT, "POST", "/printers",
    { name: "Bad", connection: "usb" }, allowed);
  ok(badUsb.status === 400, "POST /printers rejects missing usbDeviceId (400)");

  // --- Unauthorized Origin rejected ---
  const badOrigin = await request(PORT, "POST", "/printers",
    { name: "X", connection: "tcp", address: "10.0.0.1", port: 9100 },
    { Origin: "https://evil.example.com" });
  ok(badOrigin.status === 403, "Disallowed Origin rejected (403)");

  // --- Test print (TCP) ---
  received = Buffer.alloc(0);
  const test = await request(PORT, "POST", `/printers/${tcpId}/test`, {}, allowed);
  ok(test.status === 200 && test.body.ok === true, "POST /printers/:id/test succeeds");
  await new Promise((r) => setTimeout(r, 100));
  ok(received.length > 0, "Test print delivered bytes to the printer");
  ok(received[0] === 0x1b && received[1] === 0x40, "Test print starts with ESC @ (init)");

  // --- CORS preflight (OPTIONS) for allowed origin returns PNA header ---
  const preflight = await request(PORT, "OPTIONS", "/print", undefined, {
    Origin: "https://wep-dash.vercel.app",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type",
    "Access-Control-Request-Private-Network": "true",
  });
  ok(preflight.status === 204, "OPTIONS preflight returns 204 for allowed origin");
  ok(preflight.headers["access-control-allow-origin"] === "https://wep-dash.vercel.app",
    "Preflight echoes the exact allowed Origin");
  ok(preflight.headers["access-control-allow-private-network"] === "true",
    "Preflight grants Access-Control-Allow-Private-Network (LNA)");
  ok(preflight.headers["vary"] && preflight.headers["vary"].includes("Origin"),
    "Preflight sets Vary: Origin");

  const preflightLocal = await request(PORT, "OPTIONS", "/print", undefined, {
    Origin: "http://localhost:3000",
  });
  ok(preflightLocal.status === 204, "OPTIONS preflight allows localhost origin");

  const preflightBad = await request(PORT, "OPTIONS", "/print", undefined, {
    Origin: "https://evil.example.com",
  });
  ok(preflightBad.status === 403, "OPTIONS preflight rejects disallowed Origin (403)");
  ok(!preflightBad.headers["access-control-allow-origin"],
    "Disallowed preflight sets no Allow-Origin header");

  // --- Binary payload preservation via /print (printerId + data only) ---
  received = Buffer.alloc(0);
  const binary = Buffer.from([0x1b, 0x40, 0x1d, 0x76, 0x30, 0x00, 0x41, 0xff, 0x00]);
  const dataStr = binary.toString("binary");
  const print = await request(PORT, "POST", "/print",
    { printerId: tcpId, data: dataStr }, allowed);
  ok(print.status === 200 && print.body.success === true, "POST /print succeeds (printerId+data)");
  await new Promise((r) => setTimeout(r, 100));
  ok(Buffer.compare(received, binary) === 0,
    "TCP bytes bit-identical (GS v 0 raster preserved, incl 0x00/0xff)");

  // --- Agent resolves destination from OWN config (not the request body) ---
  // Supply a bogus address/port; the payload must still reach the configured
  // mock printer because the agent ignores client-supplied destinations.
  received = Buffer.alloc(0);
  const printBogus = await request(PORT, "POST", "/print",
    { printerId: tcpId, address: "10.255.255.1", port: 1, data: dataStr }, allowed);
  ok(printBogus.status === 200, "POST /print ignores client-supplied address/port");
  await new Promise((r) => setTimeout(r, 100));
  ok(Buffer.compare(received, binary) === 0,
    "Agent used its OWN configured destination (no arbitrary TCP proxy)");

  // --- Unknown printerId rejected ---
  const printUnknown = await request(PORT, "POST", "/print",
    { printerId: "does-not-exist", data: dataStr }, allowed);
  ok(printUnknown.status === 404, "POST /print with unknown printerId returns 404");

  // --- Delete printer (DELETE /printers/:id) ---
  const del = await request(PORT, "DELETE", `/printers/${tcpId}`, undefined, allowed);
  ok(del.status === 200 && del.body.ok === true, "DELETE /printers/:id succeeds");
  list = await request(PORT, "GET", "/printers");
  ok(list.body.printers.length === 1, "Printer removed after DELETE");

  const delMissing = await request(PORT, "DELETE", "/printers/nope", undefined, allowed);
  ok(delMissing.status === 404, "DELETE unknown printer returns 404");

  server.close();
  mockPrinter.close();

  console.log(`\n${"=".repeat(52)}`);
  console.log(` Print Agent self-test: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log(" All checks passed");
})().catch((err) => {
  console.error("Self-test crashed:", err);
  process.exit(1);
});