# Ahmed POS Print Agent

A lightweight **Windows system-tray application** that gives the online POS
website (Next.js on Vercel) access to the **local thermal printer**, without
exposing the printer or becoming an open TCP proxy.

The POS website stays online. This agent only owns local printer access.

```
      INTERNET
         │  HTTPS (fetch with the raster ESC/POS payload)
         ▼
  POS Website (Next.js / Vercel)
         │  HTTP  http://127.0.0.1:3001
         ▼
  Ahmed POS Print Agent  (this app, runs in the tray)
         │
   ┌─────┴─────┐
   ▼           ▼
 USB         TCP/IP
 Printer     Printer
```

## Why raster, not text

Arabic invoices are rendered to a **1bpp bitmap** by the website and sent as
ESC/POS **GS v 0** raster (`1D 76 30`). The agent transports those exact
bytes unchanged (`Buffer.from(data, "binary")`). It never decodes or
re-encodes text, and never uses printer code pages.

## Desktop application

The agent is a real Windows desktop app:

- **Dashboard** — printer cards (name, USB/TCP, address/port or USB id, paper
  width, live status) with **Test Print / Edit / Delete**.
- **Add Printer** — TCP/IP (validated IPv4 + port) or USB (device discovery +
  manual `vendorId:productId`), 58mm/80mm paper.
- **Scan USB Printers** — enumerates USB devices via the optional `usb` module.
- **First-run setup** — asks how many printers to configure (any number), then
  walks through adding them one by one.
- **Settings** — Start with Windows, port, config file path, version, restart.
- **Tray / background** — closing the window hides to the tray; the agent keeps
  running. Only **Exit** terminates it. Single-instance lock enforced.

## HTTP API (`127.0.0.1:3001`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health + version + configured printer count |
| GET | `/printers` | Configured printers (with live status) + discovered USB devices |
| POST | `/printers` | Create a printer |
| PUT | `/printers/:id` | Update a printer |
| DELETE | `/printers/:id` | Delete a printer |
| POST | `/printers/:id/test` | Print a short self-test receipt |
| POST | `/print` | Send an ESC/POS raster payload to a printer |

### `GET /printers` response

```json
{
  "ok": true,
  "printers": [
    {
      "id": "printer-1",
      "name": "Butcher Printer",
      "connection": "tcp",
      "address": "192.168.1.50",
      "port": 9100,
      "paperWidth": 80,
      "status": "ready"
    }
  ],
  "discovered": [ { "id": "0x04b8:0x0e15", "product": "EPSON TM-T20", "vendorId": "0x04b8", "productId": "0x0e15" } ]
}
```

`status` is `"ready" | "offline" | "unknown"` (TCP = live connect probe, USB =
device presence).

### `POST /print` body

```json
{
  "printerId": "pr-lobby",
  "type": "network",
  "address": "192.168.1.50",
  "port": 9100,
  "data": "<binary-string ESC/POS bytes>"
}
```

For USB: `"type": "usb", "vendorId": "0x04b8", "productId": "0x0e15"`.

`data` is the **binary string** produced by the web renderer (the existing
`print-client.ts` already sends this), so no change is needed on the site.

## Security

- Binds **only** to `127.0.0.1` (never `0.0.0.0`).
- **Origin allowlist**: `https://wep-dash.vercel.app`, `http://localhost:3000`,
  `http://127.0.0.1:3000` (plus any `localhost:*` / `127.0.0.1:*` for dev).
- Validates `printerId`, `type`, `address`, `port`, `vendorId`, `productId`.
- Caps request body size (6 MB) and connection/write timeouts.
- **No arbitrary destination forwarding** — only configured/validated printers.

## Configuration

Stored locally (never in Firebase) at
`%APPDATA%/Ahmed POS Print Agent/print-agent-config.json`:

```json
{
  "port": 3001,
  "startWithWindows": true,
  "setupComplete": true,
  "printers": [
    { "id": "printer-1", "name": "Butcher Printer", "connection": "tcp", "address": "192.168.1.50", "port": 9100, "paperWidth": 80 },
    { "id": "printer-2", "name": "Cheese Printer", "connection": "usb", "usbDeviceId": "0x04b8:0x0e15", "paperWidth": 58 }
  ]
}
```

## Run (development)

```bash
cd print-agent
npm install
npm start          # launches Electron + tray + 127.0.0.1:3001
npm run dev        # same, with --dev flag
```

Verify the agent:

```bash
node test/selftest.js      # server + validation (no Electron needed)
curl http://127.0.0.1:3001/health
```

## Build the Windows installer

```bash
cd print-agent
npm install
npm run dist       # → dist/Ahmed-POS-Print-Agent-Setup-<version>.exe
```

The end user downloads `Ahmed-POS-Print-Agent-Setup.exe`, installs it, and it
runs in the tray. **No Node.js or Python installation is required.**

Drop your icons at `assets/icon.ico` (installer) and `assets/tray.png`
(tray). If `tray.png` is missing the app still runs with an empty icon.

## Tray menu

- Status: `● Running on 127.0.0.1:3001`
- Open Dashboard / Printers / Settings
- Restart Agent
- Exit

## Website connection

The website reads the local printers through:

- `src/lib/local-printers.ts` — `getLocalPrinters()` / `getLocalAgentStatus()`
  (timeout, connection-refused and CORS handling; never throws).
- `src/components/local-printers-panel.tsx` — shows agent status + local printer
  cards, and a local-only logical→local printer mapping.
- `src/lib/local-printer-assignment.ts` — stores that mapping in `localStorage`
  only; **never** in Firebase.
- `src/lib/print-client.ts` — prefers a locally-assigned printer, otherwise
  falls back to the Firebase printer config.

No Electron/Tauri code lives in React components.

## Reuse

The `src/printing/` renderer (pure TypeScript: templates, config, raster,
ESC/POS) is unchanged and reused. This agent is transport-only.