/**
 * USB ESC/POS transport + discovery.
 *
 * The optional native `usb` module is loaded lazily so the agent still runs
 * for network printers if USB support is unavailable. On Windows, raw USB
 * printing requires the printer's USB interface to be accessible via WinUSB
 * (the `usb` npm package uses libusb). If no WinUSB driver is bound, raw
 * USB printing is not possible and the agent reports the limitation.
 *
 * Kept dependency-light: no native rebuild required for the base installer;
 * the `usb` package is an optionalDependency.
 */

const { USB_TRANSFER_TIMEOUT_MS } = require("../config/security");

let usbLib = null;
let usbChecked = false;

function getUsbLib() {
  if (!usbChecked) {
    usbChecked = true;
    try {
      // eslint-disable-next-line global-require
      usbLib = require("usb");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[Print Agent] USB module unavailable:", err.message);
      usbLib = false;
    }
  }
  return usbLib || null;
}

/** Parse "0x04b8:0x0e15" (or with decimal/hex) into {v,b} numbers. */
function parseUsbDeviceId(id) {
  if (typeof id !== "string") return null;
  const m = id.match(/^(0x[0-9a-fA-F]+|\d+)\s*[:/,-]\s*(0x[0-9a-fA-F]+|\d+)$/);
  if (!m) return null;
  const vendorId = parseInt(m[1], m[1].startsWith("0x") ? 16 : 10);
  const productId = parseInt(m[2], m[2].startsWith("0x") ? 16 : 10);
  if (!Number.isInteger(vendorId) || !Number.isInteger(productId)) return null;
  return { vendorId, productId };
}

function hex(n) {
  return `0x${Number(n).toString(16).padStart(4, "0")}`;
}

/**
 * Discover USB devices that look like printers.
 * A device qualifies if it has an OUT endpoint or uses USB printer class (7).
 * Returns [{ id, vendorId, productId, manufacturer, product, serialNumber }].
 */
function listUSBPrinters() {
  const usb = getUsbLib();
  if (!usb) return [];
  let devices = [];
  try {
    devices = usb.getDeviceList();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[Print Agent] USB enumeration failed:", err.message);
    return [];
  }

  const out = [];
  for (const d of devices) {
    try {
      const desc = d.deviceDescriptor;
      const hasOut = d.interfaces?.some((i) =>
        i.endpoints?.some((e) => e.direction === "out")
      );
      const isPrinterClass = desc.bDeviceClass === 7;
      if (!hasOut && !isPrinterClass) continue;

      const vendorId = hex(desc.idVendor);
      const productId = hex(desc.idProduct);
      out.push({
        id: `${vendorId}:${productId}`,
        vendorId,
        productId,
        manufacturer: desc.iManufacturer ? safeString(d, desc.iManufacturer) : "",
        product: desc.iProduct ? safeString(d, desc.iProduct) : "",
        serialNumber: desc.iSerialNumber ? safeString(d, desc.iSerialNumber) : "",
      });
    } catch {
      /* skip devices we cannot read */
    }
  }
  return out;
}

/** Best-effort synchronous string descriptor read (may be unavailable). */
function safeString(device, index) {
  try {
    return device.getStringDescriptorSync(index) || "";
  } catch {
    return "";
  }
}

/**
 * Send a complete binary ESC/POS payload to a USB printer.
 *
 * Lifecycle (professional, repeatable):
 *   1. Locate the configured device.
 *   2. Open the device and claim the printer interface.
 *   3. Send the whole payload in bounded chunks, each with a hard timeout.
 *   4. Release the interface and close the device EXACTLY once (idempotent),
 *      even on error, so the handle is never left in a broken state.
 *   5. Resolve only after the final transfer completed.
 *
 * The device is NOT reset between jobs; an open/release cycle per job keeps
 * the printer usable for the next job without a reset.
 */
function sendToUSBPrinter(vendorId, productId, data) {
  return new Promise((resolve, reject) => {
    const usb = getUsbLib();
    if (!usb) {
      reject(new Error("USB module is not available on this system"));
      return;
    }
    if (!Number.isInteger(vendorId) || !Number.isInteger(productId)) {
      reject(new Error("Invalid USB vendorId/productId"));
      return;
    }

    let device = null;
    let iface = null;
    let settled = false;
    let cleanupDone = false;

    /** Release interface + close device exactly once. Never throws. */
    const cleanup = () => {
      if (cleanupDone) return;
      cleanupDone = true;
      try { if (iface && iface.release) iface.release(); } catch { /* ignore */ }
      try { if (device && device.close) device.close(); } catch { /* ignore */ }
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    try {
      device = usb.findByIds(vendorId, productId);
      if (!device) {
        reject(new Error(`USB printer not found: ${hex(vendorId)}:${hex(productId)}`));
        return;
      }
      device.open();
      iface = device.interfaces && device.interfaces[0];
      if (!iface) { fail(new Error("No interface found")); return; }
      iface.claim();
      const out = iface.endpoints.find((ep) => ep.direction === "out");
      if (!out) { fail(new Error("No OUT endpoint found")); return; }

      const buffer = Buffer.from(data, "binary");
      // Bulk OUT transfers should be whole multiples of the max packet size
      // (except the final chunk). Default to 64 bytes when unknown.
      const packet = out.maxPacketSize || 64;
      const chunkSize = Math.max(packet, Math.floor(8192 / packet) * packet);
      let offset = 0;

      const writeChunk = () => {
        if (settled) return;
        const chunk = buffer.subarray(offset, offset + chunkSize);
        if (chunk.length === 0) { succeed(); return; }

        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          fail(new Error("ETIMEDOUT: USB transfer timeout"));
        }, USB_TRANSFER_TIMEOUT_MS);

        out.transfer(chunk, (err) => {
          clearTimeout(timer);
          if (timedOut) return;
          if (err) { fail(err); return; }
          offset += chunk.length;
          writeChunk();
        });
      };

      writeChunk();
    } catch (err) {
      fail(err);
    }
  });
}

module.exports = { sendToUSBPrinter, listUSBPrinters, parseUsbDeviceId };