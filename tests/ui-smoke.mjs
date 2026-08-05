#!/usr/bin/env node
/**
 * اختبار سلامة الواجهة — يفتح كل صفحة وكل ورقة سفلية في متصفح حقيقي
 * ويتحقق من ثوابت بنيوية لا يمكن رصدها بالعين وحدها.
 *
 * وُلد بعد عيبين شُحنا فعلاً للمستخدمين، وكلاهما من نفس العائلة:
 * «شيء يزيح شيئاً آخر بعد الرسم».
 *
 *   ١) التموّج كان يرث `position: relative` من قاعدة `.host > *`، فيدخل
 *      في تدفّق الصفحة ويمطّ كل بطاقة تُلمَس بارتفاعه كاملاً.
 *   ٢) حركة دخول الصفحة كانت تستعمل `transform`، وأي أب فيه transform
 *      يصير مرجع `position: fixed` بدل الشاشة — فزر الإجراء العائم كان
 *      يظهر أعلى الصفحة ثم ينطّ لأسفلها بعد ٢٥٠ms.
 *
 * لذلك الفحوص هنا تقيس **الثبات**: مقاس قبل/بعد، وموضع عند لحظات مختلفة
 * من عمر الصفحة — لا مجرد «هل ظهر العنصر».
 *
 * الاستعمال:
 *   npm i --no-save playwright
 *   npm run test:ui
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'islamic-app');
const PORT = 8201;
const BASE = `http://127.0.0.1:${PORT}`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const filePath = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});

const failures = [];
let checks = 0;
function ok(condition, label, detail) {
  checks++;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** الصفحات العشر بترتيب ظهورها للمستخدم. */
const PAGES = [
  'home', 'quran', 'adhkar', 'bookmarks', 'prayer',
  'adiyah', 'adhan', 'khatma', 'dashboard', 'settings',
];

/** الأوراق السفلية ودوالّ فتحها وإغلاقها. */
const SHEETS = [
  { id: 'prayerSettingsOverlay', open: 'openPrayerSettings()', close: 'closePrayerSettingsModal()' },
  { id: 'addAdhkarOverlay', open: 'openAddAdhkarModal()', close: 'closeAddAdhkarModal()' },
  { id: 'khatmaSetupOverlay', open: 'openKhatmaSetup()', close: 'closeKhatmaSetup()' },
  {
    id: 'adhanSettingsOverlay',
    open: "document.getElementById('adhanSettingsBtn').click()",
    close: "document.getElementById('adhanSettingsOverlay').classList.add('hidden')",
  },
];

// بيانات تجعل كل الصفحات مأهولة بمحتوى حقيقي (لا حالات فارغة)
const SEED = (theme) => {
  localStorage.setItem('theme', theme);
  localStorage.setItem('prayerLastData', JSON.stringify({
    timings: { Fajr: '04:12', Sunrise: '05:44', Dhuhr: '12:58', Asr: '16:33', Maghrib: '20:10', Isha: '21:32' },
    hijri: { day: '١٢', month: { ar: 'صفر' }, year: '١٤٤٨' },
    locationLabel: 'القاهرة، مصر',
    fetchedAt: Date.now(),
  }));
  localStorage.setItem('quranLastRead', JSON.stringify({ surah: 2, ayah: 25, surahName: 'سورة البقرة', at: Date.now() }));
  localStorage.setItem('khatmaList', JSON.stringify([
    { id: 1, startDate: new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10), dailyPages: 20, pagesRead: 96 },
  ]));
  localStorage.setItem('quranBookmarks', JSON.stringify([
    { key: '2:255', surah: 2, ayah: 255, surahName: 'سورة البقرة', text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ', date: new Date().toISOString() },
  ]));
  localStorage.setItem('noorStatsTotals', JSON.stringify({
    prayer: 12, quranPages: 40, quranSessions: 7, dhikr: 60, adiyah: 5, tasbeeh: 130,
    currentStreak: 4, bestStreak: 9, lastActiveDate: null,
  }));
};

/** يلتقط موضع ومقاس كل عنصر مرئي ذي `position: fixed`. */
const FIXED_SNAPSHOT = () => {
  const out = {};
  document.querySelectorAll('body *').forEach((el) => {
    if (getComputedStyle(el).position !== 'fixed') return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const key = el.id || el.className || el.tagName;
    out[key] = [r.top, r.left, r.width, r.height].map((n) => Math.round(n)).join(',');
  });
  return out;
};

for (const theme of ['dark', 'light']) {
  console.log(`\n${'='.repeat(58)}\nالوضع: ${theme === 'dark' ? 'الليلي' : 'النهاري'}\n${'='.repeat(58)}`);

  const context = await browser.newContext({
    viewport: { width: 412, height: 900 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ar-EG',
    timezoneId: 'Africa/Cairo',
  });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    // ٤٠٤ الصوتيات متوقَّع — التلاوة تُبَثّ من الشبكة ولا تُرفق مع التطبيق
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text());
  });

  await page.addInitScript(SEED, theme);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  console.log('\n[1] الإقلاع');
  ok(pageErrors.length === 0, 'بلا أخطاء جافاسكريبت', pageErrors.join(' | '));
  ok(consoleErrors.length === 0, 'بلا أخطاء في الطرفية', consoleErrors.join(' | '));
  ok(await page.locator('#home.active').count() === 1, 'الصفحة الرئيسية هي المفتوحة');

  console.log('\n[2] كل صفحة تفتح وتعرض محتوى');
  for (const tab of PAGES) {
    await page.evaluate((t) => navigateTo(t), tab);
    await page.waitForTimeout(400);
    const info = await page.evaluate((t) => {
      const el = document.getElementById(t);
      return { active: el.classList.contains('active'), h: Math.round(el.getBoundingClientRect().height) };
    }, tab);
    ok(info.active && info.h > 80, `${tab} — مفتوحة وارتفاعها ${info.h}px`);
  }

  console.log('\n[3] ثبات العناصر الثابتة أثناء دخول الصفحة');
  // العيب الذي شُحن: زر الإجراء العائم كان يظهر أعلى الصفحة ثم ينطّ لأسفلها
  // لأن حركة الدخول كانت تستعمل transform. نقيس عند ٣ لحظات من عمر الصفحة.
  for (const tab of PAGES) {
    await page.evaluate((t) => navigateTo(t), tab);
    const shots = [];
    for (const wait of [16, 130, 450]) {
      await page.waitForTimeout(wait === 16 ? 16 : wait - shots.length * 0);
      shots.push(await page.evaluate(FIXED_SNAPSHOT));
    }
    const keys = [...new Set(shots.flatMap((s) => Object.keys(s)))];
    const unstable = keys.filter((k) => new Set(shots.map((s) => s[k] || '—')).size > 1);
    ok(unstable.length === 0, `${tab} — العناصر الثابتة لا تتحرك بعد الرسم`,
      unstable.map((k) => `${k}: ${shots.map((s) => s[k] || '—').join(' → ')}`).join(' | '));
  }

  console.log('\n[4] زر الإجراء العائم فوق شريط التنقل مباشرةً');
  for (const tab of ['adhkar', 'khatma']) {
    await page.evaluate((t) => navigateTo(t), tab);
    await page.waitForTimeout(500);
    const fab = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.fab')].find((n) => n.getBoundingClientRect().height > 0);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const nav = document.querySelector('.tab-bar').getBoundingClientRect();
      return { bottom: Math.round(r.bottom), navTop: Math.round(nav.top), top: Math.round(r.top) };
    });
    ok(fab !== null, `${tab} — الزر العائم موجود`);
    if (fab) {
      ok(fab.bottom <= fab.navTop, `${tab} — الزر لا يغطّي شريط التنقل (${fab.bottom} ≤ ${fab.navTop})`);
      ok(fab.navTop - fab.bottom < 40, `${tab} — الزر ملتصق بأسفل الشاشة لا أعلاها (فرق ${fab.navTop - fab.bottom}px)`);
    }
  }

  console.log('\n[5] لا تمرير أفقي في أي صفحة');
  for (const tab of PAGES) {
    await page.evaluate((t) => navigateTo(t), tab);
    await page.waitForTimeout(250);
    const over = await page.evaluate(() => {
      const m = document.getElementById('mainContent');
      return { m: m.scrollWidth - m.clientWidth, d: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    ok(over.m <= 1 && over.d <= 1, `${tab} — بلا فيضان أفقي`, `المحتوى ${over.m}px، المستند ${over.d}px`);
  }

  console.log('\n[6] التموّج لا يغيّر مقاس أي سطح');
  // العيب الذي شُحن: `.host > *` كانت تكسب على `.m3-ripple` فتُدخل الموجة
  // في التدفّق. نحقن موجة بأقصى حجم في كل سطح مرئي ونقارن.
  for (const tab of PAGES) {
    await page.evaluate((t) => navigateTo(t), tab);
    await page.waitForTimeout(300);
    const bad = await page.evaluate(() => {
      const SEL = '.btn,.chip-btn,.fab,.quick-tile,.surah-card,.category-card,.nav-btn,.ab-icon,'
        + '.icon-action,.dhikr-counter-btn,.tasbeeh-btn,.play-btn,.collapse-btn,.khatma-card,'
        + '.khatma-card-del,.khatma-tab,.step-btn,.tune-btn,.as-btn,.prayer-mark-btn,.resume-open,.widget-pick';
      const problems = [];
      const content = document.getElementById('mainContent');
      const hosts = [...document.querySelectorAll(SEL)].filter((n) => n.getBoundingClientRect().height > 0).slice(0, 20);
      for (const host of hosts) {
        const beforeH = host.getBoundingClientRect().height;
        const beforeScroll = content.scrollHeight;
        const sp = document.createElement('span');
        sp.className = 'm3-ripple';
        sp.style.width = sp.style.height = '320px';
        sp.style.left = sp.style.top = '-80px';
        host.appendChild(sp);
        const pos = getComputedStyle(sp).position;
        const afterH = host.getBoundingClientRect().height;
        const afterScroll = content.scrollHeight;
        sp.remove();
        if (pos !== 'absolute' || Math.abs(afterH - beforeH) > 0.5 || afterScroll !== beforeScroll) {
          problems.push(`${host.className.split(' ')[0]}: ${Math.round(beforeH)}→${Math.round(afterH)} (${pos})`);
        }
      }
      return { problems, count: hosts.length };
    });
    ok(bad.problems.length === 0, `${tab} — ${bad.count} سطحاً ثابت المقاس مع التموّج`, bad.problems.join(' | '));
  }

  console.log('\n[7] الأوراق السفلية تفتح وتُغلق');
  for (const sheet of SHEETS) {
    await page.evaluate((s) => eval(s), sheet.open);
    await page.waitForTimeout(420);
    const opened = await page.evaluate((id) => {
      const el = document.getElementById(id);
      const panel = el.querySelector('.modal-panel').getBoundingClientRect();
      return {
        visible: !el.classList.contains('hidden'),
        // اللوحة مستقرة أسفل الشاشة بعد انتهاء حركة الصعود
        bottom: Math.round(panel.bottom),
        viewportH: Math.round(window.innerHeight),
        h: Math.round(panel.height),
      };
    }, sheet.id);
    ok(opened.visible && opened.h > 100, `${sheet.id} — تفتح (ارتفاع ${opened.h}px)`);
    ok(Math.abs(opened.bottom - opened.viewportH) <= 2, `${sheet.id} — مستقرة على حافة الشاشة`,
      `أسفلها ${opened.bottom} مقابل ${opened.viewportH}`);

    await page.evaluate((s) => eval(s), sheet.close);
    await page.waitForTimeout(200);
    ok(await page.evaluate((id) => document.getElementById(id).classList.contains('hidden'), sheet.id),
      `${sheet.id} — تُغلق`);
  }

  console.log('\n[8] قارئ المصحف');
  await page.evaluate(() => navigateTo('quran'));
  await page.evaluate(() => openSurah(1));
  await page.waitForTimeout(900);
  const reader = await page.evaluate(() => {
    const spans = document.querySelectorAll('.ayah-span');
    const bar = document.querySelector('.app-bar').getBoundingClientRect();
    const first = spans[0] ? spans[0].getBoundingClientRect() : null;
    return {
      ayahs: spans.length,
      reading: document.getElementById('appShell').classList.contains('reading'),
      navHidden: document.querySelector('.tab-bar').getBoundingClientRect().height < 2,
      firstBelowBar: first ? first.top >= bar.bottom - 1 : false,
    };
  });
  ok(reader.ayahs === 7, `الفاتحة ٧ آيات (وجدنا ${reader.ayahs})`);
  ok(reader.reading, 'وضع القراءة الغامر مفعَّل');
  ok(reader.navHidden, 'شريط التنقل مخفي أثناء القراءة');
  ok(reader.firstBelowBar, 'أول آية لا يغطّيها الشريط العلوي');
  await page.evaluate(() => goBackToSurahList());
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !document.getElementById('appShell').classList.contains('reading')),
    'الخروج من وضع القراءة يعيد الواجهة');

  console.log('\n[9] أهداف اللمس');
  await page.evaluate(() => navigateTo('home'));
  await page.waitForTimeout(300);
  const targets = await page.evaluate(() => {
    const small = [];
    document.querySelectorAll('.nav-btn, .ab-icon:not(.hidden), .btn, .quick-tile').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.height) return;
      if (r.height < 40 || r.width < 40) small.push(`${el.className.split(' ')[0]} ${Math.round(r.width)}×${Math.round(r.height)}`);
    });
    return small;
  });
  ok(targets.length === 0, 'كل أهداف اللمس ٤٠px فأكبر', targets.join(' | '));

  console.log('\n[10] بلا أخطاء بعد المرور على كل شيء');
  ok(pageErrors.length === 0, 'بلا أخطاء جافاسكريبت', pageErrors.join(' | '));
  ok(consoleErrors.length === 0, 'بلا أخطاء في الطرفية', consoleErrors.join(' | '));

  await context.close();
}

await browser.close();
server.close();

console.log(`\n${'='.repeat(58)}`);
if (failures.length) {
  console.log(`فشل ${failures.length} من ${checks} تحقّقاً:\n`);
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log(`كل فحوص الواجهة نجحت ✓ (${checks} تحقّقاً)`);
