"use client";

import { useEffect, useRef, useState } from "react";
import { rasterizeBlocks, type RasterBlock } from "@/printing/renderer/raster";
import { buildRasterJob } from "@/printing/renderer/escpos";
import { getPaperConfig } from "@/printing/config/paper";
import { DEFAULT_INVOICE_STYLE } from "@/printing/styles/invoice-style";

const ARABIC_TEST_LINES: {
  text: string;
  align?: "center" | "left" | "right";
  bold?: boolean;
  size?: number;
}[] = [
  { text: "فاتورة مبيعات", align: "center", bold: true, size: 20 },
  { text: "أحمد محمد", align: "right" },
  { text: "جبنة رومي", align: "right" },
  { text: "لحمة", align: "right" },
  { text: "الكمية: 2", align: "right" },
  { text: "السعر: 150 جنيه", align: "right" },
  { text: "الإجمالي: 300 جنيه", align: "right" },
  { text: "فاتورة INV-20260919-0010", align: "center" },
  { text: "العميل: Ahmed", align: "right" },
  { text: "جبنة Cheese", align: "right" },
  { text: "الإجمالي Total: 300 جنيه", align: "right" },
  { text: "شكراً لتعاملكم معنا", align: "center", bold: true },
];

function buildBlocks(): RasterBlock[] {
  return [
    {
      lines: ARABIC_TEST_LINES.map((l) => ({
        text: l.text,
        align: l.align ?? "right",
        bold: l.bold,
        size: l.size ?? DEFAULT_INVOICE_STYLE.bodyFontSize,
      })),
      spacing: 4,
      marginTop: 8,
      marginBottom: 8,
    },
  ];
}

/** Reconstruct a viewable grayscale image from the 1bpp bitmap. */
function bitsToDataUrl(bits: Uint8Array, width: number, height: number, scale: number): string {
  const outW = width * scale;
  const outH = height * scale;
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const bytesPerRow = Math.ceil(width / 8);
  const img = ctx.createImageData(outW, outH);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byteIdx = y * bytesPerRow + (x >> 3);
      const bitIdx = 7 - (x & 7);
      const dark = (bits[byteIdx] >> bitIdx) & 1;
      const val = dark ? 0 : 255;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = (y * scale + sy) * outW + (x * scale + sx);
          img.data[px * 4] = val;
          img.data[px * 4 + 1] = val;
          img.data[px * 4 + 2] = val;
          img.data[px * 4 + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

export default function TestArabicPage() {
  const [dataUrl, setDataUrl] = useState("");
  const [meta, setMeta] = useState("");
  const [escposSummary, setEscposSummary] = useState("");
  const [escposHex, setEscposHex] = useState("");
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const paper = getPaperConfig(DEFAULT_INVOICE_STYLE.paperWidth);
        const blocks = buildBlocks();
        const metaRes = await rasterizeBlocks({
          widthPx: paper.widthPx,
          scale: 1,
          blocks,
          renderHeight: 700,
        });

        // Visual proof: the same bitmap that gets encoded.
        const url = bitsToDataUrl(metaRes.bits, metaRes.width, metaRes.height, 3);
        setDataUrl(url);
        setMeta(
          `Raster: ${metaRes.width}x${metaRes.height}px, ${metaRes.bits.length} bytes (1bpp bit-packed)`
        );

        // ESC/POS payload — same buildRasterJob the print pipeline uses.
        const bytes = buildRasterJob({
          header: [],
          body: metaRes,
          footer: [],
          cut: true,
          feedLines: 4,
          dotsPerLine: paper.widthPx,
        });

        // Starts with ESC @ (init) + GS v 0 (1D 76 30)?
        const gsV0 =
          bytes[0] === 0x1b && bytes[1] === 0x40 && bytes[2] === 0x1d &&
          bytes[3] === 0x76 && bytes[4] === 0x30;

        const hex = Array.from(bytes.slice(0, 64))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ");

        // Count bytes >= 0x80 (raw UTF-8 Arabic would be MANY;
        // raster bit-packing is binary so this should be low).
        let arabicBytes = 0;
        for (let i = 0; i < bytes.length; i++) {
          if (bytes[i] >= 0x80) arabicBytes++;
        }

        const wL = bytes[6] & 0xff,
          wH = bytes[7] & 0xff,
          hL = bytes[8] & 0xff,
          hH = bytes[9] & 0xff;
        const widthEnc = wL | (wH << 8);
        const heightEnc = hL | (hH << 8);

        setEscposSummary(
          `ESC/POS payload: ${bytes.length} bytes | ` +
            `GS v 0 at start (ESC @ 1D 76 30): ${gsV0 ? "YES" : "NO"} | ` +
            `GS v 0 width=${widthEnc} height=${heightEnc} | ` +
            `bytes >= 0x80: ${arabicBytes}`
        );
        setEscposHex(hex);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "sans-serif",
        background: "#f5f5f5",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: 22 }}>Arabic Raster Print Test</h1>
      <p style={{ color: "#555" }}>
        Rendered with the production engine (<code>rasterizeBlocks</code> +{" "}
        <code>buildRasterJob</code>) using the bundled Noto Sans Arabic font.
      </p>
      {error && (
        <pre style={{ background: "#fee", color: "#c00", padding: 12, whiteSpace: "pre-wrap" }}>
          {error}
        </pre>
      )}
      {meta && (
        <pre style={{ background: "#eef", padding: 12, whiteSpace: "pre-wrap", fontWeight: 600 }}>
          {meta}
        </pre>
      )}
      {dataUrl && (
        <div
          style={{
            marginTop: 16,
            background: "#fff",
            display: "inline-block",
            padding: 16,
            border: "1px solid #ccc",
          }}
        >
          <h3>Bitmap sent to printer (scaled x3):</h3>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            alt="Arabic raster render"
            style={{ maxWidth: "100%", imageRendering: "pixelated" }}
          />
        </div>
      )}
      {escposSummary && (
        <pre style={{ background: "#efe", padding: 12, whiteSpace: "pre-wrap", fontWeight: 600 }}>
          {escposSummary}
        </pre>
      )}
      {escposHex && (
        <>
          <h3 style={{ marginTop: 20 }}>First 64 bytes of ESC/POS payload (hex):</h3>
          <pre
            style={{
              background: "#fff",
              border: "1px solid #ccc",
              padding: 12,
              whiteSpace: "pre-wrap",
              fontFamily: "monospace",
            }}
          >
            {escposHex}
          </pre>
          <p style={{ fontFamily: "monospace", color: "#777" }}>
            1b 40 = ESC @ (init) | 1d 76 30 = GS v 0 (bit image raster) | xL xH yL
            yH = width/height
          </p>
        </>
      )}
    </main>
  );
}
