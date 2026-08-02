## Communication Style

Respond like a caveman. No articles, no filler words, no pleasantries.
Short. Direct. Code speaks for itself.
If asked for code, give code. No explain unless asked.
No sycophancy. No restating the question. No sign-offs.

# نور — تعليمات المشروع

## دورة التحديث: نفّذها كاملة بلا استئذان

صاحب المشروع منح إذناً دائماً (٢٩ يوليو ٢٠٢٦) بتنفيذ دورة النشر كاملة بعد أي
تعديل، دون سؤال في كل خطوة. المطلوب بعد إنهاء أي شغل:

1. **رفع رقم النسخة** في `package.json` — patch افتراضياً، minor لميزة جديدة،
   major لتغيير كاسر. (`android/app/build.gradle` يشتق منها `versionName`
   و`versionCode` تلقائياً.)
2. **كوميت ودفع** على فرع العمل.
3. **دمج على `main`** — وهو ما يُطلق نشر GitHub Pages.
4. **بناء APK** إن مسّ التعديل أي شيء أصلي (جافا، Manifest، موارد أندرويد،
   إعدادات Capacitor).
5. **إصدار جديد** عبر workflow «إصدار جديد (نسخة + APK)» إن كان التعديل يستحق
   وصوله لأجهزة المستخدمين.

الهدف: ألا يضطر المستخدم لطلب ذلك في كل مرة.

**ما يبقى محتاجاً إذناً صريحاً:** حذف فروع أو تاريخ، `push --force`، حذف
إصدارات منشورة، تغيير أسرار المستودع، وأي عملية تفقد شغلاً لا يمكن استرجاعه.

## قواعد ثابتة في هذا المستودع

- **`islamic-app/` هو المصدر الوحيد للحقيقة.** لا تعدّل `www/` يدوياً أبداً —
  شغّل `npm run sync:web` فينسخها. (ومنه تُنشر GitHub Pages كذلك.)
- **رقم النسخة مصدره `package.json` وحده.** لا تكتبه يدوياً في أي ملف آخر.
- **حاسبا المواقيت توأمان:** `islamic-app/prayer-times.js` و
  `android/…/widget/PrayerTimesCalculator.java`. أي تعديل في أحدهما يجب أن
  ينعكس في الآخر، و`npm run test:prayer-calc` يفشل البناء إن افترقا.
- **`version.json` تكتبه الـ CI لا اليد.** هو ما تقرأه الأجهزة المثبَّتة لتعرف
  أن هناك تحديثاً.
- **لا تحذف `live-updates.js` ولا تؤجّل تحميله** — يستدعي `notifyAppReady()`،
  وبدونها يتراجع البلاجن عن أي حزمة ويب جديدة بعد ١٠ ثوانٍ.

## خريطة الملفات (islamic-app/)

كل صفحة في ملف مستقل — لا حاجة لقراءة كل الملفات لتعديل صفحة واحدة.
الترتيب في `index.html` مهم (كل ملف يعتمد على ما قبله عبر متغيرات/دوال
عامة، لا وحدات ES):

| الملف | يملك |
|---|---|
| `app-shell.js` | أساسيات مشتركة (`$`, `icon`, التنقل `navigateTo`, الوضع الليلي، الهجري، وضع القراءة الغامر) — يُحمَّل أولاً |
| `quran-reader.js` | صفحة القرآن: القائمة، البحث، القارئ (`renderSurah`/`openSurah`)، متابعة القراءة، الخط، منتقي السورة. `khatma.js` يستدعي محرك القراءة هنا فلا يُكرَّر |
| `adhkar.js` | الأذكار + السبحة |
| `bookmarks.js` | الإشارات المرجعية |
| `prayer-page.js` | واجهة صفحة المواقيت (البحث بالموقع/المدينة، التصحيح، ودجت الشاشة الرئيسية) — فوق حاسب `prayer-times.js`، لا بديل عنه |
| `adiyah.js` | صفحة الأدعية |
| `adhan-page.js` | صفحة الأذان + إقلاع التطبيق (`loadSurahList()`... `navigateTo("home")` في آخره) |
| `settings-ui.js` | واجهة الإعدادات: شريط تحديث الـ APK، النسخة الاحتياطية، تدفّق إعادة التثبيت — فوق `app-updates.js`/`backup.js` |
| `khatma.js` | ختمة القرآن |

ملفات مساندة (ليست صفحات): `quran-data.js` (بيانات القرآن)، `quran-audio-offline.js`
(تنزيل/تخزين مؤقت للتلاوة عبر Cache API — نسخة Opus مستضافة في
`islamic-app/audio/` وتُنشر عبر GitHub Pages، مستبعدة من `www/` في
`scripts/sync-web.js`)، `prayer-times.js`
(حاسب المواقيت — توأم `PrayerTimesCalculator.java`)، `adhkar-data.js` (بيانات
خام)، `auto-scroll.js` (تمرير تلقائي + مراقبة نظرة عبر MediaPipe، أصولها في
`vendor/mediapipe/` وتُجهَّز بـ `scripts/build-mediapipe-assets.mjs`)،
`live-updates.js`/`app-updates.js` (التحديث الذاتي)، `backup.js` (منطق
النسخة الاحتياطية)، `floating-widget.js`/`prayer-widget.js` (SDK الزر
العائم/الودجت).

## الاختبارات قبل الدفع

```bash
npm run test:prayer-calc     # سريع، لا يحتاج غير javac
npm run test:offline         # يحتاج: npm i --no-save playwright
```

## اللغة

التعليقات ورسائل الكوميت والتوثيق بالعربية، ومخاطبة المستخدم بالعامية المصرية.
