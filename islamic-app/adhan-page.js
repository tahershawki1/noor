/* ============================================================
   adhan-page.js — صفحة الأذان
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
function updateAdhanNextCard(prayerName, countdown, time24, heroLabel = 'الصلاة القادمة') {
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
  const adhanLabel = $('adhanHeroLabel');
  if (adhanLabel) adhanLabel.textContent = heroLabel;

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
