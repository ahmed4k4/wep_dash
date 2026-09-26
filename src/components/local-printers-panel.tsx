"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getLocalPrinters,
  requestLocalNetworkAccess,
  PRINT_SERVER_URL,
  type AgentState,
  type LocalPrinter,
} from "@/lib/local-printers";
import {
  setAssignment,
  clearAssignment,
  getRoleForLocalPrinter,
  FULL_INVOICE_ROLE,
} from "@/lib/local-printer-assignment";
import { fetchDepartments } from "@/lib/departments";

/**
 * Admin → Printers.
 *
 * READ-ONLY view of the printers exposed by the local Ahmed POS Print Agent,
 * plus a LOCAL-ONLY logical role assignment. The website NEVER creates, edits
 * or deletes physical printers — that belongs exclusively to the Windows
 * Print Agent. The website can only choose which local printer plays which
 * logical role (butcher / cheese / full invoice).
 */

const FULL_INVOICE_LABEL = "الفاتورة الكاملة";

/** Result of a user-initiated "grant local network access" attempt. */
type LnaPhase =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "granted" }
  | { kind: "denied" }
  | { kind: "unreachable" }
  | { kind: "error"; detail: string };

interface RoleOption {
  key: string;
  label: string;
}

export function LocalPrintersPanel() {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<AgentState>("blocked");
  const [printers, setPrinters] = useState<LocalPrinter[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [lna, setLna] = useState<LnaPhase>({ kind: "idle" });
  const [, forceRender] = useState(0);
  // Avoid overlapping background polls while a user attempt is running.
  const busyRef = useRef(false);

  const loadRoles = useCallback(async () => {
    try {
      const departments = await fetchDepartments();
      setRoles([
        ...departments
          .filter((d) => d.active)
          .map((d) => ({ key: d.name, label: d.name })),
        { key: FULL_INVOICE_ROLE, label: FULL_INVOICE_LABEL },
      ]);
    } catch {
      setRoles([{ key: FULL_INVOICE_ROLE, label: FULL_INVOICE_LABEL }]);
    }
  }, []);

  const poll = useCallback(async () => {
    if (busyRef.current) return;
    const result = await getLocalPrinters();
    setState(result.state);
    setPrinters(result.available ? result.printers : []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await loadRoles();
    await poll();
    setLoading(false);
  }, [loadRoles, poll]);

  useEffect(() => {
    let active = true;
    const run = () => {
      if (active) load();
    };
    const first = setTimeout(run, 0);
    const timer = setInterval(() => {
      if (active) poll();
    }, 15000);
    return () => {
      active = false;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load, poll]);

  // Assign a role to a printer (local only). Ensures one role per printer
  // and one printer per role.
  const assignRole = (printerId: string, roleKey: string) => {
    const previousRole = getRoleForLocalPrinter(printerId);
    if (previousRole) clearAssignment(previousRole);
    if (roleKey) setAssignment(roleKey, printerId);
    forceRender((n) => n + 1);
  };

  /**
   * The permission button handler. It MUST start the loopback fetch
   * synchronously (before any await) so Chrome sees the user gesture and can
   * raise its Local Network Access prompt. We call requestLocalNetworkAccess()
   * as the very first statement, then await its promise.
   */
  const handleGrantLocalNetwork = () => {
    // ⚠️ First statement — do not await anything before this call.
    const attempt = requestLocalNetworkAccess();

    setLna({ kind: "requesting" });
    busyRef.current = true;

    attempt
      .then((result) => {
        setState(result.state);
        setPrinters(result.connected ? result.printers : []);
        if (result.connected) {
          setLna({ kind: "granted" });
        } else if (result.state === "permission-denied") {
          setLna({ kind: "denied" });
        } else if (result.state === "permission-required") {
          // The browser neither granted nor denied — still prompting.
          setLna({ kind: "denied" });
        } else {
          setLna({ kind: "unreachable" });
        }
      })
      .catch((e) => {
        setLna({
          kind: "error",
          detail: e instanceof Error ? e.message : String(e),
        });
      })
      .finally(() => {
        busyRef.current = false;
      });
  };

  const isConnected = state === "connected" || state === "no-printers";

  return (
    <div dir="rtl" className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">الطابعات المحلية (هذا الجهاز)</h2>
          <p className="text-xs text-muted-foreground">
            تُقرأ من Ahmed POS Print Agent على {PRINT_SERVER_URL}
          </p>
        </div>
        <StatusPill state={state} />
      </div>

      {loading && <p className="text-sm text-muted-foreground">جارٍ التحقق…</p>}

      {!loading && (
        <StateBanner
          state={state}
          lna={lna}
          onRetry={load}
          onGrant={handleGrantLocalNetwork}
        />
      )}

      {!loading && isConnected && printers.length === 0 && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          الوكيل متصل لكن لا توجد طابعات مُهيأة. أضف طابعة من تطبيق
          «Ahmed POS Print Agent» على سطح المكتب.
        </div>
      )}

      {!loading && isConnected && printers.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {printers.map((p) => (
              <LocalPrinterCard
                key={p.id}
                printer={p}
                roles={roles}
                assignedRole={getRoleForLocalPrinter(p.id) ?? ""}
                onAssign={assignRole}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            لتعديل إعدادات الطابعة (IP / المنفذ / USB / عرض الورق)، افتح
            «Ahmed POS Print Agent».
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

function StatusPill({ state }: { state: AgentState }) {
  const map: Record<AgentState, { text: string; cls: string }> = {
    connected: { text: "● متصل", cls: "bg-green-100 text-green-700" },
    "no-printers": { text: "● متصل", cls: "bg-green-100 text-green-700" },
    "not-running": { text: "● غير مشغّل", cls: "bg-red-100 text-red-700" },
    "not-installed": { text: "● غير مثبّت", cls: "bg-red-100 text-red-700" },
    "permission-required": { text: "● إذن مطلوب", cls: "bg-amber-100 text-amber-700" },
    "permission-denied": { text: "● الوصول مرفوض", cls: "bg-amber-100 text-amber-700" },
    blocked: { text: "● بانتظار الإذن", cls: "bg-amber-100 text-amber-700" },
    timeout: { text: "● لا يستجيب", cls: "bg-amber-100 text-amber-700" },
    error: { text: "● خطأ", cls: "bg-red-100 text-red-700" },
  };
  const s = map[state];
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${s.cls}`}>
      {s.text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// State banner (distinguishes the different failure/empty states)
// ---------------------------------------------------------------------------

function StateBanner({
  state,
  lna,
  onRetry,
  onGrant,
}: {
  state: AgentState;
  lna: LnaPhase;
  onRetry: () => void;
  onGrant: () => void;
}) {
  if (state === "connected" || state === "no-printers") {
    return (
      <div className="mb-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
        Ahmed POS Print Agent متصل.
      </div>
    );
  }

  const retryButton = (
    <button
      onClick={onRetry}
      className="mt-3 rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
    >
      إعادة المحاولة
    </button>
  );

  // The permission-related states share the same actionable button.
  if (
    state === "permission-required" ||
    state === "permission-denied" ||
    state === "blocked"
  ) {
    return (
      <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="mb-1 font-medium">
          {state === "permission-denied"
            ? "المتصفح منع الوصول إلى برنامج الطباعة المحلي."
            : "المتصفح يحتاج إذن الوصول إلى الشبكة المحلية."}
        </p>
        <p>
          اضغط «السماح بالوصول للشبكة المحلية». سيحاول الموقع الاتصال ببرنامج
          الطباعة المحلي، وقد يعرض المتصفح طلب إذن خاص به؛ اختر «السماح».
        </p>

        <GrantButton lna={lna} onGrant={onGrant} />

        {lna.kind === "denied" && (
          <p className="mt-2 text-xs text-amber-800">
            تم رفض الوصول. إن كنت رفضت طلب المتصفح، فأعد المحاولة واختر «السماح»،
            أو اسمح بالوصول للشبكة المحلية من إعدادات الموقع في المتصفح.
          </p>
        )}
        {lna.kind === "unreachable" && (
          <p className="mt-2 text-xs text-amber-800">
            لم يتمكّن الموقع من الوصول إلى Print Agent. تأكد من تشغيل تطبيق
            «Ahmed POS Print Agent» على هذا الجهاز.
          </p>
        )}
        {lna.kind === "error" && (
          <p className="mt-2 text-xs text-red-700">
            حدث خطأ غير متوقع: {lna.detail}
          </p>
        )}
        {lna.kind === "granted" && (
          <p className="mt-2 text-xs text-green-700">تم السماح.</p>
        )}

        <div className="mt-3">{retryButton}</div>
      </div>
    );
  }

  if (state === "not-running" || state === "not-installed") {
    return (
      <div className="mb-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">
          {state === "not-installed"
            ? "برنامج الطباعة المحلي غير مثبّت على هذا الجهاز."
            : "برنامج الطباعة المحلي غير مشغّل على هذا الجهاز."}
        </p>
        <p>
          ثبّت / شغّل تطبيق «Ahmed POS Print Agent» على Windows ليتمكن الموقع من
          عرض الطابعات المحلية والطباعة.
        </p>
        {retryButton}
      </div>
    );
  }

  // timeout / error
  return (
    <div className="mb-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
      <p className="mb-1 font-medium text-foreground">
        تعذّر الاتصال ببرنامج الطباعة المحلي.
      </p>
      {retryButton}
    </div>
  );
}

/** The actual permission button, with its loading + result feedback. */
function GrantButton({ lna, onGrant }: { lna: LnaPhase; onGrant: () => void }) {
  const busy = lna.kind === "requesting";
  return (
    <button
      onClick={onGrant}
      disabled={busy}
      className="mt-3 rounded-md border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs hover:bg-amber-200 disabled:opacity-60"
    >
      {busy ? "جاري طلب الإذن..." : "السماح بالوصول للشبكة المحلية"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Printer card (read-only hardware + role assignment)
// ---------------------------------------------------------------------------

function LocalPrinterCard({
  printer,
  roles,
  assignedRole,
  onAssign,
}: {
  printer: LocalPrinter;
  roles: RoleOption[];
  assignedRole: string;
  onAssign: (printerId: string, roleKey: string) => void;
}) {
  const target =
    printer.connection === "tcp"
      ? `${printer.address}:${printer.port}`
      : "USB";
  const badge =
    printer.status === "ready"
      ? { text: "● جاهزة", cls: "bg-green-100 text-green-700" }
      : printer.status === "printing"
        ? { text: "● تطبع", cls: "bg-blue-100 text-blue-700" }
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
      <p className="mb-3 text-xs text-muted-foreground">
        عرض الورق: {printer.paperWidth}mm
      </p>

      <label className="mb-1 block text-xs font-medium">الدور المُسند</label>
      <select
        value={assignedRole}
        onChange={(e) => onAssign(printer.id, e.target.value)}
        className="w-full rounded-md border bg-background px-2 py-1 text-xs"
      >
        <option value="">— بدون دور —</option>
        {roles.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}