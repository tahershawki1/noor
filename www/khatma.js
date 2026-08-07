/* ============================================================
   khatma.js — ختمة القرآن الكريم
   ============================================================
   يستخدم محرك القراءة من quran-reader.js (openSurah) لفتح قارئ الختمة —
   لا يعيد تعريفه، فأي تحسين على القارئ ينعكس هنا تلقائياً.
   ============================================================ */
const QURAN_TOTAL_PAGES = 604;
const KHATMA_KEY = "khatmaList";

/* أسماء ختمات مقترحة مشجّعة — يتشاركها مودال الختمة وشاشة الدخول الأول. */
const KHATMA_NAME_SUGGESTIONS = [
  "ختمة رمضان",
  "ختمتي الأولى",
  "على خطى الحبيب ﷺ",
  "ختمة الوالدين",
  "وردي اليومي",
  "ختمة الشفاء",
];

/** يبني شرائح اقتراح الأسماء داخل عنصر، وكل شريحة تملأ حقل الاسم المحدَّد. */
function renderKhatmaNameChips(containerId, inputId) {
  const box = $(containerId);
  if (!box) return;
  box.innerHTML = KHATMA_NAME_SUGGESTIONS
    .map(n => `<button type="button" class="khatma-name-chip m3-ripple" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`)
    .join("");
  box.querySelectorAll(".khatma-name-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const input = $(inputId);
      if (input) { input.value = chip.dataset.name; input.focus(); }
    });
  });
}

function getKhatmas() {
  try { return JSON.parse(localStorage.getItem(KHATMA_KEY)) || []; }
  catch (_) { return []; }
}
function saveKhatmas(list) { localStorage.setItem(KHATMA_KEY, JSON.stringify(list)); }

/** ينشئ ختمة جديدة ويحفظها — يتشاركه مودال الختمة وشاشة الدخول الأول. */
function createKhatma(name, dailyPages) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const khatmas = getKhatmas();
  khatmas.push({
    id: Date.now(),
    name: (name || "").trim() || "ختمة القرآن",
    startDate: today,
    dailyPages,
    pagesRead: 0,
  });
  saveKhatmas(khatmas);
}

function khatmaDaysElapsed(k) {
  const msDay = 86400000;
  // startDate مخزَّنة "YYYY-MM-DD" بتوقيت محلي (localDateStamp) — نبنيها من
  // مكوّناتها مباشرة، لا عبر new Date(string) التي تُفسَّر كـ UTC وتزيح
  // التاريخ المحلي يوماً كاملاً لمن يقيم غرب غرينتش.
  const [y, m, d] = k.startDate.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((today - start) / msDay) + 1);
}

function khatmaExpectedPages(k) {
  return Math.min(khatmaDaysElapsed(k) * k.dailyPages, QURAN_TOTAL_PAGES);
}

function khatmaStatus(k) {
  if (k.pagesRead >= QURAN_TOTAL_PAGES) return "done";
  const exp = khatmaExpectedPages(k);
  if (k.pagesRead >= exp) return "ahead";
  if (k.pagesRead >= exp * 0.85) return "ontrack";
  return "behind";
}

const KSTATUS_LABEL = { ahead: "متقدم", ontrack: "في الموعد", behind: "متأخر", done: "مكتملة ✓" };
const KSTATUS_COLOR = { ahead: "#34C77B", ontrack: "#E6BE7B", behind: "#F2726B", done: "#34C77B" };

function khatmaRingOffset(progress, circ) {
  return (circ * (1 - Math.min(1, Math.max(0, progress)))).toFixed(1);
}

function getSurahForPage(pageNumber) {
  const list = QuranData.getSurahs();
  if (!list.length) return 1;
  let result = 1;
  for (const s of list) {
    if (QuranData.pageOf(s.first) <= pageNumber) result = s.n;
    else break;
  }
  return result;
}

/* ---- عرض قسم الختمة ---- */
function renderKhatmaSection() {
  const khatmas = getKhatmas();
  const C = 175.9; // circumference for r=28
  if (!khatmas.length) {
    $("khatmaEmptyView").classList.remove("hidden");
    $("khatmaListView").classList.add("hidden");
    return;
  }
  $("khatmaEmptyView").classList.add("hidden");
  $("khatmaListView").classList.remove("hidden");
  $("khatmaList").innerHTML = khatmas.map(k => {
    const pct = Math.round(k.pagesRead / QURAN_TOTAL_PAGES * 100);
    const remaining = QURAN_TOTAL_PAGES - k.pagesRead;
    const status = khatmaStatus(k);
    const color = KSTATUS_COLOR[status];
    const offset = khatmaRingOffset(k.pagesRead / QURAN_TOTAL_PAGES, C);
    const elapsed = khatmaDaysElapsed(k);
    const dailyRound = Math.round(k.dailyPages * 10) / 10;
    return `
      <div class="khatma-card" onclick="openKhatmaReader(${k.id})">
        <div class="kring-wrap">
          <svg viewBox="0 0 68 68">
            <circle class="kring-track" cx="34" cy="34" r="28"/>
            <circle class="kring-fill" cx="34" cy="34" r="28"
              stroke="${color}" stroke-dasharray="${C}" stroke-dashoffset="${offset}"/>
          </svg>
          <div class="kring-center">
            <span class="kring-pct">${toArabicNum(pct)}%</span>
            <span class="kring-lbl">مكتمل</span>
          </div>
        </div>
        <div class="khatma-card-info">
          <div class="khatma-card-name">${escapeHtml(k.name || "ختمة القرآن")}</div>
          <div class="khatma-card-meta">منذ ${toArabicNum(arabicCountLabel(elapsed, "يوم واحد", "يومين", "أيام", "يوماً"))} • ${toArabicNum(dailyRound)} ص/يوم</div>
          <div class="khatma-card-remaining">${toArabicNum(remaining)} صفحة متبقية</div>
          <span class="khatma-status-badge kstatus-${status}">${KSTATUS_LABEL[status]}</span>
        </div>
        <button class="khatma-card-del" onclick="deleteKhatma(${k.id}, event)" aria-label="حذف">
          ${icon("trash")}
        </button>
      </div>`;
  }).join("");
}

/* ---- مودال إنشاء ختمة ---- */
let khatmaTabMode = "days";

function openKhatmaSetup() {
  $("khatmaSetupOverlay").classList.remove("hidden");
  if ($("khatmaNameInput")) $("khatmaNameInput").value = "";
  renderKhatmaNameChips("khatmaNameChips", "khatmaNameInput");
  updateKhatmaCalcs();
}
function closeKhatmaSetup() { $("khatmaSetupOverlay").classList.add("hidden"); }

function switchKhatmaTab(tab) {
  khatmaTabMode = tab;
  $("khatmaTabDays").classList.toggle("active", tab === "days");
  $("khatmaTabPages").classList.toggle("active", tab === "pages");
  $("khatmaDaysPanel").classList.toggle("hidden", tab !== "days");
  $("khatmaPagesPanel").classList.toggle("hidden", tab !== "pages");
  updateKhatmaCalcs();
}

function updateKhatmaCalcs() {
  if (khatmaTabMode === "days") {
    const days = Math.max(1, parseInt($("khatmaDaysInput").value) || 30);
    $("khatmaDailyCalc").textContent = toArabicNum((QURAN_TOTAL_PAGES / days).toFixed(1));
  } else {
    const pages = Math.max(1, parseInt($("khatmaPagesInput").value) || 20);
    $("khatmaDurationCalc").textContent = toArabicNum(Math.ceil(QURAN_TOTAL_PAGES / pages));
  }
}

function confirmKhatmaSetup() {
  let dailyPages;
  if (khatmaTabMode === "days") {
    const days = Math.max(1, parseInt($("khatmaDaysInput").value) || 30);
    dailyPages = QURAN_TOTAL_PAGES / days;
  } else {
    dailyPages = Math.max(1, parseInt($("khatmaPagesInput").value) || 20);
  }
  const name = ($("khatmaNameInput")?.value || "").trim();
  createKhatma(name, dailyPages);
  closeKhatmaSetup();
  renderKhatmaSection();
  showToast("بدأت ختمة جديدة — بالتوفيق!");
}

function deleteKhatma(id, event) {
  event.stopPropagation();
  saveKhatmas(getKhatmas().filter(k => k.id !== id));
  renderKhatmaSection();
  showToast("تم حذف الختمة");
}

$("closeKhatmaSetup").addEventListener("click", closeKhatmaSetup);
$("khatmaSetupOverlay").addEventListener("click", e => {
  if (e.target.id === "khatmaSetupOverlay") closeKhatmaSetup();
});
$("khatmaConfirmBtn").addEventListener("click", confirmKhatmaSetup);
$("khatmaDaysInput").addEventListener("input", updateKhatmaCalcs);
$("khatmaPagesInput").addEventListener("input", updateKhatmaCalcs);

/* ---- وضع قارئ الختمة ---- */
let activeKhatmaId = null;

function openKhatmaReader(khatmaId) {
  const khatma = getKhatmas().find(k => k.id === khatmaId);
  if (!khatma) return;
  activeKhatmaId = khatmaId;
  readerReturnTab = "khatma";
  navigatingBack = true;
  // قارئ الختمة مصحف متصل: السورة التالية تُلحق تلقائياً بلوحة اسمها
  // الزخرفية بدل أن ينتهي النص عند آخر آية (quran-reader.js)
  setContinuousMode(true);
  navigateTo("quran");
  QuranData.loadMeta().then(() => {
    // lastSurah/lastAyah هو الموضع الدقيق الذي توقّفنا عنده فعلياً (يُحدَّث في
    // updateReaderProgress أثناء القراءة) — أدقّ من pagesRead التي تعطي فقط
    // أول آية في الصفحة، لا الآية التي وصلنا إليها فعلاً داخلها.
    if (khatma.lastSurah) {
      openSurah(khatma.lastSurah, khatma.lastAyah || 1);
      return;
    }
    // ختمة قديمة من قبل تسجيل lastSurah/lastAyah — نرجع لحساب أول آية بالصفحة
    const startPage = Math.max(1, khatma.pagesRead);
    const surahNumber = getSurahForPage(startPage);
    const surahMeta = QuranData.getSurahMeta(surahNumber);
    const firstAyahId = QuranData.firstAyahOfPage(startPage);
    const ayahInSurah = Math.max(1, firstAyahId - surahMeta.first + 1);
    openSurah(surahNumber, ayahInSurah);
  });
}

function hideKhatmaWidget() {
  if (!$("khatmaWidget")) return;
  $("khatmaWidget").classList.add("hidden");
  document.documentElement.style.setProperty("--khatma-bar-h", "0px");
  activeKhatmaId = null;
}

function updateKhatmaWidget() {
  if (activeKhatmaId === null) return;
  const khatma = getKhatmas().find(k => k.id === activeKhatmaId);
  if (!khatma) { hideKhatmaWidget(); return; }
  const C = 125.7; // circumference for r=20 in 52px ring
  const days = khatmaDaysElapsed(khatma);
  const pagesYest = Math.max(0, (days - 1) * khatma.dailyPages);
  const todayRead = Math.max(0, khatma.pagesRead - pagesYest);
  const todayProg = Math.min(1, todayRead / khatma.dailyPages);
  const status = khatmaStatus(khatma);
  const color = KSTATUS_COLOR[status];
  $("kwidgetFill").setAttribute("stroke", color);
  $("kwidgetFill").setAttribute("stroke-dashoffset", khatmaRingOffset(todayProg, C));
  $("kwidgetTodayText").textContent =
    `${toArabicNum(Math.round(todayRead))}/${toArabicNum(Math.ceil(khatma.dailyPages))}`;
  $("kwidgetRemaining").textContent = toArabicNum(QURAN_TOTAL_PAGES - khatma.pagesRead);
  $("kwidgetPercent").textContent = `${toArabicNum(Math.round(khatma.pagesRead / QURAN_TOTAL_PAGES * 100))}%`;
  const badge = $("kwidgetBadge");
  badge.className = `kwidget-badge kstatus-${status}`;
  badge.textContent = KSTATUS_LABEL[status];
  $("khatmaWidget").classList.remove("hidden");
  // نقيس ارتفاعه الفعلي بعد الرسم (بدل رقم ثابت مخمَّن) لنحجز له مساحة
  // مطابقة أسفل ayah-container فلا يغطّي آخر آيات معروضة.
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty("--khatma-bar-h", `${$("khatmaWidget").offsetHeight}px`);
  });
}

/**
 * أقصى قفزة أمامية تُحسب قراءةً متصلة. القارئ يسجّل أي صفحة تظهر على الشاشة،
 * ومنتقي السورة متاح داخل قارئ الختمة — فبدون هذا الحد، القفز لسورة الناس
 * (صفحة ٦٠٤) كان يُعلّم الختمة كلها مقروءة في لمسة واحدة.
 */
const KHATMA_MAX_PAGE_JUMP = 5;

function updateKhatmaPageProgress(currentPage) {
  if (activeKhatmaId === null) return;
  const khatmas = getKhatmas();
  const idx = khatmas.findIndex(k => k.id === activeKhatmaId);
  if (idx === -1) return;
  const read = khatmas[idx].pagesRead;
  if (currentPage > read && currentPage - read <= KHATMA_MAX_PAGE_JUMP) {
    khatmas[idx].pagesRead = currentPage;
    saveKhatmas(khatmas);
    updateKhatmaWidget();
  }
}

/** يسجّل الآية الدقيقة الظاهرة الآن — بلا قيد اتجاه، فهي موضع "آخر ما وصلنا
 *  إليه" للعودة إليه بالضبط، لا مقياس تقدّم كـ pagesRead. */
function updateKhatmaLastPosition(surahNumber, ayahNumber) {
  if (activeKhatmaId === null) return;
  const khatmas = getKhatmas();
  const idx = khatmas.findIndex(k => k.id === activeKhatmaId);
  if (idx === -1) return;
  khatmas[idx].lastSurah = surahNumber;
  khatmas[idx].lastAyah = ayahNumber;
  saveKhatmas(khatmas);
}
