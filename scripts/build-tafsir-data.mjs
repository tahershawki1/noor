#!/usr/bin/env node
/**
 * ينزّل تفسير الميسر كاملاً ويحوّله لملف محلي يعمل دون إنترنت.
 *
 * المخرجات: islamic-app/data/tafsir-muyassar.json
 *   مصفوفة من 114 مصفوفة، الفهرس = رقم الآية ناقص واحد.
 *
 * المصدر: مستودع spa5k/tafsir_api (نسخة ar-tafsir-muyassar، وهي نفس
 * التفسير الذي كان التطبيق يجلبه سابقاً من alquran.cloud بالمعرّف ar.muyassar).
 *
 * الاستعمال (يحتاج إنترنت — مرة واحدة فقط، والناتج مرفوع في الريبو):
 *   node scripts/build-tafsir-data.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'islamic-app', 'data');
const OUT_FILE = path.join(DATA_DIR, 'tafsir-muyassar.json');
const META_FILE = path.join(DATA_DIR, 'quran-meta.json');

const BASE = 'https://raw.githubusercontent.com/spa5k/tafsir_api/main/tafsir/ar-tafsir-muyassar';
const CONCURRENCY = 8;

if (!fs.existsSync(META_FILE)) {
  console.error('شغّل scripts/build-quran-data.mjs أولاً — نحتاج عدد آيات كل سورة للتحقق.');
  process.exit(1);
}

const { surahs } = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));

async function fetchSurah(surahNumber, attempt = 1) {
  try {
    const response = await fetch(`${BASE}/${surahNumber}.json`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (attempt >= 4) {
      throw new Error(`فشل تحميل تفسير السورة ${surahNumber}: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    return fetchSurah(surahNumber, attempt + 1);
  }
}

const tafsir = new Array(surahs.length);
let done = 0;

async function worker(queue) {
  while (queue.length) {
    const surahNumber = queue.shift();
    const entries = await fetchSurah(surahNumber);
    const expected = surahs[surahNumber - 1].ayahs;
    const texts = new Array(expected).fill('');

    for (const entry of entries) {
      const index = Number(entry.ayah) - 1;
      if (index >= 0 && index < expected) {
        texts[index] = String(entry.text || '').trim();
      }
    }

    const missing = texts.filter((t) => !t).length;
    if (missing) {
      console.warn(`⚠ السورة ${surahNumber}: ${missing} آية بلا تفسير`);
    }

    tafsir[surahNumber - 1] = texts;
    done++;
    if (done % 20 === 0 || done === surahs.length) {
      console.log(`  ${done}/${surahs.length}`);
    }
  }
}

const queue = surahs.map((s) => s.n);
console.log('تحميل تفسير الميسر...');
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

const totalAyahs = tafsir.reduce((sum, list) => sum + list.length, 0);
if (totalAyahs !== 6236) {
  console.error(`عدد الآيات ${totalAyahs} بدل 6236 — لن يُكتب الملف.`);
  process.exit(1);
}

fs.writeFileSync(OUT_FILE, JSON.stringify(tafsir));
console.log(`✓ ${path.relative(ROOT, OUT_FILE)}  ${Math.round(fs.statSync(OUT_FILE).size / 1024)} KB  (${totalAyahs} آية)`);
