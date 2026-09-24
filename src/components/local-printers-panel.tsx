"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getLocalPrinters,
  getLocalAgentStatus,
  PRINT_SERVER_URL,
  type LocalPrinter,
} from "@/lib/local-printers";
import {
  getAssignment,
  setAssignment,
  clearAssignment,
} from "@/lib/local-printer-assignment";
import { fetchPrinters } from "@/lib/departments";
import type { Printer } from "@/types";

/**
 * Shows the locally-configured printers read from the Ahmed POS Print Agent
 * on this Windows machine. This is a READ-ONLY view of local hardware plus a
 * local-only assignment control — it never writes printer configuration to
 * Firebase.
 */
export function LocalPrintersPanel() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [printers, setPrinters] = useState<LocalPrinter[]>([]);
  const [logicalPrinters, setLogicalPrinters] = useState<Printer[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const status = await getLocalAgentStatus();
    setConnected(status.connected);
    setReason(status.reason ?? null);

    if (status.connected) {
      const result = await getLocalPrinters();
      setPrinters(result.printers);
      if (!result.available) {
        setConnected(false);
        setReason(result.reason ?? "error");
      }
      // Logical printers (Firebase) are only needed for assignment.
      try {
        setLogicalPrinters(await fetchPrinters());
      } catch {
        setLogicalPrinters([]);
      }
    } else {
      setPrinters([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const run = () => {
      if (active) load();
    };
    // Defer the first fetch out of the effect body, then poll periodically
    // so the panel updates when the agent starts/stops.
    const first = setTimeout(run, 0);
    const timer = setInterval(run, 15000);
    return () => {
      active = false;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const statusText = connected
    ? "● متصل"
    : reason === "timeout"
      ? "● لا يستجيب"
      : "● الوكيل غير مشغّل";

  return (
    <div dir="rtl" className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">الطابعات المحلية (هذا الجهاز)</h2>
          <p className="text-xs text-muted-foreground">
            تُقرأ من وكيل الطباعة على {PRINT_SERVER_URL}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            connected
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {statusText}
        </span>
      </div>

      {loading && <p className="text-sm text-muted-foreground">جارٍ التحقق…</p>}

      {!loading && !connected && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">
            وكيل الطباعة غير مشغّل على هذا الجهاز.
          </p>
          <p>
            شغّل تطبيق «Ahmed POS Print Agent» على Windows ليتمكن الموقع من
            عرض الطابعات المحلية.
          </p>
          <button
            onClick={load}
            className="mt-3 rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {!loading && connected && printers.length === 0 && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          الوكيل متصل لكن لا توجد طابعات مُهيأة. أضف طابعة من تطبيق الوكيل على
          سطح المكتب.
        </div>
      )}

      {!loading && connected && printers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {printers.map((p) => (
            <LocalPrinterCard key={p.id} printer={p} />
          ))}
        </div>
      )}

      {!loading && connected && printers.length > 0 && logicalPrinters.length > 0 && (
        <AssignmentSection
          logicalPrinters={logicalPrinters}
          localPrinters={printers}
        />
      )}
    </div>
  );
}

function LocalPrinterCard({ printer }: { printer: LocalPrinter }) {
  const target =
    printer.connection === "tcp"
      ? `${printer.address}:${printer.port}`
      : "USB";
  const badge =
    printer.status === "ready"
      ? { text: "● جاهزة", cls: "bg-green-100 text-green-700" }
      : printer.status === "offline"
        ? { text: "● غير متصلة", cls: "bg-red-100 text-red-700" }
        : { text: "● غير معروف", cls: "bg-gray-100 text-gray-600" };

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{printer.name}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
          {badge.text}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {printer.connection === "usb" ? "USB" : "TCP/IP"}
      </p>
      <p dir="ltr" className="font-mono text-xs text-muted-foreground">
        {target}
      </p>
      <p className="text-xs text-muted-foreground">عرض الورق: {printer.paperWidth}mm</p>
    </div>
  );
}

/**
 * Local-only mapping between logical printers (Firebase) and the printers
 * exposed by the local agent on THIS machine.
 */
function AssignmentSection({
  logicalPrinters,
  localPrinters,
}: {
  logicalPrinters: Printer[];
  localPrinters: LocalPrinter[];
}) {
  const [, forceRender] = useState(0);

  const handleChange = (logicalId: string, localId: string) => {
    if (localId) setAssignment(logicalId, localId);
    else clearAssignment(logicalId);
    forceRender((n) => n + 1);
  };

  return (
    <div className="mt-4 rounded-md border border-dashed p-3">
      <h3 className="mb-2 text-sm font-semibold">
        ربط الطابعات المنطقية بالطابعات المحلية
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        يبقى هذا الربط على هذا الجهاز فقط ولا يُخزَّن في Firebase.
      </p>
      <div className="space-y-2">
        {logicalPrinters.map((lp) => (
          <div key={lp.id} className="flex items-center justify-between gap-3">
            <span className="text-sm">{lp.name}</span>
            <select
              value={getAssignment(lp.id) ?? ""}
              onChange={(e) => handleChange(lp.id, e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="">— بدون ربط —</option>
              {localPrinters.map((local) => (
                <option key={local.id} value={local.id}>
                  {local.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}