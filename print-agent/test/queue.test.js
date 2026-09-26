/**
 * Repeated-print / queue serialization test.
 *
 * Verifies:
 *   1. The per-printer queue runs jobs strictly one at a time (no overlap).
 *      is never concurrent on the same printer.
 *   2. A burst of 10 jobs to one printer is delivered in order, bit-identical,
 *      with no dropped bytes, and the printer stays usable afterwards.
 *   3. Two printers are serialized INDEPENDENTLY (A never blocks B).
 *   4. The transport drains + closes cleanly so the next job still works.
 *
 * Uses a mock TCP printer that records each connection's bytes and notes any
 * overlap by tracking concurrent "open" connections.
 *
 * Run: node test/queue.test.js
 */

const net = require("net");
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

function httpRequest(port, method, p, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const http = require("http");
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: "127.0.0.1", port, method, path: p,
        headers: {
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
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

/** Build a tiny valid ESC/POS payload with GS v 0 + a tag byte. */
function escpos(tag) {
  return Buffer.from([
    0x1b, 0x40,
    0x1d, 0x76, 0x30, 0x00,
    0x01, 0x00, 0x01, 0x00,
    tag & 0xff,
    0x1d, 0x56, 0x42, 0x00,
  ]);
}

/** Start a mock TCP printer that records every connection independently. */
function startMockPrinter(port) {
  const connections = [];
  let open = 0;
  let maxOpen = 0;
  const server = net.createServer((socket) => {
    open += 1;
    maxOpen = Math.max(maxOpen, open);
    const entry = { bytes: Buffer.alloc(0) };
    connections.push(entry);
    socket.on("data", (c) => { entry.bytes = Buffer.concat([entry.bytes, c]); });
    socket.on("close", () => { open -= 1; });
    socket.on("error", () => { open -= 1; });
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({ server, connections, stats: () => ({ open, maxOpen }) })
    );
  });
}

(async () => {
  const SERVER_PORT = 3977;
  const A_PORT = 3981;
  const B_PORT = 3982;

  const printerA = await startMockPrinter(A_PORT);
  const printerB = await startMockPrinter(B_PORT);

  const tmp = path.join(os.tmpdir(), `queue-test-${Date.now()}`);
  const store = new ConfigStore(tmp);
  const server = createServer(store);
  await new Promise((r) => server.listen(SERVER_PORT, "127.0.0.1", r));

  const origin = { Origin: "https://wep-dash.vercel.app" };

  const makePrinter = async (name, port) => {
    const res = await httpRequest(SERVER_PORT, "POST", "/printers",
      { name, connection: "tcp", address: "127.0.0.1", port, paperWidth: 58 }, origin);
    return res.body.printer.id;
  };

  const idA = await makePrinter("Printer A", A_PORT);
  const idB = await makePrinter("Printer B", B_PORT);

  // --- 1 & 2. Ten jobs to Printer A, fired concurrently (no ordering help) ---
  console.log("\n▶ Sending 10 concurrent jobs to Printer A...");
  const jobsA = [];
  for (let i = 0; i < 10; i++) {
    const data = escpos(i).toString("binary");
    jobsA.push(
      httpRequest(SERVER_PORT, "POST", "/print", { printerId: idA, data }, origin)
    );
  }
  const resultsA = await Promise.all(jobsA);

  ok(resultsA.every((r) => r.status === 200 && r.body.success === true),
    "All 10 jobs to Printer A accepted (200 success)");
  ok(resultsA.every((r) => r.body.jobId && r.body.status === "completed"),
    "Each job response includes jobId + status=completed");
  ok(new Set(resultsA.map((r) => r.body.jobId)).size === 10,
    "Each job got a unique jobId");

  await new Promise((r) => setTimeout(r, 150));

  const statsA = printerA.stats();
  ok(statsA.maxOpen === 1,
    `Printer A never had overlapping connections (maxOpen=${statsA.maxOpen})`);

  const connA = printerA.connections;
  ok(connA.length === 10, `Printer A saw exactly 10 connections (got ${connA.length})`);

  const allA = Buffer.concat(connA.map((c) => c.bytes));
  const expectedA = Buffer.concat(Array.from({ length: 10 }, (_, i) => escpos(i)));
  ok(Buffer.compare(allA, expectedA) === 0,
    "Printer A received all 10 payloads bit-identical, in order, no drops");

  // Verify GS v 0 survived on every job.
  ok(expectedA.includes(0x1d) && allA.includes(0x1d),
    "GS v 0 raster bytes preserved across all jobs");

  // --- 3. Two printers are independent ---
  console.log("\n▶ Sending 5 jobs to A and 5 to B concurrently...");
  printerA.connections.length = 0;
  printerB.connections.length = 0;

  const jobsAB = [];
  for (let i = 0; i < 5; i++) {
    jobsAB.push(httpRequest(SERVER_PORT, "POST", "/print",
      { printerId: idA, data: escpos(0xa0 + i).toString("binary") }, origin));
    jobsAB.push(httpRequest(SERVER_PORT, "POST", "/print",
      { printerId: idB, data: escpos(0xb0 + i).toString("binary") }, origin));
  }
  const resultsAB = await Promise.all(jobsAB);
  ok(resultsAB.every((r) => r.status === 200 && r.body.success === true),
    "All 10 mixed jobs accepted");

  await new Promise((r) => setTimeout(r, 150));

  const statsAB_A = printerA.stats();
  const statsAB_B = printerB.stats();
  ok(printerA.connections.length === 5, `Printer A got 5 jobs (got ${printerA.connections.length})`);
  ok(printerB.connections.length === 5, `Printer B got 5 jobs (got ${printerB.connections.length})`);

  const allAB_A = Buffer.concat(printerA.connections.map((c) => c.bytes));
  const allAB_B = Buffer.concat(printerB.connections.map((c) => c.bytes));
  const expectedAB_A = Buffer.concat(Array.from({ length: 5 }, (_, i) => escpos(0xa0 + i)));
  const expectedAB_B = Buffer.concat(Array.from({ length: 5 }, (_, i) => escpos(0xb0 + i)));
  ok(Buffer.compare(allAB_A, expectedAB_A) === 0, "Printer A payload order correct in mixed run");
  ok(Buffer.compare(allAB_B, expectedAB_B) === 0, "Printer B payload order correct in mixed run");

  // Per-printer serialization must still hold.
  ok(statsAB_A.maxOpen === 1 && statsAB_B.maxOpen === 1,
    "Each printer still serialized independently (maxOpen=1 each)");

  // --- 4. Printer remains usable for a follow-up job ---
  console.log("\n▶ Follow-up job after the burst...");
  printerA.connections.length = 0;
  const follow = await httpRequest(SERVER_PORT, "POST", "/print",
    { printerId: idA, data: escpos(0x5a).toString("binary") }, origin);
  await new Promise((r) => setTimeout(r, 120));
  ok(follow.status === 200 && printerA.connections.length === 1,
    "Printer A is still usable after the burst (1 clean job)");
  ok(Buffer.compare(printerA.connections[0].bytes, escpos(0x5a)) === 0,
    "Follow-up payload bit-identical");

  server.close();
  printerA.server.close();
  printerB.server.close();

  console.log(`\n${"=".repeat(52)}`);
  console.log(` Queue / repeated-print tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log(" All checks passed");
})().catch((err) => {
  console.error("Queue test crashed:", err);
  process.exit(1);
});