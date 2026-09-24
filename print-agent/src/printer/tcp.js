/**
 * TCP (network) ESC/POS transport. Bytes are sent verbatim — the payload
 * is a binary string produced by the web renderer (GS v 0 raster).
 */

const net = require("net");
const { CONNECT_TIMEOUT_MS } = require("../config/security");

function sendToNetworkPrinter(address, port, data) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const buffer = Buffer.from(data, "binary");
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };

    const timeout = setTimeout(() => {
      const e = new Error("ETIMEDOUT: Connection timeout");
      e.code = "ETIMEDOUT";
      fail(e);
    }, CONNECT_TIMEOUT_MS);

    socket.connect(port, address, () => {
      clearTimeout(timeout);
      socket.write(buffer, (err) => {
        if (err) return fail(err);
        socket.end();
      });
    });

    socket.on("close", () => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        resolve();
      }
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      fail(err);
    });
  });
}

module.exports = { sendToNetworkPrinter };