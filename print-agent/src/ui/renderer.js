/**
 * Desktop UI renderer. Runs with contextIsolation ON; talks to the main
 * process exclusively through the whitelisted `window.agent` bridge.
 */

const $ = (sel) => document.querySelector(sel);

const state = {
  printers: [],
  editingId: null,
  usbDevices: [],
  setupQueue: 0,
};

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

let toastTimer = null;
function toast(msg, kind = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast ${kind === "ok" ? "toast--ok" : kind === "err" ? "toast--err" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}

// ---------------------------------------------------------------------------
// HTML escaping (avoids literal entities so formatters cannot mangle it)
// ---------------------------------------------------------------------------

const ENTITY_CODES = { "&": 38, "<": 60, ">": 62, '"': 34, "'": 39 };

function escapeHtml(value) {
  const str = String(value == null ? "" : value);
  return str.replace(/[&<>"']/g, (c) => "&#" + ENTITY_CODES[c] + ";");
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

async function refreshStatus() {
  const s = await window.agent.getStatus();
  const pill = $("#status-pill");
  if (s.status === "running") {
    pill.className = "pill pill--ok";
    pill.textContent = `● متصل — المنفذ ${s.port}`;
  } else if (s.status === "error") {
    pill.className = "pill pill--error";
    pill.textContent = `● خطأ: ${s.error || "غير معروف"}`;
  } else {
    pill.className = "pill pill--unknown";
    pill.textContent = "● جارٍ التشغيل…";
  }
  $("#set-port").textContent = s.port;
  $("#set-configPath").textContent = s.configPath || "-";
  $("#set-version").textContent = s.version || "-";
  $("#set-startWithWindows").checked = !!s.startWithWindows;
  return s;
}

// ---------------------------------------------------------------------------
// Printers list
// ---------------------------------------------------------------------------

function badge(status) {
  if (status === "ready") return `<span class="badge badge--ok">● جاهزة</span>`;
  if (status === "offline") return `<span class="badge badge--offline">● غير متصلة</span>`;
  return `<span class="badge badge--unknown">● غير معروف</span>`;
}

function printerCard(p) {
  const conn = p.connection === "usb" ? "USB" : "TCP/IP";
  const target = p.connection === "tcp" ? `${p.address}:${p.port}` : p.usbDeviceId || "USB";
  return `
    <div class="card" data-id="${escapeHtml(p.id)}">
      <div class="card__head">
        <p class="card__name">${escapeHtml(p.name)}</p>
        ${badge(p.status)}
      </div>
      <div class="card__meta">
        ${conn}<br/>
        <span class="mono">${escapeHtml(target)}</span><br/>
        عرض الورق: ${p.paperWidth}mm
      </div>
      <div class="card__actions">
        <button class="btn btn--sm" data-act="test" data-id="${escapeHtml(p.id)}">اختبار الطباعة</button>
        <button class="btn btn--sm" data-act="edit" data-id="${escapeHtml(p.id)}">تعديل</button>
        <button class="btn btn--sm btn--danger" data-act="delete" data-id="${escapeHtml(p.id)}">حذف</button>
      </div>
    </div>`;
}

async function refreshPrinters() {
  const res = await window.agent.listPrinters();
  state.printers = res.printers || [];
  const list = $("#printers-list");
  const empty = $("#dashboard-empty");
  if (state.printers.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    list.innerHTML = state.printers.map(printerCard).join("");
  }
}

// ---------------------------------------------------------------------------
// Printer form modal
// ---------------------------------------------------------------------------

function gatherConn() {
  return document.querySelector('input[name="conn"]:checked')?.value || "tcp";
}
function gatherPaper() {
  return Number(document.querySelector('input[name="paper"]:checked')?.value || 58);
}

function toggleConnFields() {
  const conn = gatherConn();
  $("#tcp-fields").classList.toggle("hidden", conn !== "tcp");
  $("#usb-fields").classList.toggle("hidden", conn !== "usb");
}

function openModal(printer = null) {
  state.editingId = printer ? printer.id : null;
  $("#modal-title").textContent = printer ? "تعديل طابعة" : "إضافة طابعة";
  $("#modal-error").classList.add("hidden");
  $("#f-name").value = printer?.name || "";
  const connVal = printer?.connection === "usb" ? "usb" : "tcp";
  document.querySelector(`input[name="conn"][value="${connVal}"]`).checked = true;
  const paperVal = printer?.paperWidth === 80 ? 80 : 58;
  document.querySelector(`input[name="paper"][value="${paperVal}"]`).checked = true;
  $("#f-address").value = printer?.address || "";
  $("#f-port").value = printer?.port || 9100;
  $("#f-usbDeviceId").value = printer?.usbDeviceId || "";
  toggleConnFields();
  $("#modal").classList.remove("hidden");
}

function closeModal() {
  $("#modal").classList.add("hidden");
  state.editingId = null;
}

function collectForm() {
  const connection = gatherConn();
  const base = {
    name: $("#f-name").value.trim(),
    connection,
    paperWidth: gatherPaper(),
  };
  if (connection === "tcp") {
    base.address = $("#f-address").value.trim();
    base.port = Number($("#f-port").value) || 9100;
  } else {
    base.usbDeviceId = $("#f-usbDeviceId").value.trim();
    const dev = state.usbDevices.find((d) => d.id === base.usbDeviceId);
    if (dev) { base.vendorId = dev.vendorId; base.productId = dev.productId; }
  }
  return base;
}

async function savePrinter() {
  const data = collectForm();
  const res = state.editingId
    ? await window.agent.updatePrinter(state.editingId, data)
    : await window.agent.addPrinter(data);

  if (!res.ok) {
    const el = $("#modal-error");
    el.textContent = res.error || "تعذر الحفظ";
    el.classList.remove("hidden");
    return;
  }
  closeModal();
  toast("تم حفظ الطابعة", "ok");
  await refreshPrinters();

  // First-run: continue adding the queued printers.
  if (state.setupQueue > 0) {
    state.setupQueue -= 1;
    if (state.setupQueue > 0) {
      $("#setup-progress").textContent = `متبقٍ ${state.setupQueue} طابعة لإضافتها`;
      openModal();
      return;
    }
    state.setupQueue = 0;
    await window.agent.setupComplete();
    $("#setup-progress").textContent = "";
  }
}

// ---------------------------------------------------------------------------
// Test / delete
// ---------------------------------------------------------------------------

async function testPrinter(id) {
  toast("جارٍ إرسال الاختبار…");
  const res = await window.agent.testPrinter(id);
  if (res.ok) toast("تم إرسال اختبار الطباعة", "ok");
  else toast(`فشل الاختبار: ${res.error}`, "err");
}

async function deletePrinter(id) {
  if (!confirm("هل تريد حذف هذه الطابعة؟")) return;
  const res = await window.agent.deletePrinter(id);
  if (res.ok) { toast("تم الحذف", "ok"); await refreshPrinters(); }
  else toast(`تعذر الحذف: ${res.error}`, "err");
}

// ---------------------------------------------------------------------------
// USB discovery
// ---------------------------------------------------------------------------

async function scanUsb(openForm) {
  const res = await window.agent.scanUsb();
  state.usbDevices = res.devices || [];
  renderUsbList();
  if (openForm) openModal();
  if (state.usbDevices.length === 0) {
    toast("لم يتم العثور على طابعات USB. يمكنك إدخال المعرّف يدوياً.", "err");
  } else {
    toast(`تم العثور على ${state.usbDevices.length} جهاز USB`);
  }
}

function renderUsbList() {
  const box = $("#usb-device-list");
  if (!state.usbDevices.length) {
    box.innerHTML = `<p class="muted small">لا توجد أجهزة مكتشفة. أدخل المعرّف يدوياً.</p>`;
    return;
  }
  box.innerHTML = state.usbDevices
    .map(
      (d) => `<div class="usb-item" data-id="${escapeHtml(d.id)}">
        <span>${escapeHtml(d.product || d.manufacturer || "USB Printer")}</span>
        <span class="mono small">${escapeHtml(d.id)}</span>
      </div>`
    )
    .join("");
  box.querySelectorAll(".usb-item").forEach((el) =>
    el.addEventListener("click", () => {
      $("#f-usbDeviceId").value = el.dataset.id;
      const dev = state.usbDevices.find((d) => d.id === el.dataset.id);
      if (dev && !$("#f-name").value) {
        $("#f-name").value = dev.product || dev.manufacturer || "USB Printer";
      }
    })
  );
}

// ---------------------------------------------------------------------------
// First-run setup
// ---------------------------------------------------------------------------

function maybeRunSetup(status) {
  if (status.setupComplete || state.printers.length > 0) return;
  $("#setup").classList.remove("hidden");
}

function startSetup() {
  const count = Math.max(1, Math.min(20, Number($("#setup-count").value) || 1));
  state.setupQueue = count;
  $("#setup").classList.add("hidden");
  $("#setup-progress").textContent = `متبقٍ ${count} طابعة لإضافتها`;
  openModal();
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function switchView(view) {
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("is-active", t.dataset.view === view)
  );
  document.querySelectorAll(".view").forEach((v) =>
    v.classList.toggle("is-active", v.id === `view-${view}`)
  );
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

async function init() {
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => switchView(t.dataset.view))
  );

  $("#btn-add").addEventListener("click", () => openModal());
  $("#btn-refresh").addEventListener("click", () => refreshPrinters());
  $("#btn-scan").addEventListener("click", () => scanUsb(false));
  $("#btn-cancel").addEventListener("click", closeModal);
  $("#btn-save").addEventListener("click", savePrinter);
  $("#btn-test").addEventListener("click", async () => {
    if (!state.editingId) { toast("احفظ الطابعة أولاً ثم اختبرها", "err"); return; }
    await testPrinter(state.editingId);
  });

  document.querySelectorAll('input[name="conn"]').forEach((r) =>
    r.addEventListener("change", toggleConnFields)
  );

  $("#printers-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const { act, id } = btn.dataset;
    if (act === "test") testPrinter(id);
    if (act === "delete") deletePrinter(id);
    if (act === "edit") openModal(state.printers.find((p) => p.id === id));
  });

  $("#dashboard-empty").addEventListener("click", (e) => {
    if (e.target.dataset.action === "setup") $("#setup").classList.remove("hidden");
  });

  $("#btn-setup-start").addEventListener("click", startSetup);
  $("#btn-setup-skip").addEventListener("click", async () => {
    await window.agent.setupComplete();
    $("#setup").classList.add("hidden");
  });

  $("#set-startWithWindows").addEventListener("change", (e) =>
    window.agent.setSettings({ startWithWindows: e.target.checked })
  );
  $("#btn-restart").addEventListener("click", async () => {
    toast("جارٍ إعادة التشغيل…");
    const res = await window.agent.restart();
    toast(res.status === "running" ? "تمت إعادة التشغيل" : "تعذر إعادة التشغيل", res.status === "running" ? "ok" : "err");
    await refreshStatus();
  });

  const status = await refreshStatus();
  await refreshPrinters();
  maybeRunSetup(status);

  setInterval(refreshStatus, 10000);
}

window.addEventListener("DOMContentLoaded", init);