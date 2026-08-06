#!/usr/bin/env node
/**
 * يولّد كل أيقونات التطبيق من ملف مصدر واحد: assets/noor-logo.png
 *
 *   • أيقونات مشغّل أندرويد بكل الكثافات (عادية + دائرية + تكيّفية)
 *   • شاشة البداية (splash) بكل الكثافات والاتجاهين
 *   • أيقونات الويب: التبويب، الشاشة الرئيسية، وأيقونة شريط التطبيق
 *
 * المصدر هو الحقيقة الوحيدة — لا يُعدَّل أي ملف مولَّد يدوياً. لتغيير الشعار
 * استبدل assets/noor-logo.png وأعد التشغيل:
 *
 *   npm i --no-save sharp && npm run build:icons
 *
 * (sharp ليست ضمن اعتماديات المشروع حتى لا تُبطئ `npm ci` في الـ CI — مثل
 * playwright تماماً. الأيقونات المولَّدة مُودَعة في المستودع، فالبناء العادي
 * لا يحتاجها.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'assets', 'noor-logo.png');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const WEB_ICONS = path.join(ROOT, 'islamic-app', 'icons');

/**
 * لون أرضية الشعار — مأخوذ من أكثر ألوانه تكراراً (#112E20). تُملأ به الطبقة
 * الخلفية للأيقونة التكيّفية، فتذوب حواف الشعار المستديرة فيها بلا خطّ فاصل.
 */
const BRAND_BG = '#112E20';
const BRAND_RGB = { r: 0x11, g: 0x2e, b: 0x20, alpha: 1 };

/** الكثافات الخمس: الحجم بالبكسل لكل dp واحد. */
const DENSITIES = [
  { dir: 'mdpi', scale: 1 },
  { dir: 'hdpi', scale: 1.5 },
  { dir: 'xhdpi', scale: 2 },
  { dir: 'xxhdpi', scale: 3 },
  { dir: 'xxxhdpi', scale: 4 },
];

/** مقاسات شاشة البداية كما هي في المشروع — نلتزم بها حرفياً. */
const SPLASH = [
  ['drawable', 480, 320],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
];

/**
 * منطقة الأمان في الأيقونة التكيّفية: الطبقة ١٠٨dp لكن المضمون ظهوره هو
 * المربّع الأوسط ٧٢dp فقط — ما خرج عنه تقصّه أقنعة المشغّلات (دائرة، مربّع
 * مستدير، معيَّن…). لذلك يُحجَّم الشعار إلى هذه النسبة بالضبط.
 */
const ADAPTIVE_SAFE_RATIO = 72 / 108;
/** الأيقونة الدائرية: الشعار أصغر قليلاً من الدائرة حتى لا تُقصّ زخارفه. */
const ROUND_LOGO_RATIO = 0.86;
/** شاشة البداية: الشعار نسبةً إلى أقصر ضلع. */
const SPLASH_LOGO_RATIO = 0.34;

const write = (file, buffer) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  console.log('  ✓ ' + path.relative(ROOT, file));
};

/**
 * عتبة فصل الرسم عن أرضيته: كل ما اقترب لونه من BRAND_BG صار شفافاً بالتدريج.
 * بدونها يجلس الشعار بأرضيته المستديرة فوق أرضية الطبقة الخلفية، فيظهر حدّ
 * مربّع باهت حولها — لأن أرضية الشعار متدرّجة (أفتح في وسطها) لا مسطّحة.
 */
const KEY_THRESHOLD = 55;

/**
 * ينزع أرضية الشعار ويُبقي الرسم (القبّة والاسم والمصحف والنجمة وتوهّجها).
 * يُستعمل حيثما جلس الشعار فوق أرضية اللون الموحّد: الأيقونة التكيّفية،
 * والدائرية، وشاشة البداية — فيبدو الرسم طافياً على اللون بلا أي حدّ.
 */
async function keyOutBackground(pngBuffer) {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const distance = Math.hypot(out[i] - BRAND_RGB.r, out[i + 1] - BRAND_RGB.g, out[i + 2] - BRAND_RGB.b);
    const keep = Math.max(0, Math.min(1, distance / KEY_THRESHOLD));
    out[i + 3] = Math.round(out[i + 3] * keep);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toBuffer();
}

/** يحوّل المصدر إلى مربّع بإضافة هامش شفاف — بلا أي تشويه للنسبة. */
async function squareMaster() {
  const meta = await sharp(SOURCE).metadata();
  const side = Math.max(meta.width, meta.height);
  return sharp({
    create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: await sharp(SOURCE).toBuffer(), gravity: 'center' }])
    .png()
    .toBuffer();
}

/** الشعار بحجم بعينه، فوق خلفية شفافة أو ملوّنة، وسط لوحة مربّعة. */
async function logoOnCanvas(source, canvas, logoSize, background) {
  const logo = await sharp(source).resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({
    create: {
      width: canvas, height: canvas, channels: 4,
      background: background || { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer();
}

/** يقصّ الصورة في دائرة كاملة القطر. */
async function circleMask(buffer, size) {
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
  return sharp(buffer).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error('لم يُعثر على ملف الشعار: ' + path.relative(ROOT, SOURCE));
    process.exit(1);
  }
  const master = await squareMaster();
  const keyed = await keyOutBackground(master);
  const masterSide = (await sharp(master).metadata()).width;
  console.log(`المصدر: ${path.relative(ROOT, SOURCE)} → مربّع ${masterSide}×${masterSide}\n`);

  console.log('أيقونات مشغّل أندرويد:');
  for (const { dir, scale } of DENSITIES) {
    const legacy = Math.round(48 * scale);
    const adaptive = Math.round(108 * scale);

    // العادية (أندرويد ٧ فأقدم): الشعار كما هو بحوافه المستديرة
    write(
      path.join(RES, `mipmap-${dir}`, 'ic_launcher.png'),
      await sharp(master).resize(legacy, legacy).png().toBuffer()
    );

    // الدائرية: أرضية الشعار تملأ الدائرة والشعار داخلها بهامش أمان
    write(
      path.join(RES, `mipmap-${dir}`, 'ic_launcher_round.png'),
      await circleMask(
        await logoOnCanvas(keyed, legacy, Math.round(legacy * ROUND_LOGO_RATIO), BRAND_RGB),
        legacy
      )
    );

    // طبقة المقدّمة للأيقونة التكيّفية (أندرويد ٨ فأحدث)
    write(
      path.join(RES, `mipmap-${dir}`, 'ic_launcher_foreground.png'),
      await logoOnCanvas(keyed, adaptive, Math.round(adaptive * ADAPTIVE_SAFE_RATIO), null)
    );
  }

  console.log('\nلون الطبقة الخلفية للأيقونة التكيّفية:');
  write(
    path.join(RES, 'values', 'ic_launcher_background.xml'),
    Buffer.from(
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<!-- مولَّد من scripts/build-app-icons.mjs — أكثر ألوان الشعار تكراراً،\n' +
      '     فتذوب حوافه المستديرة في الخلفية بلا خطّ فاصل. -->\n' +
      '<resources>\n' +
      `    <color name="ic_launcher_background">${BRAND_BG}</color>\n` +
      '</resources>\n'
    )
  );

  console.log('\nشاشة البداية:');
  for (const [dir, width, height] of SPLASH) {
    const logoSize = Math.round(Math.min(width, height) * SPLASH_LOGO_RATIO);
    const logo = await sharp(keyed).resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
    write(
      path.join(RES, dir, 'splash.png'),
      await sharp({ create: { width, height, channels: 4, background: BRAND_RGB } })
        .composite([{ input: logo, gravity: 'center' }])
        .png()
        .toBuffer()
    );
  }

  console.log('\nأيقونات الويب:');
  // شفافة الأركان — للتبويب وشريط التطبيق
  for (const size of [16, 32, 64, 128, 192, 512]) {
    write(
      path.join(WEB_ICONS, `icon-${size}.png`),
      await sharp(master).resize(size, size).png().toBuffer()
    );
  }
  // maskable: الشعار داخل منطقة الأمان على أرضيته — لاختصار الشاشة الرئيسية
  write(
    path.join(WEB_ICONS, 'icon-maskable-512.png'),
    await logoOnCanvas(keyed, 512, Math.round(512 * ADAPTIVE_SAFE_RATIO), BRAND_RGB)
  );
  // iOS لا يحترم الشفافية في أيقونة الشاشة الرئيسية، فتُسطَّح على الأرضية
  write(
    path.join(WEB_ICONS, 'apple-touch-icon.png'),
    await logoOnCanvas(keyed, 180, 180, BRAND_RGB)
  );

  console.log('\nتم. الأيقونات المولَّدة مُودَعة في المستودع — لا حاجة لتشغيل هذا إلا عند تغيير الشعار.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
