/**
 * Preload bridge — exposes a minimal, safe IPC API to the desktop UI.
 * contextIsolation is ON and nodeIntegration is OFF; the renderer can only
 * call the whitelisted channels below.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agent", {
  getStatus: () => ipcRenderer.invoke("agent:getStatus"),
  getSettings: () => ipcRenderer.invoke("agent:getSettings"),
  setSettings: (patch) => ipcRenderer.invoke("agent:setSettings", patch),

  listPrinters: () => ipcRenderer.invoke("agent:listPrinters"),
  addPrinter: (data) => ipcRenderer.invoke("agent:addPrinter", data),
  updatePrinter: (id, data) => ipcRenderer.invoke("agent:updatePrinter", id, data),
  deletePrinter: (id) => ipcRenderer.invoke("agent:deletePrinter", id),
  testPrinter: (id) => ipcRenderer.invoke("agent:testPrinter", id),
  scanUsb: () => ipcRenderer.invoke("agent:scanUsb"),

  setupComplete: () => ipcRenderer.invoke("agent:setupComplete"),
  restart: () => ipcRenderer.invoke("agent:restart"),
});