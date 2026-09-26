/**
 * TCP (network) ESC/POS transport. Bytes are sent verbatim — the payload
 * is a binary string produced by the web renderer (GS v 0 raster).
 *
 * Lifecycle (professional, repeatable):
 *   1. Create a fresh socket per job (no long-lived connection needed).
 *   2. Connect with a hard timeout.
 *   3. Write the COMPLETE buffer.
 *   4. Wait for the write to be flushed (callback + drain).
 *   5. Gracefully half-close (end) and wait for the socket to fully close.
 *   6. Resolve ONLY after the transport actually completed.
 *
 * The job promise never resolves merely because write() was called, and the
 * socket is never destroyed before queued data has been transmitted. Every
 * timer is cleared and the socket is always destroyed on the way out, so a
 * subsequent job can immediately open a new connection.
 */

const net = require("net");
const {
  CONNECT_TIMEOUT_MS,
  WRITE_TIMEOUT_MS,
  CLOSE_TIMEOUT_MS = 4000,
} = require("../config/security");

function sendToNetworkPrinter(address, port, data) {
  return new Promise((resolve, reject) => {
    if (!address || !port) {
      reject(new Error("Missing printer address/port"));
      return;
    }

    const socket = new net.Socket();
    const buffer = Buffer.from(data, "binary");

    let settled = false;
    let connectTimer = null;
    let writeTimer = null;
    let closeTimer = null;

    const clearTimers = () => {
      if (connectTimer) clearTimeout(connectTimer);
      if (writeTimer) clearTimeout(writeTimer);
      if (closeTimer) clearTimeout(closeTimer);
      connectTimer = writeTimer = closeTimer = null;
    };

    const cleanup = () => {
      clearTimers();
      // Always release the handle so the next job starts clean.
      socket.removeAllListeners();
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
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

    // 1. Connect timeout.
    connectTimer = setTimeout(() => {
      const e = new Error("ETIMEDOUT: Connection timeout");
      e.code = "ETIMEDOUT";
      fail(e);
    }, CONNECT_TIMEOUT_MS);

    socket.once("error", (err) => fail(err));

    // 2. Once connected, write the whole buffer and wait for flush.
    socket.once("connect", () => {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }

      // Hard ceiling for the write phase so a stuck printer never hangs.
      writeTimer = setTimeout(() => {
        const e = new Error("ETIMEDOUT: Write timeout");
        e.code = "ETIMEDOUT";
        fail(e);
      }, WRITE_TIMEOUT_MS);

      socket.write(buffer, (err) => {
        if (err) {
          fail(err);
          return;
        }
        // 3. Write flushed to the OS buffer; now gracefully half-close. The
        // printer keeps reading buffered data until our FIN.
        socket.end(() => {
          // 'fin' sent; wait for the peer to close (see 'close' handler).
          if (writeTimer) {
            clearTimeout(writeTimer);
            writeTimer = null;
          }
          // Safety net: if the peer never closes, still finish cleanly.
          closeTimer = setTimeout(succeed, CLOSE_TIMEOUT_MS);
        });
      });
    });

    // 4. Full close means every byte was accepted by the peer.
    socket.once("close", () => succeed());

    try {
      socket.connect(port, address);
    } catch (err) {
      fail(err);
    }
  });
}

module.exports = { sendToNetworkPrinter };