#!/usr/bin/env node
/**
 * اختبار النسخة الاحتياطية (islamic-app/backup.js).
 *
 * هذا الكود هو خط الدفاع الأخير عن بيانات المستخدم: محفوظاته في المصحف،
 * أذكاره المخصّصة، عدّاد تسبيحه، موقعه، وآخر موضع قراءة. لو أخطأ صامتاً
 * فلن يكتشف أحد ذلك إلا بعد أن تضيع البيانات فعلاً — عندها يكون الأوان قد فات.
 *
 * لذلك نحاكي الدورة كاملة: امتلاء البيانات ← حفظ ← «حذف التطبيق» (تفريغ
 * localStorage) ← استرجاع ← التحقق أن كل شيء عاد كما كان.
 *
 * الاستعمال:  npm run test:backup
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'islamic-app', 'backup.js'), 'utf8');

let passed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
    failures.push(label);
  }
}

/** بيانات مستخدم حقيقية بمفاتيح التطبيق الفعلية. */
const USER_DATA = {
  theme: 'dark',
  quranFont: 'amiri-quran',
  quranFontSize: '115',
  quranBookmarks: JSON.stringify([{ surah: 18, ayah: 10 }, { surah: 2, ayah: 255 }]),
  customAdhkar: JSON.stringify({ morning: ['ذكر مخصّص'] }),
  adhkarOrder: JSON.stringify(['morning', 'evening']),
  tasbeehCount: '317',
  tasbeehPhrase: 'سبحان الله وبحمده',
  prayerMethod: '5',
  prayerMadhab: '0',
  prayerTune: JSON.stringify({ Fajr: -2, Isha: 3 }),
  prayerSource: 'city',
  prayerCity: JSON.stringify({ city: 'القاهرة', country: 'مصر' }),
  prayerResolvedCoords: JSON.stringify({ lat: 30.0444, lng: 31.2357 }),
  adhanSettings: JSON.stringify({ enabled: true, preAlert: 10 }),
};

/** مفاتيح تشغيلية يجب ألا تنتقل مع النسخة. */
const RUNTIME_KEYS = {
  updateLastCheckAt: '1700000000000',
  updateDismissedVersionCode: '10300',
};

function buildEnvironment({ nativeAvailable = true } = {}) {
  const store = new Map();
  const disk = { file: null };
  const calls = { saves: 0, picks: 0, exports: 0 };

  const localStorage = {
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i],
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };

  const nativePlugin = {
    save: async ({ json }) => {
      calls.saves++;
      disk.file = json;                      // «التخزين المشترك» — ينجو من الحذف
      return { saved: true, location: 'Documents/Noor/noor-backup.json' };
    },
    readAuto: async () => (disk.file
      ? { found: true, json: disk.file }
      : { found: false }),
    pickAndRead: async () => {
      calls.picks++;
      return disk.file ? { found: true, json: disk.file } : { found: false, reason: 'CANCELLED' };
    },
    exportViaPicker: async () => { calls.exports++; return { saved: true }; },
  };

  const listeners = {};
  const sandbox = {
    console,
    setTimeout: () => {},                     // نمنع الحفظ التلقائي المؤجّل
    localStorage,
    document: {
      addEventListener: (name, fn) => { listeners[name] = fn; },
      visibilityState: 'visible',
    },
    Capacitor: nativeAvailable
      ? { isNativePlatform: () => true, registerPlugin: () => nativePlugin, Plugins: {} }
      : undefined,
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (name, fn) => { listeners[name] = fn; };

  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { NoorBackup: sandbox.NoorBackup, localStorage, store, disk, calls, listeners };
}

function fill(localStorage, data) {
  Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
}

// ---------------------------------------------------------------------------
console.log('اختبار النسخة الاحتياطية\n');

// ---------- 1) الدورة الكاملة ----------
console.log('[1] الدورة الكاملة: حفظ ← حذف التطبيق ← استرجاع');
{
  const env = buildEnvironment();
  fill(env.localStorage, USER_DATA);
  fill(env.localStorage, RUNTIME_KEYS);

  const saved = await env.NoorBackup.save({ force: true });
  check('الحفظ نجح', saved.saved === true);
  check('الملف كُتب في التخزين المشترك', typeof env.disk.file === 'string' && env.disk.file.length > 0);

  const payload = JSON.parse(env.disk.file);
  check('الملف يحمل رقم صيغة وتاريخاً', payload.schema === 1 && !!payload.createdAt);
  check('كل بيانات المستخدم موجودة',
    Object.keys(USER_DATA).every((k) => payload.data[k] === USER_DATA[k]));
  check('المفاتيح التشغيلية مستثناة',
    Object.keys(RUNTIME_KEYS).every((k) => !(k in payload.data)),
    JSON.stringify(Object.keys(payload.data).filter((k) => k in RUNTIME_KEYS)));

  // حذف التطبيق: يمحو localStorage ويُبقي الملف المشترك
  env.store.clear();
  check('بعد الحذف لا بيانات في التطبيق', env.localStorage.length === 0);
  check('لكن ملف النسخة باقٍ', typeof env.disk.file === 'string');

  const restored = await env.NoorBackup.restoreFromPicker();
  check('الاسترجاع نجح', restored.restored === true);
  check(`عاد ${Object.keys(USER_DATA).length} عنصراً`, restored.itemCount === Object.keys(USER_DATA).length,
    `عاد ${restored.itemCount}`);

  const mismatched = Object.keys(USER_DATA).filter((k) => env.localStorage.getItem(k) !== USER_DATA[k]);
  check('كل قيمة عادت مطابقة تماماً', mismatched.length === 0, mismatched.join(', '));
  check('المحفوظات سليمة بعد فكّ الترميز',
    JSON.parse(env.localStorage.getItem('quranBookmarks'))[0].surah === 18);
  check('النص العربي لم يتلف', env.localStorage.getItem('tasbeehPhrase') === 'سبحان الله وبحمده');
}

// ---------- 2) لا حفظ بلا تغيير ----------
console.log('\n[2] تفادي الحفظ المتكرّر بلا داعٍ');
{
  const env = buildEnvironment();
  fill(env.localStorage, USER_DATA);
  await env.NoorBackup.save({ force: true });
  const second = await env.NoorBackup.save();
  check('لا يحفظ مرتين والبيانات لم تتغيّر', second.saved === false && second.reason === 'UNCHANGED');
  check('عدد عمليات الكتابة واحدة', env.calls.saves === 1, String(env.calls.saves));

  env.localStorage.setItem('tasbeehCount', '999');
  const third = await env.NoorBackup.save({ force: true });
  check('لكنه يحفظ بعد تغيّر البيانات', third.saved === true);
  check('والنسخة الجديدة تحمل القيمة الجديدة',
    JSON.parse(env.disk.file).data.tasbeehCount === '999');
}

// ---------- 3) ملفات غير صالحة ----------
console.log('\n[3] رفض الملفات غير الصالحة');
{
  const env = buildEnvironment();
  fill(env.localStorage, USER_DATA);

  env.disk.file = 'ليس JSON على الإطلاق {{{';
  let result = await env.NoorBackup.restoreFromPicker();
  check('يرفض ملفاً تالفاً', result.restored === false && result.reason === 'INVALID_FILE');

  env.disk.file = JSON.stringify({ hello: 'world' });
  result = await env.NoorBackup.restoreFromPicker();
  check('يرفض JSON بلا حقل data', result.restored === false && result.reason === 'INVALID_FILE');

  env.disk.file = JSON.stringify({ schema: 99, data: { theme: 'light' } });
  result = await env.NoorBackup.restoreFromPicker();
  check('يرفض ملفاً من صيغة أحدث من التطبيق',
    result.restored === false && result.reason === 'NEWER_SCHEMA');

  check('البيانات الحالية لم تُمَسّ رغم كل المحاولات',
    env.localStorage.getItem('tasbeehCount') === USER_DATA.tasbeehCount);
}

// ---------- 4) كشف التثبيت الجديد ----------
console.log('\n[4] كشف التثبيت الجديد');
{
  const env = buildEnvironment();
  check('تطبيق فارغ يُعتبر تثبيتاً جديداً', env.NoorBackup.looksEmpty() === true);
  env.localStorage.setItem('theme', 'dark');
  check('وجود الثيم وحده لا يكفي (يُضبط تلقائياً)', env.NoorBackup.looksEmpty() === true);
  env.localStorage.setItem('tasbeehCount', '5');
  check('أول بيانات حقيقية تنفي ذلك', env.NoorBackup.looksEmpty() === false);
}

// ---------- 5) الاسترجاع التلقائي ----------
console.log('\n[5] الاسترجاع التلقائي دون إزعاج');
{
  const env = buildEnvironment();
  fill(env.localStorage, USER_DATA);
  await env.NoorBackup.save({ force: true });
  env.store.clear();

  const result = await env.NoorBackup.restoreAuto();
  check('نجح دون فتح منتقي الملفات', result.restored === true && env.calls.picks === 0);
}

// ---------- 6) المتصفح العادي ----------
console.log('\n[6] خارج التطبيق الأصلي');
{
  const env = buildEnvironment({ nativeAvailable: false });
  check('الميزة معطّلة بلا أعطال', env.NoorBackup.isAvailable() === false);
  const result = await env.NoorBackup.save({ force: true });
  check('الحفظ يعود بسبب واضح', result.saved === false && result.reason === 'UNSUPPORTED');
}

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(56));
if (failures.length) {
  console.log(`فشل ${failures.length} من ${passed + failures.length}: ${failures.join(' | ')}`);
  process.exit(1);
}
console.log(`كل اختبارات النسخة الاحتياطية نجحت ✓ (${passed} تحقّق)`);
