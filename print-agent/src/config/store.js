/**
 * Local, on-disk configuration for the Print Agent.
 *
 * Printer settings stay LOCAL to this machine — they are NEVER stored in
 * Firebase. The config lives under the user's Windows AppData directory.
 *
 * Printer model:
 * {
 *   id: "printer-1",
 *   name: "Butcher Printer",
 *   connection: "tcp" | "usb",
 *   address: "192.168.1.50",   // tcp only
 *   port: 9100,                // tcp only
 *   usbDeviceId: "0x04b8:0x0e15", // usb only
 *   vendorId: "0x04b8",        // usb only (optional)
 *   productId: "0x0e15",       // usb only (optional)
 *   paperWidth: 58 | 80
 * }
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_CONFIG = {
  port: 3001,
  startWithWindows: true,
  setupComplete: false,
  printers: [],
};

const ALLOWED_PAPER_WIDTHS = [58, 80];

/** Normalize legacy `type` → `connection` and coerce paper width. */
function normalizePrinter(input) {
  if (!input || typeof input !== "object") return null;
  const connection =
    input.connection === "usb" || input.type === "usb" ? "usb" : "tcp";
  const paperWidth =
    Number(input.paperWidth) === 80 ? 80 : 58;

  const base = {
    id: typeof input.id === "string" && input.id ? input.id : `printer-${crypto.randomUUID().slice(0, 8)}`,
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : "Printer",
    connection,
    paperWidth,
  };

  if (connection === "tcp") {
    base.address = typeof input.address === "string" ? input.address : "";
    base.port = Number.isInteger(Number(input.port)) && input.port ? Number(input.port) : 9100;
  } else {
    base.usbDeviceId = typeof input.usbDeviceId === "string" ? input.usbDeviceId : "";
    if (input.vendorId) base.vendorId = input.vendorId;
    if (input.productId) base.productId = input.productId;
  }

  return base;
}

class ConfigStore {
  constructor(appDir) {
    this.file = path.join(appDir, "print-agent-config.json");
    this.appDir = appDir;
    this.data = { ...DEFAULT_CONFIG, printers: [] };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, "utf8");
        const parsed = JSON.parse(raw);
        this.data = { ...DEFAULT_CONFIG, ...parsed };
        // Normalize any legacy printer entries.
        this.data.printers = (this.data.printers || [])
          .map(normalizePrinter)
          .filter(Boolean);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[Print Agent] Could not read config, using defaults:", err.message);
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), "utf8");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[Print Agent] Could not save config:", err.message);
    }
  }

  get(key) {
    return key ? this.data[key] : this.data;
  }

  set(key, value) {
    if (typeof key === "object") {
      this.data = { ...this.data, ...key };
    } else {
      this.data[key] = value;
    }
    this._save();
    return this.data;
  }

  configPath() {
    return this.file;
  }

  // --- Printer CRUD --------------------------------------------------------

  listPrinters() {
    return this.data.printers || [];
  }

  getPrinter(id) {
    return this.listPrinters().find((p) => p.id === id);
  }

  /** Create a printer from arbitrary input; returns the normalized record. */
  addPrinter(input) {
    const printer = normalizePrinter(input);
    if (!printer) throw new Error("Invalid printer");
    const printers = this.listPrinters();
    if (printers.some((p) => p.id === printer.id)) {
      printer.id = `printer-${crypto.randomUUID().slice(0, 8)}`;
    }
    printers.push(printer);
    this.set("printers", printers);
    return printer;
  }

  /** Update a printer by id (partial). Returns the updated record. */
  updatePrinter(id, patch) {
    const printers = this.listPrinters();
    const idx = printers.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const merged = normalizePrinter({ ...printers[idx], ...patch, id });
    printers[idx] = merged;
    this.set("printers", printers);
    return merged;
  }

  removePrinter(id) {
    this.set("printers", this.listPrinters().filter((p) => p.id !== id));
  }

  /** Kept for backward compatibility with earlier call sites. */
  savePrinter(printer) {
    const existing = this.getPrinter(printer.id);
    if (existing) return this.updatePrinter(printer.id, printer);
    return this.addPrinter(printer);
  }

  markSetupComplete() {
    this.set("setupComplete", true);
  }
}

module.exports = { ConfigStore, DEFAULT_CONFIG, normalizePrinter, ALLOWED_PAPER_WIDTHS };