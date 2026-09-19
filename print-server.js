/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Minimal Local Print Service for Thermal Receipt Printers
 * 
 * Runs as a local HTTP server that receives print jobs from the web app
 * and sends raw ESC/POS data to USB or Network thermal printers.
 * 
 * Usage: node print-server.js
 * 
 * Endpoints:
 *   POST /print - Send print job
 *     Body: { printerId: string, data: string, type: "usb" | "network", address?: string, port?: number, usbIdentifier?: string }
 *   GET /printers - List configured printers
 *   GET /health - Health check
 */

const http = require('http');
const net = require('net');
const { exec } = require('child_process');
const { promisify } = require('util');

// The 'usb' native module may fail to load on some systems.
// Load it lazily so the server can still serve network printers if USB is unavailable.
let usbLib = null;
function getUsbLib() {
  if (usbLib === null) {
    try {
      usbLib = require('usb');
    } catch (err) {
      console.warn('[Print Server] WARNING: Native "usb" module failed to load:', err.message);
      console.warn('[Print Server] USB printer support is disabled. Network printing still works.');
      usbLib = false;
    }
  }
  return usbLib || null;
}

const execAsync = promisify(exec);

const PORT = process.env.PRINT_SERVER_PORT || 3001;
const HOST = '127.0.0.1';

// In-memory printer registry (loaded from config or auto-discovered)
const printers = new Map();

// Configure your printers here or load from a config file
const PRINTER_CONFIG = {
  // Example USB printer config
  // "cheese-printer": { type: "usb", vendorId: 0x04b8, productId: 0x0e15 }, // Epson TM-T20
  // "butcher-printer": { type: "usb", vendorId: 0x04b8, productId: 0x0e15 },
  
  // Example Network printer config
  // "cheese-printer": { type: "network", address: "192.168.1.100", port: 9100 },
  // "butcher-printer": { type: "network", address: "192.168.1.101", port: 9100 },
};

function initializePrinters() {
  // Load from config
  Object.entries(PRINTER_CONFIG).forEach(([id, config]) => {
    printers.set(id, { id, ...config, status: 'unknown' });
  });
  
  console.log('[Print Server] Configured printers:', Array.from(printers.keys()));
}

async function detectUSBPrinters() {
  const usb = getUsbLib();
  if (!usb) {
    throw new Error('USB module is not available on this system');
  }
  try {
    const devices = usb.getDeviceList();
    const printerDevices = [];

    for (const device of devices) {
      // Try to get device descriptor information
      try {
        // Open device to get string descriptors (manufacturer, product, serial)
        device.open();
        
        // Get manufacturer, product, and serial number strings
        const manufacturer = await getStringDescriptor(device, device.deviceDescriptor.iManufacturer);
        const product = await getStringDescriptor(device, device.deviceDescriptor.iProduct);
        const serialNumber = await getStringDescriptor(device, device.deviceDescriptor.iSerialNumber);
        
        // Check if device has an OUT endpoint (suitable for printing)
        let hasOutEndpoint = false;
        for (const iface of device.interfaces) {
          for (const endpoint of iface.endpoints) {
            if (endpoint.direction === 'out') {
              hasOutEndpoint = true;
              break;
            }
          }
          if (hasOutEndpoint) break;
        }
        
        // Include device if it has an OUT endpoint or is a known printer class
        // Class 7 = Printer, but many thermal printers use vendor-specific classes
        const deviceClass = device.deviceDescriptor.bDeviceClass;
        const isPrinterClass = deviceClass === 7;
        
        if (hasOutEndpoint || isPrinterClass) {
          printerDevices.push({
            vendorId: device.deviceDescriptor.idVendor,
            productId: device.deviceDescriptor.idProduct,
            manufacturerName: manufacturer || 'Unknown',
            productName: product || 'Unknown',
            serialNumber: serialNumber || undefined,
            deviceClass: deviceClass,
            hasOutEndpoint: hasOutEndpoint,
          });
        }
        
        device.close();
      } catch (err) {
        // Device might not allow opening or string descriptors might fail
        device.close();
        // Still include basic info for devices we can't fully inspect
        printerDevices.push({
          vendorId: device.deviceDescriptor.idVendor,
          productId: device.deviceDescriptor.idProduct,
          manufacturerName: 'Unknown',
          productName: 'Unknown',
          serialNumber: undefined,
          deviceClass: device.deviceDescriptor.bDeviceClass,
          hasOutEndpoint: false,
        });
      }
    }
    
    return printerDevices;
  } catch (err) {
    console.error('[Print Server] USB detection error:', err);
    throw err;
  }
}

function getStringDescriptor(device, index) {
  if (!index || index === 0) return Promise.resolve(null);
  
  return new Promise((resolve) => {
    try {
      device.getStringDescriptor(index, (err, str) => {
        if (err) {
          resolve(null);
        } else {
          resolve(str);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

async function sendToNetworkPrinter(address, port, data) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const buffer = Buffer.from(data, 'binary');
    const byteCount = buffer.length;

    console.log(`[PRINT SERVER]`);
    console.log(`[PRINT SERVER] Connecting to ${address}:${port}`);

    const timeout = setTimeout(() => {
      socket.destroy();
      const timeoutErr = new Error('ETIMEDOUT: Connection timeout');
      timeoutErr.code = 'ETIMEDOUT';
      console.error(`[PRINT SERVER] ETIMEDOUT`);
      reject(timeoutErr);
    }, 5000);

    socket.connect(port, address, () => {
      clearTimeout(timeout);
      console.log(`[PRINT SERVER] TCP CONNECTED`);

      // Write raw ESC/POS data
      socket.write(buffer, (err) => {
        if (err) {
          console.error(`[PRINT SERVER] Write error:`, err.code, err.message);
          socket.destroy();
          reject(err);
          return;
        }
        console.log(`[PRINT SERVER] Sending ESC/POS bytes: ${byteCount}`);
        socket.end();
      });
    });

    socket.on('close', () => {
      clearTimeout(timeout);
      console.log(`[PRINT SERVER] Print job completed`);
      resolve();
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      // Log the actual Node error code (ECONNREFUSED, ETIMEDOUT, EHOSTUNREACH, etc.)
      console.error(`[PRINT SERVER] TCP error: ${err.code || 'UNKNOWN'} - ${err.message}`);
      reject(err);
    });
  });
}

async function sendToUSBPrinter(vendorId, productId, data) {
  // Use the 'usb' npm package for raw USB communication
  // This is a simplified implementation
  return new Promise((resolve, reject) => {
    try {
      const usb = getUsbLib();
      if (!usb) {
        reject(new Error('USB module is not available on this system'));
        return;
      }
      const device = usb.findByIds(vendorId, productId);
      
      if (!device) {
        reject(new Error(`USB printer not found: ${vendorId.toString(16)}:${productId.toString(16)}`));
        return;
      }
      
      device.open();
      
      // Find the first interface with an OUT endpoint
      const interface = device.interfaces[0];
      if (!interface) {
        reject(new Error('No interface found'));
        return;
      }
      
      interface.claim();
      
      const outEndpoint = interface.endpoints.find(ep => ep.direction === 'out');
      if (!outEndpoint) {
        reject(new Error('No OUT endpoint found'));
        return;
      }
      
      // Write data in chunks
      const buffer = Buffer.from(data, 'binary');
      let offset = 0;
      const chunkSize = outEndpoint.maxPacketSize || 64;
      
      function writeChunk() {
        const chunk = buffer.slice(offset, offset + chunkSize);
        if (chunk.length === 0) {
          interface.release();
          device.close();
          resolve();
          return;
        }
        
        outEndpoint.transfer(chunk, (err) => {
          if (err) {
            interface.release();
            device.close();
            reject(err);
            return;
          }
          offset += chunk.length;
          writeChunk();
        });
      }
      
      writeChunk();
    } catch (err) {
      reject(err);
    }
  });
}

async function printToPrinter(printerId, data) {
  const printer = printers.get(printerId);
  if (!printer) {
    throw new Error(`Printer not found: ${printerId}`);
  }
  
  console.log(`[Print Server] Printing to ${printerId} (${printer.type})`);
  
  try {
    if (printer.type === 'network') {
      await sendToNetworkPrinter(printer.address, printer.port || 9100, data);
    } else if (printer.type === 'usb') {
      await sendToUSBPrinter(printer.vendorId, printer.productId, data);
    } else {
      throw new Error(`Unknown printer type: ${printer.type}`);
    }
    
    printer.status = 'ok';
    printer.lastPrint = new Date().toISOString();
    console.log(`[Print Server] Print completed for ${printerId}`);
  } catch (err) {
    printer.status = 'error';
    printer.lastError = err.message;
    console.error(`[Print Server] Print failed for ${printerId}:`, err.message);
    throw err;
  }
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  
  if (url.pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }
  
  if (url.pathname === '/printers/usb' && req.method === 'GET') {
    try {
      const devices = await detectUSBPrinters();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ devices }));
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
  }
  
  if (url.pathname === '/printers' && req.method === 'GET') {
    const printerList = Array.from(printers.values()).map(p => ({
      id: p.id,
      type: p.type,
      status: p.status,
      address: p.address,
      port: p.port,
      vendorId: p.vendorId ? `0x${p.vendorId.toString(16)}` : undefined,
      productId: p.productId ? `0x${p.productId.toString(16)}` : undefined,
      lastPrint: p.lastPrint,
      lastError: p.lastError,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ printers: printerList }));
    return;
  }
  
  if (url.pathname === '/print' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { printerId, data, type, address, port, vendorId, productId, usbIdentifier } = JSON.parse(body);
        
        if (!printerId || !data) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing printerId or data' }));
          return;
        }
        
        // Register printer if not exists (for dynamic printer discovery)
        if (!printers.has(printerId)) {
          if (type === 'network' && address && port) {
            printers.set(printerId, { id: printerId, type: 'network', address, port: parseInt(port, 10), status: 'unknown' });
          } else if (type === 'usb' && vendorId && productId) {
            printers.set(printerId, { 
              id: printerId, 
              type: 'usb', 
              vendorId: parseInt(vendorId, 16), 
              productId: parseInt(productId, 16),
              usbIdentifier,
              status: 'unknown' 
            });
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid printer configuration' }));
            return;
          }
        }
        
        await printToPrinter(printerId, data);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, printerId }));
      } catch (err) {
        console.error('[Print Server] Print error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, HOST, () => {
  initializePrinters();
  console.log(`[Print Server] Running on http://${HOST}:${PORT}`);
  console.log(`[Print Server] Endpoints:`);
  console.log(`  POST http://${HOST}:${PORT}/print`);
  console.log(`  GET  http://${HOST}:${PORT}/printers`);
  console.log(`  GET  http://${HOST}:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Print Server] Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

module.exports = { server, printToPrinter, printers };