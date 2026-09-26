/**
 * Static safety test for the website / local agent architecture.
 *
 * Proves (by inspecting the real sources):
 *   1. The website no longer CREATES/EDITS/DELETES physical printers.
 *   2. The print client sends ONLY { printerId, data } to the agent.
 *   3. The local-printers reader exposes the LNA permission states.
 *   4. The printers page renders the read-only local panel.
 *
 * Run: `node scripts/test-web-print-safety.mjs`
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error(`  x ${msg}`); }
}

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// --- 1. No physical-printer CRUD in UI/components --------------------------
const uiFiles = walk(join(root, "src", "components")).concat(
  walk(join(root, "src", "app"))
);

const forbidden = ["addPrinter", "deletePrinter", "updatePrinter", "initializeDefaults"];
const offenders = [];
for (const file of uiFiles) {
  const src = readFileSync(file, "utf8");
  for (const fn of forbidden) {
    if (new RegExp(`\\b${fn}\\s*\\(`).test(src)) {
      offenders.push(`${file.replace(root, "")} -> ${fn}()`);
    }
  }
}
ok(
  offenders.length === 0,
  `No physical-printer CRUD in website components (found: ${offenders.join(", ")})`
);

// --- 2. print-client sends only printerId + data ---------------------------
const printClient = read("src/lib/print-client.ts");
ok(
  /JSON\.stringify\(\{\s*printerId,\s*data\s*\}\)/.test(printClient),
  "print-client sends exactly { printerId, data }"
);
ok(
  !/type:\s*"network"/.test(printClient) && !/address/.test(printClient),
  "print-client never sends address/port/type (no TCP proxy)"
);
ok(
  /getAssignment\(/.test(printClient),
  "print-client resolves the local printer via role assignment"
);

// --- 3. local-printers exposes LNA states ----------------------------------
const localPrinters = read("src/lib/local-printers.ts");
for (const state of [
  "permission-required",
  "permission-denied",
  "not-running",
  "no-printers",
]) {
  ok(
    localPrinters.includes(`"${state}"`),
    `local-printers defines state: ${state}`
  );
}
ok(
  /HOSTS\s*=\s*\["127\.0\.0\.1",\s*"localhost"\]/.test(localPrinters),
  "local-printers falls back between 127.0.0.1 and localhost"
);

// --- 4. printers page is read-only local panel -----------------------------
const printersPage = read("src/app/admin/printers/page.tsx");
ok(
  printersPage.includes("LocalPrintersPanel"),
  "printers page renders the read-only LocalPrintersPanel"
);
ok(
  !printersPage.includes("DepartmentPrinterPanel"),
  "printers page no longer uses the old physical-printer panel"
);

// --- 5. agent rejects arbitrary destinations -------------------------------
const agentSecurity = read("print-agent/src/config/security.js");
ok(
  /function validatePrintRequest\(body\)[\s\S]*?const \{ printerId, data \} = body/.test(
    agentSecurity
  ),
  "agent validates /print with only printerId + data"
);
ok(
  !/validatePrintRequest[\s\S]*?isValidHost\(address\)/.test(agentSecurity),
  "agent no longer accepts a client-supplied print address"
);

// --- Results ---------------------------------------------------------------
console.log(`\n${"=".repeat(52)}`);
console.log(` Web print-safety tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(" FAILED");
  process.exit(1);
}
console.log(" All checks passed");