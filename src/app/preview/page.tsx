"use client";

import { useCallback, useEffect, useState } from "react";
import { generateAllPrintJobs } from "@/lib/printing";
import { INVOICE_CONFIG } from "@/printing/invoice";
import type { Order, Printer } from "@/types";

/**
 * Visual preview for the raster print pipeline.
 * Runs fully client-side: generates ESC/POS for a sample order, then
 * decodes the bytes (GS v 0 raster + text lines) and renders them.
 * Not part of production routes — a dev-only verification aid.
 */

interface DecodedPiece {
  kind: "raster" | "text";
  align?: "left" | "center" | "right";
  bold?: boolean;
  text?: string;
  width?: number;
  height?: number;
  bits?: Uint8Array;
}

interface DecodedJob {
  printerId: string;
  bytes: number;
  pieces: DecodedPiece[];
}

const ESC = 0x1b;
const GS = 0x1d;

function decodeEscpos(data: string): DecodedPiece[] {
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);

  const pieces: DecodedPiece[] = [];
  let i = 0;
  let align: "left" | "center" | "right" = "left";
  let bold = false;

  const readUtf8 = (start: number, end: number) =>
    new TextDecoder().decode(bytes.subarray(start, end));

  while (i < bytes.length) {
    const b = bytes[i];

    if (b === ESC && bytes[i + 1] === 0x40) { i += 2; continue; } // ESC @

    if (b === ESC && bytes[i + 1] === 0x61) { // ESC a n
      align = bytes[i + 2] === 1 ? "center" : bytes[i + 2] === 2 ? "right" : "left";
      i += 3;
      continue;
    }

    if (b === ESC && bytes[i + 1] === 0x45) { // ESC E n
      bold = bytes[i + 2] !== 0;
      i += 3;
      continue;
    }

    if (b === GS && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30) {
      // GS v 0 m xl xh yl yh
      const xl = bytes[i + 4];
      const xh = bytes[i + 5];
      const yl = bytes[i + 6];
      const yh = bytes[i + 7];
      const width = xl | (xh << 8);
      const height = yl | (yh << 8);
      const bytesPerRow = Math.ceil(width / 8);
      const bodyLen = bytesPerRow * height;
      pieces.push({
        kind: "raster",
        width,
        height,
        bits: bytes.subarray(i + 8, i + 8 + bodyLen),
        align: "center",
      });
      i += 8 + bodyLen;
      continue;
    }

    if (b === 0x0a) { i += 1; continue; } // LF
    if (b === GS && bytes[i + 1] === 0x56) { i += 4; continue; } // GS V B
    if (b === ESC && bytes[i + 1] === 0x64) { i += 3; continue; } // ESC d n
    if (b === GS && bytes[i + 1] === 0x21) { i += 3; continue; } // GS ! n

    // Text run until next LF
    let end = i;
    while (end < bytes.length && bytes[end] !== 0x0a) end++;
    const text = readUtf8(i, end);
    if (text.trim().length) pieces.push({ kind: "text", text, align, bold });
    i = end;
  }

  return pieces;
}

const SAMPLE_ORDER: Order = {
  invoiceNumber: "INV-1024",
  orderNumber: "ORD-1024",
  windowNumber: "3",
  customer: { name: "أحمد محمد", phone: "01012345678", address: "المعادي، القاهرة" },
  creator: "محمد",
  createdAt: new Date().toISOString(),
  items: [
    { department: "جبنة", productName: "جبنة رومي", quantity: "2", weight: "1.5 كجم", notes: "" },
    { department: "جزارة", productName: "لحم بقري", quantity: "1", weight: "3 كجم", notes: "مفروم" },
  ],
};

const SAMPLE_PRINTERS: Printer[] = [
  { id: "pr-jubna", name: "طابعة الجبنة", type: "usb" },
  { id: "pr-butcher", name: "طابعة الجزارة", type: "usb" },
  { id: "pr-full", name: "طابعة الفاتورة", type: "usb", isFullInvoicePrinter: true },
];

export default function PrintPreviewPage() {
  const [jobs, setJobs] = useState<DecodedJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paperWidth, setPaperWidth] = useState<"58mm" | "80mm">(
    INVOICE_CONFIG.paper.width
  );

  const generate = async (width: "58mm" | "80mm" = paperWidth) => {
    const printers = new Map(SAMPLE_PRINTERS.map((p) => [p.id, p]));
    const deptMap = new Map<string, string>([
      ["جبنة", "pr-jubna"],
      ["جزارة", "pr-butcher"],
    ]);
    const raw = await generateAllPrintJobs(
      SAMPLE_ORDER,
      printers,
      deptMap,
      { shopName: INVOICE_CONFIG.shop.name, paperWidth: width }
    );
    return raw.map((j) => ({
      printerId: j.printerId,
      bytes: j.data.length,
      pieces: decodeEscpos(j.data),
    }));
  };

  useEffect(() => {
    let cancelled = false;
    generate()
      .then((decoded) => {
        if (!cancelled) setJobs(decoded);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRegenerate = (width: "58mm" | "80mm" = paperWidth) => {
    setError(null);
    generate(width)
      .then(setJobs)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const handlePaperChange = (width: "58mm" | "80mm") => {
    setPaperWidth(width);
    handleRegenerate(width);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">معاينة الطباعة</h1>
            <p className="text-sm text-slate-500">
              توليد ESC/POS للطلب التجريبي وفك ترميزه لعرضه بصرياً
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={paperWidth}
              onChange={(e) => handlePaperChange(e.target.value as "58mm" | "80mm")}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="58mm">58mm</option>
              <option value="80mm">80mm</option>
            </select>
            <button
              onClick={() => handleRegenerate()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              إعادة التوليد
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-md border border-slate-200 bg-white p-4 text-xs text-slate-600">
          <p className="mb-1 font-semibold text-slate-700">
            الإعداد المركزي للفاتورة (من src/printing/invoice)
          </p>
          <p>
            المتجر: {INVOICE_CONFIG.shop.name} | العنوان: {INVOICE_CONFIG.shop.address} |
            الهاتف: {INVOICE_CONFIG.shop.phone}
          </p>
          <p>
            الخط: {INVOICE_CONFIG.typography.fontFamily} | حجم الترويسة:{" "}
            {INVOICE_CONFIG.typography.headerSize} | حجم النص:{" "}
            {INVOICE_CONFIG.typography.bodySize} | تباعد الأقسام:{" "}
            {INVOICE_CONFIG.spacing.sections} | الفاصل:{" "}
            {INVOICE_CONFIG.separators.style}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!jobs && !error && <p className="text-slate-500">جارٍ التوليد...</p>}

        <div className="grid gap-6 md:grid-cols-2">
          {jobs?.map((job, idx) => (
            <div key={idx} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
                <span className="text-sm font-semibold text-slate-700">{job.printerId}</span>
                <span className="text-xs text-slate-500">{job.bytes} بايت</span>
              </div>
              <ReceiptView job={job} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReceiptView({ job }: { job: DecodedJob }) {
  return (
    <div className="flex flex-col items-center bg-white p-4">
      <div className="w-44 bg-white shadow" style={{ direction: "rtl", minHeight: 120 }}>
        {job.pieces.map((p, i) =>
          p.kind === "raster" ? (
            <RasterImage key={i} p={p} />
          ) : (
            <div
              key={i}
              className="whitespace-pre-wrap text-[11px] leading-snug text-black"
              style={{
                textAlign: p.align ?? "left",
                fontWeight: p.bold ? 700 : 400,
              }}
            >
              {p.text}
            </div>
          )
        )}
      </div>
      <p className="mt-3 text-xs text-slate-400">معاينة تقريبية — اطبع للتأكد من المقياس</p>
    </div>
  );
}

function RasterImage({ p }: { p: DecodedPiece }) {
  const ref = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas || !p.bits || !p.width || !p.height) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = ctx.createImageData(p.width, p.height);
      for (let y = 0; y < p.height; y++) {
        for (let x = 0; x < p.width; x++) {
          const byteIdx = y * Math.ceil(p.width / 8) + (x >> 3);
          const bitOn = (p.bits[byteIdx] >> (7 - (x & 7))) & 1;
          const v = bitOn ? 0 : 255;
          const idx = (y * p.width + x) * 4;
          img.data[idx] = v;
          img.data[idx + 1] = v;
          img.data[idx + 2] = v;
          img.data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    [p]
  );

  return (
    <div className="flex justify-center py-1">
      <canvas
        ref={ref}
        width={p.width}
        height={p.height}
        style={{ width: "100%", imageRendering: "pixelated" }}
      />
    </div>
  );
}