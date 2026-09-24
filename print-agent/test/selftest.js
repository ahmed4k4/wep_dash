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

  // --- Binary payload preservation via /print ---
  received = Buffer.alloc(0);
  const binary = Buffer.from([0x1b, 0x40, 0x1d, 0x76, 0x30, 0x00, 0x41, 0xff, 0x00]);
  const dataStr = binary.toString("binary");
  const print = await request(PORT, "POST", "/print",
    { printerId: tcpId, type: "network", address: "127.0.0.1", port: PRINT_PORT, data: dataStr }, allowed);
  ok(print.status === 200 && print.body.success === true, "POST /print succeeds");
  await new Promise((r) => setTimeout(r, 100));
  ok(Buffer.compare(received, binary) === 0,
    "TCP bytes bit-identical (GS v 0 raster preserved, incl 0x00/0xff)");

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