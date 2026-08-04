/* ============================================================
   stats.js — سجل الإحصائيات المحلي (تغذّي dashboard.js)
   ============================================================
   كل رقم هنا ناتج عن تفاعل فعلي من صفحة أخرى — لا بيانات وهمية:
   تسبيحة (adhkar.js)، تكة ذكر (adhkar.js)، دعاء "قرأتها" (adiyah.js)،
   صفحة/جلسة قرآن (quran-reader.js)، صلاة "صلّيتها" (prayer-page.js).

   التخزين مقسوم لطبقتين لضبط الذاكرة:
   - noorStatsTotals: مجاميع كلية + الـ Streak (كائن صغير ثابت الحجم).
   - noorStatsDaily / noorPrayerLog: سجل يومي مُقلَّم لآخر RETENTION_DAYS
     يوماً فقط — كافٍ للرسوم والتقارير الأسبوعية/الشهرية دون تراكم أبدي.
   ============================================================ */

const STATS_TOTALS_KEY = "noorStatsTotals";
const STATS_DAILY_KEY = "noorStatsDaily";
const STATS_PRAYER_LOG_KEY = "noorPrayerLog";
const STATS_RETENTION_DAYS = 120;
const STATS_RECORDABLE_TYPES = ["quranSessions", "dhikr", "adiyah", "tasbeeh"];

function statsDateKey(d) {
  const date = d || new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function statsAddDays(dateKey, delta) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return statsDateKey(new Date(y, m - 1, d + delta));
}

const STATS_TOTALS_DEFAULTS = {
  prayer: 0, quranPages: 0, quranSessions: 0, dhikr: 0, adiyah: 0, tasbeeh: 0,
  currentStreak: 0, bestStreak: 0, lastActiveDate: null,
};

function getStatsTotals() {
  try {
    return Object.assign({}, STATS_TOTALS_DEFAULTS, JSON.parse(localStorage.getItem(STATS_TOTALS_KEY)) || {});
  } catch (_) { return Object.assign({}, STATS_TOTALS_DEFAULTS); }
}
function saveStatsTotals(totals) { localStorage.setItem(STATS_TOTALS_KEY, JSON.stringify(totals)); }

function getStatsDaily() {
  try { return JSON.parse(localStorage.getItem(STATS_DAILY_KEY)) || {}; } catch (_) { return {}; }
}
function saveStatsDaily(daily) { localStorage.setItem(STATS_DAILY_KEY, JSON.stringify(daily)); }

function getPrayerLog() {
  try { return JSON.parse(localStorage.getItem(STATS_PRAYER_LOG_KEY)) || {}; } catch (_) { return {}; }
}
function savePrayerLog(log) { localStorage.setItem(STATS_PRAYER_LOG_KEY, JSON.stringify(log)); }

/** يحذف الأيام الأقدم من نافذة الاحتفاظ من أي سجل يومي — يمنع تضخّم التخزين مع الوقت. */
function pruneOldDays(record) {
  const cutoff = statsAddDays(statsDateKey(), -STATS_RETENTION_DAYS);
  Object.keys(record).forEach((key) => { if (key < cutoff) delete record[key]; });
  return record;
}

/** يقدّم الـ Streak عند أول نشاط في يوم جديد فقط — لا يتأثر بتكرار النشاط في نفس اليوم. */
function touchStreak(totals, today) {
  if (totals.lastActiveDate === today) return;
  const yesterday = statsAddDays(today, -1);
  totals.currentStreak = totals.lastActiveDate === yesterday ? totals.currentStreak + 1 : 1;
  totals.bestStreak = Math.max(totals.bestStreak || 0, totals.currentStreak);
  totals.lastActiveDate = today;
}

const NoorStats = {
  todayKey: () => statsDateKey(),

  /** يسجّل حدثاً واحداً حقيقياً: quranSessions | dhikr | adiyah | tasbeeh. */
  record(type, amount = 1) {
    if (!STATS_RECORDABLE_TYPES.includes(type)) return;
    const today = statsDateKey();

    const totals = getStatsTotals();
    totals[type] = (totals[type] || 0) + amount;
    touchStreak(totals, today);
    saveStatsTotals(totals);

    const daily = pruneOldDays(getStatsDaily());
    daily[today] = daily[today] || {};
    daily[today][type] = (daily[today][type] || 0) + amount;
    saveStatsDaily(daily);
  },

  /** صفحة قرآن ظهرت أثناء القراءة — تُحسب مرة واحدة فقط لكل صفحة في نفس اليوم. */
  recordQuranPage(page) {
    const today = statsDateKey();
    const daily = pruneOldDays(getStatsDaily());
    daily[today] = daily[today] || {};
    const seenPages = daily[today].pages || [];
    if (seenPages.includes(page)) return;
    seenPages.push(page);
    daily[today].pages = seenPages;
    daily[today].quranPages = seenPages.length;
    saveStatsDaily(daily);

    const totals = getStatsTotals();
    totals.quranPages = (totals.quranPages || 0) + 1;
    touchStreak(totals, today);
    saveStatsTotals(totals);
  },

  /** يبدّل حالة "صُلّيت" لصلاة معيّنة في يوم معيّن — قابل للتراجع. يُرجع الحالة الجديدة. */
  togglePrayer(dateKey, prayerName) {
    const log = pruneOldDays(getPrayerLog());
    const day = log[dateKey] || {};
    const wasMarked = !!day[prayerName];
    if (wasMarked) delete day[prayerName];
    else day[prayerName] = 1;
    if (Object.keys(day).length) log[dateKey] = day;
    else delete log[dateKey];
    savePrayerLog(log);

    const totals = getStatsTotals();
    totals.prayer = Math.max(0, (totals.prayer || 0) + (wasMarked ? -1 : 1));
    if (!wasMarked) touchStreak(totals, statsDateKey());
    saveStatsTotals(totals);
    return !wasMarked;
  },

  isPrayerMarked(dateKey, prayerName) {
    const day = getPrayerLog()[dateKey];
    return !!(day && day[prayerName]);
  },

  getTotals: () => getStatsTotals(),

  /** آخر n يوماً (الأقدم أولاً) — كل يوم: {date, prayer, quranPages, quranSessions, dhikr, adiyah, tasbeeh, total}. */
  getDailyRange(days) {
    const daily = getStatsDaily();
    const prayerLog = getPrayerLog();
    const out = [];
    let cursor = statsDateKey();
    for (let i = 0; i < days; i++) {
      const d = daily[cursor] || {};
      const prayerCount = prayerLog[cursor] ? Object.keys(prayerLog[cursor]).length : 0;
      const quranPages = d.quranPages || 0;
      const quranSessions = d.quranSessions || 0;
      const dhikr = d.dhikr || 0;
      const adiyah = d.adiyah || 0;
      const tasbeeh = d.tasbeeh || 0;
      out.unshift({
        date: cursor, prayer: prayerCount, quranPages, quranSessions, dhikr, adiyah, tasbeeh,
        total: prayerCount + quranPages + dhikr + adiyah + tasbeeh,
      });
      cursor = statsAddDays(cursor, -1);
    }
    return out;
  },
};
