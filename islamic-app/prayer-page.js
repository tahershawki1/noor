/* ============================================================
   prayer-page.js — واجهة صفحة مواقيت الصلاة
   ============================================================
   حاسب المواقيت الفلكي في prayer-times.js (ملف مختلف تماماً) — هذا الملف
   طبقة العرض فوقه: البحث بالموقع/المدينة، شريط الصلاة القادمة، التصحيح
   اليدوي، وودجت الشاشة الرئيسية.
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
  if (!hhmm || hhmm === '--:--') return '--:--';
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
    try {
      const c = JSON.parse(localStorage.getItem("prayerCoords"));
      if (!c) throw new Error();
      fetchPrayerTimesByCoords(c.lat, c.lng).then(() => showFeedback && showToast("تم تحديث المواقيت ✓"));
    } catch (_) {
      localStorage.removeItem("prayerCoords");
      if (showFeedback) showToast("حدد موقعك أولاً");
    }
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
  // تُصفَّى الأوقات الغائبة (null أو '--:--') — تحدث في خطوط العرض العالية (فجر/عشاء صيفاً)
  const todaysTimes = PRAYER_ORDER_MAIN
    .filter((p) => timings[p] && timings[p] !== '--:--')
    .map((p) => {
      const [h, m] = timings[p].split(":").map(Number);
      return { name: p, time: new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m) };
    });

  let next = todaysTimes.find((t) => t.time > now);
  let prev;
  if (next) {
    const idx = todaysTimes.indexOf(next);
    prev = idx > 0 ? todaysTimes[idx - 1] : null;
  } else {
    // لا صلاة قادمة اليوم — نأخذ أول صلاة متاحة غداً (قد يغيب الفجر في القطبين)
    const firstAvailable = PRAYER_ORDER_MAIN.find((p) => timings[p] && timings[p] !== '--:--');
    if (firstAvailable) {
      const [h, m] = timings[firstAvailable].split(":").map(Number);
      next = { name: firstAvailable, time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m) };
    }
    prev = todaysTimes.length > 0 ? todaysTimes[todaysTimes.length - 1] : null;
  }
  if (!prev) {
    const ishaTime = timings.Isha;
    if (ishaTime && ishaTime !== '--:--') {
      const [h, m] = ishaTime.split(":").map(Number);
      prev = { name: "Isha", time: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, h, m) };
    }
  }

  $("prayerTimesList").innerHTML = PRAYER_ORDER_ALL.map((p) => {
    const info = PRAYER_NAMES[p];
    const isNext = next && next.name === p;
    const offset = tune[p] || 0;
    const tuneBadge = offset !== 0 ? `<span class="prayer-tune-badge">${offset > 0 ? "+" : ""}${offset}د</span>` : "";
    return `
      <div class="prayer-row ${isNext ? "current" : ""}">
        <span class="prayer-name">${isNext ? '<span class="current-badge">التالية</span>' : ""}${info.icon} ${info.ar}</span>
        <span class="prayer-time-wrap">${tuneBadge}<span class="prayer-time">${formatTime12(timings[p])}</span></span>
      </div>`;
  }).join("");

  if (!next) {
    $("nextPrayerCard").classList.add("hidden");
    clearInterval(countdownTimer);
    return;
  }

  $("nextPrayerCard").classList.remove("hidden");
  $("nextPrayerName").textContent = PRAYER_NAMES[next.name].ar;

  renderHomePrayerWidget(timings, next.name);

  clearInterval(countdownTimer);
  const totalSpan = prev ? next.time - prev.time : 0;

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
  if (!hhmm || hhmm === '--:--') return '—';
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
    try {
      const { lat, lng } = JSON.parse(coords);
      fetchPrayerTimesByCoords(lat, lng);
    } catch (_) { localStorage.removeItem("prayerCoords"); }
  } else if (city) {
    try {
      const c = JSON.parse(city);
      $("cityInput").value = c.city;
      $("countryInput").value = c.country || "";
      fetchPrayerTimesByCity();
    } catch (_) { localStorage.removeItem("prayerCity"); }
  }
})();
