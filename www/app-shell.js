/* ============================================================
   app-shell.js — الهيكل المشترك بين كل صفحات التطبيق
   ============================================================
   $()/icon()، الوضع الليلي/النهاري، التنقل بين الأقسام، التاريخ الهجري،
   ووضع القراءة الغامر. يُحمَّل أولاً — كل ملفات الصفحات الأخرى تعتمد على
   الدوال هنا ($, icon, navigateTo, showToast...).
   ============================================================ */

const $ = (id) => document.getElementById(id);
const icon = (name) => `<svg class="ic"><use href="#i-${name}"></use></svg>`;

/**
 * تعقيم نص قادم من المستخدم قبل إدراجه بـ innerHTML. بدونها، ذكر مخصص
 * (أو ملف نسخة احتياطية مُعدَّل يدوياً) يحمل وسوم HTML كان سيُنفَّذ كما هو.
 */
function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * صيغة المعدود العربية الصحيحة: ١ مفرد، ٢ مثنى، ٣–١٠ جمع مع الرقم،
 * ١١+ مفرد منصوب مع الرقم («٥ دقائق» لكن «١١ دقيقة»).
 */
function arabicCountLabel(n, one, two, few, many) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many || one}`;
}

/* ---------------- الوضع النهاري/الليلي ---------------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  $("themeToggle").innerHTML = icon(theme === "light" ? "moon" : "sun");
  $("themeToggle").setAttribute("aria-label", theme === "light" ? "الوضع الليلي" : "الوضع النهاري");
  // نفس قيمة --m3-surface في styles.css — شريط حالة أندرويد يتلوّن بلون
  // سطح التطبيق فيبدو امتداداً له لا شريطاً منفصلاً فوقه.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#F5FBF6" : "#0B140F");
}
applyTheme(localStorage.getItem("theme") || "dark");
$("themeToggle").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "light" ? "dark" : "light");
});

/* ---------------- التنقل بين الأقسام ---------------- */
// الأقسام الرئيسية لها زر في شريط التنقل السفلي، وما عداها يُفتح كصفحة فرعية بزر رجوع
const TAB_SECTIONS = ["home", "quran", "adhkar", "prayer", "adhan"];
const SECTION_TITLES = {
  home: "نور",
  quran: "القرآن الكريم",
  adhkar: "الأذكار",
  prayer: "مواقيت الصلاة",
  adhan: "الأذان",
  bookmarks: "المحفوظات",
  adiyah: "الأدعية",
  khatma: "ختمة القرآن",
  dashboard: "لوحة الإحصائيات",
  settings: "الإعدادات",
};
let currentTab = "home";
let navHistory = [];
let navigatingBack = false;

function setHeaderMode(mode, title = "", subtitle = "") {
  const isBrand = mode === "brand";
  $("abBrand").classList.toggle("hidden", !isBrand);
  $("abTitle").classList.toggle("hidden", isBrand);
  $("backBtn").classList.toggle("hidden", mode !== "back");
  if (!isBrand) {
    $("headerSurahName").textContent = title;
    $("headerJuzHizb").textContent = subtitle;
    $("headerJuzHizb").classList.toggle("hidden", !subtitle);
  }
}

function navigateTo(tab, options = {}) {
  const cameFromAnotherTab = currentTab !== tab;
  if (cameFromAnotherTab && !navigatingBack) {
    navHistory.push(currentTab);
    if (navHistory.length > 20) navHistory.shift();
  }
  navigatingBack = false;

  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  const panel = $(tab);
  if (panel) panel.classList.add("active");
  currentTab = tab;

  if (tab === "bookmarks") renderBookmarks();
  if (tab === "adiyah") renderAdiyah();
  if (tab === "prayer") ensurePrayerTimesFresh();
  if (tab === "khatma") renderKhatmaSection();
  if (tab === "dashboard") renderDashboard();
  if (tab === "home" && typeof renderHomeStats === "function") renderHomeStats();

  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });

  if (tab === "home") setHeaderMode("brand");
  // قائمة السور تحديداً تحمل سهم رجوع صريح للرئيسية (وليست عبر قائمة القراءة
  // الغامرة نفسها — enterReaderHeaderMode تتولى ذلك عند فتح سورة بالفعل)
  else if (tab === "quran") setHeaderMode("back", SECTION_TITLES[tab]);
  else if (TAB_SECTIONS.includes(tab)) setHeaderMode("title", SECTION_TITLES[tab]);
  else setHeaderMode("back", SECTION_TITLES[tab] || "");

  $("mainContent").scrollTop = 0;

  // فتح القرآن من شريط التنقل يستأنف آخر موضع قراءة مباشرةً.
  // الشرط cameFromAnotherTab يمنع إعادة الفتح بعد الرجوع لقائمة السور.
  if (tab === "quran" && options.resume && cameFromAnotherTab && $("surahReadView").classList.contains("hidden")) {
    resumeReading();
  }
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => navigateTo(btn.dataset.tab, { resume: true }));
});

function navigateBack() {
  const prev = navHistory.pop();
  navigatingBack = true;
  navigateTo(prev || "home");
}

// زر الرجوع في الشريط العلوي
$("backBtn").addEventListener("click", () => {
  if (!$("surahReadView").classList.contains("hidden")) return goBackToSurahList();
  if (!$("adhkarListView").classList.contains("hidden")) return backToAdhkarCategories();
  navigateBack();
});

/* ---------------- ارتفاع الشريط العلوي عند التمرير ----------------
   سلوك Material القياسي: الشريط يبدأ بنفس لون سطح الصفحة، وحين يمرّ
   المحتوى تحته ينتقل إلى سطح أعلى فيظهر الفصل بينهما دون خط حدّ. */
(function trackAppBarElevation() {
  const content = $("mainContent");
  const shell = $("appShell");
  if (!content || !shell) return;
  let raf = null;
  content.addEventListener(
    "scroll",
    () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        shell.classList.toggle("scrolled", content.scrollTop > 4);
      });
    },
    { passive: true }
  );
})();

function showToast(msg, opts) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("toast-wide", !!(opts && opts.wide));
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), (opts && opts.duration) || 2200);
}

/* ---------------- التاريخ الهجري ---------------- */
let hijriDateText = "";
try {
  hijriDateText = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date());
} catch (_) { /* المتصفح لا يدعم التقويم الهجري */ }
$("hijriDate").textContent = hijriDateText;

/* ---------------- وضع القراءة الغامر ---------------- */
let readerReturnTab = "quran";

function enterReaderHeaderMode() {
  setHeaderMode("back", "", "");
  $("appShell").classList.add("reading");
}
function exitReaderHeaderMode() {
  $("appShell").classList.remove("reading");
  const dest = readerReturnTab;
  readerReturnTab = "quran";
  navigatingBack = true;
  navigateTo(dest);
}
