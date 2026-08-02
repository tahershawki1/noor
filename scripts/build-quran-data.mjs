#!/usr/bin/env node
/**
 * يولّد البيانات الوصفية للمصحف التي يعمل بها التطبيق دون إنترنت.
 *
 * المخرج (يُحفظ في islamic-app/data/ ويُرفع للريبو):
 *   quran-meta.json  ~60KB  أسماء السور، بدايات الصفحات والأجزاء والأرباع، السجدات
 *
 * نص المصحف نفسه (islamic-app/data/quran-text/<رقم السورة>.json — ملف مستقل
 * لكل سورة) يُولَّد من مصدر منفصل عبر scripts/build-quran-text.mjs، وليس هنا.
 *
 * المصادر (حزم تُثبَّت عند الحاجة فقط — ليست ضمن اعتماديات المشروع حتى لا
 * تُبطئ `npm ci` في الـ CI، والملفات المولّدة مرفوعة في الريبو أصلاً):
 *
 *   npm i --no-save quran-db quran-meta
 *   node scripts/build-quran-data.mjs
 *
 * quran-db   → عدد آيات كل سورة والاسم العربي/الإنجليزي ومكية/مدنية
 * quran-meta → حدود الصفحات (604) والأجزاء (30) وأرباع الأحزاب (240)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'islamic-app', 'data');

const TOTAL_AYAHS = 6236;
const TOTAL_SURAHS = 114;
const TOTAL_PAGES = 604;
const TOTAL_JUZ = 30;
const TOTAL_RUB = 240;

async function loadSources() {
  try {
    const [surahData, meta] = await Promise.all([
      import('quran-db/utils/surah_data.js'),
      import('quran-meta'),
    ]);
    return {
      surahData: surahData.default,
      hafs: meta.createHafs(),
    };
  } catch (error) {
    console.error('تعذّر تحميل مصادر البيانات:', error.message);
    console.error('\nثبّتها أولاً ثم أعد المحاولة:\n  npm i --no-save quran-db quran-meta\n');
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error('فشل التحقق: ' + message);
    process.exit(1);
  }
}

const { surahData, hafs } = await loadSources();

assert(surahData.length === TOTAL_SURAHS, `عدد السور ${surahData.length} بدل ${TOTAL_SURAHS}`);

// ---------------------------------------------------------------------------
// بيانات السور — الاسم العربي، عدد الآيات، مكية/مدنية، ورقم أول آية عالمياً
// ---------------------------------------------------------------------------
const surahs = [];
let runningAyahId = 1;

for (let n = 1; n <= TOTAL_SURAHS; n++) {
  const db = surahData[n - 1];
  const metaSurah = hafs.getSurahMeta(n);

  assert(db.id === n, `ترتيب السور غير متوقع عند ${n}`);
  assert(
    db.aya === metaSurah.ayahCount,
    `تعارض في عدد آيات السورة ${n}: quran-db=${db.aya} vs quran-meta=${metaSurah.ayahCount}`
  );
  assert(
    metaSurah.firstAyahId === runningAyahId,
    `بداية السورة ${n} غير متطابقة: ${metaSurah.firstAyahId} vs ${runningAyahId}`
  );

  surahs.push({
    n,
    name: db.arabic,
    en: db.name,
    type: db.place === 'Makkah' ? 'مكية' : 'مدنية',
    ayahs: db.aya,
    first: runningAyahId,
  });

  runningAyahId += db.aya;
}

assert(runningAyahId - 1 === TOTAL_AYAHS, 'مجموع الآيات لا يساوي 6236');

// ---------------------------------------------------------------------------
// حدود الصفحات والأجزاء والأرباع — نخزّن رقم أول آية (عالمياً) لكل وحدة،
// فيكفي بحث ثنائي وقت العرض بدل تخزين قيمة لكل آية على حدة
// ---------------------------------------------------------------------------
const pageStarts = [];
for (let p = 1; p <= TOTAL_PAGES; p++) {
  pageStarts.push(hafs.getPageMeta(p).firstAyahId);
}

const juzStarts = [];
for (let j = 1; j <= TOTAL_JUZ; j++) {
  juzStarts.push(hafs.getJuzMeta(j).firstAyahId);
}

const rubStarts = [];
for (let r = 1; r <= TOTAL_RUB; r++) {
  rubStarts.push(hafs.getRubAlHizbMeta(r).firstAyahId);
}

for (const [label, list] of [['الصفحات', pageStarts], ['الأجزاء', juzStarts], ['الأرباع', rubStarts]]) {
  assert(list[0] === 1, `${label}: أول وحدة لا تبدأ بالآية 1`);
  for (let i = 1; i < list.length; i++) {
    assert(list[i] > list[i - 1], `${label}: الترتيب غير تصاعدي عند ${i + 1}`);
  }
  assert(list[list.length - 1] <= TOTAL_AYAHS, `${label}: تجاوز آخر آية`);
}

// ---------------------------------------------------------------------------
// السجدات
// ---------------------------------------------------------------------------
const sajdah = {
  7: 206, 13: 15, 16: 49, 17: 107, 19: 58, 22: 18, 25: 60,
  27: 25, 32: 15, 38: 24, 41: 37, 53: 62, 84: 21, 96: 19,
};

// ---------------------------------------------------------------------------
// الكتابة
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });

const metaFile = path.join(OUT_DIR, 'quran-meta.json');

fs.writeFileSync(metaFile, JSON.stringify({ surahs, pageStarts, juzStarts, rubStarts, sajdah }));

const kb = (file) => Math.round(fs.statSync(file).size / 1024);
console.log(`✓ ${path.relative(ROOT, metaFile)}  ${kb(metaFile)} KB`);
console.log(`  ${TOTAL_SURAHS} سورة • ${TOTAL_AYAHS} آية • ${TOTAL_PAGES} صفحة • ${TOTAL_JUZ} جزء • ${TOTAL_RUB} ربع`);
