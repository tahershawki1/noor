/* ============================================================
   quran-reader.js — صفحة القرآن الكريم: القائمة، البحث، القارئ
   ============================================================
   محرك القراءة هنا (renderSurah/openSurah/updateReaderProgress) هو
   المالك الوحيد لعرض النص — khatma.js يستدعيه بنفسه لفتح قارئ الختمة،
   فأي ميزة تُضاف هنا (تمرير تلقائي، مراقبة نظرة، خط...) تظهر في الاثنين
   معاً تلقائياً دون أي عمل إضافي.
   ============================================================ */

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

/** يحوّل الأرقام العربية الهندية والفارسية إلى لاتينية ليقبل البحث "١٨" و"۱۸" و"18". */
function toLatinDigits(text) {
  return String(text)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
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

/** يفلتر قائمة السور بنص بحث حر (اسم أو رقم). */
function filterSurahs(raw) {
  const query = normalizeArabic(raw);
  const digits = toLatinDigits(raw);
  return surahs.filter((s) => {
    if (/^\d+$/.test(digits) && s.n === Number(digits)) return true;
    return surahSearchKeys(s).some((key) => key && key.includes(query));
  });
}

/**
 * بعض لوحات مفاتيح أندرويد (تنبؤ النص) لا تُطلق أحداث input/compositionupdate
 * فعلياً مع كل حرف — النص يظهر في الحقل بصرياً لكن الحدث لا يصل حتى مسافة أو
 * حذف حرف. لا حل موثوق عبر الأحداث وحدها، فنراقب el.value مباشرة كل ١٢٠ms
 * أثناء التركيز على الحقل — هذا يعمل دائماً بصرف النظر عن أي حدث يُطلَق.
 */
function watchSearchInput(el, onChange) {
  let lastValue = el.value;
  let timer = null;
  const poll = () => {
    if (el.value !== lastValue) {
      lastValue = el.value;
      onChange(el.value);
    }
  };
  el.addEventListener("focus", () => { if (!timer) timer = setInterval(poll, 120); });
  el.addEventListener("blur", () => { clearInterval(timer); timer = null; });
}

function handleSurahSearchInput(e) {
  const raw = e.target.value.trim();
  renderSurahList(raw ? filterSurahs(raw) : surahs);
}
$("surahSearch").addEventListener("input", handleSurahSearchInput);
$("surahSearch").addEventListener("compositionupdate", handleSurahSearchInput);
watchSearchInput($("surahSearch"), (value) => {
  const raw = value.trim();
  renderSurahList(raw ? filterSurahs(raw) : surahs);
});

async function openSurah(number, ayahToHighlight = null, landAtEnd = false) {
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
    // التنقّل التلقائي للسورة السابقة (بالتمرير الزائد عند بداية السورة)
    // يفتحها عند نهايتها، استمراراً طبيعياً للقراءة العكسية
    if (landAtEnd) $("ayahContainer").scrollTop = $("ayahContainer").scrollHeight;
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
// خط "أميري قرآن" حُذف من القائمة: نسخة الخط المتاحة تنقصها رمز التنوين
// (U+065E) ومواضع الألف الخنجرية فوق العين مكسورة في OpenType الخاص بها،
// فيظهر التشكيل مشوَّهاً في كلمات شائعة جداً مثل "الرحمن" و"العالمين".
const QURAN_FONT_DEFAULT = "scheherazade";
const QURAN_FONTS = {
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
  const resolvedKey = key in QURAN_FONTS ? key : QURAN_FONT_DEFAULT;
  document.documentElement.style.setProperty("--font-quran", QURAN_FONTS[resolvedKey]);
  localStorage.setItem("quranFont", resolvedKey);
  $("fontSelect").value = resolvedKey;
}

function applyQuranFontSize(size) {
  const clamped = Math.min(QURAN_FONT_SIZE_MAX, Math.max(QURAN_FONT_SIZE_MIN, size));
  document.documentElement.style.setProperty("--quran-font-size", `${clamped}rem`);
  localStorage.setItem("quranFontSize", clamped);
  $("fontSizeLabel").textContent = `${Math.round((clamped / QURAN_FONT_SIZE_BASE) * 100)}%`;
  return clamped;
}

let quranFontSize = parseFloat(localStorage.getItem("quranFontSize")) || QURAN_FONT_SIZE_BASE;
applyQuranFont(localStorage.getItem("quranFont") || QURAN_FONT_DEFAULT);
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
  if (typeof refreshBackupStatus === "function") refreshBackupStatus();
  if (typeof refreshOfflineAudioStatus === "function") refreshOfflineAudioStatus();
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
  // شيت تحديث الـ APK لا يُغلق إن كان التحديث إجبارياً
  if (!$("apkUpdateOverlay").classList.contains("hidden")) {
    if (typeof _apkUpdate !== "undefined" && _apkUpdate && _apkUpdate.mandatory) return;
    if (typeof AppUpdates !== "undefined") AppUpdates.dismiss();
    $("apkUpdateOverlay").classList.add("hidden");
    return;
  }
  if (!$("reinstallOverlay").classList.contains("hidden")) { $("reinstallOverlay").classList.add("hidden"); return; }
  if (!$("surahPickerOverlay").classList.contains("hidden")) { closeSurahPicker(); return; }
  if (!$("khatmaSetupOverlay").classList.contains("hidden")) { closeKhatmaSetup(); return; }
  if (!$("settingsOverlay").classList.contains("hidden")) { closeSettingsModal(); return; }
  if (!$("prayerSettingsOverlay").classList.contains("hidden")) { closePrayerSettingsModal(); return; }
  if (!$("addAdhkarOverlay").classList.contains("hidden")) { closeAddAdhkarModal(); return; }
  if (!$("ayahDialogOverlay").classList.contains("hidden")) { closeAyahDialog(); return; }
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

  updateDownloadSurahBtn(surah.number, surah.ayahs.length);
}

/* --------- تنزيل السورة للاستماع دون إنترنت (QuranAudioOffline) --------- */
async function updateDownloadSurahBtn(surahNumber, ayahCount) {
  const btn = $("downloadSurahBtn");
  if (typeof QuranAudioOffline === "undefined") {
    btn.classList.add("hidden");
    return;
  }
  btn.classList.remove("hidden", "downloading", "downloaded");
  btn.dataset.surah = surahNumber;
  btn.dataset.ayahCount = ayahCount;
  const cached = await QuranAudioOffline.isSurahFullyCached(surahNumber, ayahCount);
  btn.classList.toggle("downloaded", cached);
  btn.innerHTML = cached ? icon("check") : icon("download");
  const label = cached ? "السورة محمّلة للاستماع دون إنترنت" : "تنزيل السورة للاستماع دون إنترنت";
  btn.setAttribute("aria-label", label);
  btn.title = label;
}

$("downloadSurahBtn").addEventListener("click", async () => {
  const btn = $("downloadSurahBtn");
  if (btn.classList.contains("downloaded") || btn.classList.contains("downloading")) {
    if (btn.classList.contains("downloaded")) showToast("السورة محمّلة بالفعل للاستماع دون إنترنت");
    return;
  }
  const surahNumber = Number(btn.dataset.surah);
  const ayahCount = Number(btn.dataset.ayahCount);
  if (!surahNumber || !ayahCount) return;

  btn.classList.add("downloading");
  showToast("جارِ تنزيل السورة للاستماع دون إنترنت...");
  try {
    const { failed } = await QuranAudioOffline.downloadSurah(surahNumber, ayahCount, (done, total) => {
      btn.setAttribute("aria-label", `جارِ التنزيل… ${done}/${total}`);
    });
    btn.classList.remove("downloading");
    if (failed > 0) {
      showToast(`تم التنزيل مع تعذّر ${failed} آية — تحقق من الاتصال وأعد المحاولة`);
      updateDownloadSurahBtn(surahNumber, ayahCount);
    } else {
      btn.classList.add("downloaded");
      btn.innerHTML = icon("check");
      btn.setAttribute("aria-label", "السورة محمّلة للاستماع دون إنترنت");
      showToast("تم تنزيل السورة للاستماع دون إنترنت");
    }
  } catch (e) {
    btn.classList.remove("downloading");
    showToast("تعذّر تنزيل السورة — تحقق من الاتصال بالإنترنت");
  }
});

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
  // ملاحظة: activeKhatmaId/updateKhatmaPageProgress معرَّفان في khatma.js
  // (يُحمَّل بعد هذا الملف) — آمن لأن الاستدعاء الفعلي يحدث وقت التمرير
  // بعد اكتمال تحميل كل السكربتات، لا وقت تحميل هذا الملف نفسه.
  if (activeKhatmaId !== null) {
    updateKhatmaPageProgress(page);
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

/* --------- تنقّل بين السور بالتمرير: شدّ إضافي بعد الحافة --------- */
// الوصول لنهاية السورة والاستمرار في التمرير لأسفل ← السورة التالية (من أولها)
// الوصول لبداية السورة والاستمرار في التمرير لأعلى ← السورة السابقة (من آخرها)
const SURAH_OVERSCROLL_PX = 140;
let surahOverscrollAccum = 0;
let surahOverscrollDir = 0; // 1 = أسفل (تالية)، -1 = أعلى (سابقة)
let surahNavigating = false;

function isAtContainerBottom() {
  const el = $("ayahContainer");
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
}
function isAtContainerTop() {
  return $("ayahContainer").scrollTop <= 2;
}
function resetSurahOverscroll() {
  surahOverscrollAccum = 0;
  surahOverscrollDir = 0;
}

async function goToAdjacentSurah(direction) {
  if (surahNavigating || !currentSurah) return;
  const target = currentSurah + direction;
  if (target < 1 || target > 114) return;
  surahNavigating = true;
  resetSurahOverscroll();
  await openSurah(target, null, direction < 0);
  surahNavigating = false;
}

$("ayahContainer").addEventListener(
  "wheel",
  (e) => {
    if (surahNavigating) return;
    if (e.deltaY > 0 && isAtContainerBottom()) {
      if (surahOverscrollDir !== 1) { surahOverscrollDir = 1; surahOverscrollAccum = 0; }
      surahOverscrollAccum += e.deltaY;
      if (surahOverscrollAccum > SURAH_OVERSCROLL_PX) goToAdjacentSurah(1);
    } else if (e.deltaY < 0 && isAtContainerTop()) {
      if (surahOverscrollDir !== -1) { surahOverscrollDir = -1; surahOverscrollAccum = 0; }
      surahOverscrollAccum += -e.deltaY;
      if (surahOverscrollAccum > SURAH_OVERSCROLL_PX) goToAdjacentSurah(-1);
    } else {
      resetSurahOverscroll();
    }
  },
  { passive: true }
);

let surahTouchStartY = null;
$("ayahContainer").addEventListener(
  "touchstart",
  (e) => {
    if (e.touches.length !== 1) return;
    surahTouchStartY = e.touches[0].clientY;
    resetSurahOverscroll();
  },
  { passive: true }
);
$("ayahContainer").addEventListener(
  "touchmove",
  (e) => {
    if (surahNavigating || surahTouchStartY === null || e.touches.length !== 1) return;
    const y = e.touches[0].clientY;
    const delta = surahTouchStartY - y; // موجب = سحب الإصبع لأعلى (نية تمرير لأسفل)
    if (delta > 0 && isAtContainerBottom()) {
      if (surahOverscrollDir !== 1) { surahOverscrollDir = 1; surahOverscrollAccum = 0; surahTouchStartY = y; return; }
      surahOverscrollAccum = delta;
      if (surahOverscrollAccum > SURAH_OVERSCROLL_PX) goToAdjacentSurah(1);
    } else if (delta < 0 && isAtContainerTop()) {
      if (surahOverscrollDir !== -1) { surahOverscrollDir = -1; surahOverscrollAccum = 0; surahTouchStartY = y; return; }
      surahOverscrollAccum = -delta;
      if (surahOverscrollAccum > SURAH_OVERSCROLL_PX) goToAdjacentSurah(-1);
    } else {
      resetSurahOverscroll();
    }
  },
  { passive: true }
);
$("ayahContainer").addEventListener("touchend", () => {
  surahTouchStartY = null;
  resetSurahOverscroll();
});

/* --------- ضغطة قصيرة = معلومات سريعة، ضغطة طويلة = قائمة الإجراءات --------- */
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
    if (navigator.vibrate) navigator.vibrate(35);
    openAyahDialog(span);
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
  // انتهت الضغطة قبل اكتمال مؤقّت الضغط الطويل (ولم تُلغَ بالسحب) = ضغطة قصيرة عادية
  if (pressTimer && pressSpan) showAyahQuickInfo(pressSpan);
  clearPress();
});
["pointercancel", "pointerleave"].forEach((evt) =>
  ayahContainerEl.addEventListener(evt, clearPress)
);

ayahContainerEl.addEventListener("contextmenu", (e) => {
  if (e.target.closest(".ayah-span")) e.preventDefault();
});

/** ضغطة قصيرة: توست سفلي بموضع الآية — السورة/رقمها من إجمالي آيات السورة/الجزء/الحزب. */
function showAyahQuickInfo(span) {
  const ayahNum = parseInt(span.dataset.ayah, 10);
  const meta = QuranData.getSurahMeta(currentSurah);
  const total = meta ? meta.ayahs : "";
  const juz = parseInt(span.dataset.juz, 10);
  const globalQuarter = parseInt(span.dataset.hizbQuarter, 10);
  const hizb = Math.ceil(globalQuarter / 4);
  // موضع الآية داخل الحزب: البداية بلا كسر، وإلا ربع/نصف/ثلاثة أرباع كرمز صغير مضغوط
  const quarterInHizb = ((globalQuarter - 1) % 4) + 1;
  const fraction = ["", " ¼", " ½", " ¾"][quarterInHizb - 1];
  const text =
    `سورة ${currentSurahName} — آية ${toArabicNum(ayahNum)} من ${toArabicNum(total)} ` +
    `• الجزء ${toArabicNum(juz)} • الحزب ${toArabicNum(hizb)}${fraction}`;
  showToast(text, { wide: true, duration: 3800 });
}

/* --------- قائمة إجراءات الآية (ضغطة طويلة) --------- */
let currentDialogAyah = null;

function openAyahDialog(span) {
  const ayahNum = parseInt(span.dataset.ayah, 10);
  currentDialogAyah = { surah: currentSurah, ayah: ayahNum, span };
  $("ayahDialogTitle").textContent = `${currentSurahName} — الآية ${toArabicNum(ayahNum)}`;
  $("ayahTafsirBox").classList.add("hidden");
  $("ayahTafsirBox").innerHTML = "";
  updateFavoriteBtnLabel();
  $("ayahDialogOverlay").classList.remove("hidden");
}

function updateFavoriteBtnLabel() {
  const isSaved = currentDialogAyah.span.classList.contains("bookmarked");
  $("ayahFavoriteBtn").innerHTML = isSaved
    ? `${icon("check")} علامة موضوعة — إزالة`
    : `${icon("bookmark")} علامة توقف القراءة`;
  $("ayahFavoriteBtn").classList.toggle("favorited", isSaved);
}

function closeAyahDialog() {
  $("ayahDialogOverlay").classList.add("hidden");
}

$("closeAyahDialog").addEventListener("click", closeAyahDialog);
$("ayahDialogOverlay").addEventListener("click", (e) => {
  if (e.target.id === "ayahDialogOverlay") closeAyahDialog();
});

/* --------- مشغّل تلاوة متسلسل — يخدم الأزرار الثلاثة: آية / سورة / صفحة --------- */
let playQueue = [];
let playIndex = -1;
let playLabel = "";
let playHighlightSpan = null;
let lastAyahObjectUrl = null; // آخر blob URL أُنشئ لآية مخزَّنة محلياً — يُحرَّر عند تبديله

function releaseLastAyahObjectUrl() {
  if (lastAyahObjectUrl) {
    URL.revokeObjectURL(lastAyahObjectUrl);
    lastAyahObjectUrl = null;
  }
}

/** يفضّل النسخة المحلية المُنزَّلة (QuranAudioOffline) إن وُجدت، ثم يبثّ أونلاين. */
function resolveAyahAudioUrl(surah, ayah) {
  const streamUrl = () =>
    `https://everyayah.com/data/Alafasy_128kbps/${String(surah).padStart(3, "0")}${String(ayah).padStart(3, "0")}.mp3`;
  if (typeof QuranAudioOffline === "undefined") {
    return Promise.resolve(navigator.onLine === false ? null : streamUrl());
  }
  return QuranAudioOffline.getCachedAyahObjectUrl(surah, ayah).then(
    (cached) => cached || (navigator.onLine === false ? null : streamUrl())
  );
}

function highlightPlayingAyah(item) {
  if (playHighlightSpan) playHighlightSpan.classList.remove("highlighted");
  playHighlightSpan = null;
  if (item.surah !== currentSurah) return; // آية من سورة مجاورة غير معروضة حالياً (تشغيل صفحة يمتد بين سورتين)
  const span = $(`ayah-${item.ayahNumberInSurah}`);
  if (!span) return;
  span.classList.add("highlighted");
  span.scrollIntoView({ behavior: "smooth", block: "center" });
  playHighlightSpan = span;
}

function updateQueuePlayerBar() {
  $("qpLabel").textContent =
    playQueue.length > 1
      ? `${playLabel} — ${toArabicNum(playIndex + 1)}/${toArabicNum(playQueue.length)}`
      : playLabel;
}

function showQueuePlayerBar() {
  $("queuePlayerBar").classList.remove("hidden");
  const use = $("qpToggle").querySelector("use");
  if (use) use.setAttribute("href", "#i-pause");
}

function stopAyahQueue() {
  const wasPlaying = playQueue.length > 0;
  playQueue = [];
  playIndex = -1;
  $("ayahAudioPlayer").pause();
  releaseLastAyahObjectUrl();
  if (playHighlightSpan) {
    playHighlightSpan.classList.remove("highlighted");
    playHighlightSpan = null;
  }
  if (wasPlaying) $("queuePlayerBar").classList.add("hidden");
}

async function playQueueStep() {
  if (playIndex < 0 || playIndex >= playQueue.length) {
    stopAyahQueue();
    return;
  }
  const item = playQueue[playIndex];
  const stepQueueRef = playQueue; // للتأكد إن التشغيل لم يُوقَف أثناء انتظار resolveAyahAudioUrl
  updateQueuePlayerBar();
  highlightPlayingAyah(item);
  const url = await resolveAyahAudioUrl(item.surah, item.ayahNumberInSurah);
  if (stepQueueRef !== playQueue) return; // أُوقِفت القائمة أثناء الانتظار
  if (!url) {
    showToast("تعذّر تشغيل بعض الآيات — تحقق من الاتصال بالإنترنت");
    playIndex++;
    playQueueStep();
    return;
  }
  releaseLastAyahObjectUrl();
  if (url.startsWith("blob:")) lastAyahObjectUrl = url;
  const audio = $("ayahAudioPlayer");
  audio.src = url;
  audio.play().catch(() => {
    playIndex++;
    playQueueStep();
  });
}

function startAyahQueue(queue, label) {
  stopAyahQueue();
  if (!queue.length) {
    showToast("تعذّر تجهيز قائمة التشغيل");
    return;
  }
  if (typeof AutoScroll !== "undefined") AutoScroll.hide();
  playQueue = queue;
  playIndex = 0;
  playLabel = label;
  showQueuePlayerBar();
  playQueueStep();
}

$("ayahAudioPlayer").addEventListener("ended", () => {
  if (!playQueue.length) return;
  playIndex++;
  playQueueStep();
});

$("qpToggle").addEventListener("click", () => {
  const audio = $("ayahAudioPlayer");
  const use = $("qpToggle").querySelector("use");
  if (audio.paused) {
    audio.play();
    if (use) use.setAttribute("href", "#i-pause");
  } else {
    audio.pause();
    if (use) use.setAttribute("href", "#i-play");
  }
});
$("qpClose").addEventListener("click", stopAyahQueue);

$("ayahListenBtn").addEventListener("click", () => {
  const { surah, ayah } = currentDialogAyah;
  closeAyahDialog();
  startAyahQueue([{ surah, ayahNumberInSurah: ayah }], `آية ${toArabicNum(ayah)}`);
});

$("ayahListenSurahBtn").addEventListener("click", () => {
  const { surah } = currentDialogAyah;
  closeAyahDialog();
  const meta = QuranData.getSurahMeta(surah);
  if (!meta) return;
  const queue = [];
  for (let i = 1; i <= meta.ayahs; i++) queue.push({ surah, ayahNumberInSurah: i });
  startAyahQueue(queue, meta.name);
});

$("ayahListenPageBtn").addEventListener("click", () => {
  const { span } = currentDialogAyah;
  const page = parseInt(span.dataset.page, 10);
  closeAyahDialog();
  const queue = QuranData.getAyahsOnPage(page).map((a) => ({
    surah: a.surah,
    ayahNumberInSurah: a.ayahNumberInSurah,
  }));
  startAyahQueue(queue, `صفحة ${toArabicNum(page)}`);
});

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
  if (typeof AutoScroll !== "undefined") AutoScroll.hide();
  stopAyahQueue();
  $("surahReadView").classList.add("hidden");
  hideKhatmaWidget();
  const shouldRestoreList = readerReturnTab === "quran";
  // exitReaderHeaderMode() يستدعي navigateTo() داخلياً، الذي يصفّر
  // mainContent.scrollTop دائماً — فلا بد أن يسبق أي تمرير نضبطه نحن، وإلا
  // يُلغى فوراً بعده.
  exitReaderHeaderMode();
  if (shouldRestoreList) {
    // نص بحث قديم قد يخفي السورة المفتوحة عن القائمة — نعيد القائمة كاملة
    // حتى نضمن وجود بطاقتها لنمرّر إليها.
    $("surahSearch").value = "";
    renderSurahList(surahs);
    $("surahListView").classList.remove("hidden");
    renderResumeCard();
    const card = document.querySelector(`.surah-card[onclick="openSurah(${currentSurah})"]`);
    if (card) card.scrollIntoView({ block: "center" });
  }
}

/* ============================================================
   منتقي السورة — يظهر في وضع القراءة عند النقر على اسم السورة
   ============================================================ */
$("surahNavBtn").addEventListener("click", () => {
  if (!$("appShell").classList.contains("reading")) return;
  openSurahPicker();
});

function openSurahPicker() {
  renderSurahPickerList(surahs);
  $("surahPickerSearch").value = "";
  $("surahPickerOverlay").classList.remove("hidden");
  setTimeout(() => $("surahPickerSearch").focus(), 150);
}

function closeSurahPicker() {
  $("surahPickerOverlay").classList.add("hidden");
}

function renderSurahPickerList(list) {
  $("surahPickerList").innerHTML = list.map(s =>
    `<div class="surah-card" onclick="pickSurah(${s.n})">
      <div class="surah-number"><span>${s.n}</span></div>
      <div class="surah-card-info">
        <div class="surah-card-name">${s.name}</div>
        <div class="surah-card-meta">${s.type} • ${toArabicNum(s.ayahs)} آية</div>
      </div>
    </div>`
  ).join("");
}

function pickSurah(number) {
  closeSurahPicker();
  openSurah(number);
}

$("closeSurahPicker").addEventListener("click", closeSurahPicker);
function handleSurahPickerSearchInput(e) {
  const raw = e.target.value.trim();
  renderSurahPickerList(raw ? filterSurahs(raw) : surahs);
}
$("surahPickerSearch").addEventListener("input", handleSurahPickerSearchInput);
$("surahPickerSearch").addEventListener("compositionupdate", handleSurahPickerSearchInput);
watchSearchInput($("surahPickerSearch"), (value) => {
  const raw = value.trim();
  renderSurahPickerList(raw ? filterSurahs(raw) : surahs);
});
