/* ============================================================
   onboarding.js — شاشة الدخول الأول (لمرة واحدة)
   ============================================================
   ٣ شرائح متتابعة مع تخطّي: الموقع + طريقة الحساب، ثم إعدادات الأذان،
   ثم بدء ختمة. لا يكرّر منطقاً موجوداً — يعيد استعمال دوال المواقيت
   (fetchPrayerTimesByCoords/loadCities/findCity/computeAndStorePrayerTimes)
   وإعدادات الأذان (saveAdhanSettings/setAdhanSilent) وإنشاء الختمة
   (createKhatma). يُحمَّل آخر السكربتات ويعرض نفسه فوق الرئيسية إن لزم.
   ============================================================ */

const ONBOARDING_KEY = "noorOnboardingDone";
const OB_STEPS = 3;
let obStep = 0;

function isOnboardingDone() {
  return localStorage.getItem(ONBOARDING_KEY) === "1";
}

/* ---- عرض الشرائح والتنقّل ---- */

function obRender() {
  document.querySelectorAll(".ob-slide").forEach((s) => {
    s.classList.toggle("active", Number(s.dataset.step) === obStep);
  });
  document.querySelectorAll("#obDots .ob-dot").forEach((d, i) => {
    d.classList.toggle("active", i === obStep);
  });
  const back = $("obBack");
  const next = $("obNext");
  if (back) back.style.visibility = obStep === 0 ? "hidden" : "visible";
  if (next) next.textContent = obStep === OB_STEPS - 1 ? "ابدأ الختمة" : "التالي";
  // زر «تخطّي» العلوي يبقى ظاهراً في كل الخطوات (الختمة اختيارية بالكامل)
  $("onboardingOverlay").scrollTop = 0;
}

function obNext() {
  if (obStep === OB_STEPS - 1) {
    obCreateKhatmaFromInputs();
    finishOnboarding();
    return;
  }
  obStep++;
  obRender();
}

function obBack() {
  if (obStep > 0) { obStep--; obRender(); }
}

function showOnboarding() {
  const ov = $("onboardingOverlay");
  if (!ov) return;
  obStep = 0;
  obPopulate();
  ov.classList.remove("hidden");
  ov.setAttribute("aria-hidden", "false");
  obRender();
}

function finishOnboarding() {
  localStorage.setItem(ONBOARDING_KEY, "1");
  const ov = $("onboardingOverlay");
  if (ov) {
    ov.classList.add("hidden");
    ov.setAttribute("aria-hidden", "true");
  }
  if (typeof AdhanNative !== "undefined") AdhanNative.sync();
  if (typeof PrayerWidget !== "undefined") PrayerWidget.refresh();
}

/* ---- تعبئة القيم الحالية عند العرض ---- */

function obPopulate() {
  const method = $("obCalcMethod");
  if (method && typeof getPrayerMethod === "function") method.value = getPrayerMethod();
  obRefreshPermStatus();

  const reciter = $("obReciter");
  if (reciter && typeof getAdhanReciter === "function") reciter.value = getAdhanReciter();
  const pre = $("obPreAlert");
  if (pre && typeof getAdhanPreAlert === "function") pre.value = String(getAdhanPreAlert());

  const silent = typeof getAdhanSilent === "function" ? getAdhanSilent() : { enabled: false, delay: 0, duration: 15 };
  if ($("obSilentToggle")) $("obSilentToggle").checked = silent.enabled;
  if ($("obSilentDelay")) $("obSilentDelay").value = String(silent.delay);
  if ($("obSilentDuration")) $("obSilentDuration").value = String(silent.duration);
  obToggleSilentOptions(silent.enabled);
  obUpdateDndBtn();

  if (typeof renderKhatmaNameChips === "function") renderKhatmaNameChips("obKhatmaChips", "obKhatmaName");
}

/* ---- شريحة ١: الموقع وطريقة الحساب ---- */

function obUpdateLocationStatus(text) {
  const el = $("obLocationStatus");
  if (el) el.textContent = text;
}

function obApplyMethod() {
  const el = $("obCalcMethod");
  if (!el) return;
  localStorage.setItem("prayerMethod", el.value);
  // لو الموقع محدَّد سلفاً أعد الحساب بالطريقة الجديدة
  if (localStorage.getItem("prayerSource") && typeof retryPrayerFetch === "function") {
    retryPrayerFetch(false);
  }
}

async function obUseGeo() {
  if (!navigator.geolocation) {
    obUpdateLocationStatus("المتصفح لا يدعم تحديد الموقع — اكتب مدينتك");
    return;
  }
  obUpdateLocationStatus("جارِ طلب صلاحية الموقع...");
  // في الغلاف الأصلي: بلا صلاحية الموقع يفشل getCurrentPosition بصمت
  const allowed = await ensureLocationPermission();
  obRefreshPermStatus();
  if (!allowed) {
    obUpdateLocationStatus("صلاحية الموقع مرفوضة — فعّلها من الإعدادات أو اكتب مدينتك");
    return;
  }
  obUpdateLocationStatus("جارِ تحديد موقعك...");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      fetchPrayerTimesByCoords(pos.coords.latitude, pos.coords.longitude);
      obUpdateLocationStatus("تم تحديد موقعك تلقائياً ✓");
    },
    () => obUpdateLocationStatus("تعذّر تحديد الموقع — اكتب اسم مدينتك"),
    { timeout: 10000 }
  );
}

/**
 * يعرض حالة صلاحية الموقع في شريحة الموقع: «✓ مفعّلة» أو زر «امنح الصلاحية».
 * يُنادى عند فتح الأونبوردنج وبعد كل محاولة طلب. في المتصفح يخفي الصف كله.
 */
async function obRefreshPermStatus() {
  const row = $("obLocationPerm");
  if (!row) return;
  if (!NativePerms.isAvailable()) { row.classList.add("hidden"); return; }
  row.classList.remove("hidden");
  const label = $("obLocationPermLabel");
  const btn = $("obLocationPermBtn");
  const st = await NativePerms.check();
  const granted = !!(st && st.location);
  if (label) label.textContent = granted ? "صلاحية الموقع: مفعّلة ✓" : "صلاحية الموقع: غير مفعّلة";
  row.classList.toggle("ob-perm-ok", granted);
  if (btn) btn.classList.toggle("hidden", granted);
}

async function obCityGo() {
  const city = ($("obCityInput")?.value || "").trim();
  const country = ($("obCountryInput")?.value || "").trim();
  if (!city) { obUpdateLocationStatus("اكتب اسم المدينة أولاً"); return; }
  obUpdateLocationStatus("جارِ البحث...");
  try {
    const cities = await loadCities();
    const match = findCity(cities, city, country);
    if (!match) {
      obUpdateLocationStatus("لم نجد هذه المدينة — جرّب أقرب مدينة كبيرة أو زر تحديد الموقع");
      return;
    }
    localStorage.setItem("prayerSource", "city");
    localStorage.setItem("prayerCity", JSON.stringify({ city, country }));
    localStorage.removeItem("prayerCoords");
    const label = `${match.a || match.n}${match.c ? "، " + (COUNTRY_NAMES_AR[match.c] || match.c) : ""}`;
    computeAndStorePrayerTimes(match.y, match.x, label);
    obUpdateLocationStatus(`تم: ${label} ✓`);
  } catch (_) {
    obUpdateLocationStatus("تعذّر البحث — جرّب زر تحديد الموقع");
  }
}

/* ---- شريحة ٢: الأذان ---- */

function obToggleSilentOptions(on) {
  const opts = $("obSilentOptions");
  if (opts) opts.style.display = on ? "" : "none";
}

function obUpdateDndBtn() {
  const btn = $("obSilentDndBtn");
  if (!btn) return;
  const enabled = $("obSilentToggle")?.checked;
  if (!enabled || typeof AdhanNative === "undefined" || !AdhanNative.isAvailable()) {
    btn.classList.add("hidden");
    return;
  }
  AdhanNative.hasDndAccess().then((r) => btn.classList.toggle("hidden", !!(r && r.granted)));
}

/* ---- شريحة ٣: الختمة ---- */

function obCreateKhatmaFromInputs() {
  if (typeof createKhatma !== "function") return;
  const days = Math.max(1, parseInt($("obKhatmaDays")?.value, 10) || 30);
  const name = $("obKhatmaName")?.value || "";
  createKhatma(name, QURAN_TOTAL_PAGES / days);
  if (typeof renderKhatmaSection === "function") renderKhatmaSection();
  showToast("بدأت ختمة جديدة — بالتوفيق!");
}

/* ---- ربط الأحداث ---- */

$("obNext")?.addEventListener("click", obNext);
$("obBack")?.addEventListener("click", obBack);
$("obSkipAll")?.addEventListener("click", finishOnboarding);

$("obUseGeo")?.addEventListener("click", obUseGeo);
$("obLocationPermBtn")?.addEventListener("click", async () => {
  obUpdateLocationStatus("جارِ طلب صلاحية الموقع...");
  await ensureLocationPermission();
  await obRefreshPermStatus();
  const st = await NativePerms.check();
  obUpdateLocationStatus(st && st.location ? "تم منح صلاحية الموقع ✓" : "لم تُمنح — يمكنك تفعيلها من إعدادات النظام");
});
$("obCityGo")?.addEventListener("click", obCityGo);
$("obCountryInput")?.addEventListener("keydown", (e) => e.key === "Enter" && obCityGo());
$("obCalcMethod")?.addEventListener("change", obApplyMethod);

$("obReciter")?.addEventListener("change", (e) => {
  const s = getAdhanSettings();
  s.reciter = e.target.value;
  saveAdhanSettings(s);
});
$("obPreAlert")?.addEventListener("change", (e) => {
  const s = getAdhanSettings();
  s.preAlert = e.target.value;
  saveAdhanSettings(s);
  AdhanNative.sync();
});
$("obSilentToggle")?.addEventListener("change", (e) => {
  setAdhanSilent({ enabled: e.target.checked });
  obToggleSilentOptions(e.target.checked);
  if (e.target.checked && typeof AdhanNative !== "undefined" && AdhanNative.isAvailable()) {
    AdhanNative.hasDndAccess().then((r) => {
      if (!(r && r.granted)) {
        showToast("امنح إذن «عدم الإزعاج» ليعمل الكتم");
        AdhanNative.requestDndAccess();
      }
    });
  }
  obUpdateDndBtn();
});
$("obSilentDelay")?.addEventListener("change", (e) => setAdhanSilent({ delay: parseInt(e.target.value, 10) }));
$("obSilentDuration")?.addEventListener("change", (e) => setAdhanSilent({ duration: parseInt(e.target.value, 10) }));
$("obSilentDndBtn")?.addEventListener("click", () => AdhanNative.requestDndAccess());

/* ---- الإقلاع: اعرض الشاشة إن كانت أول مرة ---- */
if (!isOnboardingDone()) {
  showOnboarding();
}
