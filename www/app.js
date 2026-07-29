/* ============================================================
   نور — تطبيق إسلامي
   الأقسام: القرآن الكريم، الأذكار، الإشارات المرجعية، مواقيت الصلاة
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
};
let currentTab = "home";

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
  // ندخل من تبويب آخر؟ يُستعمل لتقرير فتح آخر موضع قراءة تلقائياً
  const cameFromAnotherTab = currentTab !== tab;

  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  const panel = $(tab);
  if (panel) panel.classList.add("active");
  currentTab = tab;

  if (tab === "bookmarks") renderBookmarks();
  if (tab === "adiyah") renderAdiyah();
  if (tab === "prayer") ensurePrayerTimesFresh();

  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });

  if (tab === "home") setHeaderMode("brand");
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

// زر الرجوع في الشريط العلوي — يعرف السياق الذي هو فيه
$("backBtn").addEventListener("click", () => {
  if (!$("surahReadView").classList.contains("hidden")) return goBackToSurahList();
  if (!$("adhkarListView").classList.contains("hidden")) return backToAdhkarCategories();
  navigateTo("home");
});

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 2200);
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
function enterReaderHeaderMode() {
  setHeaderMode("back", "", "");
  $("appShell").classList.add("reading");
}
function exitReaderHeaderMode() {
  $("appShell").classList.remove("reading");
  navigateTo("quran");
}

/* ============================================================
   ١) قسم القرآن الكريم
   ============================================================ */
// كل بيانات القرآن محلية داخل التطبيق (islamic-app/data) — لا اتصال بأي API.
// انظر quran-data.js لطبقة التحميل، و scripts/build-quran-data.mjs لتوليد البيانات.
let surahs = [];
let currentSurah = null;
let pendingAyahScroll = null;

/**
 * تطبيع عربي شامل للبحث: يزيل التشكيل وعلامات المصحف والتطويل، ويوحّد
 * أشكال الألف (ومنها ألف الوصل التي يكثر ورودها في رسم المصحف)، والتاء
 * المربوطة، والألف المقصورة، والهمزات. بدونه يفشل البحث عن "الفاتحة"
 * لأن الاسم المخزَّن يكتبها بألف وصل وتشكيل كامل.
 */
function normalizeArabic(text) {
  return String(text || "")
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, "") // تشكيل وعلامات مصحفية
    .replace(/ـ/g, "")                                          // تطويل
    .replace(/[آأإٱٲٳٵ]/g, "ا") // أشكال الألف
    .replace(/ة/g, "ه")                                    // ة ← ه
    .replace(/[ىی]/g, "ي")                            // ى ← ي
    .replace(/ؤ/g, "و")                                    // ؤ ← و
    .replace(/ئ/g, "ي")                                    // ئ ← ي
    .replace(/[​-‏؜]/g, "")                           // محارف اتجاه غير مرئية
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** مفاتيح البحث لكل سورة: الاسم كاملاً، وبدون "سورة"، وبدون "ال"، والاسم اللاتيني. */
function surahSearchKeys(surah) {
  const name = normalizeArabic(surah.name);
  const bare = name.replace(/^سوره\s*/, "");
  return [name, bare, bare.replace(/^ال/, ""), String(surah.en || "").toLowerCase()];
}

/** يحوّل الأرقام العربية الهندية إلى لاتينية ليقبل البحث "١٨" و"18". */
function toLatinDigits(text) {
  return String(text).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

async function loadSurahList() {
  const listEl = $("surahList");
  try {
    await QuranData.loadMeta();
    surahs = QuranData.getSurahs();
    renderSurahList(surahs);
    renderResumeCard();
  } catch (e) {
    listEl.innerHTML = `<div class="error-msg">تعذر قراءة بيانات المصحف المرفقة مع التطبيق.<br><br><button class="btn btn-soft" onclick="loadSurahList()">إعادة المحاولة</button></div>`;
  }
}

function renderSurahList(list) {
  if (!list.length) {
    $("surahList").innerHTML = `<div class="empty-state"><p>لا توجد سورة بهذا الاسم</p></div>`;
    return;
  }
  $("surahList").innerHTML = list
    .map(
      (s) => `
      <div class="surah-card" onclick="openSurah(${s.n})">
        <div class="surah-number"><span>${s.n}</span></div>
        <div class="surah-card-info">
          <div class="surah-card-name">${s.name}</div>
          <div class="surah-card-meta">${s.type} • ${s.ayahs} آية</div>
        </div>
      </div>`
    )
    .join("");
}

$("surahSearch").addEventListener("input", (e) => {
  const raw = e.target.value.trim();
  if (!raw) return renderSurahList(surahs);

  const query = normalizeArabic(raw);
  const digits = toLatinDigits(raw);

  renderSurahList(
    surahs.filter((s) => {
      if (/^\d+$/.test(digits) && s.n === Number(digits)) return true;
      return surahSearchKeys(s).some((key) => key && key.includes(query));
    })
  );
});

async function openSurah(number, ayahToHighlight = null) {
  currentSurah = number;
  pendingAyahScroll = ayahToHighlight;
  $("surahListView").classList.add("hidden");
  $("surahReadView").classList.remove("hidden");
  $("ayahContainer").innerHTML = '<div class="loading">جارِ فتح السورة...</div>';
  $("ayahContainer").scrollTop = 0;
  enterReaderHeaderMode();

  try {
    await QuranData.loadMeta();
    await QuranData.loadText();
    const surah = QuranData.getSurah(number);
    if (!surah) throw new Error("سورة غير موجودة: " + number);
    renderSurah(surah);
  } catch (e) {
    $("ayahContainer").innerHTML = `<div class="error-msg">تعذر قراءة نص السورة من بيانات التطبيق.<br><br><button class="btn btn-soft" onclick="openSurah(${number})">إعادة المحاولة</button></div>`;
  }
}

// نص الـ API يستخدم رسم المصحف (ألف وصل، ياء فارسية، سكون قرآني...)
// لذا نطابق البسملة بعد تطبيع الحروف وتجاهل التشكيل
function stripBasmala(text) {
  const target = "بسماللهالرحمنالرحيم";
  const isSkippable = (code) =>
    (code >= 0x0610 && code <= 0x061a) ||
    (code >= 0x064b && code <= 0x065f) ||
    code === 0x0670 ||
    code === 0x0640 ||
    (code >= 0x06d6 && code <= 0x06ed) ||
    code === 0x0020 || code === 0x000a;
  const normalize = (code) => {
    if (code === 0x0671 || code === 0x0623 || code === 0x0625 || code === 0x0622) return "ا";
    if (code === 0x06cc || code === 0x0649) return "ي";
    return String.fromCharCode(code);
  };
  let norm = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isSkippable(code)) continue;
    norm += normalize(code);
    if (norm === target) {
      let j = i + 1;
      while (j < text.length && isSkippable(text.charCodeAt(j))) j++;
      return text.slice(j);
    }
    if (norm.length >= target.length) break;
  }
  return text;
}

function toArabicNum(n) {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
}

/* --------- إعدادات خط القرآن --------- */
const QURAN_FONTS = {
  "amiri-quran": '"Amiri Quran", "Amiri", serif',
  "amiri": '"Amiri", serif',
  "scheherazade": '"Scheherazade New", serif',
  "noto-naskh": '"Noto Naskh Arabic", serif',
  "lateef": '"Lateef", serif',
  "reem-kufi": '"Reem Kufi", sans-serif',
};
const QURAN_FONT_SIZE_MIN = 1.2;
const QURAN_FONT_SIZE_MAX = 2.6;
const QURAN_FONT_SIZE_STEP = 0.15;
const QURAN_FONT_SIZE_BASE = 1.75;

function applyQuranFont(key) {
  const family = QURAN_FONTS[key] || QURAN_FONTS["amiri-quran"];
  document.documentElement.style.setProperty("--font-quran", family);
  localStorage.setItem("quranFont", key);
  $("fontSelect").value = key;
}

function applyQuranFontSize(size) {
  const clamped = Math.min(QURAN_FONT_SIZE_MAX, Math.max(QURAN_FONT_SIZE_MIN, size));
  document.documentElement.style.setProperty("--quran-font-size", `${clamped}rem`);
  localStorage.setItem("quranFontSize", clamped);
  $("fontSizeLabel").textContent = `${Math.round((clamped / QURAN_FONT_SIZE_BASE) * 100)}%`;
  return clamped;
}

let quranFontSize = parseFloat(localStorage.getItem("quranFontSize")) || QURAN_FONT_SIZE_BASE;
applyQuranFont(localStorage.getItem("quranFont") || "amiri-quran");
quranFontSize = applyQuranFontSize(quranFontSize);

$("fontSelect").addEventListener("change", (e) => applyQuranFont(e.target.value));
$("fontBigger").addEventListener("click", () => {
  quranFontSize = applyQuranFontSize(quranFontSize + QURAN_FONT_SIZE_STEP);
});
$("fontSmaller").addEventListener("click", () => {
  quranFontSize = applyQuranFontSize(quranFontSize - QURAN_FONT_SIZE_STEP);
});

/* --------- تكبير/تصغير الخط بالقرص (Pinch-to-Zoom) --------- */
const ayahContainerPinchEl = $("ayahContainer");
let pinchStartDist = null;
let pinchBaseSize = null;

function touchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

ayahContainerPinchEl.addEventListener(
  "touchstart",
  (e) => {
    if (e.touches.length === 2) {
      pinchStartDist = touchDistance(e.touches);
      pinchBaseSize = quranFontSize;
    }
  },
  { passive: true }
);

ayahContainerPinchEl.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length === 2 && pinchStartDist) {
      e.preventDefault();
      const ratio = touchDistance(e.touches) / pinchStartDist;
      quranFontSize = applyQuranFontSize(pinchBaseSize * ratio);
    }
  },
  { passive: false }
);

["touchend", "touchcancel"].forEach((evt) => {
  ayahContainerPinchEl.addEventListener(evt, (e) => {
    if (e.touches.length < 2) {
      pinchStartDist = null;
      pinchBaseSize = null;
    }
  });
});

// دعم إيماءة القرص على لوحة اللمس (تراك باد) في المتصفحات المكتبية
ayahContainerPinchEl.addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    quranFontSize = applyQuranFontSize(quranFontSize - e.deltaY * 0.01);
  },
  { passive: false }
);

/* --------- نافذة الإعدادات --------- */
function openSettings() {
  $("settingsOverlay").classList.remove("hidden");
}
function closeSettingsModal() {
  $("settingsOverlay").classList.add("hidden");
}
$("settingsBtn").addEventListener("click", openSettings);
$("closeSettings").addEventListener("click", closeSettingsModal);
$("settingsOverlay").addEventListener("click", (e) => {
  if (e.target.id === "settingsOverlay") closeSettingsModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("settingsOverlay").classList.contains("hidden")) closeSettingsModal();
  if (!$("prayerSettingsOverlay").classList.contains("hidden")) closePrayerSettingsModal();
  if (!$("addAdhkarOverlay").classList.contains("hidden")) closeAddAdhkarModal();
  if (!$("ayahDialogOverlay").classList.contains("hidden")) closeAyahDialog();
  if (!$("adhanSettingsOverlay").classList.contains("hidden")) $("adhanSettingsOverlay").classList.add("hidden");
});

let currentSurahName = "";

function renderSurah(surah) {
  currentSurahName = surah.name;
  $("headerSurahName").textContent = surah.name;

  const bookmarks = getBookmarks();
  const showBasmala = surah.number !== 1 && surah.number !== 9;
  const isFatiha = surah.number === 1;

  const renderAyahSpan = (a, stripEmbeddedBasmala) => {
    let text = a.text;
    if (stripEmbeddedBasmala) text = stripBasmala(text);
    const key = `${surah.number}:${a.numberInSurah}`;
    const saved = bookmarks.some((b) => b.key === key);
    const classes = ["ayah-span"];
    if (saved) classes.push("bookmarked");
    if (a.sajdah) classes.push("has-sajdah");
    return `<span class="${classes.join(" ")}" id="ayah-${a.numberInSurah}" data-ayah="${a.numberInSurah}" data-juz="${a.juz}" data-hizb-quarter="${a.hizbQuarter}" data-page="${a.page}">${text}<span class="ayah-marker">﴿${toArabicNum(a.numberInSurah)}﴾</span>${a.sajdah ? '<span class="sajdah-mark" title="موضع سجدة">۩</span>' : ""}</span>`;
  };

  // فاصل صفحات المصحف — يُدرج قبل أول آية في كل صفحة جديدة
  const pageSeparator = (pageNumber) =>
    `<div class="page-separator" data-page="${pageNumber}">` +
    `<span class="page-separator-line"></span>` +
    `<span class="page-separator-label">صفحة ${toArabicNum(pageNumber)}</span>` +
    `<span class="page-separator-line"></span>` +
    `</div>`;

  let html = showBasmala ? '<div class="basmala">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>' : "";

  let ayahsToFlow = surah.ayahs;
  if (isFatiha) {
    // البسملة في الفاتحة هي الآية الأولى فعلياً — تُعرض في سطر خاص بها كبقية السور
    html += `<div class="basmala-ayah-line">${renderAyahSpan(surah.ayahs[0], false)}</div>`;
    ayahsToFlow = surah.ayahs.slice(1);
  }

  // النص يتدفق في فقرة لكل صفحة مصحف، ليقع الفاصل بين الفقرات لا داخل السطر
  html += '<p class="mushaf-text" dir="rtl">';
  ayahsToFlow.forEach((a, index) => {
    if (a.pageStart && index > 0) {
      html += `</p>${pageSeparator(a.page)}<p class="mushaf-text" dir="rtl">`;
    }
    html += renderAyahSpan(a, a.numberInSurah === 1 && showBasmala) + " ";
  });
  html += "</p>";

  $("ayahContainer").innerHTML = html;
  updateReaderProgress();

  if (pendingAyahScroll) {
    const el = $(`ayah-${pendingAyahScroll}`);
    if (el) {
      el.classList.add("highlighted");
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
      setTimeout(() => el.classList.remove("highlighted"), 2500);
    }
    pendingAyahScroll = null;
  }
}

/* --------- متابعة القراءة — يُحفظ آخر موضع تلقائياً أثناء التصفح --------- */
const LAST_READ_KEY = "quranLastRead";

function getLastRead() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_READ_KEY));
    return saved && saved.surah ? saved : null;
  } catch (_) {
    return null;
  }
}

function saveLastRead(surahNumber, ayahNumber, surahName) {
  localStorage.setItem(
    LAST_READ_KEY,
    JSON.stringify({ surah: surahNumber, ayah: ayahNumber, surahName, at: Date.now() })
  );
}

function clearLastRead() {
  localStorage.removeItem(LAST_READ_KEY);
  renderResumeCard();
  showToast("تم مسح موضع القراءة");
}

/**
 * بطاقة "متابعة القراءة" أعلى قائمة السور — تُظهر آخر موضع وتتيح فتحه يدوياً.
 * الإشارات المرجعية شيء منفصل تماماً: هي علامات يضعها المستخدم بنفسه ولا
 * تؤثر على موضع المتابعة.
 */
function renderResumeCard() {
  const card = $("resumeCard");
  if (!card) return;
  const last = getLastRead();
  if (!last) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  card.innerHTML =
    `<button class="resume-open" onclick="resumeReading()">` +
    `<span class="resume-label">متابعة القراءة</span>` +
    `<span class="resume-ref">${last.surahName || ""} — الآية ${toArabicNum(last.ayah)}</span>` +
    `</button>` +
    `<button class="icon-action danger" onclick="clearLastRead()" aria-label="مسح موضع القراءة">${icon("trash")}</button>`;
}

/** يفتح آخر موضع قراءة محفوظ. */
function resumeReading() {
  const last = getLastRead();
  if (!last) return false;
  openSurah(last.surah, last.ayah);
  return true;
}

/* --------- شارة الجزء والحزب والصفحة — تتحدث حسب الآية الظاهرة أعلى صندوق القراءة --------- */
function updateReaderProgress() {
  const container = $("ayahContainer");
  const spans = container.querySelectorAll(".ayah-span");
  if (!spans.length) return;
  const refY = container.getBoundingClientRect().top + 20;
  let current = spans[0];
  for (const span of spans) {
    if (span.getBoundingClientRect().top <= refY) current = span;
    else break;
  }

  const juz = parseInt(current.dataset.juz, 10);
  const hizb = Math.ceil(parseInt(current.dataset.hizbQuarter, 10) / 4);
  const page = parseInt(current.dataset.page, 10);
  $("headerJuzHizb").textContent =
    `جزء ${toArabicNum(juz)} • حزب ${toArabicNum(hizb)} • صفحة ${toArabicNum(page)}`;
  $("headerJuzHizb").classList.remove("hidden");

  if (currentSurah) {
    saveLastRead(currentSurah, parseInt(current.dataset.ayah, 10), currentSurahName);
  }
}

let juzHizbScrollRaf = null;
$("ayahContainer").addEventListener(
  "scroll",
  () => {
    if (juzHizbScrollRaf) return;
    juzHizbScrollRaf = requestAnimationFrame(() => {
      juzHizbScrollRaf = null;
      updateReaderProgress();
    });
  },
  { passive: true }
);

/* --------- الحفظ بالضغط المطول (Long Press) --------- */
const LONG_PRESS_MS = 550;
const MOVE_CANCEL_PX = 12;
let pressTimer = null;
let pressSpan = null;
let pressStart = null;

function clearPress() {
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = null;
  if (pressSpan) pressSpan.classList.remove("pressing");
  pressSpan = null;
  pressStart = null;
}

const ayahContainerEl = $("ayahContainer");

ayahContainerEl.addEventListener("pointerdown", (e) => {
  const span = e.target.closest(".ayah-span");
  if (!span) return;
  clearPress();
  pressSpan = span;
  pressStart = { x: e.clientX, y: e.clientY };
  span.classList.add("pressing");
  pressTimer = setTimeout(() => {
    span.classList.remove("pressing");
    handleAyahLongPress(span);
    pressTimer = null;
    pressSpan = null;
  }, LONG_PRESS_MS);
});

ayahContainerEl.addEventListener("pointermove", (e) => {
  if (!pressStart) return;
  const dx = e.clientX - pressStart.x;
  const dy = e.clientY - pressStart.y;
  if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clearPress();
});

ayahContainerEl.addEventListener("pointerup", () => {
  // إذا انتهت الضغطة قبل اكتمال المؤقّت (ولم تُلغَ بالسحب) فهي ضغطة قصيرة عادية
  if (pressTimer && pressSpan) openAyahDialog(pressSpan);
  clearPress();
});
["pointercancel", "pointerleave"].forEach((evt) =>
  ayahContainerEl.addEventListener(evt, clearPress)
);

ayahContainerEl.addEventListener("contextmenu", (e) => {
  if (e.target.closest(".ayah-span")) e.preventDefault();
});

function handleAyahLongPress(span) {
  const ayahNum = parseInt(span.dataset.ayah, 10);
  toggleBookmark(currentSurah, ayahNum, currentSurahName, span);
  if (navigator.vibrate) navigator.vibrate(35);
}

/* --------- نافذة خيارات الآية: استماع + تفسير --------- */
let currentDialogAyah = null;

function openAyahDialog(span) {
  const ayahNum = parseInt(span.dataset.ayah, 10);
  currentDialogAyah = { surah: currentSurah, ayah: ayahNum, span };
  $("ayahDialogTitle").textContent = `${currentSurahName} — الآية ${toArabicNum(ayahNum)}`;
  $("ayahTafsirBox").classList.add("hidden");
  $("ayahTafsirBox").innerHTML = "";
  resetAyahListenBtn();
  updateFavoriteBtnLabel();
  $("ayahDialogOverlay").classList.remove("hidden");
}

function updateFavoriteBtnLabel() {
  const isSaved = currentDialogAyah.span.classList.contains("bookmarked");
  $("ayahFavoriteBtn").innerHTML = isSaved
    ? `${icon("check")} محفوظة — إزالة`
    : `${icon("bookmark")} إضافة إلى المحفوظات`;
  $("ayahFavoriteBtn").classList.toggle("favorited", isSaved);
}

function closeAyahDialog() {
  $("ayahDialogOverlay").classList.add("hidden");
  $("ayahAudioPlayer").pause();
  resetAyahListenBtn();
}

function resetAyahListenBtn() {
  $("ayahListenBtn").innerHTML = `${icon("volume")} استماع إلى الآية`;
  $("ayahListenBtn").classList.remove("playing");
}

$("closeAyahDialog").addEventListener("click", closeAyahDialog);
$("ayahDialogOverlay").addEventListener("click", (e) => {
  if (e.target.id === "ayahDialogOverlay") closeAyahDialog();
});

$("ayahListenBtn").addEventListener("click", () => {
  const audio = $("ayahAudioPlayer");
  if (!audio.paused) {
    audio.pause();
    resetAyahListenBtn();
    return;
  }
  const { surah, ayah } = currentDialogAyah;

  // النص والتفسير يعملان دون إنترنت، أما التلاوة الصوتية فتُبَثّ من الشبكة
  // (ملفات التلاوة كاملةً تتجاوز 200 ميجابايت، فلا تُرفق داخل التطبيق)
  if (navigator.onLine === false) {
    showToast("التلاوة الصوتية تحتاج اتصالاً بالإنترنت");
    return;
  }

  const fileName = `${String(surah).padStart(3, "0")}${String(ayah).padStart(3, "0")}.mp3`;
  audio.src = `https://everyayah.com/data/Alafasy_128kbps/${fileName}`;
  audio
    .play()
    .then(() => {
      $("ayahListenBtn").innerHTML = `${icon("pause")} إيقاف الاستماع`;
      $("ayahListenBtn").classList.add("playing");
    })
    .catch(() => showToast("تعذر تشغيل التلاوة — تحقق من الاتصال بالإنترنت"));
});
$("ayahAudioPlayer").addEventListener("ended", resetAyahListenBtn);

$("ayahFavoriteBtn").addEventListener("click", () => {
  const { surah, ayah, span } = currentDialogAyah;
  toggleBookmark(surah, ayah, currentSurahName, span);
  updateFavoriteBtnLabel();
});

// التفسير مرفق مع التطبيق (data/tafsir-muyassar.json) ويُقرأ عند أول طلب فقط
$("ayahTafsirBtn").addEventListener("click", async () => {
  const box = $("ayahTafsirBox");
  box.classList.remove("hidden");
  box.innerHTML = '<div class="loading">جارِ فتح التفسير...</div>';
  const { surah, ayah } = currentDialogAyah;
  try {
    await QuranData.loadTafsir();
    const text = QuranData.getTafsir(surah, ayah);
    box.innerHTML = text
      ? `<p class="tafsir-source">📖 تفسير الميسر</p><p class="tafsir-text">${text.replace(/\n/g, "<br>")}</p>`
      : '<div class="error-msg">لا يوجد تفسير محفوظ لهذه الآية.</div>';
  } catch (e) {
    box.innerHTML = '<div class="error-msg">تعذر قراءة ملف التفسير المرفق مع التطبيق.</div>';
  }
});

function goBackToSurahList() {
  $("surahReadView").classList.add("hidden");
  $("surahListView").classList.remove("hidden");
  renderResumeCard();
  exitReaderHeaderMode();
}

/* ============================================================
   ٢) قسم الأذكار
   ============================================================ */
/* --------- تخزين الأذكار المخصصة وترتيب العرض --------- */
function getCustomAdhkar() {
  try { return JSON.parse(localStorage.getItem("customAdhkar")) || {}; } catch (_) { return {}; }
}
function saveCustomAdhkar(obj) { localStorage.setItem("customAdhkar", JSON.stringify(obj)); }

function getAdhkarOrder() {
  try { return JSON.parse(localStorage.getItem("adhkarOrder")) || {}; } catch (_) { return {}; }
}
function saveAdhkarOrder(obj) { localStorage.setItem("adhkarOrder", JSON.stringify(obj)); }

// يدمج أذكار القسم الأصلية مع الأذكار المخصصة، ثم يطبّق الترتيب المحفوظ إن وجد
function getCategoryItems(cat) {
  const custom = getCustomAdhkar()[cat.id] || [];
  const builtIn = cat.items.map((item, idx) => ({ id: `built-${idx}`, ...item, isCustom: false }));
  const customMapped = custom.map((item) => ({ ...item, isCustom: true }));
  let all = builtIn.concat(customMapped);

  const order = getAdhkarOrder()[cat.id];
  if (order && order.length) {
    const byId = new Map(all.map((it) => [it.id, it]));
    const ordered = [];
    order.forEach((id) => {
      if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id); }
    });
    byId.forEach((it) => ordered.push(it)); // عناصر جديدة لم تكن ضمن الترتيب المحفوظ تُلحق بالنهاية
    all = ordered;
  }
  return all;
}

let currentAdhkarCategoryId = null;
let adhkarReorderMode = false;

function renderAdhkarCategories() {
  const custom = getCustomAdhkar();
  $("adhkarCategories").innerHTML = ADHKAR_DATA.map((cat) => {
    const count = cat.items.length + (custom[cat.id] || []).length;
    return `
    <div class="category-card" onclick="openAdhkarCategory('${cat.id}')">
      <div class="category-icon">${cat.icon}</div>
      <div class="category-name">${cat.name}</div>
      <div class="category-count">${count} أذكار</div>
    </div>`;
  }).join("");
}

function openAdhkarCategory(id) {
  const cat = ADHKAR_DATA.find((c) => c.id === id);
  if (!cat) return;
  currentAdhkarCategoryId = id;
  adhkarReorderMode = false;
  $("reorderAdhkarBtn").innerHTML = `${icon("sort")} ترتيب`;
  $("reorderAdhkarBtn").classList.remove("on");
  $("adhkarCatView").classList.add("hidden");
  $("adhkarListView").classList.remove("hidden");
  $("adhkarCatTitle").textContent = `${cat.icon} ${cat.name}`;
  renderAdhkarItemsList();
  $("mainContent").scrollTop = 0;
}

function renderAdhkarItemsList() {
  const cat = ADHKAR_DATA.find((c) => c.id === currentAdhkarCategoryId);
  if (!cat) return;
  const items = getCategoryItems(cat);

  if (adhkarReorderMode) {
    $("adhkarItems").innerHTML = items
      .map(
        (item, i) => `
      <div class="dhikr-card">
        <div class="dhikr-text">${item.text}</div>
        ${item.benefit ? `<div class="dhikr-benefit">💡 ${item.benefit}</div>` : ""}
        <div class="dhikr-footer">
          <div class="reorder-controls">
            <button class="tune-btn" onclick="moveAdhkarItem(${i}, -1)" ${i === 0 ? "disabled" : ""} aria-label="تحريك لأعلى">▲</button>
            <button class="tune-btn" onclick="moveAdhkarItem(${i}, 1)" ${i === items.length - 1 ? "disabled" : ""} aria-label="تحريك لأسفل">▼</button>
          </div>
          ${item.isCustom ? `<button class="icon-action danger" onclick="deleteCustomAdhkar('${item.id}')" aria-label="حذف">${icon("trash")}</button>` : ""}
        </div>
      </div>`
      )
      .join("");
    return;
  }

  $("adhkarItems").innerHTML = items
    .map(
      (item) => `
      <div class="dhikr-card">
        <div class="dhikr-text">${item.text}</div>
        ${item.benefit ? `<div class="dhikr-benefit">💡 ${item.benefit}</div>` : ""}
        <div class="dhikr-footer">
          <span class="dhikr-repeat">التكرار: ${item.repeat} ${item.repeat === 1 ? "مرة" : "مرات"}</span>
          <button class="dhikr-counter-btn" data-remaining="${item.repeat}" onclick="tickDhikr(this)">
            ${item.repeat}
          </button>
        </div>
        ${item.isCustom ? `<span class="custom-adhkar-tag">✍️ مخصص</span>` : ""}
      </div>`
    )
    .join("");
}

function moveAdhkarItem(index, direction) {
  const cat = ADHKAR_DATA.find((c) => c.id === currentAdhkarCategoryId);
  if (!cat) return;
  const items = getCategoryItems(cat);
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= items.length) return;
  [items[index], items[newIndex]] = [items[newIndex], items[index]];
  const order = getAdhkarOrder();
  order[currentAdhkarCategoryId] = items.map((it) => it.id);
  saveAdhkarOrder(order);
  renderAdhkarItemsList();
}

function deleteCustomAdhkar(id) {
  const custom = getCustomAdhkar();
  const list = custom[currentAdhkarCategoryId] || [];
  custom[currentAdhkarCategoryId] = list.filter((it) => it.id !== id);
  saveCustomAdhkar(custom);

  const order = getAdhkarOrder();
  if (order[currentAdhkarCategoryId]) {
    order[currentAdhkarCategoryId] = order[currentAdhkarCategoryId].filter((oid) => oid !== id);
    saveAdhkarOrder(order);
  }
  renderAdhkarItemsList();
  showToast("تم حذف الذكر");
}

function tickDhikr(btn) {
  let remaining = parseInt(btn.dataset.remaining, 10);
  if (remaining <= 0) return;
  remaining -= 1;
  btn.dataset.remaining = remaining;
  if (remaining === 0) {
    btn.textContent = "✓ تم";
    btn.classList.add("done");
  } else {
    btn.textContent = remaining;
  }
}

function backToAdhkarCategories() {
  $("adhkarListView").classList.add("hidden");
  $("adhkarCatView").classList.remove("hidden");
  renderAdhkarCategories();
  $("mainContent").scrollTop = 0;
}
$("backToCategories").addEventListener("click", backToAdhkarCategories);

$("reorderAdhkarBtn").addEventListener("click", () => {
  adhkarReorderMode = !adhkarReorderMode;
  $("reorderAdhkarBtn").innerHTML = adhkarReorderMode
    ? `${icon("check")} تم`
    : `${icon("sort")} ترتيب`;
  $("reorderAdhkarBtn").classList.toggle("on", adhkarReorderMode);
  renderAdhkarItemsList();
});

/* --------- إضافة ذكر جديد --------- */
function openAddAdhkarModal() {
  $("newAdhkarCategory").innerHTML = ADHKAR_DATA.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join("");
  if (currentAdhkarCategoryId) $("newAdhkarCategory").value = currentAdhkarCategoryId;
  $("newAdhkarText").value = "";
  $("newAdhkarRepeat").value = "1";
  $("newAdhkarBenefit").value = "";
  $("addAdhkarOverlay").classList.remove("hidden");
}
function closeAddAdhkarModal() {
  $("addAdhkarOverlay").classList.add("hidden");
}
$("addAdhkarBtn").addEventListener("click", openAddAdhkarModal);
$("closeAddAdhkar").addEventListener("click", closeAddAdhkarModal);
$("addAdhkarOverlay").addEventListener("click", (e) => {
  if (e.target.id === "addAdhkarOverlay") closeAddAdhkarModal();
});

$("saveNewAdhkarBtn").addEventListener("click", () => {
  const categoryId = $("newAdhkarCategory").value;
  const text = $("newAdhkarText").value.trim();
  const repeat = Math.max(1, parseInt($("newAdhkarRepeat").value, 10) || 1);
  const benefit = $("newAdhkarBenefit").value.trim();
  if (!text) { showToast("اكتب نص الذكر أولاً"); return; }

  const custom = getCustomAdhkar();
  if (!custom[categoryId]) custom[categoryId] = [];
  custom[categoryId].push({ id: `custom-${Date.now()}`, text, repeat, benefit });
  saveCustomAdhkar(custom);

  closeAddAdhkarModal();
  showToast("تمت إضافة الذكر ✓");
  renderAdhkarCategories();
  if (!$("adhkarListView").classList.contains("hidden") && currentAdhkarCategoryId === categoryId) {
    renderAdhkarItemsList();
  }
});

/* --------- السبحة الإلكترونية --------- */
let tasbeehCount = parseInt(localStorage.getItem("tasbeehCount") || "0", 10);
$("tasbeehCount").textContent = tasbeehCount;
$("tasbeehBtn").textContent = localStorage.getItem("tasbeehPhrase") || "سبحان الله";
$("tasbeehPhrase").value = localStorage.getItem("tasbeehPhrase") || "سبحان الله";

$("tasbeehBtn").addEventListener("click", () => {
  tasbeehCount += 1;
  $("tasbeehCount").textContent = tasbeehCount;
  localStorage.setItem("tasbeehCount", tasbeehCount);
  if (navigator.vibrate) navigator.vibrate(15);
});
$("tasbeehReset").addEventListener("click", () => {
  tasbeehCount = 0;
  $("tasbeehCount").textContent = 0;
  localStorage.setItem("tasbeehCount", 0);
});
$("tasbeehPhrase").addEventListener("change", (e) => {
  $("tasbeehBtn").textContent = e.target.value;
  localStorage.setItem("tasbeehPhrase", e.target.value);
});

/* ============================================================
   ٣) قسم الإشارات المرجعية
   ============================================================ */
function getBookmarks() {
  try {
    return JSON.parse(localStorage.getItem("quranBookmarks") || "[]");
  } catch (_) {
    return [];
  }
}
function saveBookmarks(list) {
  localStorage.setItem("quranBookmarks", JSON.stringify(list));
}

function toggleBookmark(surahNum, ayahNum, surahName, span) {
  const key = `${surahNum}:${ayahNum}`;
  let bookmarks = getBookmarks();
  const existing = bookmarks.findIndex((b) => b.key === key);

  if (existing >= 0) {
    bookmarks.splice(existing, 1);
    saveBookmarks(bookmarks);
    span.classList.remove("bookmarked");
    showToast("تم حذف الإشارة المرجعية 🗑");
  } else {
    // نص الآية من العنصر نفسه (بدون رقم الآية)
    const clone = span.cloneNode(true);
    clone.querySelector(".ayah-marker")?.remove();
    const text = clone.textContent.trim();

    bookmarks.unshift({
      key,
      surah: surahNum,
      ayah: ayahNum,
      surahName,
      text,
      date: new Date().toISOString(),
    });
    saveBookmarks(bookmarks);
    span.classList.add("bookmarked");
    showToast("تمت إضافة الإشارة المرجعية 🔖");
  }

  span.classList.add("pulse");
  setTimeout(() => span.classList.remove("pulse"), 450);
}

function renderBookmarks() {
  const list = getBookmarks();
  const el = $("bookmarksList");
  if (!list.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="big">${icon("bookmark")}</div>
        <p>لا توجد آيات محفوظة بعد</p>
        <p class="muted">افتح أي سورة واضغط مطولاً على الآية لإضافتها هنا</p>
      </div>`;
    return;
  }
  el.innerHTML = list
    .map(
      (b, i) => `
      <div class="bookmark-item">
        <div class="bookmark-ayah-text">${b.text} <span class="ayah-marker">﴿${toArabicNum(b.ayah)}﴾</span></div>
        <div class="bookmark-meta">
          <span class="bookmark-ref">${b.surahName} — الآية ${toArabicNum(b.ayah)}</span>
          <div class="bookmark-actions">
            <button class="icon-action" onclick="goToBookmark(${b.surah}, ${b.ayah})" aria-label="فتح الآية">${icon("open")}</button>
            <button class="icon-action danger" onclick="deleteBookmark(${i})" aria-label="حذف">${icon("trash")}</button>
          </div>
        </div>
      </div>`
    )
    .join("");
}

function goToBookmark(surahNum, ayahNum) {
  document.querySelector('.nav-btn[data-tab="quran"]').click();
  openSurah(surahNum, ayahNum);
}

function deleteBookmark(index) {
  const list = getBookmarks();
  list.splice(index, 1);
  saveBookmarks(list);
  renderBookmarks();
  showToast("تم حذف الإشارة المرجعية");
}

/* ============================================================
   ٤) قسم مواقيت الصلاة
   ============================================================ */
const PRAYER_NAMES = {
  Fajr: { ar: "الفجر", icon: "🌄" },
  Sunrise: { ar: "الشروق", icon: "🌅" },
  Dhuhr: { ar: "الظهر", icon: "☀️" },
  Asr: { ar: "العصر", icon: "🌤️" },
  Maghrib: { ar: "المغرب", icon: "🌇" },
  Isha: { ar: "العشاء", icon: "🌙" },
};
/** أسماء عربية لرموز الدول — لعرض الموقع وللبحث بالدولة. */
const COUNTRY_NAMES_AR = {
  EG: "مصر", SA: "السعودية", AE: "الإمارات", KW: "الكويت", QA: "قطر", BH: "البحرين",
  OM: "عُمان", YE: "اليمن", JO: "الأردن", PS: "فلسطين", IL: "فلسطين", LB: "لبنان",
  SY: "سوريا", IQ: "العراق", LY: "ليبيا", TN: "تونس", DZ: "الجزائر", MA: "المغرب",
  MR: "موريتانيا", SD: "السودان", SO: "الصومال", DJ: "جيبوتي", KM: "جزر القمر",
  TR: "تركيا", IR: "إيران", PK: "باكستان", ID: "إندونيسيا", MY: "ماليزيا",
  BD: "بنغلاديش", AF: "أفغانستان", BN: "بروناي", MV: "المالديف",
  NG: "نيجيريا", SN: "السنغال", ML: "مالي", NE: "النيجر", TD: "تشاد",
  AZ: "أذربيجان", KZ: "كازاخستان", UZ: "أوزبكستان", TM: "تركمانستان",
  KG: "قيرغيزستان", TJ: "طاجيكستان", AL: "ألبانيا", XK: "كوسوفو", BA: "البوسنة",
  GB: "بريطانيا", FR: "فرنسا", DE: "ألمانيا", NL: "هولندا", BE: "بلجيكا",
  ES: "إسبانيا", IT: "إيطاليا", SE: "السويد", NO: "النرويج", DK: "الدنمارك",
  AT: "النمسا", CH: "سويسرا", RU: "روسيا", US: "أمريكا", CA: "كندا", AU: "أستراليا",
};

const PRAYER_ORDER_ALL = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];
const PRAYER_ORDER_MAIN = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
let countdownTimer = null;
let lastPrayerData = null; // { timings, hijri, locationLabel, fetchedAt } — البيانات الخام قبل تطبيق التصحيح

function getPrayerMethod() { return localStorage.getItem("prayerMethod") || "5"; }
function getPrayerMadhab() { return localStorage.getItem("prayerMadhab") || "0"; }
function getTuneOffsets() {
  try { return JSON.parse(localStorage.getItem("prayerTune")) || {}; } catch (_) { return {}; }
}
function saveTuneOffsets(obj) { localStorage.setItem("prayerTune", JSON.stringify(obj)); }

function addMinutesToTime(hhmm, offsetMin) {
  const [h, m] = hhmm.split(":").map(Number);
  let total = h * 60 + m + (offsetMin || 0);
  total = ((total % 1440) + 1440) % 1440;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function formatRelativeTime(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} ${mins === 1 ? "دقيقة" : "دقائق"}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ${hours === 1 ? "ساعة" : "ساعات"}`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} ${days === 1 ? "يوم" : "أيام"}`;
}

$("useGeo").addEventListener("click", () => {
  if (!navigator.geolocation) {
    showToast("المتصفح لا يدعم تحديد الموقع — اكتب المدينة يدوياً");
    return;
  }
  $("prayerLocation").textContent = "جارِ تحديد موقعك...";
  navigator.geolocation.getCurrentPosition(
    (pos) => fetchPrayerTimesByCoords(pos.coords.latitude, pos.coords.longitude),
    () => {
      $("prayerLocation").textContent = "تعذر تحديد الموقع — اكتب اسم المدينة يدوياً";
    },
    { timeout: 10000 }
  );
});

$("cityGo").addEventListener("click", () => fetchPrayerTimesByCity());
$("countryInput").addEventListener("keydown", (e) => e.key === "Enter" && fetchPrayerTimesByCity());
$("refreshPrayer").addEventListener("click", () => retryPrayerFetch(true));

function retryPrayerFetch(showFeedback) {
  const source = localStorage.getItem("prayerSource");
  if (source === "coords") {
    const c = JSON.parse(localStorage.getItem("prayerCoords"));
    fetchPrayerTimesByCoords(c.lat, c.lng).then(() => showFeedback && showToast("تم تحديث المواقيت ✓"));
  } else if (source === "city") {
    fetchPrayerTimesByCity().then(() => showFeedback && showToast("تم تحديث المواقيت ✓"));
  } else if (showFeedback) {
    showToast("حدد موقعك أولاً");
  }
}

function showPrayerLoading() {
  if (!lastPrayerData) {
    $("prayerTimesList").innerHTML = Array(6).fill('<div class="skeleton-row"></div>').join("");
    $("prayerLocation").textContent = "جارِ حساب المواقيت...";
  }
}

function handlePrayerFetchError() {
  if (lastPrayerData) {
    showToast("تعذر الحساب — تُعرض آخر مواقيت محفوظة");
  } else {
    $("prayerLocation").textContent = "تعذر حساب المواقيت";
    $("prayerTimesList").innerHTML = `<div class="error-msg">تعذر حساب المواقيت.<br><br><button class="btn btn-soft" onclick="retryPrayerFetch(true)">إعادة المحاولة</button></div>`;
  }
}

function storeAndRenderPrayerData(data, locationLabel) {
  lastPrayerData = {
    timings: data.timings,
    hijri: data.date.hijri,
    locationLabel,
    fetchedAt: Date.now(),
  };
  localStorage.setItem("prayerLastData", JSON.stringify(lastPrayerData));
  renderPrayerTimes();
}

/**
 * المواقيت تُحسب على الجهاز فلكياً (prayer-times.js) — لا اتصال بأي خدمة.
 * التاريخ الهجري من Intl، وهو متاح دون إنترنت كذلك.
 */
function computeAndStorePrayerTimes(lat, lng, locationLabel) {
  // الإحداثيات المحسومة (سواء جاءت من الـ GPS أو من اختيار مدينة) — يقرأها
  // ودجت الشاشة الرئيسية ليحسب المواقيت بنفسه والتطبيق مغلق.
  localStorage.setItem("prayerResolvedCoords", JSON.stringify({ lat, lng }));
  const timings = PrayerCalc.calculate({
    latitude: lat,
    longitude: lng,
    date: new Date(),
    method: Number(getPrayerMethod()),
    school: getPrayerMadhab(),
  });
  const hijri = PrayerCalc.hijriDate() || { day: "", month: "", year: "" };
  storeAndRenderPrayerData(
    { timings, date: { hijri: { day: hijri.day, month: { ar: hijri.month }, year: hijri.year } } },
    locationLabel
  );
}

async function fetchPrayerTimesByCoords(lat, lng) {
  localStorage.setItem("prayerSource", "coords");
  localStorage.setItem("prayerCoords", JSON.stringify({ lat, lng }));
  try {
    computeAndStorePrayerTimes(lat, lng, `موقعك الحالي (${lat.toFixed(2)}, ${lng.toFixed(2)})`);
  } catch (e) {
    handlePrayerFetchError();
  }
}

/** قائمة المدن المرفقة مع التطبيق — تُقرأ عند أول بحث فقط. */
let citiesCache = null;
async function loadCities() {
  if (!citiesCache) {
    const res = await fetch("data/cities.json");
    if (!res.ok) throw new Error("cities " + res.status);
    citiesCache = await res.json();
  }
  return citiesCache;
}

function findCity(cities, cityQuery, countryQuery) {
  const query = normalizeArabic(cityQuery);
  const country = normalizeArabic(countryQuery);

  const matches = cities.filter((c) => {
    const latin = String(c.n).toLowerCase();
    const arabic = c.a ? normalizeArabic(c.a) : "";
    const hit = latin === query || arabic === query || latin.includes(query) || (arabic && arabic.includes(query));
    if (!hit) return false;
    if (!country) return true;
    return String(c.c).toLowerCase() === country || normalizeArabic(COUNTRY_NAMES_AR[c.c] || "") === country;
  });

  // الأفضلية للمطابقة التامة على المطابقة الجزئية
  const exact = matches.find((c) => String(c.n).toLowerCase() === query || (c.a && normalizeArabic(c.a) === query));
  return exact || matches[0] || null;
}

async function fetchPrayerTimesByCity() {
  const city = $("cityInput").value.trim();
  const country = $("countryInput").value.trim();
  if (!city) { showToast("اكتب اسم المدينة أولاً"); return; }
  localStorage.setItem("prayerSource", "city");
  localStorage.setItem("prayerCity", JSON.stringify({ city, country }));
  localStorage.removeItem("prayerCoords");
  showPrayerLoading();
  try {
    const cities = await loadCities();
    const match = findCity(cities, city, country);
    if (!match) {
      $("prayerLocation").textContent = "لم نجد هذه المدينة في القائمة المرفقة";
      $("prayerTimesList").innerHTML =
        `<div class="error-msg">المدينة غير موجودة ضمن المدن المرفقة مع التطبيق.<br>` +
        `جرّب اسم أقرب مدينة كبيرة، أو استعمل زر «موقعي الحالي» فهو الأدق ويعمل دون إنترنت.</div>`;
      return;
    }
    const label = `${match.a || match.n}${match.c ? "، " + (COUNTRY_NAMES_AR[match.c] || match.c) : ""}`;
    computeAndStorePrayerTimes(match.y, match.x, label);
  } catch (e) {
    handlePrayerFetchError();
  }
}

function renderPrayerTimes() {
  if (!lastPrayerData) return;
  const { timings: rawTimings, hijri, locationLabel, fetchedAt } = lastPrayerData;
  const tune = getTuneOffsets();
  const timings = {};
  PRAYER_ORDER_ALL.forEach((p) => { timings[p] = addMinutesToTime(rawTimings[p], tune[p]); });

  $("prayerLocation").textContent = `📍 ${locationLabel} — ${hijri.day} ${hijri.month.ar} ${hijri.year}هـ`;
  $("lastUpdated").textContent = `آخر تحديث: ${formatRelativeTime(fetchedAt)}`;
  $("lastUpdated").classList.remove("hidden");

  renderPrayerRowsAndCountdown(timings, tune);

  // مسار واحد يمرّ به كل تغيير في المواقيت أو إعداداتها، فهو أنسب موضع
  // لمزامنة ودجت الشاشة الرئيسية. لا يفعل شيئاً في المتصفح العادي.
  if (typeof PrayerWidget !== "undefined") PrayerWidget.sync();
}

function renderHomePrayerWidget(timings, nextName) {
  const row = $("homePrayerTimesRow");
  if (!row) return;
  row.innerHTML = PRAYER_ORDER_ALL.map((p) => {
    const info = PRAYER_NAMES[p];
    const isNext = nextName === p;
    return `<div class="home-prayer-item ${isNext ? "next-prayer" : ""}">
      <span class="home-prayer-icon">${info.icon}</span>
      <span class="home-prayer-name">${info.ar}</span>
      <span class="home-prayer-time">${formatTime12(timings[p])}</span>
    </div>`;
  }).join("");
  const nextNameEl = $("homeNextPrayerName");
  if (nextNameEl) nextNameEl.textContent = PRAYER_NAMES[nextName].ar;
  const nextSection = $("homeNextSection");
  if (nextSection) nextSection.classList.remove("hidden");
  const placeholder = $("homePlaceholder");
  if (placeholder) placeholder.classList.add("hidden");
}

function renderPrayerRowsAndCountdown(timings, tune) {
  const now = new Date();
  const todaysTimes = PRAYER_ORDER_MAIN.map((p) => {
    const [h, m] = timings[p].split(":").map(Number);
    return { name: p, time: new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m) };
  });

  let next = todaysTimes.find((t) => t.time > now);
  let prev;
  if (next) {
    const idx = todaysTimes.indexOf(next);
    prev = idx > 0 ? todaysTimes[idx - 1] : null;
  } else {
    const [h, m] = timings.Fajr.split(":").map(Number);
    next = { name: "Fajr", time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m) };
    prev = todaysTimes[todaysTimes.length - 1];
  }
  if (!prev) {
    const [h, m] = timings.Isha.split(":").map(Number);
    prev = { name: "Isha", time: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, h, m) };
  }

  $("prayerTimesList").innerHTML = PRAYER_ORDER_ALL.map((p) => {
    const info = PRAYER_NAMES[p];
    const isNext = next.name === p;
    const offset = tune[p] || 0;
    const tuneBadge = offset !== 0 ? `<span class="prayer-tune-badge">${offset > 0 ? "+" : ""}${offset}د</span>` : "";
    return `
      <div class="prayer-row ${isNext ? "current" : ""}">
        <span class="prayer-name">${isNext ? '<span class="current-badge">التالية</span>' : ""}${info.icon} ${info.ar}</span>
        <span class="prayer-time-wrap">${tuneBadge}<span class="prayer-time">${formatTime12(timings[p])}</span></span>
      </div>`;
  }).join("");

  $("nextPrayerCard").classList.remove("hidden");
  $("nextPrayerName").textContent = PRAYER_NAMES[next.name].ar;

  renderHomePrayerWidget(timings, next.name);

  clearInterval(countdownTimer);
  const totalSpan = next.time - prev.time;

  // جدولة التنبيه المسبق إن وُجد
  if (typeof schedulePreAlert === 'function') schedulePreAlert(next.name, next.time.getTime());

  const updateCountdown = () => {
    const diff = next.time - new Date();
    if (diff <= 0) {
      clearInterval(countdownTimer);
      $("countdown").textContent = "حان وقت الصلاة 🕌";
      const homeCD = $("homeCountdown");
      if (homeCD) homeCD.textContent = "حان وقت الصلاة 🕌";
      $("prayerProgressFill").style.width = "100%";
      // تشغيل الأذان تلقائياً عند دخول الوقت
      if (typeof autoPlayAdhanForPrayer === 'function') autoPlayAdhanForPrayer(next.name);
      renderPrayerRowsAndCountdown(timings, tune);
      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    $("countdown").textContent = timeStr;
    const homeCD = $("homeCountdown");
    if (homeCD) homeCD.textContent = timeStr;
    // تحديث عداد صفحة الأذان
    if (typeof updateAdhanNextCard === 'function') {
      updateAdhanNextCard(next.name, timeStr, timings[next.name]);
    }
    const elapsed = totalSpan - diff;
    const pct = totalSpan > 0 ? Math.min(100, Math.max(0, (elapsed / totalSpan) * 100)) : 0;
    $("prayerProgressFill").style.width = `${pct}%`;
  };
  updateCountdown();
  countdownTimer = setInterval(updateCountdown, 1000);
}

function formatTime12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "م" : "ص";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/* --------- إعدادات الحساب والتصحيح --------- */
function renderTuneList() {
  const tune = getTuneOffsets();
  $("prayerTuneList").innerHTML = PRAYER_ORDER_ALL.map((p) => {
    const info = PRAYER_NAMES[p];
    const val = tune[p] || 0;
    return `
      <div class="tune-row">
        <span class="tune-name">${info.icon} ${info.ar}</span>
        <div class="tune-controls">
          <button class="tune-btn" onclick="adjustTune('${p}', -1)">−</button>
          <span class="tune-value">${val > 0 ? "+" : ""}${val}</span>
          <button class="tune-btn" onclick="adjustTune('${p}', 1)">+</button>
        </div>
      </div>`;
  }).join("");
}

function adjustTune(prayer, delta) {
  const tune = getTuneOffsets();
  const current = tune[prayer] || 0;
  tune[prayer] = Math.max(-30, Math.min(30, current + delta));
  saveTuneOffsets(tune);
  renderTuneList();
  renderPrayerTimes();
}

$("resetTuneBtn").addEventListener("click", () => {
  saveTuneOffsets({});
  renderTuneList();
  renderPrayerTimes();
  showToast("تمت إعادة تعيين تصحيح الأوقات");
});

$("calcMethodSelect").addEventListener("change", (e) => {
  localStorage.setItem("prayerMethod", e.target.value);
  retryPrayerFetch(true);
});
$("madhabSelect").addEventListener("change", (e) => {
  localStorage.setItem("prayerMadhab", e.target.value);
  retryPrayerFetch(true);
});

/* --------- ودجت الشاشة الرئيسية --------- */

/**
 * قسم الودجت يظهر في تطبيق الأندرويد فقط — في المتصفح لا معنى له.
 * نُبرز الحجم المضاف بالفعل، ونبدّل التلميح حسب الحالة.
 */
async function refreshPrayerWidgetSection() {
  const field = $("prayerWidgetField");
  if (!field || typeof PrayerWidget === "undefined" || !PrayerWidget.isAvailable()) return;
  field.classList.remove("hidden");

  const status = await PrayerWidget.getStatus();
  field
    .querySelector('[data-widget-size="large"]')
    .classList.toggle("selected", status.largeCount > 0);
  field
    .querySelector('[data-widget-size="small"]')
    .classList.toggle("selected", status.smallCount > 0);

  const hint = $("prayerWidgetHint");
  if (!hint) return;
  if (!status.hasData) {
    hint.textContent = "حدّد موقعك أولاً حتى يعرض الودجت المواقيت.";
  } else if (status.largeCount + status.smallCount > 0) {
    hint.textContent =
      "الودجت مضاف بالفعل. غيّر حجمه بالضغط المطوّل عليه وسحب مقابضه، وسيتكيّف المحتوى تلقائياً.";
  } else {
    hint.textContent =
      "اختر الحجم ليُضاف إلى الشاشة الرئيسية. العدّاد يتحرك ثانيةً بثانية ويعمل دون إنترنت.";
  }
}

async function addPrayerWidget(size) {
  if (typeof PrayerWidget === "undefined") return;
  await PrayerWidget.sync();
  const result = await PrayerWidget.requestPin(size);
  if (result.requested) {
    showToast("أكّد الإضافة من النافذة التي ظهرت");
  } else {
    // بعض مشغّلات الشاشة الرئيسية لا تدعم الإضافة من داخل التطبيق
    showToast("اضغط مطوّلاً على الشاشة الرئيسية ← الودجتات ← نور");
  }
}

$("prayerWidgetField")
  .querySelectorAll("[data-widget-size]")
  .forEach((btn) => btn.addEventListener("click", () => addPrayerWidget(btn.dataset.widgetSize)));

function openPrayerSettings() {
  $("calcMethodSelect").value = getPrayerMethod();
  $("madhabSelect").value = getPrayerMadhab();
  renderTuneList();
  refreshPrayerWidgetSection();
  $("prayerSettingsOverlay").classList.remove("hidden");
}
function closePrayerSettingsModal() {
  $("prayerSettingsOverlay").classList.add("hidden");
}
$("prayerSettingsBtn").addEventListener("click", openPrayerSettings);
$("closePrayerSettings").addEventListener("click", closePrayerSettingsModal);
$("prayerSettingsOverlay").addEventListener("click", (e) => {
  if (e.target.id === "prayerSettingsOverlay") closePrayerSettingsModal();
});

/** المواقيت محسوبة ليوم بعينه — نعيد حسابها إن دخل المستخدم بعد منتصف الليل. */
function ensurePrayerTimesFresh() {
  if (!lastPrayerData || !lastPrayerData.fetchedAt) return;
  const sameDay =
    new Date(lastPrayerData.fetchedAt).toDateString() === new Date().toDateString();
  if (!sameDay) retryPrayerFetch(false);
}

// استرجاع آخر بيانات وموقع محفوظين عند فتح التطبيق
(function restorePrayerLocation() {
  try {
    const cached = JSON.parse(localStorage.getItem("prayerLastData"));
    if (cached) {
      lastPrayerData = cached;
      renderPrayerTimes();
    }
  } catch (_) { /* لا بيانات محفوظة */ }

  const coords = localStorage.getItem("prayerCoords");
  const city = localStorage.getItem("prayerCity");
  if (coords) {
    const { lat, lng } = JSON.parse(coords);
    fetchPrayerTimesByCoords(lat, lng);
  } else if (city) {
    const c = JSON.parse(city);
    $("cityInput").value = c.city;
    $("countryInput").value = c.country || "";
    fetchPrayerTimesByCity();
  }
})();

/* ============================================================
   ٥) قسم الأدعية
   ============================================================ */
const ADIYAH_DATA = [
  {
    title: "سيد الاستغفار",
    icon: "🌟",
    text: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ لَكَ بِذَنْبِي فَاغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ",
    source: "رواه البخاري — من قالها موقنًا بها حين يمسي فمات من ليلته دخل الجنة، وكذلك حين يصبح",
  },
  {
    title: "دعاء الكرب والشدة",
    icon: "🤲",
    text: "لَا إِلَهَ إِلَّا اللهُ الْعَظِيمُ الْحَلِيمُ، لَا إِلَهَ إِلَّا اللهُ رَبُّ الْعَرْشِ الْعَظِيمِ، لَا إِلَهَ إِلَّا اللهُ رَبُّ السَّمَاوَاتِ وَرَبُّ الْأَرْضِ وَرَبُّ الْعَرْشِ الْكَرِيمِ",
    source: "رواه البخاري ومسلم",
  },
  {
    title: "دعاء الهمّ والحزن",
    icon: "💛",
    text: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَأَعُوذُ بِكَ مِنَ الْعَجْزِ وَالْكَسَلِ، وَأَعُوذُ بِكَ مِنَ الْجُبْنِ وَالْبُخْلِ، وَأَعُوذُ بِكَ مِنْ غَلَبَةِ الدَّيْنِ وَقَهْرِ الرِّجَالِ",
    source: "رواه البخاري",
  },
  {
    title: "دعاء الهمّ والغمّ",
    icon: "✨",
    text: "اللَّهُمَّ إِنِّي عَبْدُكَ وَابْنُ عَبْدِكَ وَابْنُ أَمَتِكَ، نَاصِيَتِي بِيَدِكَ، مَاضٍ فِيَّ حُكْمُكَ، عَدْلٌ فِيَّ قَضَاؤُكَ، أَسْأَلُكَ بِكُلِّ اسْمٍ هُوَ لَكَ، سَمَّيْتَ بِهِ نَفْسَكَ، أَوْ أَنْزَلْتَهُ فِي كِتَابِكَ، أَوْ عَلَّمْتَهُ أَحَدًا مِنْ خَلْقِكَ، أَوِ اسْتَأْثَرْتَ بِهِ فِي عِلْمِ الْغَيْبِ عِنْدَكَ، أَنْ تَجْعَلَ الْقُرْآنَ رَبِيعَ قَلْبِي، وَنُورَ صَدْرِي، وَجَلَاءَ حُزْنِي، وَذَهَابَ هَمِّي",
    source: "رواه أحمد والحاكم بسند صحيح",
  },
  {
    title: "دعاء الاستخارة",
    icon: "🌙",
    text: "اللَّهُمَّ إِنِّي أَسْتَخِيرُكَ بِعِلْمِكَ وَأَسْتَقْدِرُكَ بِقُدْرَتِكَ وَأَسْأَلُكَ مِنْ فَضْلِكَ الْعَظِيمِ، فَإِنَّكَ تَقْدِرُ وَلَا أَقْدِرُ، وَتَعْلَمُ وَلَا أَعْلَمُ، وَأَنْتَ عَلَّامُ الْغُيُوبِ، اللَّهُمَّ إِنْ كُنْتَ تَعْلَمُ أَنَّ هَذَا الْأَمْرَ خَيْرٌ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي فَاقْدُرْهُ لِي وَيَسِّرْهُ لِي ثُمَّ بَارِكْ لِي فِيهِ، وَإِنْ كُنْتَ تَعْلَمُ أَنَّ هَذَا الْأَمْرَ شَرٌّ لِي فِي دِينِي وَمَعَاشِي وَعَاقِبَةِ أَمْرِي فَاصْرِفْهُ عَنِّي وَاصْرِفْنِي عَنْهُ وَاقْدُرْ لِي الْخَيْرَ حَيْثُ كَانَ ثُمَّ أَرْضِنِي بِهِ",
    source: "رواه البخاري",
  },
  {
    title: "دعاء الصباح",
    icon: "🌅",
    text: "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ",
    source: "رواه مسلم",
  },
  {
    title: "دعاء المساء",
    icon: "🌆",
    text: "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذِهِ اللَّيْلَةِ وَخَيْرَ مَا بَعْدَهَا، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذِهِ اللَّيْلَةِ وَشَرِّ مَا بَعْدَهَا",
    source: "رواه مسلم",
  },
  {
    title: "دعاء الشفاء",
    icon: "💚",
    text: "اللَّهُمَّ رَبَّ النَّاسِ، أَذْهِبِ الْبَأْسَ، اشْفِهِ وَأَنْتَ الشَّافِي، لَا شِفَاءَ إِلَّا شِفَاؤُكَ، شِفَاءً لَا يُغَادِرُ سَقَمًا",
    source: "رواه البخاري ومسلم",
  },
  {
    title: "دعاء النوم",
    icon: "🌙",
    text: "اللَّهُمَّ بِاسْمِكَ أَمُوتُ وَأَحْيَا",
    source: "رواه البخاري",
  },
  {
    title: "دعاء الاستيقاظ",
    icon: "☀️",
    text: "الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ",
    source: "رواه البخاري",
  },
  {
    title: "دعاء ركوب السيارة والسفر",
    icon: "🚗",
    text: "سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ، وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ",
    source: "رواه مسلم — من سورة الزخرف (آية 13-14)",
  },
  {
    title: "دعاء دخول المنزل",
    icon: "🏡",
    text: "بِسْمِ اللهِ وَلَجْنَا، وَبِسْمِ اللهِ خَرَجْنَا، وَعَلَى اللهِ رَبِّنَا تَوَكَّلْنَا",
    source: "رواه أبو داود",
  },
  {
    title: "الصلاة الإبراهيمية",
    icon: "🕌",
    text: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ، كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ، اللَّهُمَّ بَارِكْ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ، كَمَا بَارَكْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ",
    source: "رواه البخاري ومسلم — تُقال في التشهد الأخير",
  },
  {
    title: "دعاء القنوت",
    icon: "🤲",
    text: "اللَّهُمَّ اهْدِنِي فِيمَنْ هَدَيْتَ، وَعَافِنِي فِيمَنْ عَافَيْتَ، وَتَوَلَّنِي فِيمَنْ تَوَلَّيْتَ، وَبَارِكْ لِي فِيمَا أَعْطَيْتَ، وَقِنِي شَرَّ مَا قَضَيْتَ، فَإِنَّكَ تَقْضِي وَلَا يُقْضَى عَلَيْكَ، وَإِنَّهُ لَا يَذِلُّ مَنْ وَالَيْتَ، وَلَا يَعِزُّ مَنْ عَادَيْتَ، تَبَارَكْتَ رَبَّنَا وَتَعَالَيْتَ",
    source: "رواه أبو داود والترمذي وقال: حسن",
  },
  {
    title: "دعاء ختم المجلس",
    icon: "📿",
    text: "سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا أَنْتَ، أَسْتَغْفِرُكَ وَأَتُوبُ إِلَيْكَ",
    source: "رواه الترمذي — كفارة المجلس",
  },
];

function renderAdiyah() {
  const el = $("adiyahList");
  if (!el) return;
  el.innerHTML = ADIYAH_DATA.map((dua) => `
    <div class="dua-card">
      <div class="dua-title">${dua.icon} ${dua.title}</div>
      <div class="dua-text" dir="rtl">${dua.text}</div>
      <div class="dua-source">📚 ${dua.source}</div>
    </div>`).join("");
}

/* ============================================================
   ٦) قسم الأذان
   ============================================================ */

const ADHAN_AUDIO_SOURCES = {
  alafasy: {
    name: 'مشاري العفاسي',
    url: 'https://www.islamcan.com/audio/adhan/azan1.mp3',
  },
  makkah: {
    name: 'أذان الحرم المكي',
    url: 'https://www.islamcan.com/audio/adhan/azan2.mp3',
  },
  madinah: {
    name: 'أذان المسجد النبوي',
    url: 'https://www.islamcan.com/audio/adhan/azan3.mp3',
  },
  egypt: {
    name: 'أذان مصري كلاسيكي',
    url: 'https://www.islamcan.com/audio/adhan/azan4.mp3',
  },
};

const ADHAN_TEXT_LINES = [
  'اللهُ أَكْبَرُ، اللهُ أَكْبَرُ',
  'اللهُ أَكْبَرُ، اللهُ أَكْبَرُ',
  'أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا اللهُ',
  'أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا اللهُ',
  'أَشْهَدُ أَنَّ مُحَمَّدًا رَسُولُ اللهِ',
  'أَشْهَدُ أَنَّ مُحَمَّدًا رَسُولُ اللهِ',
  'حَيَّ عَلَى الصَّلَاةِ',
  'حَيَّ عَلَى الصَّلَاةِ',
  'حَيَّ عَلَى الْفَلَاحِ',
  'حَيَّ عَلَى الْفَلَاحِ',
  'اللهُ أَكْبَرُ، اللهُ أَكْبَرُ',
  'لَا إِلَهَ إِلَّا اللهُ',
];

function getAdhanSettings() {
  try { return JSON.parse(localStorage.getItem('adhanSettings')) || {}; } catch (_) { return {}; }
}
function saveAdhanSettings(obj) { localStorage.setItem('adhanSettings', JSON.stringify(obj)); }

function getAdhanEnabledPrayers() {
  const s = getAdhanSettings();
  return s.enabledPrayers ?? { Fajr: true, Dhuhr: false, Asr: false, Maghrib: true, Isha: false };
}

function getAdhanReciter() {
  return getAdhanSettings().reciter || 'alafasy';
}

function getAdhanVolume() {
  const v = getAdhanSettings().volume;
  return v !== undefined ? parseFloat(v) : 1;
}

function getAdhanPreAlert() {
  return parseInt(getAdhanSettings().preAlert ?? '0', 10);
}

/* --------- مشغّل الأذان --------- */
const adhanAudio = $('adhanAudioPlayer');
let adhanPlaying = false;
let adhanProgressTimer = null;

function formatAdhanTime(secs) {
  if (!isFinite(secs) || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateAdhanProgress() {
  if (!adhanAudio.duration) return;
  const pct = (adhanAudio.currentTime / adhanAudio.duration) * 100;
  $('adhanProgressFill').style.width = `${pct}%`;
  $('adhanCurrentTime').textContent = formatAdhanTime(adhanAudio.currentTime);
  $('adhanDuration').textContent = formatAdhanTime(adhanAudio.duration);
}

function setAdhanPlayState(playing) {
  adhanPlaying = playing;
  const btn = $('adhanPlayBtn');
  const iconEl = $('adhanPlayIcon');
  const label = $('adhanPlayLabel');
  if (!btn) return;
  if (playing) {
    btn.classList.add('playing');
    iconEl.innerHTML = icon('pause');
    label.textContent = 'إيقاف الأذان';
    $('adhanProgressWrap').classList.remove('hidden');
    adhanProgressTimer = setInterval(updateAdhanProgress, 500);
  } else {
    btn.classList.remove('playing');
    iconEl.innerHTML = icon('play');
    label.textContent = 'تشغيل الأذان';
    clearInterval(adhanProgressTimer);
  }
}

function toggleAdhanPlay() {
  if (adhanPlaying) {
    adhanAudio.pause();
    setAdhanPlayState(false);
    return;
  }

  const reciter = $('adhanReciterSelect')?.value || getAdhanReciter();
  const src = ADHAN_AUDIO_SOURCES[reciter]?.url;
  if (!src) { showToast('لا يوجد مصدر صوتي'); return; }

  if (adhanAudio.src !== src) {
    adhanAudio.src = src;
    adhanAudio.load();
  }
  adhanAudio.volume = getAdhanVolume();
  adhanAudio.play()
    .then(() => setAdhanPlayState(true))
    .catch(() => showToast('تعذّر تشغيل الأذان — تأكد من الاتصال بالإنترنت'));
}

adhanAudio.addEventListener('ended', () => {
  setAdhanPlayState(false);
  $('adhanProgressFill').style.width = '0%';
  $('adhanCurrentTime').textContent = '0:00';
});

adhanAudio.addEventListener('error', () => {
  setAdhanPlayState(false);
  showToast('تعذّر تحميل صوت الأذان');
});

/* --------- تشغيل تلقائي عند دخول وقت الصلاة --------- */
function autoPlayAdhanForPrayer(prayerName) {
  const enabled = getAdhanEnabledPrayers();
  if (!enabled[prayerName]) return;

  const reciter = getAdhanReciter();
  const src = ADHAN_AUDIO_SOURCES[reciter]?.url;
  if (!src) return;

  if (adhanAudio.src !== src) {
    adhanAudio.src = src;
    adhanAudio.load();
  }
  adhanAudio.volume = getAdhanVolume();
  adhanAudio.play().then(() => {
    setAdhanPlayState(true);
    showToast(`🔔 حان وقت ${PRAYER_NAMES[prayerName]?.ar || prayerName} — الأذان`);
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`🕌 ${PRAYER_NAMES[prayerName]?.ar || prayerName}`, {
        body: 'حان وقت الصلاة',
        icon: '/favicon.ico',
      });
    }
  }).catch(() => {});
}

/* --------- تنبيه مسبق --------- */
let preAlertTimers = {};
function schedulePreAlert(prayerName, prayerTime) {
  const mins = getAdhanPreAlert();
  if (!mins) return;
  const enabled = getAdhanEnabledPrayers();
  if (!enabled[prayerName]) return;
  clearTimeout(preAlertTimers[prayerName]);
  const diff = prayerTime - Date.now() - mins * 60000;
  if (diff > 0) {
    preAlertTimers[prayerName] = setTimeout(() => {
      showToast(`⏰ ${PRAYER_NAMES[prayerName]?.ar} بعد ${mins} دقيقة`);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`⏰ ${PRAYER_NAMES[prayerName]?.ar}`, {
          body: `الصلاة بعد ${mins} دقيقة`,
        });
      }
    }, diff);
  }
}

/* --------- عرض نص الأذان --------- */
function renderAdhanText() {
  const el = $('adhanTextContent');
  if (!el) return;
  el.innerHTML = ADHAN_TEXT_LINES.map(
    (line) => `<div class="adhan-text-phrase">${line}</div>`
  ).join('');
}

/* --------- تحديث بطاقة الصلاة القادمة في صفحة الأذان --------- */
function updateAdhanNextCard(prayerName, countdown, time24) {
  const nameEl = $('adhanNextName');
  const cdEl = $('adhanCountdown');
  const timeEl = $('adhanNextTime');
  const noData = $('adhanNoData');
  if (!nameEl) return;
  if (!prayerName) {
    nameEl.textContent = '—';
    cdEl.textContent = '--:--:--';
    if (noData) noData.classList.remove('hidden');
    return;
  }
  if (noData) noData.classList.add('hidden');
  nameEl.textContent = `${PRAYER_NAMES[prayerName]?.icon || ''} ${PRAYER_NAMES[prayerName]?.ar || prayerName}`;
  cdEl.textContent = countdown;
  if (timeEl && time24) timeEl.textContent = formatTime12(time24);

  // إظهار شارة الفجر
  const fajrBadge = $('adhanFajrBadge');
  if (fajrBadge) {
    fajrBadge.classList.toggle('hidden', prayerName !== 'Fajr');
  }
  const fajrNote = $('adhanFajrNote');
  if (fajrNote) {
    fajrNote.style.display = prayerName === 'Fajr' ? 'block' : 'none';
  }
}

/* --------- القوائم القابلة للطي --------- */
function initAdhanCollapsibles() {
  const sections = [
    { btn: 'adhanTextToggle', body: 'adhanTextBody', arrow: 'adhanTextArrow' },
    { btn: 'adhanDuaToggle', body: 'adhanDuaBody', arrow: 'adhanDuaArrow' },
    { btn: 'adhanFadlToggle', body: 'adhanFadlBody', arrow: 'adhanFadlArrow' },
  ];
  sections.forEach(({ btn, body, arrow }) => {
    const btnEl = $(btn);
    const bodyEl = $(body);
    const arrowEl = $(arrow);
    if (!btnEl || !bodyEl) return;
    btnEl.addEventListener('click', () => {
      const isOpen = bodyEl.classList.toggle('open');
      if (arrowEl) arrowEl.classList.toggle('open', isOpen);
    });
  });
}

/* --------- إعدادات الأذان --------- */
function renderAdhanPrayerToggles() {
  const enabled = getAdhanEnabledPrayers();
  const container = $('adhanPrayerToggles');
  if (!container) return;
  container.innerHTML = PRAYER_ORDER_MAIN.map((p) => {
    const info = PRAYER_NAMES[p];
    const checked = enabled[p] ? 'checked' : '';
    return `
      <div class="adhan-toggle-row">
        <span class="adhan-toggle-label">${info.icon} ${info.ar}</span>
        <label class="adhan-toggle-switch">
          <input type="checkbox" data-prayer="${p}" ${checked} onchange="toggleAdhanPrayer(this)">
          <span class="adhan-toggle-track"></span>
        </label>
      </div>`;
  }).join('');
}

function toggleAdhanPrayer(el) {
  const s = getAdhanSettings();
  if (!s.enabledPrayers) s.enabledPrayers = getAdhanEnabledPrayers();
  s.enabledPrayers[el.dataset.prayer] = el.checked;
  saveAdhanSettings(s);
}

function updateNotifStatus() {
  const el = $('notifStatusText');
  if (!el || !('Notification' in window)) return;
  const status = { default: '⚪ لم يُحدَّد بعد', granted: '✅ مفعّل', denied: '❌ محظور — فعِّله من إعدادات المتصفح' };
  el.textContent = status[Notification.permission] || '';
}

$('adhanSettingsBtn')?.addEventListener('click', () => {
  renderAdhanPrayerToggles();
  const preaEl = $('adhanPreAlertSelect');
  if (preaEl) preaEl.value = String(getAdhanPreAlert());
  const volEl = $('adhanVolumeSettings');
  if (volEl) volEl.value = String(getAdhanVolume());
  updateNotifStatus();
  $('adhanSettingsOverlay').classList.remove('hidden');
});

$('closeAdhanSettings')?.addEventListener('click', () => {
  $('adhanSettingsOverlay').classList.add('hidden');
});

$('adhanSettingsOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'adhanSettingsOverlay') $('adhanSettingsOverlay').classList.add('hidden');
});

$('adhanPreAlertSelect')?.addEventListener('change', (e) => {
  const s = getAdhanSettings();
  s.preAlert = e.target.value;
  saveAdhanSettings(s);
});

$('adhanVolumeSettings')?.addEventListener('input', (e) => {
  const s = getAdhanSettings();
  s.volume = e.target.value;
  saveAdhanSettings(s);
  adhanAudio.volume = parseFloat(e.target.value);
  const mainVol = $('adhanVolume');
  if (mainVol) mainVol.value = e.target.value;
});

$('requestNotifBtn')?.addEventListener('click', async () => {
  if (!('Notification' in window)) {
    showToast('المتصفح لا يدعم الإشعارات');
    return;
  }
  const perm = await Notification.requestPermission();
  updateNotifStatus();
  showToast(perm === 'granted' ? '✅ تم تفعيل الإشعارات' : 'تعذّر الحصول على الإذن');
});

/* --------- اختيار المؤذن --------- */
$('adhanReciterSelect')?.addEventListener('change', (e) => {
  const s = getAdhanSettings();
  s.reciter = e.target.value;
  saveAdhanSettings(s);
  // أوقف التشغيل الحالي عند تغيير المؤذن
  if (adhanPlaying) { adhanAudio.pause(); setAdhanPlayState(false); }
  adhanAudio.src = '';
});

/* --------- شريط التقدم: الضغط للتخطّي --------- */
$('adhanPlayBtn')?.addEventListener('click', toggleAdhanPlay);

$('adhanProgressBar')?.addEventListener('click', (e) => {
  if (!adhanAudio.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  // الواجهة من اليمين لليسار — بداية الشريط عند حافته اليمنى
  const ratio = (rect.right - e.clientX) / rect.width;
  adhanAudio.currentTime = Math.min(Math.max(ratio, 0), 1) * adhanAudio.duration;
  updateAdhanProgress();
});

/* --------- التهيئة --------- */
function initAdhanPage() {
  const savedReciter = getAdhanReciter();
  const reciterEl = $('adhanReciterSelect');
  if (reciterEl) reciterEl.value = savedReciter;

  const volEl = $('adhanVolume');
  if (volEl) {
    volEl.value = String(getAdhanVolume());
    volEl.addEventListener('input', (e) => {
      adhanAudio.volume = parseFloat(e.target.value);
      const s = getAdhanSettings();
      s.volume = e.target.value;
      saveAdhanSettings(s);
    });
  }

  renderAdhanText();
  initAdhanCollapsibles();

  // استعادة بيانات الصلاة القادمة من آخر حالة محفوظة
  if (lastPrayerData) {
    const tune = getTuneOffsets();
    const timings = {};
    PRAYER_ORDER_ALL.forEach((p) => { timings[p] = addMinutesToTime(lastPrayerData.timings[p], tune[p]); });
    const now = new Date();
    const todaysTimes = PRAYER_ORDER_MAIN.map((p) => {
      const [h, m] = timings[p].split(':').map(Number);
      return { name: p, time: new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m) };
    });
    const next = todaysTimes.find((t) => t.time > now);
    if (next) updateAdhanNextCard(next.name, $('countdown')?.textContent || '--:--:--', timings[next.name]);
  }
}

/* ---------------- التشغيل ---------------- */
loadSurahList();
renderAdhkarCategories();
initAdhanPage();
renderAdiyah();
navigateTo("home");

/* ============================================================
   دعم بيئة أندرويد (Capacitor)
   ============================================================ */
document.addEventListener("backbutton", (e) => {
  e.preventDefault();
  // أولوية الإغلاق: المودالات أولاً، ثم قارئ السورة، ثم تراجع الأقسام
  const modals = [
    "ayahDialogOverlay",
    "settingsOverlay",
    "prayerSettingsOverlay",
    "addAdhkarOverlay",
    "adhanSettingsOverlay",
  ];
  for (const id of modals) {
    const m = $(id);
    if (m && !m.classList.contains("hidden")) {
      m.classList.add("hidden");
      if (id === "ayahDialogOverlay") closeAyahDialog();
      return;
    }
  }
  // إغلاق قارئ السورة
  const readView = $("surahReadView");
  if (readView && !readView.classList.contains("hidden")) {
    goBackToSurahList();
    return;
  }
  // إغلاق قائمة الأذكار
  const adhkarList = $("adhkarListView");
  if (adhkarList && !adhkarList.classList.contains("hidden")) {
    backToAdhkarCategories();
    return;
  }
  // إذا لم نكن في الصفحة الرئيسية، ارجع إليها
  const homePanel = $("home");
  if (homePanel && !homePanel.classList.contains("active")) {
    navigateTo("home");
    return;
  }
  // خروج من التطبيق عبر Capacitor
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.exitApp();
  }
}, false);
