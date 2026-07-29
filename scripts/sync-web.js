#!/usr/bin/env node
/**
 * ينسخ مصدر تطبيق الويب (islamic-app/) إلى مجلد أصول Capacitor (www/).
 *
 * islamic-app/ هو المصدر الوحيد للحقيقة: منه يُنشر GitHub Pages، ومنه تُبنى
 * حزمة الويب التي يحملها الـ APK أو تُرفع كتحديث مباشر عبر Capgo.
 *
 * الاستعمال:  npm run sync:web
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'islamic-app');
const TARGET = path.join(ROOT, 'www');

// مستثناة من الحزمة: الصوتيات ضخمة (222MB) والتطبيق يجلبها من everyayah.com،
// وREADME لا لزوم له داخل الـ APK.
const EXCLUDED = new Set(['audio', 'README.md', '.DS_Store']);

function copyRecursive(source, target) {
  const entries = fs.readdirSync(source, { withFileTypes: true });
  fs.mkdirSync(target, { recursive: true });

  for (const entry of entries) {
    if (EXCLUDED.has(entry.name)) {
      continue;
    }
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(from, to);
    } else {
      fs.copyFileSync(from, to);
      console.log('  ✓ ' + path.relative(ROOT, to));
    }
  }
}

if (!fs.existsSync(SOURCE)) {
  console.error('لم يُعثر على مجلد المصدر: ' + SOURCE);
  process.exit(1);
}

console.log('نسخ islamic-app/ → www/');
copyRecursive(SOURCE, TARGET);
console.log('تم. شغّل الآن: npx cap sync android');
