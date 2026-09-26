# Printing System Documentation

## 1. Architecture Overview

```
Invoice Data (order object)
        ↓
Invoice Template (src/printing/templates/)
        ↓
Invoice Renderer (src/printing/renderer/)  ← Canvas + Noto Sans Arabic
        ↓
1bpp bitmap → ESC/POS GS v 0 (Uint8Array)
        ↓
Print Transport (src/lib/print-client.ts → Print Agent)
        ↓
Thermal Printer (USB / TCP)
```

> Arabic is rendered as a **raster image** (GS v 0), never as raw Unicode
> text. Do not reintroduce text-based Arabic printing.

## 2. Where everything lives

| Layer | Location | Responsibility |
|---|---|---|
| **Invoice config (single source of truth)** | `src/printing/invoice/` | Shop, paper, typography, spacing, visibility, separators, footer, layout |
| Layout | `src/printing/invoice/invoice-layout.ts` | Ordered sections per invoice type |
| Content (words) | `src/printing/invoice/invoice-content.ts` | All labels/titles/footer strings |
| Templates | `src/printing/templates/` | Build `RasterBlock[]` from config + order |
| Renderer | `src/printing/renderer/` | Arabic shaping, wrapping, RGBA→1bpp, ESC/POS |
| Paper geometry | `src/printing/config/paper.ts` | 58mm / 80mm pixel dimensions |
| Service | `src/printing/print-service.ts` | Order → template → raster → ESC/POS |
| Transport | `src/lib/print-client.ts` | Sends `{ printerId, data }` to the local agent |
| Print Agent | `print-agent/` | Owns physical printers; byte-preserving bridge |

## 3. How to customize the invoice

All design changes happen in **`src/printing/invoice/`**. Never edit the
renderer, ESC/POS encoder, or print server to change the design.

1. **Shop information** — `invoice-config.ts` → `INVOICE_CONFIG.shop`
   (`name`, `subtitle`, `phone`, `address`, `logo`, `logoEnabled`).
2. **Font sizes** — `INVOICE_CONFIG.typography`
   (`headerSize`, `titleSize`, `sectionSize`, `bodySize`, `smallSize`,
   `totalSize`, `lineHeight`, `boldHeader`).
3. **Spacing** — `INVOICE_CONFIG.spacing`
   (`header`, `sections`, `rows`, `totals`, `footer`).
4. **Show/hide fields** — `INVOICE_CONFIG.visibility` (e.g. `phone: false`).
5. **Header** — `templates/shared.ts` → `renderHeader()` (reads `shop`).
6. **Customer section** — `templates/shared.ts` → `renderCustomer()`.
7. **Item rows** — `templates/shared.ts` → `renderItems()` / `itemLines()`.
8. **Totals** — `templates/shared.ts` → `renderTotals()`.
9. **Footer** — `INVOICE_CONFIG.footer` (`enabled`, `text`, `alignment`) and
   `templates/shared.ts` → `renderFooter()`.
10. **Butcher invoice** — `invoice-config.ts` → `BUTCHER_INVOICE_CONFIG`
    (overrides only) + `templates/butcher-invoice.ts`.
11. **Cheese invoice** — `invoice-config.ts` → `CHEESE_INVOICE_CONFIG`
    (overrides only) + `templates/cheese-invoice.ts`.
12. **Paper width** — `INVOICE_CONFIG.paper.width` (`"58mm"` | `"80mm"`).
    Pixel dimensions are derived from `config/paper.ts`; never hardcode them.
13. **Arabic rendering** — `renderer/raster.ts` + `renderer/font-loader.ts`.
14. **Section order** — `invoice-layout.ts` (reorder the arrays; no renderer
    changes needed).

### Files that MUST NOT be changed when only changing invoice appearance

- `src/printing/renderer/*` (arabic, text, image, raster, escpos, font-loader)
- `src/printing/config/paper.ts`
- `src/lib/print-client.ts`
- `print-agent/src/server/server.js`

## 4. Content vs. Style vs. Layout

- **Content** (words) → `invoice-content.ts`
- **Style** (sizes/spacing/visibility) → `invoice-config.ts`
- **Layout** (section order) → `invoice-layout.ts`

Templates combine the three and produce `RasterBlock[]`.

## 5. Department overrides (shared defaults + overrides)

Departments do **not** duplicate the whole config; they declare only what
differs, then merge onto the global config:

```ts
import { resolveInvoiceConfig, CHEESE_INVOICE_CONFIG } from "@/printing/invoice";
const cheese = resolveInvoiceConfig(CHEESE_INVOICE_CONFIG);
```

`resolveInvoiceConfigForDepartment("جبنة")` does this automatically. Add a
new department by adding an `*_INVOICE_CONFIG` override + a case in
`resolveInvoiceConfigForDepartment`.

## 6. Arabic Rendering Method

1. Text is drawn on an HTML `<canvas>` with the bundled **Noto Sans Arabic**
   font → the browser performs real Arabic shaping + RTL + bidi natively.
2. Canvas pixels (`getImageData`) → 1-bit black/white bitmap
   (`renderer/image.ts`).
3. Bitmap → **ESC/POS `GS v 0`** (`renderer/escpos.ts`, hex `1D 76 30`).
4. Bytes are sent as a binary string → Print Agent → printer.

Font file: `public/fonts/NotoSansArabic.ttf` (also `src/printing/fonts/`).

## 7. Changing Paper Width

```ts
// src/printing/config/paper.ts
"58mm": { widthPx: 384, marginPx: 8, charsPerLine: 32, lineHeightPx: 24, ... }
"80mm": { widthPx: 576, marginPx: 12, charsPerLine: 48, lineHeightPx: 28, ... }
```

Select at print time via `PrintConfig.paperWidth` or
`INVOICE_CONFIG.paper.width`. The renderer/transport never hardcode width.

## 8. Live Preview

`/preview` uses the **same** `generateAllPrintJobs` + centralized config as
printing, so preview and printed output match. It also shows the resolved
config values and lets you toggle 58mm/80mm.

## 9. Local Print Agent & Transport

The website stays online (Next.js + Firebase on Vercel). A separate local
Windows **Print Agent** (`print-agent/`) exposes `127.0.0.1:3001` and owns
**all physical printer access**. The web UI only talks to the agent:

```
Web UI → print-client → 127.0.0.1:3001 (Print Agent) → USB/TCP Printer
```

### 9.1 The website NEVER manages physical printers

- Physical printers (IP/port/USB/paper width) live **only** in the agent's
  AppData config (`print-agent-config.json`). They are **never** stored in
  Firebase. The website can only **read** them and **assign** them to logical
  roles.
- The website may only print to a `printerId` the agent already knows. It
  never sends IPs/ports, so it can never turn the agent into an arbitrary TCP
  proxy. The agent resolves the physical destination from its own config.

### 9.2 Roles vs. local assignment

- **Logical roles** (departments such as جبنة / جزارة, plus the full-invoice
  role) live in Firebase.
- **Local assignment** maps each role to a local agent printer id, stored in
  `localStorage` per machine (`src/lib/local-printer-assignment.ts`). This
  lets many customers share the same website while each machine binds its own
  hardware to the same roles.

### 9.3 Chromium Local Network Access (LNA / PNA)

A public HTTPS page reaching loopback needs Chromium's *Local Network Access*
permission. The agent answers the CORS preflight (`OPTIONS`) with
`Access-Control-Allow-Private-Network: true` **for allowlisted origins only**
(never `*`), and echoes the exact Origin with `Vary: Origin`. The web UI
distinguishes **agent-not-running** from **permission-required /
permission-denied** (`src/lib/local-printers.ts`) and surfaces the correct
recovery action instead of mislabelling the state.

**User-gesture requirement (important):** Chrome only raises its LNA prompt
while *transient user activation* is present, and that activation is consumed
by any `await` before the loopback fetch. Therefore the "allow local network
access" button starts the loopback fetch **synchronously** in the click
handler via `requestLocalNetworkAccess()` (which calls `getLocalPrinters()`
as its first statement). The UI then reports a real outcome — allowed / denied
/ unreachable — instead of a no-op button, and shows a "requesting…" state.

### 9.5 Print queue & lifecycle (multiple jobs)

Each local printer has an in-memory **serial queue** (`print-agent/src/printer/queue.js`),
keyed by `printerId`:

```
Printer A: A1 -> A2 -> A3     (strictly sequential)
Printer B: B1 -> B2           (independent; A never blocks B)
```

- Jobs for the same printer never overlap; the next job starts only after the
  previous one fully completes.
- TCP transport opens a fresh socket per job, waits for the write callback +
  graceful close (with connect/write/close timeouts), and always releases the
  handle. A printer is **ready** even with no persistent socket.
- USB transport opens/claims, streams the payload in bounded chunks (each with
  a transfer timeout), then releases the interface and closes the device
  exactly once. The device is not reset between jobs.
- `GET /printers` reports `printing` while a job is in flight, otherwise the
  normal `ready` / `offline` / `unknown`.
- `POST /print` responds with `{ ok, success, printerId, jobId, status }` and
  resolves only after the job truly completed.

### 9.4 Endpoints (agent)

`GET /health`, `GET /printers` (with status), `POST /printers`,
`PUT /printers/:id`, `DELETE /printers/:id`, `POST /printers/:id/test`,
`POST /print`. `POST /print` accepts only `{ printerId, data }`.

## 10. Tests

```bash
npx tsc --noEmit                        # type check
node scripts/test-printing.mjs          # pure helpers + ESC/POS structure (47)
node scripts/test-arabic-raster.mjs     # GS v 0 + bit-exact raster round-trip
node scripts/test-web-print-safety.mjs  # website cannot manage physical printers
node scripts/test-agent-e2e.mjs         # real agent HTTP: LNA preflight + print
cd print-agent; node test/selftest.js   # agent CORS/LNA + bit-exact transport (33)
cd print-agent; node test/queue.test.js # repeated prints: queue + no concurrency
```

Visual proof: run the app and open `/preview` (decodes and shows the ESC/POS
raster) or Admin → Printers (read-only local printers + role assignment).

## 11. Website ↔ Agent responsibilities

| Concern | Owner |
|---|---|
| Invoice design / templates / raster | Website (`src/printing/`) |
| Logical roles (departments) | Website + Firebase |
| Physical printers (IP/USB/paper) | **Print Agent only** |
| Role → local printer mapping | Website (`localStorage`, per machine) |
| Binary transport to hardware | Print Agent |

Reuse `src/printing/` (pure TS) inside the agent; do not put Electron/Tauri
code in React components.
