#!/usr/bin/env node
/**
 * ينسخ الخطوط العربية محلياً ويولّد ملف @font-face، فيستغني التطبيق عن
 * Google Fonts ويعمل دون إنترنت.
 *
 * المخرجات: islamic-app/fonts/*.woff2 + islamic-app/fonts/fonts.css
 *
 * الاستعمال (مرة واحدة — الناتج مرفوع في الريبو):
 *   npm i --no-save @fontsource/amiri \
 *     @fontsource/scheherazade-new @fontsource/lateef \
 *     @fontsource-variable/cairo @fontsource-variable/reem-kufi \
 *     @fontsource-variable/noto-naskh-arabic
 *   node scripts/build-fonts.mjs
 *
 * نأخذ نسخة woff2 من المقطع العربي فقط (وlatin لخط الواجهة Cairo حتى تظهر
 * الأرقام والحروف اللاتينية القليلة في الإعدادات) — وهذا يوفّر معظم الحجم.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'islamic-app', 'fonts');
const MODULES = path.join(ROOT, 'node_modules');

/** family: اسم العائلة كما يُستعمل في CSS. weight: قيمة أو مدى للخط المتغيّر. */
const FONTS = [
  { family: 'Amiri', pkg: '@fontsource/amiri', file: 'amiri-arabic-400-normal.woff2', weight: '400' },
  { family: 'Amiri', pkg: '@fontsource/amiri', file: 'amiri-arabic-700-normal.woff2', weight: '700' },
  { family: 'Scheherazade New', pkg: '@fontsource/scheherazade-new', file: 'scheherazade-new-arabic-400-normal.woff2', weight: '400' },
  { family: 'Scheherazade New', pkg: '@fontsource/scheherazade-new', file: 'scheherazade-new-arabic-700-normal.woff2', weight: '700' },
  { family: 'Lateef', pkg: '@fontsource/lateef', file: 'lateef-arabic-400-normal.woff2', weight: '400' },
  { family: 'Lateef', pkg: '@fontsource/lateef', file: 'lateef-arabic-700-normal.woff2', weight: '700' },
  { family: 'Noto Naskh Arabic', pkg: '@fontsource-variable/noto-naskh-arabic', file: 'noto-naskh-arabic-arabic-wght-normal.woff2', weight: '400 700' },
  { family: 'Reem Kufi', pkg: '@fontsource-variable/reem-kufi', file: 'reem-kufi-arabic-wght-normal.woff2', weight: '400 700' },
  { family: 'Cairo', pkg: '@fontsource-variable/cairo', file: 'cairo-arabic-wght-normal.woff2', weight: '200 1000' },
  { family: 'Cairo', pkg: '@fontsource-variable/cairo', file: 'cairo-latin-wght-normal.woff2', weight: '200 1000', unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215' },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const rules = [];
let totalBytes = 0;
const missing = [];

for (const font of FONTS) {
  const source = path.join(MODULES, font.pkg, 'files', font.file);
  if (!fs.existsSync(source)) {
    missing.push(`${font.pkg}/files/${font.file}`);
    continue;
  }

  fs.copyFileSync(source, path.join(OUT_DIR, font.file));
  totalBytes += fs.statSync(source).size;

  rules.push(
    [
      '@font-face {',
      `  font-family: "${font.family}";`,
      '  font-style: normal;',
      `  font-weight: ${font.weight};`,
      '  font-display: swap;',
      `  src: url("./${font.file}") format("woff2");`,
      ...(font.unicodeRange ? [`  unicode-range: ${font.unicodeRange};`] : []),
      '}',
    ].join('\n')
  );
}

if (missing.length) {
  console.error('ملفات خطوط ناقصة — ثبّت الحزم أولاً:\n  ' + missing.join('\n  '));
  process.exit(1);
}

const header = [
  '/* مولَّد آلياً بواسطة scripts/build-fonts.mjs — لا تعدّله يدوياً. */',
  '/* خطوط محلية بدل Google Fonts حتى يعمل التطبيق دون إنترنت. */',
  '',
].join('\n');

fs.writeFileSync(path.join(OUT_DIR, 'fonts.css'), header + rules.join('\n\n') + '\n');

console.log(`✓ ${FONTS.length} ملف خط في islamic-app/fonts/  —  ${Math.round(totalBytes / 1024)} KB`);
