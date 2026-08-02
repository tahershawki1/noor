/* ============================================================
   app-shell.js — الهيكل المشترك بين كل صفحات التطبيق
   ============================================================
   $()/icon()، الوضع الليلي/النهاري، التنقل بين الأقسام، التاريخ الهجري،
   ووضع القراءة الغامر. يُحمَّل أولاً — كل ملفات الصفحات الأخرى تعتمد على
   الدوال هنا ($, icon, navigateTo, showToast...).
   ============================================================ */

const $ = (id) => document.getElementById(id);
const icon = (name) => `<svg class="ic"><use href="#i-${name}"></use></svg>`;

/* ---------------- الوضع النهاري/الليلي ---------------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  $("themeToggle").innerHTML = icon(theme === "light" ? "moon" : "sun");
  $("themeToggle").setAttribute("aria-label", theme === "light" ? "الوضع الليلي" : "الوضع النهاري");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#F3F6F4" : "#0A100D");
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
