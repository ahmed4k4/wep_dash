/**
 * Security config & validators for the local Print Agent.
 * Binds loopback only, enforces an Origin allowlist, validates printer
 * fields, caps body size, and sets connection timeouts. Not a TCP proxy.
 */

const ALLOWED_ORIGINS = [
  "https://wep-dash.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const MAX_BODY_BYTES = 6 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 5000;
const WRITE_TIMEOUT_MS = 15000;
const PROFILES = ["usb", "network"];
const CONNECTIONS = ["usb", "tcp"];
const PAPER_WIDTHS = [58, 80];

function isOriginAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return LOCAL_ORIGIN_RE.test(origin);
}

function isValidId(id) {
  return typeof id === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(id);
}

function isValidHost(host) {
  return typeof host === "string" && /^[A-Za-z0-9.-]{1,253}$/.test(host);
}

/** IPv4 address validation for TCP printer config. */
function isValidIPv4(ip) {
  if (typeof ip !== "string") return false;
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function isValidPort(port) {
  const p = Number(port);
  return Number.isInteger(p) && p >= 1 && p <= 65535;
}

function isValidPaperWidth(w) {
  return PAPER_WIDTHS.includes(Number(w));
}

/**
 * Validate a printer configuration payload for POST/PUT /printers.
 * Returns { ok:true, value } | { ok:false, error }.
 */
function validatePrinterConfig(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid JSON body" };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80) return { ok: false, error: "Invalid printer name" };

  const connection = body.connection || body.type;
  if (!CONNECTIONS.includes(connection)) {
    return { ok: false, error: `Unsupported connection: ${connection}` };
  }

  const paperWidth = body.paperWidth === undefined ? 58 : Number(body.paperWidth);
  if (!isValidPaperWidth(paperWidth)) return { ok: false, error: "Invalid paperWidth (58 or 80)" };

  const value = { name, connection, paperWidth };

  if (body.id !== undefined) {
    if (!isValidId(body.id)) return { ok: false, error: "Invalid printer id" };
    value.id = body.id;
  }

  if (connection === "tcp") {
    if (!isValidIPv4(body.address)) return { ok: false, error: "Invalid IP address" };
    const port = body.port === undefined ? 9100 : Number(body.port);
    if (!isValidPort(port)) return { ok: false, error: "Invalid port" };
    value.address = body.address;
    value.port = port;
  } else {
    // USB: require an identifier string (from discovery or manual entry).
    const usbDeviceId = typeof body.usbDeviceId === "string" ? body.usbDeviceId.trim() : "";
    if (!usbDeviceId || usbDeviceId.length > 128) {
      return { ok: false, error: "Missing or invalid usbDeviceId" };
    }
    value.usbDeviceId = usbDeviceId;
    if (body.vendorId) value.vendorId = body.vendorId;
    if (body.productId) value.productId = body.productId;
  }

  return { ok: true, value };
}

/** Validate a print request body → { ok, value } | { ok:false, error }. */
function validatePrintRequest(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid JSON body" };
  const { printerId, data, type, address, port } = body;

  if (!isValidId(printerId)) return { ok: false, error: "Invalid printerId" };
  if (typeof data !== "string" || data.length === 0)
    return { ok: false, error: "Missing or invalid data" };
  if (data.length > MAX_BODY_BYTES) return { ok: false, error: "Payload too large" };

  const profile = type === "usb" ? "usb" : "network";
  if (!PROFILES.includes(profile))
    return { ok: false, error: `Unsupported printer type: ${profile}` };

  if (profile === "network") {
    if (!isValidHost(address)) return { ok: false, error: "Invalid printer address" };
    const p = port ? Number(port) : 9100;
    if (!isValidPort(p)) return { ok: false, error: "Invalid printer port" };
    return { ok: true, value: { printerId, data, type: "network", address, port: p } };
  }

  const vendorId = parseInt(body.vendorId, 16);
  const productId = parseInt(body.productId, 16);
  if (!Number.isInteger(vendorId) || vendorId <= 0)
    return { ok: false, error: "Invalid vendorId" };
  if (!Number.isInteger(productId) || productId <= 0)
    return { ok: false, error: "Invalid productId" };
  return { ok: true, value: { printerId, data, type: "usb", vendorId, productId } };
}

module.exports = {
  ALLOWED_ORIGINS, MAX_BODY_BYTES, CONNECT_TIMEOUT_MS, WRITE_TIMEOUT_MS,
  CONNECTIONS, PAPER_WIDTHS,
  isOriginAllowed, isValidId, isValidHost, isValidIPv4, isValidPort,
  isValidPaperWidth, validatePrinterConfig, validatePrintRequest,
};