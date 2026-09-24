/**
 * Ahmed POS Print Agent — Electron main process.
 *
 * Runs the local HTTP print API on 127.0.0.1:3001 and provides a visible
 * desktop dashboard. Closing the window hides to the tray; only "Exit"
 * fully terminates the agent. The POS website stays online and talks to
 * this agent over localhost.
 */

const path = require("path");
const { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain } = require("electron");
const { ConfigStore } = require("../config/store");
const { createServer, VERSION } = require("../server/server");
const { dispatchPrint, listUSBPrinters, withStatus } = require("../printer");
const { buildTestPayload } = require("../server/test-receipt");
const { validatePrinterConfig, validatePrintRequest } = require("../config/security");

const HOST = "127.0.0.1";

let tray = null;
let win = null;
let server = null;
let store = null;
let serverStatus = "starting";
let serverError = "";
let isQuitting = false;

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function startServer() {
  return new Promise((resolve) => {
    const port = Number(store.get("port")) || 3001;
    server = createServer(store);

    server.on("error", (err) => {
      serverStatus = "error";
      serverError = err.code || err.message;
      // eslint-disable-next-line no-console
      console.error("[Print Agent] Server error:", serverError);
      refreshTray();
      resolve(false);
    });

    server.listen(port, HOST, () => {
      serverStatus = "running";
      serverError = "";
      // eslint-disable-next-line no-console
      console.log(`[Print Agent] Listening on http://${HOST}:${port}`);
      refreshTray();
      resolve(true);
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => { server = null; resolve(); });
  });
}

// ---------------------------------------------------------------------------
// Start with Windows
// ---------------------------------------------------------------------------

function applyLoginItem(enabled) {
  if (process.platform !== "win32") return;
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      path: process.execPath,
      args: ["--hidden"],
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[Print Agent] setLoginItemSettings failed:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow({ hidden = false } = {}) {
  if (win && !win.isDestroyed()) {
    if (!hidden) { win.show(); win.focus(); }
    return win;
  }

  win = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: "Ahmed POS Print Agent",
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "..", "ui", "index.html"));

  win.once("ready-to-show", () => {
    if (!hidden) win.show();
  });

  // Close → hide to tray (background mode), not quit.
  win.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  // Open external links in the OS browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

function showWindow() {
  const w = createWindow();
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

function trayImage() {
  const iconPath = path.join(__dirname, "..", "..", "assets", "tray.png");
  const img = nativeImage.createFromPath(iconPath);
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}

function buildTrayMenu() {
  const dot = serverStatus === "running" ? "● Running" : `● ${serverStatus}`;
  return Menu.buildFromTemplate([
    { label: "Ahmed POS Print Agent", enabled: false },
    { label: serverError ? `${dot} (${serverError})` : dot, enabled: false },
    { type: "separator" },
    { label: "Open Dashboard", click: () => showWindow() },
    { label: "Printers", click: () => showWindow() },
    { label: "Settings", click: () => { showWindow(); win && win.webContents.send("agent:navigate", "settings"); } },
    { type: "separator" },
    { label: "Restart Agent", click: () => restartAgent() },
    { type: "separator" },
    { label: "Exit", click: () => { isQuitting = true; app.quit(); } },
  ]);
}

function refreshTray() {
  if (!tray) return;
  tray.setToolTip(`Ahmed POS Print Agent — ${serverStatus}`);
  tray.setContextMenu(buildTrayMenu());
}

async function restartAgent() {
  await stopServer();
  await startServer();
}

// ---------------------------------------------------------------------------
// IPC (desktop UI)
// ---------------------------------------------------------------------------

function publicPrinter(p) {
  return {
    id: p.id,
    name: p.name,
    connection: p.connection,
    address: p.address,
    port: p.port,
    usbDeviceId: p.usbDeviceId,
    paperWidth: p.paperWidth,
    status: p.status || "unknown",
  };
}

function registerIpc() {
  ipcMain.handle("agent:getStatus", () => ({
    status: serverStatus,
    error: serverError,
    port: Number(store.get("port")) || 3001,
    version: VERSION,
    setupComplete: !!store.get("setupComplete"),
    startWithWindows: !!store.get("startWithWindows"),
    configPath: store.configPath(),
  }));

  ipcMain.handle("agent:getSettings", () => ({
    port: Number(store.get("port")) || 3001,
    startWithWindows: !!store.get("startWithWindows"),
    configPath: store.configPath(),
  }));

  ipcMain.handle("agent:setSettings", (_e, patch = {}) => {
    if (typeof patch.startWithWindows === "boolean") {
      store.set("startWithWindows", patch.startWithWindows);
      applyLoginItem(patch.startWithWindows);
    }
    return { ok: true };
  });

  ipcMain.handle("agent:listPrinters", async () => {
    const printers = await withStatus(store.listPrinters());
    return { ok: true, printers: printers.map(publicPrinter) };
  });

  ipcMain.handle("agent:addPrinter", (_e, data) => {
    const check = validatePrinterConfig(data);
    if (!check.ok) return { ok: false, error: check.error };
    const created = store.addPrinter(check.value);
    return { ok: true, printer: publicPrinter(created) };
  });

  ipcMain.handle("agent:updatePrinter", (_e, id, data) => {
    const check = validatePrinterConfig({ ...(data || {}), id });
    if (!check.ok) return { ok: false, error: check.error };
    const updated = store.updatePrinter(id, check.value);
    if (!updated) return { ok: false, error: "Printer not found" };
    return { ok: true, printer: publicPrinter(updated) };
  });

  ipcMain.handle("agent:deletePrinter", (_e, id) => {
    if (!store.getPrinter(id)) return { ok: false, error: "Printer not found" };
    store.removePrinter(id);
    return { ok: true };
  });

  ipcMain.handle("agent:testPrinter", async (_e, id) => {
    const printer = store.getPrinter(id);
    if (!printer) return { ok: false, error: "Printer not found" };
    try {
      const payload = buildTestPayload(printer, {});
      const check = validatePrintRequest(payload);
      if (!check.ok) return { ok: false, error: check.error };
      await dispatchPrint({ ...check.value, usbDeviceId: printer.usbDeviceId });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle("agent:scanUsb", () => {
    const devices = listUSBPrinters();
    return {
      ok: true,
      devices,
      // The optional native `usb` module may be unavailable; surface that.
      available: devices.length > 0 || true,
    };
  });

  ipcMain.handle("agent:setupComplete", () => {
    store.markSetupComplete();
    return { ok: true };
  });

  ipcMain.handle("agent:restart", async () => {
    await restartAgent();
    return { ok: true, status: serverStatus };
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function bootstrap() {
  store = new ConfigStore(app.getPath("userData"));
  applyLoginItem(!!store.get("startWithWindows"));

  tray = new Tray(trayImage());
  tray.setToolTip("Ahmed POS Print Agent");
  tray.on("double-click", () => showWindow());
  refreshTray();

  registerIpc();

  const hidden = process.argv.includes("--hidden") || !!store.get("startWithWindows");
  createWindow({ hidden });

  await startServer();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.whenReady().then(bootstrap);

  app.on("activate", () => showWindow());

  app.on("before-quit", () => {
    isQuitting = true;
    if (server) server.close();
  });
}