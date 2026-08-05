/* ============================================================
   ripple.js — تموّج اللمس (Material ripple)
   ============================================================
   في تطبيقات أندرويد الأصلية، كل سطح قابل للنقر يُطلق موجة دائرية
   من نقطة إصبعك بالضبط. طبقة الحالة (التغميق عند الضغط) موجودة في
   styles.css، وهذا الملف يضيف الموجة نفسها.

   مستمع واحد على مستوى المستند (بالالتقاط) يخدم كل الواجهة — فالبطاقات
   التي تُعاد كتابتها بـ innerHTML (السور، الأذكار، الختمات…) تحصل على
   التموّج تلقائياً دون إعادة ربط أي حدث.

   مهم: الموجة لا تنطلق لحظة اللمس. أندرويد ينتظر قليلاً ليعرف هل هي
   نقرة أم بداية تمرير، ويُلغيها إن تحرّك الإصبع أو بدأت القائمة تتمرّر —
   وبدون هذا الانتظار كانت كل محاولة تمرير تُشعل موجات متداخلة في كل
   بطاقة يمرّ فوقها الإصبع.
   ============================================================ */
(function () {
  "use strict";

  // الأسطح التي تتموّج — كلها معرَّفة في styles.css بـ overflow:hidden
  // وسياق تموضع، وهما شرطا احتواء الموجة داخل حدود العنصر.
  const RIPPLE_TARGETS = [
    ".btn", ".chip-btn", ".fab", ".quick-tile", ".surah-card", ".category-card",
    ".nav-btn", ".ab-icon", ".icon-action", ".dhikr-counter-btn", ".tasbeeh-btn",
    ".play-btn", ".collapse-btn", ".khatma-card", ".khatma-card-del", ".khatma-tab",
    ".step-btn", ".tune-btn", ".as-btn", ".prayer-mark-btn", ".resume-open",
    ".widget-pick",
  ].join(",");

  const RIPPLE_MS = 450;
  // مهلة تمييز النقرة عن بداية التمرير، ومسافة التسامح قبل اعتبارها سحباً
  const TAP_DELAY_MS = 90;
  const MOVE_SLOP_PX = 8;

  const reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  /** أزرار شريط التنقل تتموّج داخل كبسولة المؤشّر لا داخل الزر كله. */
  function rippleHost(el) {
    if (el.classList.contains("nav-btn")) return el.querySelector(".nav-ic") || el;
    return el;
  }

  function spawnRipple(host, clientX, clientY) {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // نصف قطر يغطي أبعد ركن عن نقطة اللمس، فتملأ الموجة العنصر كاملاً
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const radius = Math.hypot(
      Math.max(x, rect.width - x),
      Math.max(y, rect.height - y)
    );

    const ripple = document.createElement("span");
    ripple.className = "m3-ripple";
    ripple.style.width = ripple.style.height = `${radius * 2}px`;
    ripple.style.left = `${x - radius}px`;
    ripple.style.top = `${y - radius}px`;
    host.appendChild(ripple);
    setTimeout(() => ripple.remove(), RIPPLE_MS);
  }

  /** اللمسة المعلَّقة التي لم يُحسم بعد كونها نقرة أم تمريراً. */
  let pending = null;

  function cancelPending() {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
  }

  function firePending() {
    if (!pending) return;
    clearTimeout(pending.timer);
    spawnRipple(pending.host, pending.x, pending.y);
    pending = null;
  }

  document.addEventListener(
    "pointerdown",
    (e) => {
      cancelPending();
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const target = e.target.closest && e.target.closest(RIPPLE_TARGETS);
      if (!target || target.disabled) return;

      const host = rippleHost(target);
      // الفأرة لا تُمرّر بالسحب، فلا داعي لتأخيرها
      if (e.pointerType === "mouse") {
        spawnRipple(host, e.clientX, e.clientY);
        return;
      }
      pending = { host, x: e.clientX, y: e.clientY, timer: null };
      pending.timer = setTimeout(firePending, TAP_DELAY_MS);
    },
    { passive: true, capture: true }
  );

  document.addEventListener(
    "pointermove",
    (e) => {
      if (!pending) return;
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > MOVE_SLOP_PX) cancelPending();
    },
    { passive: true, capture: true }
  );

  // نقرة قصيرة انتهت قبل انقضاء المهلة تستحق موجتها
  document.addEventListener("pointerup", firePending, { passive: true, capture: true });
  document.addEventListener("pointercancel", cancelPending, { passive: true, capture: true });
  // أي تمرير فعلي يبدأ = ليست نقرة
  document.addEventListener("scroll", cancelPending, { passive: true, capture: true });
})();
