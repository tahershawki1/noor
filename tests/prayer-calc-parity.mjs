#!/usr/bin/env node
/**
 * اختبار تطابق حاسبَي المواقيت — الويب والأندرويد.
 *
 * المواقيت تُحسب مرتين في هذا المشروع:
 *   • islamic-app/prayer-times.js                       — لشاشات التطبيق
 *   • android/.../widget/PrayerTimesCalculator.java     — لودجت الشاشة الرئيسية
 *
 * الازدواج مقصود: الودجت يعمل والتطبيق مغلق، فلا WebView ولا جافاسكريبت. لكنه
 * ازدواج خطر — لو عُدِّلت زاوية أو طريقة حساب في ملف دون الآخر لعرض الودجت وقتاً
 * يخالف ما تعرضه الشاشة، وهو خطأ يصعب ملاحظته. هذا الاختبار يمنع ذلك: يشغّل
 * الحاسبَين على عشرات الحالات ويفشل عند أول اختلاف ولو بدقيقة.
 *
 * الحالات تغطي: كل طرق الحساب، المذهبين، نصفَي الكرة، حدود التوقيت الصيفي،
 * وخطوط العرض العالية حيث قد ينعدم بعض الأوقات.
 *
 * الاستعمال:  npm run test:prayer-calc     (يحتاج javac فقط — لا SDK أندرويد)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_CALC = path.join(ROOT, 'islamic-app', 'prayer-times.js');
const JAVA_CALC = path.join(
  ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'noor', 'islamicapp',
  'widget', 'PrayerTimesCalculator.java'
);

const ORDER = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

/** [خط العرض، خط الطول، الطريقة، المذهب، المنطقة الزمنية، سنة، شهر، يوم] */
const CASES = [
  [30.0444, 31.2357, 5, 0, 'Africa/Cairo', 2026, 7, 29],
  [30.0444, 31.2357, 5, 1, 'Africa/Cairo', 2026, 12, 31],
  [21.4225, 39.8262, 4, 0, 'Asia/Riyadh', 2026, 1, 15],
  [24.7136, 46.6753, 4, 1, 'Asia/Riyadh', 2026, 12, 21],
  [33.5138, 36.2765, 3, 0, 'Asia/Damascus', 2026, 6, 21],
  [31.9539, 35.9106, 1, 0, 'Asia/Amman', 2026, 3, 1],
  [51.5074, -0.1278, 8, 0, 'Europe/London', 2026, 3, 29],   // بداية التوقيت الصيفي
  [51.5074, -0.1278, 8, 0, 'Europe/London', 2026, 10, 25],  // نهاية التوقيت الصيفي
  [40.7128, -74.0060, 2, 0, 'America/New_York', 2026, 11, 1],
  [41.0082, 28.9784, 15, 1, 'Europe/Istanbul', 2026, 9, 10],
  [35.6892, 51.3890, 7, 0, 'Asia/Tehran', 2026, 2, 14],
  [-33.8688, 151.2093, 1, 0, 'Australia/Sydney', 2026, 10, 4],
  [-1.2921, 36.8219, 3, 0, 'Africa/Nairobi', 2026, 6, 15],  // على خط الاستواء تقريباً
  [25.2048, 55.2708, 10, 0, 'Asia/Dubai', 2026, 5, 5],
  [35.6895, 139.6917, 0, 0, 'Asia/Tokyo', 2026, 8, 8],
  [59.3293, 18.0686, 3, 0, 'Europe/Stockholm', 2026, 4, 20],  // خط عرض عالٍ
  [64.1466, -21.9426, 3, 0, 'Atlantic/Reykjavik', 2026, 6, 21], // أطول نهار
  [1.3521, 103.8198, 1, 1, 'Asia/Singapore', 2026, 2, 28],
];

// ---------------------------------------------------------------------------
// 1) الجانب الجافاسكريبتي
// ---------------------------------------------------------------------------

/** فرق التوقيت الفعلي للمنطقة في ذلك اليوم — يشمل التوقيت الصيفي. */
function timezoneOffsetHours(zone, year, month, day) {
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(probe)
    .find((part) => part.type === 'timeZoneName').value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) + Number(match[3]) / 60);
}

function runJavaScript() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(JS_CALC, 'utf8'), sandbox);
  const PrayerCalc = sandbox.window.PrayerCalc;

  return CASES.map(([lat, lng, method, school, zone, y, m, d]) => {
    const timings = PrayerCalc.calculate({
      latitude: lat,
      longitude: lng,
      method,
      school,
      date: new Date(y, m - 1, d, 12, 0, 0),
      timezone: timezoneOffsetHours(zone, y, m, d),
    });
    return ORDER.map((key) => timings[key] || '--:--').join(' ');
  });
}

// ---------------------------------------------------------------------------
// 2) الجانب الجافاوي
// ---------------------------------------------------------------------------

function runJava() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'noor-parity-'));
  const pkgDir = path.join(work, 'com', 'noor', 'islamicapp', 'widget');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.copyFileSync(JAVA_CALC, path.join(pkgDir, 'PrayerTimesCalculator.java'));

  const cases = CASES
    .map(([lat, lng, method, school, zone, y, m, d]) =>
      `{${lat}d, ${lng}d, ${method}, ${school}, "${zone}", ${y}, ${m}, ${d}}`)
    .join(',\n        ');

  fs.writeFileSync(path.join(work, 'Parity.java'), `
import com.noor.islamicapp.widget.PrayerTimesCalculator;
import java.util.Calendar;
import java.util.TimeZone;

public class Parity {
    static Object[][] CASES = {
        ${cases}
    };

    public static void main(String[] args) {
        for (Object[] c : CASES) {
            Calendar day = Calendar.getInstance(TimeZone.getTimeZone((String) c[4]));
            day.clear();
            day.set((Integer) c[5], (Integer) c[6] - 1, (Integer) c[7], 12, 0, 0);
            int[] times = PrayerTimesCalculator.calculate(
                (Double) c[0], (Double) c[1], (Integer) c[2], (Integer) c[3], 0, day);
            StringBuilder line = new StringBuilder();
            for (int i = 0; i < times.length; i++) {
                if (i > 0) line.append(' ');
                line.append(times[i] < 0
                    ? "--:--"
                    : String.format("%02d:%02d", times[i] / 60, times[i] % 60));
            }
            System.out.println(line);
        }
    }
}
`);

  execFileSync('javac', ['-d', path.join(work, 'out'),
    path.join(pkgDir, 'PrayerTimesCalculator.java'), path.join(work, 'Parity.java')],
    { cwd: work, stdio: ['ignore', 'ignore', 'inherit'] });

  const output = execFileSync('java', ['-cp', path.join(work, 'out'), 'Parity'],
    { cwd: work, encoding: 'utf8' });

  fs.rmSync(work, { recursive: true, force: true });
  // نزيل \r لأن Windows يُعيد أسطراً بـ CRLF فتفشل المقارنة كذباً رغم تطابق الأرقام
  return output.trim().split('\n').map(line => line.replace(/\r$/, ''));
}

// ---------------------------------------------------------------------------
// 3) المقارنة
// ---------------------------------------------------------------------------

console.log('مقارنة حاسب المواقيت: prayer-times.js ↔ PrayerTimesCalculator.java\n');

const fromJs = runJavaScript();
const fromJava = runJava();
const failures = [];

CASES.forEach(([lat, lng, method, school, zone, y, m, d], index) => {
  const label = `${zone} ${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} ` +
    `طريقة ${method}${school === 1 ? ' حنفي' : ''}`;
  if (fromJs[index] === fromJava[index]) {
    console.log(`  ✓ ${label.padEnd(44)} ${fromJava[index]}`);
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`      الويب:    ${fromJs[index]}`);
    console.log(`      الأندرويد: ${fromJava[index]}`);
    failures.push(label);
  }
});

console.log('\n' + '='.repeat(60));
if (failures.length) {
  console.log(`فشل ${failures.length} من ${CASES.length}: الحاسبان غير متطابقين.`);
  console.log('عدّل الملفين معاً — أي تغيير في أحدهما يجب أن ينعكس في الآخر.');
  process.exit(1);
}
console.log(`الحاسبان متطابقان في ${CASES.length} حالة ✓`);
