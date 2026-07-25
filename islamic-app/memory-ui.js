/* ============================================================
   نور — واجهة قسم الذاكرة
   تربط ‎NoorMemory‎ و ‎NoorUpdates‎ بعناصر قسم "الذاكرة".
   تُحمَّل بعد app.js لأنها تستخدم ‎navigateTo‎ و ‎showToast‎.
   ============================================================ */
(function () {
  "use strict";

  const memory = window.NoorMemory;
  const updates = window.NoorUpdates;
  if (!memory) return;

  const el = (id) => document.getElementById(id);
  const toast = (msg) => (window.showToast ? window.showToast(msg) : console.log(msg));

  const TYPE_NAMES = {
    setting: "إعدادات",
    field: "حقول",
    search: "بحث",
    action: "إجراءات",
    note: "ملاحظات",
    nav: "تنقّل",
    input: "مدخلات",
  };

  let activeType = "";
  let query = "";

  /* ---------------- أدوات عرض ---------------- */
  function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = String(text ?? "");
    return div.innerHTML;
  }

  function relativeTime(iso) {
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return "";
    const seconds = Math.round((Date.now() - then) / 1000);
    if (seconds < 60) return "الآن";
    if (seconds < 3600) return `منذ ${Math.floor(seconds / 60)} دقيقة`;
    if (seconds < 86400) return `منذ ${Math.floor(seconds / 3600)} ساعة`;
    if (seconds < 604800) return `منذ ${Math.floor(seconds / 86400)} يوم`;
    return new Date(then).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" });
  }

  function shorten(value, max) {
    const text = String(value ?? "");
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  /* ---------------- الإحصاءات ---------------- */
  function renderStats() {
    const stats = memory.stats();
    const cards = [
      { label: "مدخل محفوظ", value: stats.total },
      { label: "بانتظار الرفع", value: stats.pending },
      { label: "أنواع", value: Object.keys(stats.byType).length },
      { label: "آخر مدخل", value: stats.last ? relativeTime(stats.last) : "—" },
    ];
    el("memStats").innerHTML = cards
      .map(
        (card) => `
        <div class="mem-stat">
          <span class="mem-stat-value">${escapeHTML(card.value)}</span>
          <span class="mem-stat-label">${escapeHTML(card.label)}</span>
        </div>`
      )
      .join("");
    el("memCount").textContent = stats.total;
  }

  /* ---------------- المرشّحات ---------------- */
  function renderFilters() {
    const byType = memory.stats().byType;
    const types = Object.keys(byType).sort((a, b) => byType[b] - byType[a]);
    const chips = [`<button class="chip-btn${activeType ? "" : " on"}" data-type="">الكل</button>`].concat(
      types.map(
        (type) =>
          `<button class="chip-btn${activeType === type ? " on" : ""}" data-type="${escapeHTML(type)}">${
            escapeHTML(TYPE_NAMES[type] || type)
          } ${byType[type]}</button>`
      )
    );
    const container = el("memFilters");
    container.innerHTML = chips.join("");
    container.querySelectorAll("[data-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeType = btn.dataset.type;
        renderFilters();
        renderList();
      });
    });
  }

  /* ---------------- قائمة المدخلات ---------------- */
  function renderList() {
    const items = memory.search({ type: activeType || undefined, q: query || undefined, limit: 300 });
    const list = el("memList");

    if (!items.length) {
      list.innerHTML = `<div class="mem-empty">لا توجد مدخلات مطابقة</div>`;
      return;
    }

    list.innerHTML = items
      .map(
        (entry) => `
        <div class="mem-item">
          <div class="mem-item-head">
            <span class="mem-type mem-type-${escapeHTML(entry.type)}">${escapeHTML(
              TYPE_NAMES[entry.type] || entry.type
            )}</span>
            <span class="mem-item-key">${escapeHTML(entry.label || entry.key)}</span>
            <span class="mem-item-time">${escapeHTML(relativeTime(entry.at))}</span>
          </div>
          <div class="mem-item-value" dir="auto">${escapeHTML(shorten(entry.value, 300))}</div>
        </div>`
      )
      .join("");
  }

  /* ---------------- بطاقة التحديثات ---------------- */
  function renderUpdateInfo() {
    const box = el("memUpdateInfo");
    if (!box) return;

    if (!updates) {
      box.innerHTML = `<div class="mem-kv-row"><span>الحالة</span><b>غير متاح</b></div>`;
      return;
    }

    const current = updates.current;
    const latest = updates.latest;
    const upToDate = !latest || !current.sha || latest.shortSha === String(current.sha).slice(0, 7);

    const rows = [
      ["نسختك الحالية", current.sha ? String(current.sha).slice(0, 7) : "غير معروفة"],
      ["آخر إصدار منشور", latest ? latest.shortSha : "—"],
      ["آخر تغيير", latest?.message ? shorten(latest.message, 80) : "—"],
      ["آخر فحص", latest?.seenAt ? relativeTime(latest.seenAt) : "—"],
      ["الحالة", upToDate ? "محدَّث ✓" : "يتوفر تحديث"],
    ];

    box.innerHTML =
      rows
        .map(
          ([key, value]) =>
            `<div class="mem-kv-row"><span>${escapeHTML(key)}</span><b dir="auto">${escapeHTML(value)}</b></div>`
        )
        .join("") +
      (upToDate
        ? ""
        : `<button class="btn btn-primary btn-block btn-sm" id="memApplyUpdate">تحديث التطبيق الآن</button>`);

    const applyBtn = el("memApplyUpdate");
    if (applyBtn) applyBtn.addEventListener("click", () => updates.applyUpdate());

    const versionLabel = el("settingsVersion");
    if (versionLabel) {
      versionLabel.textContent = current.version
        ? `${current.version} (${String(current.sha || "").slice(0, 7) || "—"})`
        : String(current.sha || "").slice(0, 7) || "—";
    }
  }

  /* ---------------- بطاقة المزامنة ---------------- */
  function renderSync() {
    const cfg = memory.getConfig();
    el("memDeviceId").textContent = memory.deviceId;
    el("memApiUrl").value = cfg.apiUrl || "";
    el("memApiToken").value = cfg.token || "";
    el("memSyncToggle").checked = Boolean(cfg.sync);

    const badge = el("memSyncBadge");
    const on = Boolean(cfg.sync && cfg.apiUrl);
    badge.textContent = on ? "مفعّلة" : "غير مفعّلة";
    badge.classList.toggle("ok", on);
  }

  /* ---------------- التحديث الكامل للواجهة ---------------- */
  function renderAll() {
    if (!el("memStats")) return;
    renderStats();
    renderFilters();
    renderList();
    renderSync();
    renderUpdateInfo();
  }

  /* ---------------- الأحداث ---------------- */
  function wire() {
    el("openMemoryBtn")?.addEventListener("click", () => {
      el("settingsOverlay")?.classList.add("hidden");
      window.navigateTo?.("memory");
    });

    el("memSearch")?.addEventListener("input", (e) => {
      query = e.target.value.trim();
      renderList();
    });

    el("memApiUrl")?.addEventListener("change", (e) => {
      const url = e.target.value.trim();
      memory.setConfig({ apiUrl: url });
      updates?.setConfig({ apiUrl: url });
      renderSync();
      toast(url ? "تم حفظ عنوان الخادم" : "تم إلغاء عنوان الخادم");
    });

    el("memApiToken")?.addEventListener("change", (e) => {
      memory.setConfig({ token: e.target.value.trim() });
      toast("تم حفظ التوكن");
    });

    el("memSyncToggle")?.addEventListener("change", (e) => {
      if (e.target.checked && !memory.getConfig().apiUrl) {
        e.target.checked = false;
        return toast("اضبط عنوان الخادم أولاً");
      }
      memory.setConfig({ sync: e.target.checked });
      renderSync();
      toast(e.target.checked ? "المزامنة مفعّلة" : "المزامنة معطّلة");
    });

    el("memSyncNow")?.addEventListener("click", async () => {
      if (!memory.getConfig().apiUrl) return toast("اضبط عنوان الخادم أولاً");
      try {
        const result = await memory.flush();
        toast(result.skipped ? "فعّل المزامنة أولاً" : `تم رفع ${result.pushed} مدخل`);
        renderAll();
      } catch (err) {
        toast(`تعذّر الرفع: ${err.message}`);
      }
    });

    el("memPull")?.addEventListener("click", async () => {
      try {
        const result = await memory.pull();
        toast(`تم سحب ${result.added} مدخل`);
        renderAll();
      } catch (err) {
        toast(`تعذّر السحب: ${err.message}`);
      }
    });

    el("memRestore")?.addEventListener("click", async () => {
      if (!confirm("سيتم استبدال إعدادات هذا الجهاز بالإعدادات المحفوظة على الخادم. متابعة؟")) return;
      try {
        const result = await memory.pull({ restoreState: true });
        toast(`تمت استعادة ${result.restored} إعداد — يُعاد التحميل`);
        setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        toast(`تعذّرت الاستعادة: ${err.message}`);
      }
    });

    el("memExport")?.addEventListener("click", () => {
      memory.downloadExport();
      toast("تم تصدير الذاكرة");
    });

    el("memImport")?.addEventListener("click", () => el("memImportFile")?.click());

    el("memImportFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        const restore = confirm("هل تريد استعادة الإعدادات المحفوظة في الملف أيضاً؟");
        const result = memory.importData(payload, { restoreState: restore });
        toast(`تم استيراد ${result.added} مدخل`);
        renderAll();
        if (restore && result.restored) setTimeout(() => window.location.reload(), 900);
      } catch (err) {
        toast(`ملف غير صالح: ${err.message}`);
      } finally {
        e.target.value = "";
      }
    });

    el("memClear")?.addEventListener("click", () => {
      if (!confirm("سيتم مسح سجل المدخلات على هذا الجهاز. متابعة؟")) return;
      memory.clear();
      renderAll();
      toast("تم مسح السجل");
    });

    el("memCheckUpdate")?.addEventListener("click", async () => {
      if (!updates) return;
      const btn = el("memCheckUpdate");
      btn.disabled = true;
      btn.textContent = "جارِ الفحص…";
      try {
        const result = await updates.check();
        renderUpdateInfo();
        toast(!result.ok ? "تعذّر الوصول لمصدر التحديثات" : result.updateAvailable ? "يتوفر تحديث جديد" : "التطبيق محدَّث");
      } finally {
        btn.disabled = false;
        btn.textContent = "بحث عن تحديث";
      }
    });

    const autoReload = el("memAutoReload");
    if (autoReload && updates) {
      autoReload.checked = Boolean(updates.getConfig().autoReload);
      autoReload.addEventListener("change", (e) => {
        updates.setConfig({ autoReload: e.target.checked });
        toast(e.target.checked ? "سيُحدَّث التطبيق تلقائياً" : "سيُسألك قبل التحديث");
      });
    }

    updates?.onEvent(() => renderUpdateInfo());
    memory.onChange(() => {
      // نُحدّث الأرقام فقط عندما يكون القسم مفتوحاً
      if (el("memory")?.classList.contains("active")) {
        renderStats();
        renderList();
      }
    });
  }

  wire();
  renderUpdateInfo();

  // ‎app.js‎ ينادي هذه الدالة عند فتح القسم
  window.renderMemorySection = renderAll;
})();
