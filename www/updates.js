/* ============================================================
   نور — البحث عن التحديثات
   يكتشف نشر أي تحديث جديد ويعرض شريط "يتوفر تحديث" فوراً.

   مصادر الاكتشاف بالترتيب:
     ١) بثّ حيّ من الباك اند ‎(SSE)‎ — يصل خلال ثوانٍ من الـ push.
     ٢) سؤال الباك اند دورياً ‎/api/updates/check‎.
     ٣) ملف ‎version.json‎ المنشور مع الموقع (يعمل بدون باك اند).
     ٤) واجهة GitHub مباشرة كخطة أخيرة.
   ============================================================ */
(function () {
  "use strict";

  const CONFIG_KEY = "noor.updates.config";
  const STATE_KEY = "noor.updates.state";
  const POLL_MS = 60_000;
  const GITHUB_POLL_MS = 5 * 60_000;

  const defaults = {
    repo: "tahershawki1/noor",
    branch: "main",
    apiUrl: "", // عنوان الباك اند — يُقرأ من إعدادات الذاكرة إن وُجد
    autoReload: false, // إعادة تحميل تلقائية عند وصول التحديث
    enabled: true,
  };

  const readJSON = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  };
  const writeJSON = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  };

  let cfg = { ...defaults, ...readJSON(CONFIG_KEY, {}) };
  if (!cfg.apiUrl) {
    const memoryCfg = readJSON("noor.memory.config", {});
    if (memoryCfg.apiUrl) cfg.apiUrl = memoryCfg.apiUrl;
  }
  if (window.NOOR_API && !cfg.apiUrl) cfg.apiUrl = String(window.NOOR_API);

  const apiBase = () => String(cfg.apiUrl || "").replace(/\/+$/, "");

  /* ---------------- النسخة الحالية للصفحة المفتوحة ---------------- */
  const metaVersion = document.querySelector('meta[name="noor-version"]')?.content || "";
  const current = {
    sha: metaVersion,
    version: document.querySelector('meta[name="noor-release"]')?.content || "",
    source: metaVersion ? "meta" : "unknown",
  };

  const listeners = new Set();
  let latest = readJSON(STATE_KEY, null);
  let banner = null;
  let checking = false;

  const shortOf = (sha) => String(sha || "").slice(0, 7);

  function emit(event, data) {
    listeners.forEach((fn) => {
      try {
        fn(event, data);
      } catch (_) {}
    });
  }

  /** هل ما وصلنا أحدث من النسخة التي تعمل الآن؟ */
  function isNewer(info) {
    if (!info || !info.sha) return false;
    if (!current.sha) {
      // لا نعرف نسختنا بعد — نعتمد أول قراءة كمرجع
      current.sha = info.sha;
      current.source = "first-seen";
      return false;
    }
    return shortOf(info.sha) !== shortOf(current.sha);
  }

  function setLatest(info, source) {
    if (!info || !info.sha) return false;
    const normalized = {
      sha: info.sha,
      shortSha: shortOf(info.sha),
      message: info.message || "",
      author: info.author || "",
      date: info.date || info.builtAt || null,
      version: info.version || info.release?.tag || "",
      url: info.url || `https://github.com/${cfg.repo}/commit/${info.sha}`,
      source,
      seenAt: new Date().toISOString(),
    };

    const isUpdate = isNewer(normalized);
    latest = normalized;
    writeJSON(STATE_KEY, latest);
    emit("checked", { latest, updateAvailable: isUpdate });

    if (isUpdate) {
      emit("update", latest);
      if (cfg.autoReload) applyUpdate();
      else showBanner(latest);
    }
    return isUpdate;
  }

  /* ---------------- مصادر الفحص ---------------- */
  async function checkVersionFile() {
    const res = await fetch(`version.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`version.json ${res.status}`);
    const data = await res.json();
    if (!data.sha) throw new Error("version.json بلا sha");
    return data;
  }

  async function checkBackend() {
    const res = await fetch(
      `${apiBase()}/api/updates/check?current=${encodeURIComponent(current.sha || "")}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error(`الخادم ${res.status}`);
    const data = await res.json();
    if (!data.latest) throw new Error("لا توجد معلومات من الخادم");
    return data.latest;
  }

  async function checkGitHub() {
    const res = await fetch(
      `https://api.github.com/repos/${cfg.repo}/commits/${cfg.branch}`,
      { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const commit = await res.json();
    return {
      sha: commit.sha,
      message: commit.commit?.message?.split("\n")[0] || "",
      author: commit.commit?.author?.name || "",
      date: commit.commit?.author?.date || null,
      url: commit.html_url,
    };
  }

  /**
   * فحص شامل: يجرّب المصادر بالترتيب ويتوقف عند أول نجاح.
   * @param {{silent?: boolean, includeGitHub?: boolean}} options
   */
  async function check(options) {
    const opts = options || {};
    if (checking) return { skipped: true };
    checking = true;

    // ‎version.json‎ أولاً لأنه يمثّل ما هو *منشور فعلاً* على الموقع،
    // بينما الباك اند و GitHub يعرفان آخر commit وقد يسبق اكتمال النشر.
    const attempts = [["version.json", checkVersionFile]];
    if (apiBase()) attempts.push(["backend", checkBackend]);
    if (opts.includeGitHub !== false) attempts.push(["github", checkGitHub]);

    try {
      for (const [source, fn] of attempts) {
        try {
          const info = await fn();
          const updateAvailable = setLatest(info, source);
          return { ok: true, source, latest, updateAvailable };
        } catch (err) {
          if (!opts.silent) console.debug(`[updates] ${source}: ${err.message}`);
        }
      }
      emit("error", new Error("تعذّر الوصول إلى أي مصدر للتحديثات"));
      return { ok: false };
    } finally {
      checking = false;
    }
  }

  /* ---------------- البثّ الحيّ من الباك اند ---------------- */
  let stream = null;
  let streamRetry = 0;

  function connectStream() {
    if (!apiBase() || !window.EventSource || stream) return;
    try {
      stream = new EventSource(`${apiBase()}/api/updates/stream`);
    } catch (_) {
      return;
    }

    stream.addEventListener("hello", () => {
      streamRetry = 0;
    });

    // الخادم يعرف بالـ push خلال ثوانٍ، لكن نشر GitHub Pages يستغرق دقيقة تقريباً،
    // لذا نعيد سؤال ‎version.json‎ عدة مرات حتى يظهر الإصدار المنشور فعلاً.
    stream.addEventListener("update", () => {
      emit("push-detected", { at: new Date().toISOString() });
      [0, 20_000, 45_000, 90_000].forEach((delay) => {
        setTimeout(() => {
          if (!latest || !banner) check({ silent: true, includeGitHub: false });
        }, delay);
      });
    });

    stream.onerror = () => {
      stream?.close();
      stream = null;
      // إعادة اتصال بتباعد متزايد حتى دقيقة
      streamRetry = Math.min(streamRetry + 1, 6);
      setTimeout(connectStream, Math.min(60_000, 2 ** streamRetry * 1000));
    };
  }

  function disconnectStream() {
    stream?.close();
    stream = null;
  }

  /* ---------------- تطبيق التحديث ---------------- */
  /** يمسح كل ما قد يخدم نسخة قديمة ثم يعيد التحميل. */
  async function applyUpdate() {
    const version = latest?.shortSha || Date.now().toString(36);
    try {
      if (window.caches?.keys) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
      if (navigator.serviceWorker?.getRegistrations) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
      }
    } catch (_) {
      /* لا شيء نفعله — نكمل لإعادة التحميل على أي حال */
    }
    const url = new URL(window.location.href);
    url.searchParams.set("v", version);
    window.location.replace(url.toString());
  }

  /* ---------------- شريط التنبيه ---------------- */
  function showBanner(info) {
    if (banner) banner.remove();

    banner = document.createElement("div");
    banner.className = "update-banner";
    banner.setAttribute("role", "status");
    banner.innerHTML = `
      <div class="update-banner-body">
        <span class="update-banner-icon"><svg class="ic"><use href="#i-refresh"></use></svg></span>
        <div class="update-banner-text">
          <strong>يتوفر تحديث جديد</strong>
          <span>${escapeHTML(info.message || info.version || info.shortSha)}</span>
        </div>
      </div>
      <div class="update-banner-actions">
        <button class="btn btn-light btn-sm" data-update-apply>تحديث الآن</button>
        <button class="ab-icon sm" data-update-dismiss aria-label="لاحقاً">
          <svg class="ic"><use href="#i-close"></use></svg>
        </button>
      </div>`;

    banner.querySelector("[data-update-apply]").addEventListener("click", applyUpdate);
    banner.querySelector("[data-update-dismiss]").addEventListener("click", () => {
      banner.remove();
      banner = null;
    });

    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add("show"));
  }

  function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = String(text ?? "");
    return div.innerHTML;
  }

  /* ---------------- التشغيل ---------------- */
  let pollTimer = null;
  let githubTimer = null;

  function start() {
    if (!cfg.enabled) return;
    check({ silent: true });
    connectStream();

    clearInterval(pollTimer);
    // البثّ الحيّ يغني عن الاستطلاع المتكرر، فنُبطّئه عند توفره
    pollTimer = setInterval(() => {
      if (document.visibilityState === "visible") check({ silent: true, includeGitHub: false });
    }, POLL_MS);

    clearInterval(githubTimer);
    githubTimer = setInterval(() => {
      if (!apiBase() && document.visibilityState === "visible") check({ silent: true });
    }, GITHUB_POLL_MS);
  }

  function stop() {
    clearInterval(pollTimer);
    clearInterval(githubTimer);
    disconnectStream();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && cfg.enabled) check({ silent: true });
  });

  window.NoorUpdates = {
    check,
    applyUpdate,
    start,
    stop,
    get current() {
      return { ...current };
    },
    get latest() {
      return latest ? { ...latest } : null;
    },
    getConfig: () => ({ ...cfg }),
    setConfig(patch) {
      cfg = { ...cfg, ...patch };
      writeJSON(CONFIG_KEY, cfg);
      stop();
      start();
      return { ...cfg };
    },
    onEvent(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  // لو لم تكن نسخة الصفحة معروفة من الميتا، نأخذها من version.json كمرجع أول
  if (!current.sha) {
    checkVersionFile()
      .then((data) => {
        current.sha = data.sha;
        current.version = data.version || "";
        current.source = "version.json";
        start();
      })
      .catch(start);
  } else {
    start();
  }
})();
