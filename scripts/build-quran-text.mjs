#!/usr/bin/env node
/**
 * يولّد نص المصحف — ملف مستقل لكل سورة — من ملفات مصدر خام برسم عثماني
 * (سورة واحدة لكل ملف، بصيغة "اسم السورة&[البسملة⏎]آية # آية # آية...").
 *
 * المخرج (يُحفظ في islamic-app/data/quran-text/ ويُرفع للريبو):
 *   1.json .. 114.json   مصفوفة JSON بنصوص آيات السورة بالترتيب
 *
 * الاستعمال:
 *   node scripts/build-quran-text.mjs <مجلد المصدر>
 *
 * يتطلب data/quran-meta.json (يُولَّد بـ build-quran-data.mjs) للتحقق من
 * عدد آيات كل سورة قبل الكتابة.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'islamic-app', 'data');
const OUT_DIR = path.join(DATA_DIR, 'quran-text');

const TOTAL_SURAHS = 114;
const NO_BASMALA_LINE = new Set([1, 9]); // الفاتحة: البسملة آية١ — التوبة: بلا بسملة

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('الاستعمال: node scripts/build-quran-text.mjs <مجلد المصدر>');
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) {
    console.error('فشل التحقق: ' + message);
    process.exit(1);
  }
}

const meta = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'quran-meta.json'), 'utf-8'));
assert(meta.surahs.length === TOTAL_SURAHS, `quran-meta.json فيه ${meta.surahs.length} سورة بدل ${TOTAL_SURAHS}`);

function cleanAyah(text) {
  return text.replace(/﻿/g, '').replace(/[ \t]+/g, ' ').trim();
}

function parseSurahFile(n) {
  const raw = fs.readFileSync(path.join(sourceDir, String(n)), 'utf-8');
  const content = raw.replace(/^﻿/, '').replace(/\r/g, '').replace(/\n+$/, '');
  const [, rest] = content.split(/&(.*)$/s);
  assert(rest !== undefined, `سورة ${n}: لا يوجد فاصل "&" بين الاسم والنص`);

  let ayatPart = rest;
  if (!NO_BASMALA_LINE.has(n)) {
    const lines = rest.split('\n').filter((l) => l.trim() !== '');
    assert(lines.length === 2, `سورة ${n}: عدد أسطر غير متوقع (${lines.length}) بعد فصل الاسم`);
    ayatPart = lines[1];
  }

  return ayatPart
    .split('#')
    .map(cleanAyah)
    .filter((a) => a !== '');
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let totalBytes = 0;
for (let n = 1; n <= TOTAL_SURAHS; n++) {
  const ayat = parseSurahFile(n);
  const expected = meta.surahs[n - 1].ayahs;
  assert(ayat.length === expected, `سورة ${n} (${meta.surahs[n - 1].name}): ${ayat.length} آية بدل ${expected}`);

  const outFile = path.join(OUT_DIR, `${n}.json`);
  fs.writeFileSync(outFile, JSON.stringify(ayat));
  totalBytes += fs.statSync(outFile).size;
}

console.log(`✓ ${TOTAL_SURAHS} ملف في islamic-app/data/quran-text/  (${Math.round(totalBytes / 1024)} ك.ب إجمالاً)`);
