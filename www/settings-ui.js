/* ============================================================
   settings-ui.js — دعم Capacitor + شريط تحديث التطبيق + النسخة الاحتياطية
   ============================================================
   واجهة صفحة الإعدادات فوق السَّت الأصلي: app-updates.js / live-updates.js
   (التحديث الذاتي) وbackup.js (النسخة الاحتياطية). هذا الملف تنسيق العرض
   فقط — المنطق الفعلي في تلك الملفات.
   ============================================================ */
document.addEventListener("backbutton", (e) => {
  e.preventDefault();
  // شيت تحديث الـ APK — لا يُغلق إن كان التحديث إجبارياً
  if (!$("apkUpdateOverlay").classList.contains("hidden")) {
    if (_apkUpdate && _apkUpdate.mandatory) return;
    AppUpdates.dismiss();
    hideApkUpdateSheet();
    return;
  }
  if (!$("reinstallOverlay").classList.contains("hidden")) {
    $("reinstallOverlay").classList.add("hidden");
    return;
  }
  // منتقي السورة / مودال الختمة أولاً
  if (!$("surahPickerOverlay").classList.contains("hidden")) { closeSurahPicker(); return; }
  if (!$("khatmaSetupOverlay").classList.contains("hidden")) { closeKhatmaSetup(); return; }
  // أولوية الإغلاق: المودالات أولاً، ثم قارئ السورة، ثم تراجع الأقسام
  const modals = [
    "ayahDialogOverlay",
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
  // إذا لم نكن في الصفحة الرئيسية، ارجع للسابق
  if (currentTab !== "home") {
    navigateBack();
    return;
  }
  // خروج من التطبيق — عبر AppExitPlugin المحلي (المشروع لا يعتمد @capacitor/app)
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppExit) {
    window.Capacitor.Plugins.AppExit.exit();
  }
}, false);

/* ============================================================================
 * شريط تحديث التطبيق
 * ============================================================================
 * تحديثات الويب تُطبَّق صامتةً (يتكفّل بها app-updates.js ثم يعيد التطبيق
 * تحميل نفسه). أما تحديث الـ APK فلا يمرّ إلا بموافقة المستخدم، وهذا الشريط
 * هو موضع الموافقة.
 * ========================================================================== */

let _apkUpdate = null;

function showApkUpdateSheet(update) {
  if (!update) return;
  _apkUpdate = update;

  const size = update.sizeBytes
    ? `${(update.sizeBytes / 1048576).toFixed(1)} ميجابايت`
    : "";

  $("ausVersionNew").textContent = `النسخة ${update.version}`;
  $("ausVersionOld").textContent = update.installedVersion
    ? `لديك ${update.installedVersion}`
    : "الإصدار الحالي";
  $("ausMandatoryBadge").classList.toggle("hidden", !update.mandatory);

  const notesEl = $("ausNotes");
  if (update.notes && update.notes.trim()) {
    notesEl.textContent = update.notes;
    notesEl.classList.remove("hidden");
  } else {
    notesEl.classList.add("hidden");
  }

  $("ausSize").textContent = size;
  $("ausStatus").textContent = "";
  $("ausProgress").classList.add("hidden");
  $("ausProgressFill").style.width = "0%";
  $("ausInstallBtn").disabled = false;
  $("ausInstallBtn").textContent = update.requiresReinstall ? "التفاصيل" : "تحديث الآن";
  $("ausDismissBtn").classList.toggle("hidden", !!update.mandatory);

  $("apkUpdateOverlay").classList.remove("hidden");
}

function hideApkUpdateSheet() {
  $("apkUpdateOverlay").classList.add("hidden");
  _apkUpdate = null;
}

function showWebUpdatePill(show) {
  const pill = $("webUpdatePill");
  if (pill) pill.classList.toggle("hidden", !show);
}

function initAppUpdates() {
  if (typeof AppUpdates === "undefined" || !AppUpdates.isAvailable()) return;

  // عرض رقم النسخة المثبَّتة في الإعدادات
  const appInfoField = $("appInfoField");
  if (appInfoField) {
    appInfoField.classList.remove("hidden");
    AppUpdates.getInstalled()
      .then(info => {
        if (info && info.versionName && $("installedVersionLabel")) {
          $("installedVersionLabel").textContent = info.versionName;
        }
      })
      .catch(() => {});

    // إصدار محتوى الويب الفعلي المُحمَّل الآن — من البلاجن مباشرة
    // (LiveUpdates.current())، لا من ملف version.json: هذا الملف مُستبعَد
    // عمداً من حزمة أي تحديث ويب (انظر web-release.yml)، فبعد أول تحديث
    // صامت لا يعود موجوداً داخل الحزمة العاملة ويفشل جلبه صامتاً — فيبقى
    // الحقل فارغاً للأبد رغم أن التحديث تم فعلاً.
    if (typeof LiveUpdates !== "undefined" && LiveUpdates.isSupported()) {
      LiveUpdates.current()
        .then(result => {
          let running = result && result.bundle ? result.bundle.version : null;
          if (!running || running === "builtin") running = (result && result.native) || null;
          if (running && $("webVersionLabel")) $("webVersionLabel").textContent = running;
        })
        .catch(() => {});
    } else {
      fetch("version.json", { cache: "no-store" })
        .then(r => r.json())
        .then(manifest => {
          if (manifest && manifest.web && manifest.web.version && $("webVersionLabel")) {
            $("webVersionLabel").textContent = manifest.web.version;
          }
        })
        .catch(() => {});
    }
  }

  // زر «تحقق من التحديثات» في الإعدادات
  const checkBtn = $("checkUpdatesBtn");
  if (checkBtn) {
    checkBtn.addEventListener("click", () => {
      const hint = $("checkUpdatesHint");
      checkBtn.disabled = true;
      if (hint) hint.textContent = "جاري الفحص…";
      AppUpdates.check({ force: true })
        .then(update => {
          checkBtn.disabled = false;
          if (update) {
            if (hint) hint.textContent = `يوجد تحديث — النسخة ${update.version}`;
            showApkUpdateSheet(update);
          } else {
            if (hint) hint.textContent = "التطبيق محدَّث بالكامل ✓";
          }
        })
        .catch(() => {
          checkBtn.disabled = false;
          if ($("checkUpdatesHint")) $("checkUpdatesHint").textContent = "تعذّر الفحص — تحقق من الاتصال";
        });
    });
  }

  // زر «امسح النسخة الحالية وأعد التحميل» — إجباري، لحل حالات بقاء محتوى
  // قديم رغم «تحقق من التحديثات» (مثلاً حزمة عالقة لم تُطبَّق فعلياً).
  // يرجع للحزمة المدمجة في الـ APK ثم يعيد فحص التحديثات فوراً بلا تجاهل
  // فاصل الست ساعات ولا نسخة رفضها المستخدم سابقاً.
  const forceRefreshBtn = $("forceRefreshBtn");
  if (forceRefreshBtn && typeof LiveUpdates !== "undefined" && LiveUpdates.isSupported()) {
    forceRefreshBtn.addEventListener("click", () => {
      const hint = $("forceRefreshHint");
      forceRefreshBtn.disabled = true;
      if (hint) hint.textContent = "جارِ المسح وإعادة التحميل…";
      LiveUpdates.reset()
        .catch(() => {})
        .then(() => AppUpdates.check({ force: true }))
        .then(update => {
          // نجاح تحديث الويب يعيد تحميل التطبيق فوراً ولا يصل الكود هنا.
          // الوصول لهذه النقطة يعني عدم وجود تحديث ويب أحدث من نسخة الـ APK.
          forceRefreshBtn.disabled = false;
          if (update) {
            if (hint) hint.textContent = `يوجد تحديث — النسخة ${update.version}`;
            showApkUpdateSheet(update);
          } else if (hint) {
            hint.textContent = "لا يوجد محتوى أحدث من نسخة التطبيق المثبَّتة.";
          }
        })
        .catch(() => {
          forceRefreshBtn.disabled = false;
          if (hint) hint.textContent = "تعذّر المسح — تحقق من الاتصال";
        });
    });
  } else if (forceRefreshBtn) {
    forceRefreshBtn.classList.add("hidden");
    if ($("forceRefreshHint")) $("forceRefreshHint").classList.add("hidden");
  }

  // «تحديث الآن» داخل النافذة
  $("ausInstallBtn").addEventListener("click", () => {
    const pending = _apkUpdate || AppUpdates.getPending();
    if (pending && pending.requiresReinstall) {
      hideApkUpdateSheet();
      openReinstallFlow(pending);
      return;
    }
    $("ausInstallBtn").disabled = true;
    $("ausStatus").textContent = "جارٍ التنزيل…";
    $("ausProgress").classList.remove("hidden");
    AppUpdates.install();
  });

  // «لاحقاً»
  $("ausDismissBtn").addEventListener("click", () => {
    AppUpdates.dismiss();
    hideApkUpdateSheet();
  });

  // إغلاق بالضغط على الخلفية — إلا في التحديثات الإجبارية
  $("apkUpdateOverlay").addEventListener("click", e => {
    if (e.target !== $("apkUpdateOverlay")) return;
    if (_apkUpdate && _apkUpdate.mandatory) return;
    AppUpdates.dismiss();
    hideApkUpdateSheet();
  });

  AppUpdates.on((event, data) => {
    if (event === "downloadProgress") {
      const pct = data.percent || 0;
      $("ausProgressFill").style.width = `${pct}%`;
      $("ausStatus").textContent = `جارٍ التنزيل… ${pct}%`;
    } else if (event === "downloadFailed") {
      $("ausInstallBtn").disabled = false;
      $("ausProgress").classList.add("hidden");
      $("ausStatus").textContent = "تعذّر التنزيل — جرّب مرة أخرى";
      showToast("تعذّر تنزيل التحديث");
    } else if (event === "installPermissionDenied") {
      $("ausInstallBtn").disabled = false;
      $("ausProgress").classList.add("hidden");
      $("ausStatus").textContent = "يحتاج إذن التثبيت";
      showToast("لتثبيت التحديث، اسمح بتثبيت التطبيقات غير المعروفة");
    } else if (event === "webUpdateStarted") {
      showWebUpdatePill(true);
    } else if (event === "webUpdateFailed") {
      showWebUpdatePill(false);
    }
  });

  // الفحص بعد إقلاع الواجهة
  setTimeout(() => {
    AppUpdates.check().then(showApkUpdateSheet).catch(() => {});
  }, 2500);

  // فحص دوري كل ٣ دقائق طوال بقاء التطبيق مفتوحاً — force:true يتجاوز فاصل
  // الست ساعات الافتراضي (المصمَّم أصلاً لفتحة تطبيق عادية واحدة، لا لجلسة
  // طويلة) حتى يلتقط تحديثات الويب الصامتة بسرعة دون انتظار إعادة فتح التطبيق.
  const UPDATE_POLL_MS = 3 * 60 * 1000;
  setInterval(() => {
    AppUpdates.check({ force: true }).then(showApkUpdateSheet).catch(() => {});
  }, UPDATE_POLL_MS);
}

initAppUpdates();

/* ============================================================================
 * مشاركة التطبيق
 * ============================================================================
 * داخل التطبيق الأصلي: يشارك ملف آخر إصدار (APK) عبر ورقة مشاركة النظام —
 * الملف المنزَّل مسبقاً إن وُجد، وإلا يُنزَّل الأحدث من GitHub ثم يُشارَك.
 * في المتصفح/PWA: يشارك (أو ينسخ) رابط تنزيل آخر إصدار.
 * ========================================================================== */
// مشاركة رابط آخر إصدار — للمتصفح، وكحلٍّ بديل لو تعذّرت مشاركة الملف الأصلية
async function shareAppLink() {
  let url = "https://github.com/tahershawki1/noor/releases/latest";
  try {
    const m = await fetch("version.json", { cache: "no-store" }).then((r) => r.json());
    if (m && m.app && m.app.apkUrl) url = m.app.apkUrl;
  } catch (_) { /* نكتفي برابط آخر إصدار */ }
  const shareData = {
    title: "تطبيق نور",
    text: "تطبيق نور — القرآن الكريم والأذكار ومواقيت الصلاة",
    url,
  };
  if (navigator.share) {
    return navigator.share(shareData).catch(() => {});
  }
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(url).then(
      () => showToast("تم نسخ رابط التطبيق"),
      () => showToast(url)
    );
  }
  showToast(url);
}

function initShareApp() {
  const btn = $("shareAppBtn");
  if (!btn) return;
  const hint = $("shareAppHint");
  const defaultHint = hint ? hint.textContent : "";
  const native = typeof AppUpdates !== "undefined" && AppUpdates.isAvailable();

  if (!native) {
    // متصفح/PWA: لا ملف نصل إليه — نشارك رابط آخر إصدار
    if (hint) hint.textContent = "يشارك رابط تنزيل آخر إصدار من التطبيق.";
    btn.addEventListener("click", shareAppLink);
    return;
  }

  let sharing = false;

  AppUpdates.on((event, data) => {
    if (!sharing) return;
    if (event === "shareProgress") {
      const pct = data.percent || 0;
      if (hint) hint.textContent = pct < 100 ? `جارٍ تجهيز الملف… ${pct}%` : "جارٍ فتح المشاركة…";
    }
  });

  btn.addEventListener("click", () => {
    if (sharing) return;
    sharing = true;
    btn.disabled = true;
    if (hint) hint.textContent = "جارٍ تجهيز الملف…";
    AppUpdates.shareApp().then((res) => {
      sharing = false;
      btn.disabled = false;
      if (hint) hint.textContent = defaultHint;
      if (res && res.shared) return;
      // لا ملف محلي وبلا إنترنت — نبلّغ؛ وأي فشل آخر (منها نسخة APK قديمة لا
      // تعرف المشاركة الأصلية) نتراجع فيه لمشاركة الرابط حتى يعمل الزر دائماً
      if (res && res.reason === "NO_APK") {
        showToast("تعذّر تجهيز الملف — سنشارك الرابط بدلاً منه");
      }
      shareAppLink();
    }).catch(() => {
      sharing = false;
      btn.disabled = false;
      if (hint) hint.textContent = defaultHint;
      shareAppLink();
    });
  });
}

initShareApp();

/* ============================================================================
 * إصدار واجهة الويب — يظهر دائماً في المتصفح، مخفي داخل التطبيق الأصلي
 * ========================================================================== */
(function initWebVersionDisplay() {
  const field = $("webVersionField");
  if (!field) return;
  // داخل التطبيق الأصلي، appInfoField يعرض الإصدار بالفعل
  if (typeof AppUpdates !== "undefined" && AppUpdates.isAvailable()) {
    field.classList.add("hidden");
    return;
  }
  fetch("version.json", { cache: "no-store" })
    .then(r => r.json())
    .then(manifest => {
      const label = $("webVersionLabelWeb");
      if (label && manifest && manifest.web && manifest.web.version) {
        label.textContent = manifest.web.version;
      }
    })
    .catch(() => {});
})();

/* ============================================================================
 * النسخة الاحتياطية
 * ============================================================================
 * تُحفظ تلقائياً (backup.js يتكفّل بذلك)، وهذا القسم للتحكّم اليدوي وعرض الحالة.
 * ========================================================================== */

function refreshBackupStatus() {
  const field = $("backupField");
  if (!field || typeof NoorBackup === "undefined" || !NoorBackup.isAvailable()) return;
  field.classList.remove("hidden");

  const lastSaved = NoorBackup.getLastSaved();
  const dot = $("backupDot");
  const text = $("backupStatusText");
  if (lastSaved) {
    dot.className = "backup-dot ok";
    text.textContent = `آخر نسخة: ${formatRelativeTime(new Date(lastSaved).getTime())}`;
  } else {
    dot.className = "backup-dot warn";
    text.textContent = "لم تُحفظ نسخة بعد";
  }
}

function initBackup() {
  if (typeof NoorBackup === "undefined" || !NoorBackup.isAvailable()) return;

  $("backupSaveBtn").addEventListener("click", async () => {
    const result = await NoorBackup.save({ force: true });
    showToast(result.saved ? "تم حفظ النسخة ✓" : "تعذّر الحفظ — جرّب «تصدير إلى…»");
    refreshBackupStatus();
  });

  $("backupExportBtn").addEventListener("click", async () => {
    const result = await NoorBackup.exportManually();
    if (result.saved) showToast("تم التصدير ✓");
  });

  $("backupRestoreBtn").addEventListener("click", async () => {
    const result = await NoorBackup.restoreFromPicker();
    if (result.restored) {
      showToast(`تم استرجاع ${result.itemCount} عنصر — سيُعاد التحميل`);
      setTimeout(() => location.reload(), 1200);
    } else if (result.reason !== "CANCELLED") {
      showToast(result.reason === "INVALID_FILE" ? "الملف غير صالح" : "تعذّر الاسترجاع");
    }
  });

  // تثبيت جديد وبياناته فارغة: نعرض الاسترجاع بدل أن يبدأ المستخدم من الصفر
  if (NoorBackup.looksEmpty()) {
    NoorBackup.restoreAuto().then((result) => {
      if (result.restored) {
        showToast(`تم استرجاع بياناتك (${result.itemCount} عنصر)`);
        setTimeout(() => location.reload(), 1200);
      }
    });
  }
}

/* ============================================================================
 * تحديث يتطلّب حذف النسخة القديمة
 * ============================================================================ */

let reinstallTarget = null;

function openReinstallFlow(update) {
  reinstallTarget = update;
  $("reinstallLead").textContent =
    `النسخة ${update.version} موقّعة بمفتاح مختلف عن النسخة المثبّتة، وأندرويد لا يسمح ` +
    `بتثبيتها فوقها. لذلك لا بد من حذف القديمة أولاً — وحذفها يمسح بياناتك، فنحفظها الآن.`;
  $("reinstallStep1").className = "reinstall-step active";
  $("reinstallStep2").className = "reinstall-step";
  $("reinstallStep3").className = "reinstall-step";
  $("reinstallStartBtn").classList.remove("hidden");
  $("reinstallStartBtn").disabled = false;
  $("reinstallUninstallBtn").classList.add("hidden");
  $("reinstallProgress").classList.add("hidden");
  $("reinstallOverlay").classList.remove("hidden");
}

function initReinstallFlow() {
  if (typeof AppUpdates === "undefined" || !AppUpdates.isAvailable()) return;

  $("closeReinstall").addEventListener("click", () =>
    $("reinstallOverlay").classList.add("hidden"));

  $("reinstallStartBtn").addEventListener("click", async () => {
    $("reinstallStartBtn").disabled = true;
    $("reinstallProgress").classList.remove("hidden");

    const result = await AppUpdates.prepareReinstall(reinstallTarget);

    if (!result.ready) {
      $("reinstallStartBtn").disabled = false;
      $("reinstallStep1Note").textContent =
        result.reason === "BACKUP_FAILED"
          ? "تعذّر حفظ النسخة — جرّب «تصدير إلى…» من الإعدادات أولاً"
          : "تعذّر التجهيز — حاول مرة أخرى";
      showToast("لم نكمل: بياناتك لم تُحفظ بعد");
      return;
    }
    // الحفظ نجح والتنزيل بدأ؛ بقية التقدّم تصل عبر أحداث AppUpdates
    $("reinstallStep1").className = "reinstall-step done";
    $("reinstallStep2").className = "reinstall-step active";
  });

  $("reinstallUninstallBtn").addEventListener("click", () => AppUpdates.uninstall());

  AppUpdates.on((event, data) => {
    if (event === "backupReady") {
      $("reinstallStep1Note").textContent = "حُفظت في: " + (data.location || "المستندات/Noor");
    } else if (event === "downloadProgress" && reinstallTarget) {
      $("reinstallProgressFill").style.width = `${data.percent || 0}%`;
      $("reinstallStep2Note").textContent = `جارٍ التنزيل… ${data.percent || 0}%`;
      if ((data.percent || 0) >= 100) {
        $("reinstallStep2").className = "reinstall-step done";
        $("reinstallStep3").className = "reinstall-step active";
        $("reinstallStartBtn").classList.add("hidden");
        $("reinstallUninstallBtn").classList.remove("hidden");
        $("reinstallHint").textContent =
          "بعد الحذف، افتح مجلد التنزيلات وثبّت الملف. ثم: الإعدادات ← النسخة الاحتياطية ← «استرجاع من ملف».";
      }
    }
  });
}

initBackup();
initReinstallFlow();

/* ============================================================================
 * الصوتيات المحملة للاستماع دون إنترنت
 * ============================================================================
 * التنزيل نفسه فعليّ من زر أعلى صفحة قراءة السورة (quran-reader.js) — هذا
 * القسم لعرض حجم ما تجمّع ومسحه. انظر quran-audio-offline.js.
 * ========================================================================== */

function formatAudioSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

async function refreshOfflineAudioStatus() {
  const field = $("offlineAudioField");
  if (!field || typeof QuranAudioOffline === "undefined") return;
  field.classList.remove("hidden");

  const { count, bytes } = await QuranAudioOffline.getOfflineAudioStats();
  $("offlineAudioStatusText").textContent =
    count > 0
      ? `${arabicCountLabel(count, "آية واحدة", "آيتان", "آيات", "آية")} محمّلة (${formatAudioSize(bytes)})`
      : "لا توجد صوتيات محمّلة";
  $("offlineAudioClearBtn").disabled = count === 0;
}

function initOfflineAudio() {
  if (typeof QuranAudioOffline === "undefined") return;

  $("offlineAudioClearBtn").addEventListener("click", async () => {
    await QuranAudioOffline.clearOfflineAudio();
    showToast("تم مسح كل الصوتيات المحملة");
    refreshOfflineAudioStatus();
    if (typeof currentSurah === "number" && currentSurah && !$("surahReadView").classList.contains("hidden")) {
      const surah = QuranData.getSurah(currentSurah);
      if (surah) updateDownloadSurahBtn(surah.number, surah.ayahs.length);
    }
  });
}

initOfflineAudio();
