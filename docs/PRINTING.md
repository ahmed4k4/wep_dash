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
Print Transport (print-server.js / src/lib/print-client.ts)
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
| Transport | `src/lib/print-client.ts` | Sends payload to local print server |
| Print server | `print-server.js` | Byte-preserving TCP/USB bridge |

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
- `print-server.js`

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
4. Bytes are sent as a binary string → `print-server.js` → printer.

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

## 9. Print Server & Transport

- `print-server.js`: binds `127.0.0.1:3001`; treats the payload as **binary**
  (`Buffer.from(data, "binary")`) and writes it to the socket unchanged.
- Endpoints: `GET /health`, `GET /printers`, `POST /print`,
  `POST /printers/usb`, `GET /capture`, `POST /capture`.
- `src/lib/print-client.ts` never converts bytes to text.

## 10. Tests

```bash
npx tsc --noEmit                 # type check
node scripts/test-printing.mjs   # pure helpers + ESC/POS structure (47 checks)
node scripts/test-arabic-raster.mjs  # GS v 0 + bit-exact raster round-trip
```

Visual proof: run the app and open `/test-arabic` (renders the production
raster bitmap) or `/preview` (decodes and shows the ESC/POS raster).

## 11. Future: Windows Print Agent (Phase 2)

The website stays online (Next.js + Firebase on Vercel). A separate local
Windows **Print Agent** (`print-agent/`) exposes `127.0.0.1:3001` and owns
local printer access. The web UI only talks to the agent through
`print-client.ts`:

```
Web UI → print-client → 127.0.0.1:3001 (Print Agent) → USB/TCP Printer
```

Reuse `src/printing/` (pure TS) inside the agent; do not put Electron/Tauri
code in React components.