#!/usr/bin/env node
/**
 * ينسخ أصول MediaPipe Tasks Vision (كشف الوجه) محلياً حتى تعمل مراقبة
 * النظرة في auto-scroll.js دون أي اتصال بخوادم Google وقت التشغيل.
 *
 * المخرجات: islamic-app/vendor/mediapipe/
 *   vision_bundle.mjs          — واجهة FilesetResolver/FaceDetector (وحدة ES)
 *   vision_wasm_internal.js    — مُحمِّل محرّك WASM (SIMD)
 *   vision_wasm_internal.wasm  — محرّك WASM نفسه (~12 ميجابايت — الأكبر بكثير)
 *   blaze_face_short_range.tflite — نموذج كشف الوجه (قصير المدى، ~225 كيلوبايت)
 *
 * نكتفي بنسخة SIMD فقط (تدعمها كل أجهزة أندرويد الحديثة عملياً) بدل نسخ
 * الثلاث نسخ (SIMD/nosimd/module) التي تنشرها الحزمة — توفير ~23 ميجابايت.
 *
 * الاستعمال (مرة واحدة — الناتج مرفوع في الريبو):
 *   npm i --no-save @mediapipe/tasks-vision
 *   node scripts/build-mediapipe-assets.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG_DIR = path.join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision');
const OUT_DIR = path.join(ROOT, 'islamic-app', 'vendor', 'mediapipe');

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

if (!fs.existsSync(PKG_DIR)) {
  console.error('لم يُعثر على @mediapipe/tasks-vision — نفّذ أولاً: npm i --no-save @mediapipe/tasks-vision');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const COPIES = [
  ['vision_bundle.mjs', 'vision_bundle.mjs'],
  [path.join('wasm', 'vision_wasm_internal.js'), 'vision_wasm_internal.js'],
  [path.join('wasm', 'vision_wasm_internal.wasm'), 'vision_wasm_internal.wasm'],
];

for (const [from, to] of COPIES) {
  fs.copyFileSync(path.join(PKG_DIR, from), path.join(OUT_DIR, to));
  console.log('  ✓ ' + to);
}

const modelPath = path.join(OUT_DIR, 'blaze_face_short_range.tflite');
console.log('تنزيل نموذج كشف الوجه من ' + MODEL_URL + ' …');
const resp = await fetch(MODEL_URL);
if (!resp.ok) {
  console.error('فشل تنزيل النموذج: HTTP ' + resp.status);
  process.exit(1);
}
fs.writeFileSync(modelPath, Buffer.from(await resp.arrayBuffer()));
console.log('  ✓ blaze_face_short_range.tflite');

console.log('تم. لا تنسَ: npm uninstall @mediapipe/tasks-vision (كانت مؤقتة لاستخراج الأصول فقط)');
