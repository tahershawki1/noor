#!/usr/bin/env node
/**
 * يبني معلومات النسخة داخل مجلد النشر:
 *   ١) يكتب ‎version.json‎ (يقرأه العميل لاكتشاف التحديثات).
 *   ٢) يملأ ‎<meta name="noor-version">‎ في ‎index.html‎.
 *   ٣) يضيف ‎?v=<sha>‎ لروابط CSS/JS حتى لا يخدم المتصفح نسخة قديمة بعد التحديث.
 *
 * الاستخدام:
 *   node scripts/build-version.mjs [مجلد-النشر]
 *
 * يقرأ الـ sha من ‎GITHUB_SHA‎ وإلا من ‎git rev-parse HEAD‎.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const targetDir = path.resolve(process.argv[2] || "islamic-app");

const git = (command, fallback) => {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (_) {
    return fallback;
  }
};

const sha = process.env.GITHUB_SHA || git("git rev-parse HEAD", "dev");
const message =
  process.env.COMMIT_MESSAGE || git("git log -1 --pretty=%s", "تحديث");
const repo = process.env.GITHUB_REPOSITORY || "tahershawki1/noor";
const branch = process.env.GITHUB_REF_NAME || git("git rev-parse --abbrev-ref HEAD", "main");

const pkgPath = path.resolve("package.json");
const version = fs.existsSync(pkgPath)
  ? JSON.parse(fs.readFileSync(pkgPath, "utf8")).version || "1.0.0"
  : "1.0.0";

const shortSha = sha.slice(0, 7);
const info = {
  version,
  sha,
  shortSha,
  message,
  builtAt: new Date().toISOString(),
  repo,
  branch,
};

fs.writeFileSync(path.join(targetDir, "version.json"), `${JSON.stringify(info, null, 2)}\n`);

const indexPath = path.join(targetDir, "index.html");
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, "utf8");

  html = html.replace(
    /<meta name="noor-version" content="[^"]*"\s*\/?>/,
    `<meta name="noor-version" content="${sha}" />`
  );
  html = html.replace(
    /<meta name="noor-release" content="[^"]*"\s*\/?>/,
    `<meta name="noor-release" content="${version}" />`
  );

  // كسر ذاكرة المتصفح لملفات الواجهة المحلية فقط (نتجاهل الروابط الخارجية)
  html = html.replace(
    /(<(?:script src|link[^>]*href)=")((?!https?:|\/\/)[^"?]+\.(?:js|css))(")/g,
    (_match, before, file, after) => `${before}${file}?v=${shortSha}${after}`
  );

  fs.writeFileSync(indexPath, html);
}

console.log(`✔ نسخة ${version} (${shortSha}) — ${path.relative(process.cwd(), targetDir)}`);
