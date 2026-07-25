/* ============================================================
   نور — ذاكرة التطبيق
   تسجّل كل مدخلات المستخدم (إعدادات، حقول، بحث، عدّادات، محفوظات)
   وتحفظها محلياً، ومع الباك اند تتزامن بين الأجهزة.

   يجب تحميل هذا الملف *قبل* app.js حتى يلتقط كل عمليات الحفظ.
   ============================================================ */
(function () {
  "use strict";

  const KEYS = {
    log: "noor.memory.log",
    device: "noor.memory.device",
    config: "noor.memory.config",
    cursor: "noor.memory.cursor",
  };
  // مفاتيح داخلية لا تُسجَّل ولا تُزامَن — الذاكرة لا تسجّل نفسها،
  // ومفاتيح مدقّق التحديثات خاصة بكل جهاز فلا معنى لمزامنتها
  const INTERNAL = new Set([...Object.values(KEYS), "noor.updates.state", "noor.updates.config"]);

  const MAX_LOCAL_ENTRIES = 3000;
  const FLUSH_INTERVAL_MS = 15_000;

  /* ---------------- أدوات ---------------- */
  const raw = {
    setItem: Storage.prototype.setItem.bind(localStorage),
    getItem: Storage.prototype.getItem.bind(localStorage),
    removeItem: Storage.prototype.removeItem.bind(localStorage),
  };

  const readJSON = (key, fallback) => {
    try {
      const value = raw.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  };
  const writeJSON = (key, value) => {
    try {
      raw.setItem(key, JSON.stringify(value));
    } catch (_) {
      /* الحصة ممتلئة — نتجاهل بدل كسر التطبيق */
    }
  };

  const uid = () =>
    (crypto.randomUUID && crypto.randomUUID()) ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const nowISO = () => new Date().toISOString();

  /* ---------------- الهوية والإعدادات ---------------- */
  let deviceId = raw.getItem(KEYS.device);
  if (!deviceId || !/^[A-Za-z0-9_-]{6,64}$/.test(deviceId)) {
    deviceId = uid().replace(/-/g, "").slice(0, 32);
    raw.setItem(KEYS.device, deviceId);
  }

  const defaultConfig = { apiUrl: "", token: "", sync: false };
  let cfg = { ...defaultConfig, ...readJSON(KEYS.config, {}) };
  if (window.NOOR_API && !cfg.apiUrl) cfg.apiUrl = String(window.NOOR_API);

  const apiBase = () => String(cfg.apiUrl || "").replace(/\/+$/, "");
  const syncEnabled = () => Boolean(cfg.sync && apiBase());

  /* ---------------- أسماء عربية للمفاتيح المعروفة ---------------- */
  const LABELS = {
    theme: "الوضع (ليلي/نهاري)",
    quranFont: "خط المصحف",
    quranFontSize: "حجم خط المصحف",
    tasbeehCount: "عدّاد السبحة",
    tasbeehPhrase: "ذكر السبحة",
    quranBookmarks: "الإشارات المرجعية",
    customAdhkar: "أذكار مخصّصة",
    adhkarOrder: "ترتيب الأذكار",
    prayerMethod: "طريقة حساب المواقيت",
    prayerMadhab: "مذهب حساب العصر",
    prayerTune: "تعديل المواقيت اليدوي",
    prayerSource: "مصدر المواقيت",
    prayerCoords: "الإحداثيات",
    prayerCity: "المدينة",
    prayerLastData: "آخر مواقيت محفوظة",
    adhanSettings: "إعدادات الأذان",
    lastRead: "آخر موضع قراءة",
  };
  const labelFor = (key) => LABELS[key] || key;

  /* ---------------- سجل الذاكرة ---------------- */
  let log = readJSON(KEYS.log, []);
  if (!Array.isArray(log)) log = [];

  let recording = false; // يمنع التسجيل العودي أثناء كتابتنا نحن
  const listeners = new Set();

  function persistLog() {
    if (log.length > MAX_LOCAL_ENTRIES) log = log.slice(log.length - MAX_LOCAL_ENTRIES);
    writeJSON(KEYS.log, log);
  }

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(log);
      } catch (_) {}
    });
  }

  /**
   * يسجّل مدخلاً واحداً.
   * @param {string} type نوع المدخل: setting | field | search | action | note | nav
   * @param {string} key  المفتاح أو اسم الحقل
   * @param {*}      value القيمة
   */
  function record(type, key, value, options) {
    if (recording) return null;
    const opts = options || {};

    let text = value;
    if (typeof text !== "string") {
      try {
        text = JSON.stringify(text);
      } catch (_) {
        text = String(text);
      }
    }
    if (text && text.length > 2000) text = text.slice(0, 2000) + "…";

    const previous = log[log.length - 1];
    // ندمج التكرار السريع لنفس الحقل (مثل الكتابة حرفاً حرفاً) في مدخل واحد
    if (
      previous &&
      previous.type === type &&
      previous.key === key &&
      Date.now() - Date.parse(previous.at) < 1500
    ) {
      previous.value = text;
      previous.at = nowISO();
      previous.synced = false;
      persistLog();
      notify();
      return previous;
    }

    const entry = {
      id: uid(),
      type: type || "input",
      key: String(key || ""),
      value: text == null ? "" : text,
      label: opts.label || labelFor(key),
      section: opts.section || currentSection(),
      at: nowISO(),
      synced: false,
    };

    log.push(entry);
    persistLog();
    notify();
    return entry;
  }

  function currentSection() {
    const active = document.querySelector(".tab-panel.active");
    return active ? active.id : "";
  }

  /* ---------------- التقاط تلقائي: كل كتابة في localStorage ---------------- */
  Storage.prototype.setItem = function (key, value) {
    const result = raw.setItem.call(this, key, value);
    if (this === window.localStorage && !INTERNAL.has(key)) {
      record("setting", key, value);
    }
    return result;
  };

  Storage.prototype.removeItem = function (key) {
    const result = raw.removeItem.call(this, key);
    if (this === window.localStorage && !INTERNAL.has(key)) {
      record("setting", key, "(حُذف)");
    }
    return result;
  };

  /* ---------------- التقاط تلقائي: حقول الإدخال ---------------- */
  function describeField(el) {
    const explicit = el.getAttribute("data-mem-label");
    if (explicit) return explicit;
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label && label.textContent.trim()) return label.textContent.trim();
    }
    return el.getAttribute("placeholder") || el.getAttribute("aria-label") || el.name || el.id || "حقل";
  }

  function fieldKey(el) {
    return el.id || el.name || `${el.tagName.toLowerCase()}.${el.type || "text"}`;
  }

  function captureField(el) {
    if (!el || el.hasAttribute("data-mem-ignore")) return;
    const tag = el.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") return;

    const type = (el.type || "").toLowerCase();
    if (type === "password" || type === "hidden") return;

    let value;
    if (type === "checkbox" || type === "radio") value = el.checked ? "مفعّل" : "معطّل";
    else if (tag === "SELECT") value = el.options[el.selectedIndex]?.text || el.value;
    else value = el.value;

    if (value === "" || value == null) return;

    const isSearch = /search|بحث/i.test(`${el.id} ${el.placeholder || ""}`);
    record(isSearch ? "search" : "field", fieldKey(el), value, { label: describeField(el) });
  }

  document.addEventListener("change", (e) => captureField(e.target), true);
  document.addEventListener(
    "input",
    (e) => {
      const el = e.target;
      if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return;
      clearTimeout(el._memTimer);
      el._memTimer = setTimeout(() => captureField(el), 700);
    },
    true
  );

  /* ---------------- لقطة الحالة الكاملة ---------------- */
  /** كل ما في localStorage عدا مفاتيح الذاكرة الداخلية. */
  function snapshotState() {
    const state = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || INTERNAL.has(key)) continue;
      state[key] = raw.getItem(key);
    }
    return state;
  }

  /** يكتب حالة محفوظة إلى localStorage (بدون تسجيلها كمدخلات جديدة). */
  function restoreState(state) {
    if (!state || typeof state !== "object") return 0;
    recording = true;
    let count = 0;
    try {
      Object.keys(state).forEach((key) => {
        if (INTERNAL.has(key)) return;
        const value = state[key];
        raw.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
        count += 1;
      });
    } finally {
      recording = false;
    }
    return count;
  }

  /* ---------------- التزامن مع الباك اند ---------------- */
  let flushing = false;

  function apiHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (cfg.token) headers["x-noor-token"] = cfg.token;
    return headers;
  }

  async function api(path, options) {
    const res = await fetch(`${apiBase()}${path}`, { ...options, headers: apiHeaders() });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${res.status} ${detail.slice(0, 160)}`);
    }
    return res.status === 204 ? null : res.json();
  }

  /** يرسل المدخلات غير المتزامنة + لقطة الحالة إلى الخادم. */
  async function flush() {
    if (!syncEnabled() || flushing) return { skipped: true };
    const pending = log.filter((entry) => !entry.synced);
    if (!pending.length) return { pushed: 0 };

    flushing = true;
    try {
      await api(`/api/memory/${deviceId}/entries`, {
        method: "POST",
        body: JSON.stringify({
          entries: pending.map(({ synced, ...entry }) => entry),
        }),
      });
      await api(`/api/memory/${deviceId}/state`, {
        method: "PUT",
        body: JSON.stringify({ state: snapshotState() }),
      });

      const ids = new Set(pending.map((entry) => entry.id));
      log.forEach((entry) => {
        if (ids.has(entry.id)) entry.synced = true;
      });
      persistLog();
      writeJSON(KEYS.cursor, { at: nowISO(), pushed: pending.length });
      notify();
      return { pushed: pending.length };
    } finally {
      flushing = false;
    }
  }

  /** يسحب المدخلات والحالة من الخادم ويدمجها محلياً. */
  async function pull(options) {
    if (!apiBase()) throw new Error("لم يُضبط عنوان الخادم");
    const opts = options || {};
    const data = await api(`/api/memory/${deviceId}/entries?limit=1000`, { method: "GET" });
    const known = new Set(log.map((entry) => entry.id));
    let added = 0;

    (data.entries || []).forEach((entry) => {
      if (known.has(entry.id)) return;
      log.push({ ...entry, synced: true });
      added += 1;
    });
    log.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    persistLog();

    let restored = 0;
    if (opts.restoreState) {
      const remote = await api(`/api/memory/${deviceId}/state`, { method: "GET" });
      restored = restoreState(remote.state);
    }
    notify();
    return { added, restored };
  }

  // إرسال دوري + محاولة أخيرة عند إغلاق الصفحة
  setInterval(() => {
    flush().catch(() => {});
  }, FLUSH_INTERVAL_MS);

  window.addEventListener("pagehide", () => {
    if (!syncEnabled()) return;
    const pending = log.filter((entry) => !entry.synced);
    if (!pending.length || !navigator.sendBeacon) return;
    const blob = new Blob(
      [JSON.stringify({ entries: pending.map(({ synced, ...entry }) => entry) })],
      { type: "application/json" }
    );
    navigator.sendBeacon(`${apiBase()}/api/memory/${deviceId}/entries`, blob);
  });

  /* ---------------- التصدير والاستيراد ---------------- */
  function exportData() {
    return {
      format: "noor-memory@1",
      exportedAt: nowISO(),
      deviceId,
      state: snapshotState(),
      entries: log.map(({ synced, ...entry }) => entry),
    };
  }

  function downloadExport() {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `noor-memory-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** يستورد ملف تصدير: يدمج المدخلات ويستعيد الحالة اختيارياً. */
  function importData(payload, options) {
    const opts = options || { restoreState: true };
    if (!payload || typeof payload !== "object") throw new Error("ملف غير صالح");

    const known = new Set(log.map((entry) => entry.id));
    let added = 0;
    (payload.entries || []).forEach((entry) => {
      if (!entry || known.has(entry.id)) return;
      log.push({ ...entry, id: entry.id || uid(), synced: false });
      known.add(entry.id);
      added += 1;
    });
    log.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    persistLog();

    const restored = opts.restoreState ? restoreState(payload.state) : 0;
    notify();
    return { added, restored };
  }

  function clearLog() {
    log = [];
    persistLog();
    notify();
  }

  /* ---------------- استعلامات ---------------- */
  function search(options) {
    const opts = options || {};
    let items = log.slice().reverse();
    if (opts.type) items = items.filter((entry) => entry.type === opts.type);
    if (opts.q) {
      const needle = String(opts.q).toLowerCase();
      items = items.filter((entry) =>
        `${entry.key} ${entry.value} ${entry.label}`.toLowerCase().includes(needle)
      );
    }
    return opts.limit ? items.slice(0, opts.limit) : items;
  }

  function stats() {
    const byType = {};
    log.forEach((entry) => {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    });
    return {
      deviceId,
      total: log.length,
      pending: log.filter((entry) => !entry.synced).length,
      first: log[0]?.at || null,
      last: log[log.length - 1]?.at || null,
      byType,
      sync: syncEnabled(),
      apiUrl: cfg.apiUrl,
    };
  }

  function setConfig(patch) {
    cfg = { ...cfg, ...patch };
    writeJSON(KEYS.config, cfg);
    return cfg;
  }

  /* ---------------- الواجهة العامة ---------------- */
  window.NoorMemory = {
    deviceId,
    record,
    search,
    stats,
    get entries() {
      return log.slice();
    },
    getConfig: () => ({ ...cfg }),
    setConfig,
    snapshotState,
    restoreState,
    exportData,
    downloadExport,
    importData,
    clear: clearLog,
    flush,
    pull,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    LABELS,
  };

  // أول مدخل: بداية الجلسة
  record("action", "session.start", nowISO(), { label: "بدء جلسة" });
})();
