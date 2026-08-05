/* ============================================================
   dashboard.js — لوحة الإحصائيات
   ============================================================
   طبقة عرض فقط فوق بيانات stats.js — لا تسجّل أي حدث بنفسها.
   ============================================================ */

const DASH_STAT_CARDS = [
  { key: "prayer", label: "الصلوات", icon: "mosque", tone: "emerald" },
  { key: "quranSessions", label: "مرات القراءة", icon: "quran", tone: "teal" },
  { key: "quranPages", label: "صفحات القرآن", icon: "book-text", tone: "jade" },
  { key: "dhikr", label: "الأذكار", icon: "beads", tone: "violet" },
  { key: "adiyah", label: "الأدعية", icon: "dua", tone: "rose" },
  { key: "tasbeeh", label: "السبحة", icon: "beads", tone: "blue" },
];

function renderDashboardStats() {
  // بطاقات الشبكة تعرض نشاط اليوم الحالي فقط — تُقرأ من السجل اليومي
  // (يوم اليوم فيه صفر افتراضياً حتى يبدأ نشاط جديد فيه) لا من المجاميع
  // الكلية totals، التي كانت تتراكم للأبد بلا تصفير عند منتصف الليل.
  // الأمس ثابت بالفعل تحت مفتاحه الخاص في noorStatsDaily، يقرأه تقرير
  // الأسبوع/الشهر أدناه دون أي تغيير.
  const today = NoorStats.getDailyRange(1)[0];
  const totals = NoorStats.getTotals();
  $("dashboardStatGrid").innerHTML = DASH_STAT_CARDS.map((c) => `
    <div class="dash-stat-card">
      <span class="dash-stat-icon tone-${c.tone}">${icon(c.icon)}</span>
      <span class="dash-stat-value">${toArabicNum(today[c.key] || 0)}</span>
      <span class="dash-stat-label">${c.label}</span>
    </div>`).join("");

  $("dashboardStreak").innerHTML = `
    <div class="dash-streak-current">
      <span class="dash-streak-num">${toArabicNum(totals.currentStreak || 0)}</span>
      <span class="dash-streak-label">🔥 ${arabicCountLabel(totals.currentStreak || 0, "يوم متتالٍ", "يومان متتاليان", "أيام متتالية", "يوماً متتالياً")}</span>
    </div>
    <div class="dash-streak-best">أطول تتابع: ${toArabicNum(totals.bestStreak || 0)}</div>`;
}

function dashboardDayLabel(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  try { return new Date(y, m - 1, d).toLocaleDateString("ar", { weekday: "short" }); }
  catch (_) { return ""; }
}

function renderDashboardWeeklyChart() {
  const days = NoorStats.getDailyRange(7);
  const max = Math.max(1, ...days.map((d) => d.total));
  const barW = 28, gap = 14, chartH = 84, top = 4, labelH = 20;
  const svgW = days.length * (barW + gap) - gap;
  const bars = days.map((d, i) => {
    const h = d.total ? Math.max(4, Math.round((d.total / max) * chartH)) : 2;
    const x = i * (barW + gap);
    const y = top + (chartH - h);
    return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="6" class="dash-bar" opacity="${d.total ? 1 : 0.3}"></rect>` +
      `<text x="${x + barW / 2}" y="${top + chartH + 15}" text-anchor="middle" class="dash-chart-label">${dashboardDayLabel(d.date)}</text>`;
  }).join("");
  $("dashboardWeeklyChart").innerHTML =
    `<svg viewBox="0 0 ${svgW} ${top + chartH + labelH}" class="dash-chart-svg">${bars}</svg>`;
}

/** تقرير أرقام مجمّعة لآخر n يوماً — نفس الحسبة لتقريري الأسبوع والشهر. */
function renderDashboardReport(elId, days) {
  const range = NoorStats.getDailyRange(days);
  const sums = range.reduce((acc, d) => {
    acc.prayer += d.prayer; acc.quranPages += d.quranPages; acc.quranSessions += d.quranSessions;
    acc.dhikr += d.dhikr; acc.adiyah += d.adiyah; acc.tasbeeh += d.tasbeeh;
    return acc;
  }, { prayer: 0, quranPages: 0, quranSessions: 0, dhikr: 0, adiyah: 0, tasbeeh: 0 });
  const activeDays = range.filter((d) => d.total > 0).length;

  const rows = [
    ["أيام نشطة", `${toArabicNum(activeDays)}/${toArabicNum(range.length)}`],
    ["الصلوات", toArabicNum(sums.prayer)],
    ["صفحات القرآن", toArabicNum(sums.quranPages)],
    ["مرات القراءة", toArabicNum(sums.quranSessions)],
    ["الأذكار", toArabicNum(sums.dhikr)],
    ["الأدعية", toArabicNum(sums.adiyah)],
    ["السبحة", toArabicNum(sums.tasbeeh)],
  ];
  $(elId).innerHTML = rows.map(([label, value]) => `
    <div class="dash-report-row"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderDashboard() {
  renderDashboardStats();
  renderDashboardWeeklyChart();
  renderDashboardReport("dashboardWeeklyReport", 7);
  renderDashboardReport("dashboardMonthlyReport", 30);
}
