/* ============================================================
   ripple.js — تموّج اللمس (Material ripple)
   ============================================================
   في تطبيقات أندرويد الأصلية، كل سطح قابل للنقر يُطلق موجة دائرية
   من نقطة إصبعك بالضبط. طبقة الحالة (التغميق عند الضغط) موجودة في
   styles.css، وهذا الملف يضيف الموجة نفسها.

   مستمع واحد على مستوى المستند (بالالتقاط) يخدم كل الواجهة — فالبطاقات
   التي تُعاد كتابتها بـ innerHTML (السور، الأذكار، الختمات…) تحصل على
   التموّج تلقائياً دون إعادة ربط أي حدث.
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

  const reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  if (reduceMotion) return;

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const target = e.target.closest && e.target.closest(RIPPLE_TARGETS);
      if (!target || target.disabled) return;
      spawnRipple(rippleHost(target), e.clientX, e.clientY);
    },
    { passive: true, capture: true }
  );
})();
