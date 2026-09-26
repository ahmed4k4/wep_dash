/**
 * Unified printer dispatcher, status prober, and discovery.
 *
 * Preserves binary bytes end-to-end. Supports BOTH the local config model
 * (`connection: "tcp" | "usb"`) and the website's print payload
 * (`type: "network" | "usb"`).
 */

const net = require("net");
const { sendToNetworkPrinter } = require("./tcp");
const { sendToUSBPrinter, listUSBPrinters, parseUsbDeviceId } = require("./usb");
const { enqueue, isBusy } = require("./queue");
const { WRITE_TIMEOUT_MS, CONNECT_TIMEOUT_MS } = require("../config/security");

/**
 * Actually perform a single job's transport work (no queueing here).
 * The write timeout is enforced by the transport itself now; this is a belt
 * and braces ceiling in case a transport implementation forgets one.
 */
async function performPrint(job) {
  const isUsb = job.type === "usb" || job.connection === "usb";

  let work;
  if (isUsb) {
    let vendorId = job.vendorId;
    let productId = job.productId;
    if ((!vendorId || !productId) && job.usbDeviceId) {
      const parsed = parseUsbDeviceId(job.usbDeviceId);
      if (parsed) {
        vendorId = `0x${parsed.vendorId.toString(16)}`;
        productId = `0x${parsed.productId.toString(16)}`;
      }
    }
    work = sendToUSBPrinter(
      parseInt(vendorId, 16),
      parseInt(productId, 16),
      job.data
    );
  } else {
    work = sendToNetworkPrinter(job.address, job.port, job.data);
  }

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("ETIMEDOUT: Print write timeout")), WRITE_TIMEOUT_MS + 1000)
  );

  await Promise.race([work, timeout]);
}

/**
 * Dispatch an already-validated print request to the correct transport.
 *
 * Jobs bound for the SAME printerId are serialized through a per-printer
 * queue, so consecutive print jobs never overlap on one device. Different
 * printers run independently. Resolves only after THIS job truly completed.
 */
async function dispatchPrint(job) {
  const printerId = job.printerId || `${job.address || "usb"}:${job.port || ""}`;
  return enqueue(printerId, () => performPrint(job));
}

/** Check whether a TCP host:port accepts a connection. */
function probeTcp(address, port) {
  return new Promise((resolve) => {
    if (!address) return resolve("unknown");
    const socket = new net.Socket();
    let done = false;
    const finish = (status) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(status);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("connect", () => finish("ready"));
    socket.once("timeout", () => finish("offline"));
    socket.once("error", () => finish("offline"));
    try {
      socket.connect(port || 9100, address);
    } catch {
      finish("offline");
    }
  });
}

/**
 * Probe a locally-configured printer for its status.
 * @returns "ready" | "offline" | "unknown"
 */
async function probePrinter(printer) {
  if (!printer) return "unknown";
  // A printer with an in-flight job is "printing" regardless of connection.
  if (isBusy(printer.id)) return "printing";
  if (printer.connection === "tcp") {
    return probeTcp(printer.address, printer.port);
  }
  // USB: presence check only.
  const parsed = parseUsbDeviceId(printer.usbDeviceId || "");
  if (!parsed) return "unknown";
  const devices = listUSBPrinters();
  const found = devices.some(
    (d) =>
      parseInt(d.vendorId, 16) === parsed.vendorId &&
      parseInt(d.productId, 16) === parsed.productId
  );
  if (devices.length === 0) return "unknown"; // usb module unavailable
  return found ? "ready" : "offline";
}

/** Add status to every printer in the list (parallel, bounded). */
async function withStatus(printers) {
  return Promise.all(
    printers.map(async (p) => ({ ...p, status: await probePrinter(p) }))
  );
}

module.exports = {
  dispatchPrint,
  performPrint,
  listUSBPrinters,
  probePrinter,
  withStatus,
  queue: require("./queue"),
};
