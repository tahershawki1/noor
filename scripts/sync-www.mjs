#!/usr/bin/env node
/**
 * ينسخ ملفات الواجهة من ‎islamic-app/‎ إلى ‎www/‎ (المصدر الذي يبني منه Capacitor
 * تطبيق الأندرويد) — بدون مجلد الصوتيات.
 *
 * الاستخدام: npm run sync:www
 */
import fs from "node:fs";
import path from "node:path";

const source = path.resolve("islamic-app");
const target = path.resolve("www");
const SKIP_DIRS = new Set(["audio"]);
const SKIP_FILES = new Set(["README.md"]);

fs.mkdirSync(target, { recursive: true });

let copied = 0;
for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    if (SKIP_DIRS.has(entry.name)) continue;
    fs.cpSync(path.join(source, entry.name), path.join(target, entry.name), { recursive: true });
    copied += 1;
    continue;
  }
  if (SKIP_FILES.has(entry.name)) continue;
  fs.copyFileSync(path.join(source, entry.name), path.join(target, entry.name));
  copied += 1;
}

console.log(`✔ نُسخ ${copied} عنصراً من islamic-app/ إلى www/`);
