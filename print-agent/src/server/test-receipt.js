/**
 * Builds a short ESC/POS self-test receipt for `POST /printers/:id/test`.
 *
 * Hardware connectivity test only — uses native ESC/POS latin text. The
 * production Arabic invoice is always sent as GS v 0 raster from the web
 * renderer; this file does not render Arabic.
 */

const ESC = 0x1b;
const GS = 0x1d;

function concat(parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = Buffer.alloc(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

/**
 * Build a validated print request object for a printer config.
 * @param {object} printer - local printer record
 * @param {object} overrides - optional { line1, line2 }
 */
function buildTestPayload(printer, overrides = {}) {
  const now = new Date().toLocaleString("en-GB");
  const lines = [
    overrides.line1 || "Ahmed POS - Print Agent",
    overrides.line2 || "Printer self-test OK",
    `Printer: ${printer.name || printer.id}`,
    `${printer.connection === "usb" ? "USB" : "TCP/IP"}`,
    printer.connection === "tcp" ? `${printer.address}:${printer.port}` : printer.usbDeviceId || "",
    now,
  ].filter(Boolean);

  const parts = [];
  parts.push(Buffer.from([ESC, 0x40]));
  parts.push(Buffer.from([ESC, 0x61, 0x01]));
  parts.push(Buffer.from([ESC, 0x45, 0x01]));
  for (const line of lines) parts.push(Buffer.from(`${line}\n`, "latin1"));
  parts.push(Buffer.from([ESC, 0x45, 0x00]));
  parts.push(Buffer.from([0x0a]));
  parts.push(Buffer.from([ESC, 0x64, 0x03]));
  parts.push(Buffer.from([GS, 0x56, 0x42, 0x00]));

  const data = concat(parts).toString("binary");

  const base = { printerId: printer.id, data, type: printer.connection === "usb" ? "usb" : "network" };
  if (printer.connection === "usb") {
    base.vendorId = printer.vendorId;
    base.productId = printer.productId;
    base.usbDeviceId = printer.usbDeviceId;
  } else {
    base.address = printer.address;
    base.port = printer.port || 9100;
  }
  return base;
}

module.exports = { buildTestPayload };