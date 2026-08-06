/* ============================================================
   adhan-page.js — صفحة الأذان
   ============================================================ */

/**
 * ملفات الأذان مستضافة ذاتياً في islamic-app/audio/adhan (تُنشر عبر GitHub
 * Pages مثل تلاوة Opus). Pages يرسل ترويسات CORS فنستطيع تخزين الملف في
 * Cache API بعد أول تشغيل — بعدها يعمل الأذان دون إنترنت. islamcan.com يبقى
 * بثاً احتياطياً فقط (بلا CORS فلا يُخزَّن).
 */
const ADHAN_AUDIO_BASE = 'https://tahershawki1.github.io/noor/audio/adhan/';
const ADHAN_FALLBACK_BASE = 'https://www.islamcan.com/audio/adhan/';
const ADHAN_CACHE_NAME = 'noor-adhan-audio';

const ADHAN_AUDIO_SOURCES = {
  alafasy: { name: 'مشاري العفاسي', file: 'azan1.mp3' },
  makkah: { name: 'أذان الحرم المكي', file: 'azan2.mp3' },
  madinah: { name: 'أذان المسجد النبوي', file: 'azan3.mp3' },
  egypt: { name: 'أذان مصري كلاسيكي', file: 'azan4.mp3' },
};

let adhanObjectUrl = null; // blob URL الحالي — يُحرَّر عند تبديله
function releaseAdhanObjectUrl() {
  if (adhanObjectUrl) {
    URL.revokeObjectURL(adhanObjectUrl);
    adhanObjectUrl = null;
  }
}

/** كاش أولاً، وإلا تنزيل وتخزين، وإلا بث مباشر من المصدر الاحتياطي. */
async function resolveAdhanAudioUrl(reciter) {
  const source = ADHAN_AUDIO_SOURCES[reciter];
  if (!source) return null;
  const url = ADHAN_AUDIO_BASE + source.file;
  if (typeof caches === 'undefined') return url;
  try {
    const cache = await caches.open(ADHAN_CACHE_NAME);
    let res = await cache.match(url);
    if (!res) {
      res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await cache.put(url, res.clone());
    }
    const blob = await res.blob();
    releaseAdhanObjectUrl();
    adhanObjectUrl = URL.createObjectURL(blob);
    return adhanObjectUrl;
  } catch (e) {
    return navigator.onLine === false ? null : ADHAN_FALLBACK_BASE + source.file;
  }
}

/** يجهّز عنصر الصوت للمؤذن المطلوب — true عند النجاح. */
let adhanLoadedReciter = null;
async function loadAdhanAudio(reciter) {
  if (adhanLoadedReciter === reciter && adhanAudio.src) return true;
  const url = await resolveAdhanAudioUrl(reciter);
  if (!url) return false;
  adhanAudio.src = url;
  adhanAudio.load();
  adhanLoadedReciter = reciter;
  return true;
}

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

/* --------- الجسر إلى إشعارات الأذان الأصلية (AdhanPlugin.java) ---------
   داخل الغلاف الأصلي، منبّه نظام (AlarmManager) يعرض إشعاراً بصوت الأذان
   الكامل حتى والتطبيق مغلق. في المتصفح plugin = null وكل الدوال بلا أثر. */
const AdhanNative = (() => {
  const cap = window.Capacitor;
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  let plugin = null;
  if (isNative && cap.registerPlugin) plugin = cap.registerPlugin('AdhanNative');
  else if (isNative && cap.Plugins) plugin = cap.Plugins.AdhanNative;
  return {
    isAvailable: () => !!plugin,
    /** يدفع الصلوات المفعّلة والتنبيه المسبق للطبقة الأصلية ويعيد جدولة المنبّه. */
    sync() {
      if (!plugin) return Promise.resolve(null);
      return plugin.sync({
        enabledPrayers: getAdhanEnabledPrayers(),
        preAlertMinutes: getAdhanPreAlert(),
      }).catch(() => null);
    },
    getStatus() {
      if (!plugin) return Promise.resolve(null);
      return plugin.getStatus().catch(() => null);
    },
    requestPermission() {
      if (!plugin) return Promise.resolve(null);
      return plugin.requestNotificationPermission().catch(() => null);
    },
  };
})();

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

async function toggleAdhanPlay() {
  if (adhanPlaying) {
    adhanAudio.pause();
    setAdhanPlayState(false);
    return;
  }

  const reciter = $('adhanReciterSelect')?.value || getAdhanReciter();
  const loaded = await loadAdhanAudio(reciter);
  if (!loaded) { showToast('تعذّر تشغيل الأذان — تأكد من الاتصال بالإنترنت'); return; }

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
async function autoPlayAdhanForPrayer(prayerName) {
  // داخل التطبيق الأصلي، إشعار النظام (بصوت الأذان الكامل) هو المصدر الوحيد
  // للتشغيل التلقائي — تشغيل ثانٍ هنا كان سيُسمِع أذانين متداخلين.
  if (AdhanNative.isAvailable()) return;
  const enabled = getAdhanEnabledPrayers();
  if (!enabled[prayerName]) return;

  const loaded = await loadAdhanAudio(getAdhanReciter());
  if (!loaded) return;

  adhanAudio.volume = getAdhanVolume();
  adhanAudio.play().then(() => {
    setAdhanPlayState(true);
    showToast(`🔔 حان وقت ${PRAYER_NAMES[prayerName]?.ar || prayerName} — الأذان`);
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`🕌 ${PRAYER_NAMES[prayerName]?.ar || prayerName}`, {
        body: 'حان وقت الصلاة',
        // مسار نسبي: التطبيق يُنشر تحت مسار فرعي على GitHub Pages، و'/favicon.ico'
        // المطلق كان يشير خارج نطاقه فلا يوجد أصلاً
        icon: 'icons/icon-192.png',
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
  AdhanNative.sync();
}

async function updateNotifStatus() {
  const el = $('notifStatusText');
  if (!el) return;
  // داخل التطبيق الأصلي: الحالة من النظام لا من Web Notification API
  // (غير المدعومة في WebView أندرويد أصلاً)
  if (AdhanNative.isAvailable()) {
    const s = await AdhanNative.getStatus();
    if (!s) { el.textContent = ''; return; }
    el.textContent = s.notificationsEnabled
      ? '✅ مفعّلة — إشعار الأذان يصلك حتى والتطبيق مغلق'
      : '❌ غير مفعّلة — اضغط الزر أعلاه للسماح بالإشعارات';
    return;
  }
  if (!('Notification' in window)) {
    el.textContent = 'المتصفح لا يدعم الإشعارات';
    return;
  }
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
  AdhanNative.sync();
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
  if (AdhanNative.isAvailable()) {
    const s = await AdhanNative.requestPermission();
    updateNotifStatus();
    showToast(s && s.notificationsEnabled
      ? '✅ تم تفعيل الإشعارات — الأذان سيصلك والتطبيق مغلق'
      : 'الإشعارات محظورة — فعِّلها من إعدادات النظام لتطبيق نور');
    AdhanNative.sync();
    return;
  }
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
  adhanLoadedReciter = null;
  releaseAdhanObjectUrl();
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

  // داخل التطبيق الأصلي: صحّح نص التلميح (الأذان يعمل والتطبيق مغلق)،
  // وادفع الإعدادات الحالية للطبقة الأصلية ليُضبط منبّه أول صلاة فوراً
  if (AdhanNative.isAvailable()) {
    const hint = $('adhanAutoHint');
    if (hint) hint.textContent = 'يصلك إشعار بصوت الأذان الكامل حتى والتطبيق مغلق';
    AdhanNative.sync();
  }

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

/* ============================================================
   تشغيل التطبيق — بعد أن عرّفت كل ملفات الصفحات دوالها، هذا آخر ما يُحمَّل
   (settings-ui.js وkhatma.js يعرّفان initAppUpdates/initBackup الخاصة بهما
   بأنفسهما ولا يعتمدان على هذا التسلسل).
   ============================================================ */
loadSurahList();
renderAdhkarCategories();
initAdhanPage();
renderAdiyah();
navigateTo("home");
// تحديث الودجت عند كل فتح للتطبيق حتى يعرض العدّاد الصحيح
if (typeof PrayerWidget !== "undefined") PrayerWidget.refresh();
