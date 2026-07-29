#!/usr/bin/env node
/**
 * اختبار منطق التحديث الذاتي (islamic-app/app-updates.js).
 *
 * هذا الكود يعمل وحده على أجهزة المستخدمين بلا رقيب: يقرّر متى ينزّل حزمة ويب،
 * ومتى يعرض تحديث APK، ومتى يصمت. خطأ فيه يعني إما تحديثات لا تصل، أو تنزيلاً
 * متكرراً لحزمة يملكها الجهاز أصلاً. لذلك يُختبر بمحاكاة الطبقة الأصلية كاملة
 * بدل جهاز حقيقي.
 *
 * الاستعمال:  npm run test:update-flow
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'islamic-app', 'app-updates.js'), 'utf8');

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

// ---------------------------------------------------------------------------
// بيئة وهمية تحاكي التطبيق الأصلي
// ---------------------------------------------------------------------------

function buildEnvironment({
  manifest, installed, currentBundle, failFirstSource = false, backupFails = false,
}) {
  const calls = {
    fetched: [],
    installBundle: [],
    notified: [],
    downloadAndInstall: [],
    backupSaved: false,
  };

  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  const appUpdater = {
    getInstalled: async () => installed,
    uninstallSelf: async () => { calls.uninstall = true; },
    canInstall: async () => ({ granted: true }),
    requestInstallPermission: async () => ({ granted: true }),
    notifyUpdateAvailable: async (options) => { calls.notified.push(options); },
    cancelNotification: async () => {},
    downloadAndInstall: async (options) => { calls.downloadAndInstall.push(options); return { started: true }; },
    addListener: () => {},
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    localStorage,
    AbortController,
    Capacitor: {
      isNativePlatform: () => true,
      registerPlugin: (name) => (name === 'AppUpdater' ? appUpdater : {}),
      Plugins: {},
    },
    LiveUpdates: {
      isSupported: () => true,
      current: async () => currentBundle,
      installBundle: async (options) => { calls.installBundle.push(options); },
    },
    NoorBackup: {
      isAvailable: () => true,
      save: async () => {
        if (backupFails) return { saved: false, reason: 'PERMISSION' };
        calls.backupSaved = true;
        return { saved: true, location: 'Documents/Noor/noor-backup.json' };
      },
    },
    fetch: async (url) => {
      calls.fetched.push(url);
      if (failFirstSource && url.includes('raw.githubusercontent.com')) {
        throw new Error('network down');
      }
      return { ok: true, status: 200, json: async () => manifest };
    },
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { AppUpdates: sandbox.AppUpdates, calls, localStorage };
}

const INSTALLED = {
  packageName: 'com.noor.islamicapp',
  versionName: '1.2.0',
  versionCode: 10200,
  signature: 'aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44',
};
const BUILTIN_BUNDLE = { bundle: { id: 'builtin', version: 'builtin' }, native: '1.2.0' };

function manifestFor(appVersion, appCode, webVersion, extra = {}) {
  return {
    app: {
      version: appVersion,
      versionCode: appCode,
      apkUrl: `https://github.com/x/y/releases/download/v${appVersion}/noor-${appVersion}.apk`,
      sizeBytes: 15000000,
      notes: 'ملاحظات',
      mandatory: false,
      ...extra,
    },
    web: {
      version: webVersion,
      url: `https://github.com/x/y/releases/download/v${webVersion}/noor-web-${webVersion}.zip`,
      checksum: 'deadbeef',
    },
  };
}

// ---------------------------------------------------------------------------
console.log('اختبار منطق التحديث الذاتي\n');

// ---------- 1) لا جديد ----------
console.log('[1] الجهاز على أحدث نسخة');
{
  const { AppUpdates, calls } = buildEnvironment({
    manifest: manifestFor('1.2.0', 10200, '1.2.0'),
    installed: INSTALLED,
    currentBundle: BUILTIN_BUNDLE,
  });
  const update = await AppUpdates.check({ force: true });
  check('لا يعرض تحديث تطبيق', update === null);
  check('لا ينزّل حزمة ويب يملكها أصلاً', calls.installBundle.length === 0,
    `نزّل ${calls.installBundle.length}`);
  check('لا يرسل إشعاراً', calls.notified.length === 0);
}

// ---------- 2) تحديث ويب فقط ----------
console.log('\n[2] حزمة ويب أحدث (بلا APK جديد)');
{
  const { AppUpdates, calls } = buildEnvironment({
    manifest: manifestFor('1.2.0', 10200, '1.2.1'),
    installed: INSTALLED,
    currentBundle: BUILTIN_BUNDLE,
  });
  await AppUpdates.check({ force: true });
  check('ينزّل الحزمة الأحدث', calls.installBundle.length === 1);
  check('يمرّر الرابط والنسخة والبصمة',
    calls.installBundle[0]?.version === '1.2.1' &&
    calls.installBundle[0]?.checksum === 'deadbeef' &&
    String(calls.installBundle[0]?.url).endsWith('noor-web-1.2.1.zip'));
  check('لا يزعج المستخدم بإشعار لتحديث ويب صامت', calls.notified.length === 0);
}

// ---------- 3) تحديث APK ----------
console.log('\n[3] إصدار APK أحدث');
{
  const { AppUpdates, calls } = buildEnvironment({
    manifest: manifestFor('1.3.0', 10300, '1.2.0'),
    installed: INSTALLED,
    currentBundle: BUILTIN_BUNDLE,
  });
  const update = await AppUpdates.check({ force: true });
  check('يعرض التحديث', !!update);
  check('يحمل النسخة ورقمها', update?.version === '1.3.0' && update?.versionCode === 10300);
  check('يذكر النسخة المثبّتة للمقارنة', update?.installedVersion === '1.2.0');
  check('يرسل إشعاراً للمستخدم', calls.notified.length === 1,
    JSON.stringify(calls.notified));
  check('getPending يعيد نفس التحديث', AppUpdates.getPending()?.versionCode === 10300);
}

// ---------- 4) الرفض يُحترم ----------
console.log('\n[4] المستخدم رفض النسخة');
{
  const env = buildEnvironment({
    manifest: manifestFor('1.3.0', 10300, '1.2.0'),
    installed: INSTALLED,
    currentBundle: BUILTIN_BUNDLE,
  });
  const first = await env.AppUpdates.check({ force: true });
  env.AppUpdates.dismiss(first);
  check('الرفض محفوظ برقم النسخة', env.localStorage.getItem('updateDismissedVersionCode') === '10300');

  // الفحص التلقائي (بلا force) هو ما يجب أن يحترم الرفض. نمسح وقت آخر فحص
  // لنتجاوز فاصل الست ساعات دون أن نتجاوز الرفض معه.
  env.localStorage.removeItem('updateLastCheckAt');
  const second = await env.AppUpdates.check();
  check('الفحص التلقائي لا يعرضها مرة أخرى', second === null);

  // أما الفحص اليدوي فيتجاوز الرفض عمداً: من ضغط الزر يريد جواباً
  const manual = await env.AppUpdates.check({ force: true });
  check('الفحص اليدوي يتجاوز الرفض عمداً', manual?.versionCode === 10300);

  // نسخة أحدث من المرفوضة يجب أن تُعرض
  const later = buildEnvironment({
    manifest: manifestFor('1.4.0', 10400, '1.2.0'),
    installed: INSTALLED,
    currentBundle: BUILTIN_BUNDLE,
  });
  later.localStorage.setItem('updateDismissedVersionCode', '10300');
  const third = await later.AppUpdates.check({ force: true });
  check('لكن نسخة أحدث من المرفوضة تُعرض', third?.versionCode === 10400);
}

// ---------- 5) التحديث الإجباري ----------
console.log('\n[5] تحديث إجباري');
{
  const env = buildEnvironment({
    manifest: manifestFor('1.3.0', 10300, '1.2.0', { mandatory: true }),
    installed: INSTALLED,
    currentBundle: BUILTIN_BUNDLE,
  });
  env.localStorage.setItem('updateDismissedVersionCode', '10300');
  const update = await env.AppUpdates.check({ force: true });
  check('يتجاوز الرفض السابق', update?.mandatory === true);
}

// ---------- 6) لا تراجع للخلف ----------
console.log('\n[6] الملف يحمل نسخة أقدم من المثبّتة');
{
  const { AppUpdates, calls } = buildEnvironment({
    manifest: manifestFor('1.1.0', 10100, '1.1.0'),
    installed: INSTALLED,
    currentBundle: BUILTIN_BUNDLE,
  });
  const update = await AppUpdates.check({ force: true });
  check('لا يعرض نسخة أقدم', update === null);
  check('لا ينزّل حزمة ويب أقدم', calls.installBundle.length === 0);
}

// ---------- 7) المصدر البديل ----------
console.log('\n[7] تعذّر المصدر الأول');
{
  const { AppUpdates, calls } = buildEnvironment({
    manifest: manifestFor('1.3.0', 10300, '1.2.0'),
    installed: INSTALLED,
    currentBundle: BUILTIN_BUNDLE,
    failFirstSource: true,
  });
  const update = await AppUpdates.check({ force: true });
  check('ينتقل تلقائياً إلى GitHub Pages', !!update);
  check('جرّب المصدرين بالترتيب',
    calls.fetched.length === 2 &&
    calls.fetched[0].includes('raw.githubusercontent.com') &&
    calls.fetched[1].includes('github.io'));
}

// ---------- 8) مقارنة الأرقام لا النصوص ----------
console.log('\n[8] مقارنة النسخ رقمياً');
{
  const { AppUpdates, calls } = buildEnvironment({
    manifest: manifestFor('1.2.0', 10200, '1.2.10'),
    installed: INSTALLED,
    currentBundle: { bundle: { id: 'b', version: '1.2.9' }, native: '1.2.0' },
  });
  await AppUpdates.check({ force: true });
  check('1.2.10 أحدث من 1.2.9 (لا مقارنة نصية)', calls.installBundle.length === 1);
}

// ---------- 9) فاصل الفحص ----------
console.log('\n[9] فاصل الفحص التلقائي');
{
  const env = buildEnvironment({
    manifest: manifestFor('1.3.0', 10300, '1.2.0'),
    installed: INSTALLED,
    currentBundle: BUILTIN_BUNDLE,
  });
  env.localStorage.setItem('updateLastCheckAt', String(Date.now()));
  const skipped = await env.AppUpdates.check();
  check('لا يفحص مرتين خلال المهلة', skipped === null && env.calls.fetched.length === 0);
  const forced = await env.AppUpdates.check({ force: true });
  check('لكن الفحص اليدوي يتجاوز المهلة', forced?.versionCode === 10300);
}

// ---------- 10) التثبيت ----------
console.log('\n[10] مسار التثبيت');
{
  const { AppUpdates, calls } = buildEnvironment({
    manifest: manifestFor('1.3.0', 10300, '1.2.0'),
    installed: INSTALLED,
    currentBundle: BUILTIN_BUNDLE,
  });
  await AppUpdates.check({ force: true });
  await AppUpdates.install();
  check('يستدعي التنزيل بالرابط الصحيح',
    calls.downloadAndInstall.length === 1 &&
    String(calls.downloadAndInstall[0].url).endsWith('noor-1.3.0.apk'));
}

// ---------- 11) اختلاف مفتاح التوقيع ----------
console.log('\n[11] النسخة الجديدة موقّعة بمفتاح مختلف');
{
  const manifest = manifestFor('1.3.0', 10300, '1.2.0', {
    sha256Cert: '9999999999999999999999999999999999999999999999999999999999999999',
  });
  const { AppUpdates, calls } = buildEnvironment({
    manifest, installed: INSTALLED, currentBundle: BUILTIN_BUNDLE,
  });
  const update = await AppUpdates.check({ force: true });
  check('يكتشف أن التحديث يتطلّب حذف القديمة', update?.requiresReinstall === true);
  check('الإشعار ينبّه لحفظ البيانات لا للتثبيت المباشر',
    /حذف النسخة القديمة/.test(calls.notified[0]?.notes || ''),
    JSON.stringify(calls.notified[0]));

  // install() يجب أن يتحوّل لمسار إعادة التثبيت لا التنزيل المباشر
  const result = await AppUpdates.install();
  check('install يتحوّل تلقائياً لمسار إعادة التثبيت', result?.ready === true);
  check('النسخة الاحتياطية حُفظت قبل أي شيء آخر', calls.backupSaved === true);
  check('نزّل إلى التنزيلات العامة (تبقى بعد الحذف)',
    calls.downloadAndInstall[0]?.publicDownloads === true);
  check('لم يفتح شاشة التثبيت تلقائياً (الحذف أولاً)',
    calls.downloadAndInstall[0]?.autoInstall === false);
}

// ---------- 12) فشل النسخة الاحتياطية يوقف كل شيء ----------
console.log('\n[12] تعذّر حفظ النسخة الاحتياطية');
{
  const manifest = manifestFor('1.3.0', 10300, '1.2.0', {
    sha256Cert: '9999999999999999999999999999999999999999999999999999999999999999',
  });
  const { AppUpdates, calls } = buildEnvironment({
    manifest, installed: INSTALLED, currentBundle: BUILTIN_BUNDLE, backupFails: true,
  });
  await AppUpdates.check({ force: true });
  const result = await AppUpdates.install();
  check('يتوقّف ولا يكمل', result?.ready === false && result?.reason === 'BACKUP_FAILED');
  check('لم ينزّل شيئاً — لا نُقدِم على خطوة تمحو بيانات غير محفوظة',
    calls.downloadAndInstall.length === 0);
}

// ---------- 13) نفس المفتاح ----------
console.log('\n[13] نفس مفتاح التوقيع');
{
  const manifest = manifestFor('1.3.0', 10300, '1.2.0', { sha256Cert: INSTALLED.signature });
  const { AppUpdates, calls } = buildEnvironment({
    manifest, installed: INSTALLED, currentBundle: BUILTIN_BUNDLE,
  });
  const update = await AppUpdates.check({ force: true });
  check('تحديث عادي بلا حذف', update?.requiresReinstall === false);
  await AppUpdates.install();
  check('ينزّل ويثبّت مباشرة',
    calls.downloadAndInstall[0]?.publicDownloads !== true && calls.backupSaved !== true);
}

// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(56));
if (failures.length) {
  console.log(`فشل ${failures.length} من ${passed + failures.length}: ${failures.join(' | ')}`);
  process.exit(1);
}
console.log(`كل اختبارات التحديث نجحت ✓ (${passed} تحقّق)`);
