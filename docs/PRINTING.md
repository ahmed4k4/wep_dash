# Printing System Documentation

## 1. Architecture Overview

```
Invoice Data (order object)
        ↓
Invoice Template (src/printing/templates/)
        ↓
Invoice Renderer (src/printing/renderer/)
        ↓
ESC/POS Printable Data (Uint8Array)
        ↓
Print Transport (print-server.js / src/lib/print-client.ts)
        ↓
Thermal Printer
```

The printing module is fully separated into:

| Layer | Location | Responsibility |
|---|---|---|
| Templates | `src/printing/templates/` | Assemble invoice sections (header, items, totals, footer) |
| Styles | `src/printing/styles/` | Central visual configuration (fonts, spacing, colors) |
| Config | `src/printing/config/` | Paper dimensions and printer settings |
| Renderer | `src/printing/renderer/` | Arabic shaping, text layout, image/raster conversion, ESC/POS byte building |
| Service | `src/printing/print-service.ts` | Orchestrates template → renderer → payload pipeline |
| Transport | `src/lib/print-client.ts` | Sends payload to local print-server |
| Print Server | `print-server.js` | Network bridge to TCP printer |

## 2. Key Files

| File | Purpose |
|---|---|
| `src/printing/templates/shared.ts` | Shared section builder helpers (header, separator, items, totals, footer) |
| `src/printing/templates/department.ts` | Butcher + Cheese department invoice builders |
| `src/printing/templates/index.ts` | Template registry and factory (`buildInvoice`) |
| `src/printing/renderer/arabic.ts` | Arabic detection, Arabic-Indic numerals |
| `src/printing/renderer/text.ts` | Text measurement, wrapping, label/value lines |
| `src/printing/renderer/image.ts` | RGBA → 1-bit bitmap, bitmap → ESC/POS bytes |
| `src/printing/renderer/escpos.ts` | ESC/POS command builder |
| `src/printing/renderer/raster.ts` | Canvas-based raster renderer (browser) |
| `src/printing/renderer/font-loader.ts` | Loads bundled Arabic font for canvas |
| `src/printing/config/paper.ts` | 58mm and 80mm paper configurations |
| `src/printing/styles/invoice-style.ts` | All visual settings in one place |
| `src/printing/print-service.ts` | Main entry point — builds printable payload |
| `src/lib/printing/index.ts` | Re-export bridge for backward compatibility with existing imports |

## 3. Arabic Rendering Method

Arabic is **not** sent as raw Unicode text to the printer. Instead:

1. Text is rendered on an HTML `<canvas>` using the bundled **Noto Sans Arabic** font.
2. Browser canvas automatically performs Arabic glyph shaping + RTL ordering.
3. The canvas is converted to a 1-bit black/white bitmap.
4. The bitmap is encoded as ESC/POS **GS v 0** raster image data.
5. The printer prints the image — no dependency on printer Arabic fonts.

Font file location: `public/fonts/NotoSansArabic.ttf`

For fonts already installed on the OS, a fallback chain is used:
- `Noto Sans Arabic`
- `Noto Naskh Arabic`
- `Cairo`
- `Tahoma`
- `Arial`

## 4. Changing Paper Width

Edit `src/printing/config/paper.ts`:

```ts
export const PAPER_58: PaperConfig = {
  widthPx: 384,     // 384px @203dpi ≈ 48mm printable
  marginPx: 8,
  charsPerLine: 32,
  lineHeightPx: 24,
};

export const PAPER_80: PaperConfig = {
  widthPx: 576,     // 576px @203dpi ≈ 72mm printable
  marginPx: 12,
  charsPerLine: 48,
  lineHeightPx: 28,
};
```

To select paper width at print time:

```ts
// In print-service.ts or print-client.ts
const paper = "80";   // or "58"
```

## 5. Changing Font Sizes

Edit `src/printing/styles/invoice-style.ts`:

```ts
export const InvoiceStyle = {
  headerFontSize: 16,   // shop name
  titleFontSize: 16,    // "فاتورة مبيعات"
  bodyFontSize: 14,     // regular text
  smallFontSize: 12,    // labels and footnotes
  // ...
};
```

## 6. Changing Spacing

Same file (`invoice-style.ts`):

```ts
lineSpacing: 1.2,       // line height multiplier
sectionSpacing: 8,      // vertical gap between sections
itemSpacing: 4,         // vertical gap between item rows
```

## 7. Adding / Removing Invoice Fields

Every field has a toggle in `invoice-style.ts`:

```ts
showCustomer: true,
showPhone: true,
showAddress: true,
showNotes: true,
showInvoiceNumber: true,
showDate: true,
showTime: true,
showDepartment: true,
showUnitPrice: true,
showQuantity: true,
showWeight: true,
showSubtotal: true,
showDiscount: true,
showTotal: true,
showFooter: true,
```

To **remove** a field: set its toggle to `false`.
To **add** a new field: add the toggle + a new builder function in `templates/shared.ts`.

## 8. Modifying the Header

Edit `renderInvoiceHeader()` in `src/printing/templates/shared.ts`:

```ts
export function renderInvoiceHeader(opts: HeaderOptions): SectionBlock[] {
  // Returns: shop name / subtitle / invoice title / separator
}
```

Change shop name, subtitle, logo display, and title there.

## 9. Modifying the Footer

Edit `renderFooter()` in the same file:

```ts
export function renderFooter(opts: FooterOptions): SectionBlock[] {
  // Returns: footer text / separator / thank-you message
}
```

Change `footerText` in `invoice-style.ts`:

```ts
footerText: "شكراً لتعاملكم معنا",
```

## 10. Modifying Item Rows

Edit `renderItems()` in `src/printing/templates/shared.ts`.

Item rows are built from the data in the order's `items` array. Each row shows:

```
اسم الصنف      الكمية     السعر
```

Toggle columns via `showUnitPrice`, `showQuantity`, `showWeight` in the style object.

## 11. How Arabic Rendering Works

**Step-by-step** (see also §3):

1. `arabic.ts` utilities detect Arabic ranges (`\u0600-\u06FF`) and convert optional Arabic-Indic numerals.
2. The canvas renderer (`renderer/raster.ts`) draws text with `ctx.fillText()` using the bundled Arabic font.
3. Canvas handles Arabic shaping + RTL automatically.
4. `image.ts` converts canvas pixel data (`getImageData`) to a 1-bit bitmap.
5. `escpos.ts` encodes the bitmap as `GS v 0` raster bytes.

## 12. Printer Configuration

Edit `src/printing/config/printer.ts` (or the relevant config file):

```ts
export const DEFAULT_PRINTER: PrinterConfig = {
  name: "Receipt Printer",
  type: "network",          // "network" | "usb" | "local"
  address: "127.0.0.1",     // for network
  port: 9100,               // for network (raw ESC/POS)
  timeoutMs: 3000,
};
```

Runtime printer selection (by room/window) happens in:
- `src/components/department-printer-management.tsx` (admin UI)
- `src/lib/orders.ts` (resolves printer per department/window)

## 13. Adding Another Invoice Template

1. Create a new file: `src/printing/templates/my-invoice.ts`
2. Export a builder function using `shared.ts` helpers:

```ts
import { renderInvoiceHeader, renderItems, renderTotals } from "./shared";
import type { OrderData } from "@/types";

export function buildMyInvoice(order: OrderData, style: InvoiceStyle) {
  return [
    ...renderInvoiceHeader({ ... }),
    ...renderItems(order.items, style),
    ...renderTotals(order, style),
    // ...
  ];
}
```

3. Register it in `src/printing/templates/index.ts`:

```ts
export type InvoiceTemplateName = "full" | "butcher" | "cheese" | "my-invoice";
```

4. Call via `buildInvoice(order, "my-invoice", paper)`.

## 14. Future Desktop App Reuse

The printing module is transport-agnostic. `print-service.ts` produces `Uint8Array` ESC/POS bytes. A future Windows Desktop app can:

1. Reuse `src/printing/` as-is (pure TypeScript, no React/HTTP imports).
2. Replace the transport layer with a local USB printer driver (e.g. `node-escpos`).
3. Keep `print-client.ts` + `print-server.js` for network-capable printers.

Architecture is designed for:

```
Desktop App (Electron/Tauri)
    ├─ UI: existing React components
    ├─ Printing: src/printing/ (pure)
    └─ Transport: native USB printer module
```

## 15. Running the Tests

```bash
node scripts/test-printing.mjs
```

Covers: Arabic detection, numerals, text wrapping, bitmap conversion, paper configs, ESC/POS command structure, template data, reprint preservation, mixed Arabic/English.

## 16. Running the Print Server

```bash
node print-server.js
```

Listens on the configured port (default 9100) and forwards raw ESC/POS data to the configured printer IP/port.

## 17. Printing Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Server health check |
| `POST /print` | Send a rendered PrintJob payload |
| `GET /status` | Printer connection status |

## 18. Print Job Format

```ts
interface PrintJob {
  type: "invoice" | "reprint" | "test";
  paperWidth: "58" | "80";
  printerId: string;
  copies: number;
  payload: {           // ArrayBuffer or base64
    bytes: number[];   // ESC/POS bytes
    preview?: string;  // optional base64 PNG preview
  };
  metadata: {
    invoiceNumber?: string;
    orderNumber?: string;
    department?: string;
    printedAt: string;
  };
}
```

## 19. Troubleshooting

| Problem | Fix |
|---|---|
| Arabic garbage | Ensure the canvas renderer path is used (not raw text) |
| Text clipped | Increase paper `widthPx` or reduce font sizes |
| Printer offline | Check printer IP/port in `config/printer.ts` or admin UI |
| Connection timeout | Increase `timeoutMs` in `config/printer.ts` |
| Blank print | Check `public/fonts/NotoSansArabic.ttf` exists |
