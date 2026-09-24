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

    let device;
    try {
      device = usb.findByIds(vendorId, productId);
      if (!device) {
        reject(new Error(`USB printer not found: ${hex(vendorId)}:${hex(productId)}`));
        return;
      }
      device.open();
      const iface = device.interfaces && device.interfaces[0];
      if (!iface) { device.close(); reject(new Error("No interface found")); return; }
      iface.claim();
      const out = iface.endpoints.find((ep) => ep.direction === "out");
      if (!out) {
        try { iface.release(); } catch { /* ignore */ }
        device.close();
        reject(new Error("No OUT endpoint found"));
        return;
      }

      const buffer = Buffer.from(data, "binary");
      const chunkSize = out.maxPacketSize || 64;
      let offset = 0;

      const cleanup = () => {
        try { iface.release(); } catch { /* ignore */ }
        try { device.close(); } catch { /* ignore */ }
      };

      const writeChunk = () => {
        const chunk = buffer.subarray(offset, offset + chunkSize);
        if (chunk.length === 0) { cleanup(); resolve(); return; }
        out.transfer(chunk, (err) => {
          if (err) { cleanup(); reject(err); return; }
          offset += chunk.length;
          writeChunk();
        });
      };

      writeChunk();
    } catch (err) {
      try { device && device.close(); } catch { /* ignore */ }
      reject(err);
    }
  });
}

module.exports = { sendToUSBPrinter, listUSBPrinters, parseUsbDeviceId };