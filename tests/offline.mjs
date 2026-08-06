#!/usr/bin/env node
/**
 * اختبار الاستقلال عن الإنترنت — يشغّل التطبيق في متصفح حقيقي مع حجب كل
 * الشبكة الخارجية، فأي اعتماد متبقٍ على الإنترنت يظهر فوراً كفشل.
 *
 * يغطي أيضاً: بحث السور، فواصل الصفحات، متابعة القراءة، وحساب المواقيت محلياً.
 *
 * الاستعمال:
 *   npm i --no-save playwright
 *   npm run test:offline
 *
 * (Playwright ليست ضمن اعتماديات المشروع حتى لا تُبطئ `npm ci` في الـ CI.)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'islamic-app');
const PORT = 8199;
const BASE = `http://127.0.0.1:${PORT}`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
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

// المتصفح المرفق مع البيئة إن وُجد، وإلا نسخة Playwright الافتراضية
const BROWSER_PATH = '/opt/pw-browsers/chromium';
const launchOptions = fs.existsSync(BROWSER_PATH) ? { executablePath: BROWSER_PATH } : {};

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ locale: 'ar-EG', timezoneId: 'Africa/Cairo' });
const page = await context.newPage();

const blocked = [];
const failures = [];
const consoleErrors = [];

// نسمح فقط بالمضيف المحلي — أي طلب خارجي يُحجب ويُسجَّل
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')) {
    return route.continue();
  }
  blocked.push(url);
  return route.abort();
});

page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const check = (name, condition, detail = '') => {
  if (condition) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name} ${detail}`); failures.push(name); }
};

await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });

// ---------- 1) قائمة السور من البيانات المحلية ----------
console.log('\n[1] قائمة السور');
await page.evaluate(() => navigateTo('quran'));
await page.waitForSelector('.surah-card', { timeout: 10000 });
const cardCount = await page.locator('.surah-card').count();
check('١١٤ سورة معروضة', cardCount === 114, `(${cardCount})`);
const firstName = await page.locator('.surah-card-name').first().textContent();
check('اسم أول سورة صحيح', firstName.trim() === 'الفاتحة', `(${firstName})`);

// ---------- 2) البحث ----------
console.log('\n[2] البحث عن السورة');
const searchCases = [
  ['الفاتحة', 'الفاتحة'],
  ['فاتحه', 'الفاتحة'],
  ['بقرة', 'البقرة'],
  ['الكهف', 'الكهف'],
  ['ياسين', null],
  ['يس', 'يس'],
  ['18', 'الكهف'],
  ['١٨', 'الكهف'],
  ['kahf', 'الكهف'],
  ['الإخلاص', 'الإخلاص'],
  ['اخلاص', 'الإخلاص'],
];
for (const [query, expected] of searchCases) {
  await page.fill('#surahSearch', query);
  await page.waitForTimeout(60);
  const names = await page.locator('.surah-card-name').allTextContents();
  if (expected === null) continue;
  check(`بحث "${query}" ← ${expected}`, names.some((n) => n.trim() === expected), `(نتائج: ${names.slice(0, 3).join('، ') || 'لا شيء'})`);
}
await page.fill('#surahSearch', '');

// ---------- 3) فتح سورة + فواصل الصفحات ----------
console.log('\n[3] فتح سورة وفواصل الصفحات');
await page.evaluate(() => openSurah(2));
await page.waitForSelector('#ayahContainer .ayah-span', { timeout: 10000 });
const ayahCount = await page.locator('#ayahContainer .ayah-span').count();
check('البقرة ٢٨٦ آية', ayahCount === 286, `(${ayahCount})`);
const separators = await page.locator('.page-separator').count();
check('فواصل الصفحات ظاهرة', separators > 30, `(${separators} فاصل)`);
const firstSep = await page.locator('.page-separator-label').first().textContent();
check('نص الفاصل يحمل رقم صفحة', /صفحة/.test(firstSep), `(${firstSep})`);
const badge = await page.locator('#headerJuzHizb').textContent();
check('شارة الجزء/الحزب/الصفحة', /جزء.*حزب.*صفحة/.test(badge), `(${badge})`);

// النص المعروض يطابق ملف البيانات حرفاً بحرف (آية الكرسي نموذجاً)
const expected255 = JSON.parse(await (await fetch(BASE + '/data/quran-text/2.json')).text())[254];
// المعرِّف يحمل رقم السورة ثم رقم الآية — لأن قارئ الختمة يعرض عدة سور معاً
const ayah255 = (await page.locator('#ayah-2-255').textContent()).replace(/[﴾﴿٠-٩]/g, '').trim();
check('نص آية الكرسي يطابق المصدر', ayah255 === expected255.trim(), `\n     معروض: ${ayah255.slice(0, 50)}\n     مصدر:  ${expected255.slice(0, 50)}`);

// ---------- 4) التفسير المحلي ----------
console.log('\n[4] التفسير');
await page.evaluate(() => {
  currentDialogAyah = { surah: 2, ayah: 255 };
  document.getElementById('ayahTafsirBtn').click();
});
await page.waitForFunction(() => !document.getElementById('ayahTafsirBox').querySelector('.loading'), { timeout: 10000 });
const tafsir = await page.locator('#ayahTafsirBox').textContent();
check('تفسير الميسر يظهر', tafsir.includes('تفسير الميسر') && tafsir.length > 120, `(${tafsir.slice(0, 60)})`);

// ---------- 5) متابعة القراءة ----------
console.log('\n[5] متابعة القراءة');
await page.evaluate(() => saveLastRead(18, 60, 'الكهف'));
await page.evaluate(() => goBackToSurahList());
await page.waitForTimeout(120);
const resumeVisible = await page.locator('#resumeCard').isVisible();
check('بطاقة المتابعة تظهر', resumeVisible);
const resumeText = await page.locator('#resumeCard').textContent();
check('البطاقة تعرض آخر موضع', resumeText.includes('الكهف'), `(${resumeText.trim()})`);

await page.evaluate(() => navigateTo('home'));
await page.waitForTimeout(80);
await page.click('.nav-btn[data-tab="quran"]');
await page.waitForSelector('#ayahContainer .ayah-span', { timeout: 8000 });
// ‏#surahReadView غلاف بارتفاع صفر بحكم التصميم — القارئ الفعلي هو ayahContainer
const readerOpen = await page.locator('#ayahContainer').isVisible();
const listHidden = await page.locator('#surahListView').isHidden();
const openedSurah = await page.evaluate(() => currentSurah);
const openedAyahs = await page.locator('#ayahContainer .ayah-span').count();
check(
  'فتح القرآن يستأنف آخر موضع',
  readerOpen && listHidden && openedSurah === 18 && openedAyahs === 110,
  `(سورة ${openedSurah}، ${openedAyahs} آية، قارئ ظاهر: ${readerOpen})`
);

// الرجوع لا يعيد فتح القارئ (لا حلقة لا نهائية)
await page.evaluate(() => goBackToSurahList());
await page.waitForTimeout(300);
check('الرجوع يُظهر قائمة السور', await page.locator('#surahListView').isVisible());

// ---------- 6) مواقيت الصلاة محلياً ----------
console.log('\n[6] مواقيت الصلاة');
await page.evaluate(() => fetchPrayerTimesByCoords(30.0444, 31.2357));
await page.waitForTimeout(400);
const times = await page.evaluate(() => lastPrayerData && lastPrayerData.timings);
check('المواقيت محسوبة محلياً', !!times && !!times.Fajr, JSON.stringify(times));
if (times) {
  const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const order = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map((k) => mins(times[k]));
  check('ترتيب الأوقات صحيح', order.every((v, i) => i === 0 || v > order[i - 1]), JSON.stringify(times));
}
const hijri = await page.evaluate(() => lastPrayerData && lastPrayerData.hijri);
check('التاريخ الهجري محلي', !!hijri && !!hijri.month && !!hijri.month.ar, JSON.stringify(hijri));

// البحث بالمدينة من القائمة المرفقة
await page.evaluate(() => {
  document.getElementById('cityInput').value = 'مكة المكرمة';
  document.getElementById('countryInput').value = '';
  return fetchPrayerTimesByCity();
});
await page.waitForTimeout(600);
const cityLabel = await page.evaluate(() => lastPrayerData && lastPrayerData.locationLabel);
check('البحث بالمدينة يعمل أوفلاين', /مكة/.test(String(cityLabel)), `(${cityLabel})`);

// ---------- 7) الخطوط المحلية ----------
console.log('\n[7] الخطوط');
const fontLoaded = await page.evaluate(() => document.fonts.check('16px "Scheherazade New"'));
check('خط Scheherazade New محمّل محلياً', fontLoaded);

// ---------- النتيجة ----------
console.log('\n[8] الشبكة الخارجية');
const externalBlocked = [...new Set(blocked)];
check('لم يُطلب أي مورد خارجي', externalBlocked.length === 0, `\n     ${externalBlocked.join('\n     ')}`);

if (consoleErrors.length) {
  console.log('\nأخطاء الكونسول:');
  consoleErrors.slice(0, 10).forEach((e) => console.log('   ! ' + e));
}

await browser.close();
server.close();

console.log('\n' + '='.repeat(50));
if (failures.length) {
  console.log(`فشل ${failures.length}: ${failures.join(' | ')}`);
  process.exit(1);
}
console.log('كل الاختبارات نجحت ✓');
