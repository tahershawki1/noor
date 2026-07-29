# الغلاف الأصلي (Native Shell) — دليل كامل

هذا المستند يشرح البنية التي تجعل **الـ APK يُبنى مرة واحدة فقط**، وكل ما بعدها
(تحديث الكود، تفعيل الميزات، التحكم بالصلاحيات، الزر العائم) يُدار من كود الويب.

```
islamic-app/          ← مصدر الويب (المنشور على GitHub Pages + مصدر حزم التحديث)
  ├─ index.html
  ├─ app.js, styles.css, adhkar-data.js
  ├─ live-updates.js    ← تطبيق حزم الويب الجديدة
  ├─ app-updates.js     ← التحديث الذاتي: يقرأ version.json ويقرّر أي مسار
  ├─ backup.js          ← نسخة احتياطية تنجو من حذف التطبيق
  ├─ prayer-widget.js   ← الـ SDK الخاص بودجتات الشاشة الرئيسية
  ├─ floating-widget.js ← الـ SDK الخاص بالزر العائم
  └─ version.json       ← تكتبه الـ CI؛ وهو ما تقرأه الأجهزة لتعرف أن هناك تحديثاً
www/                  ← نسخة الويب التي يحملها Capacitor (تُولَّد بـ npm run sync:web)
android/
  ├─ app/src/main/AndroidManifest.xml         ← كل الصلاحيات معلنة مسبقاً
  └─ app/src/main/java/com/noor/islamicapp/
       ├─ MainActivity.java                    ← يسجّل البلاجنات المحلية
       ├─ floating/                            ← الزر العائم فوق التطبيقات
       ├─ widget/                              ← ودجتا الشاشة الرئيسية + حاسب المواقيت
       ├─ update/                              ← تنزيل الـ APK وتثبيته والإشعار به
       └─ backup/                              ← النسخة الاحتياطية في التخزين المشترك
capacitor.config.json ← إعدادات Capacitor
scripts/sync-web.js   ← islamic-app/ → www/
```

---

## 1) إعداد Capacitor والربط مع الموقع

`capacitor.config.json`:

| المفتاح | القيمة | السبب |
|---|---|---|
| `webDir` | `www` | أصول الويب تُحزم داخل الـ APK فتعمل بلا إنترنت، ثم تُستبدل لاسلكياً بحزمة من GitHub |
| `server.androidScheme` | `https` | يجعل أصل الـ WebView هو `https://localhost` — **شرط أساسي** لعمل `getUserMedia` و`geolocation` وService Workers (المتصفحات ترفضها على أصل غير آمن) |
| `server.allowNavigation` | نطاقات الـ API | يسمح بالانتقال إلى نطاقات alquran / aladhan / everyayah دون خروج للمتصفح |
| `android.allowMixedContent` | `false` | يمنع تحميل موارد http داخل صفحة https |
| `android.captureInput` | `true` | تحسين إدخال لوحة المفاتيح داخل الـ WebView |
| `android.appendUserAgent` | `NoorNativeShell` | يمكّن كود الويب من التمييز: `navigator.userAgent.includes('NoorNativeShell')` |

### وضع "التحميل من الموقع مباشرة" (بديل اختياري)

إن أردت أن يعرض التطبيق موقعك الحيّ بدل الأصول المحزّمة، أضف إلى الإعدادات:

```json
"server": {
  "url": "https://tahershawki1.github.io/noor/",
  "cleartext": false,
  "androidScheme": "https"
}
```

**لكن هذا ليس الوضع الموصى به هنا**، لأن:

- التطبيق يصبح بلا فائدة بدون إنترنت (لا أذكار ولا سبحة أوفلاين).
- `server.url` يتعارض مع Capgo: البلاجن يبدّل مجلد الأصول المحلي، وهو ما يُتجاهل تماماً حين يكون التحميل من رابط خارجي.
- سياسات Google Play تتشدّد مع التطبيقات التي هي مجرد إطار لموقع.

الوضع الحالي (أصول محزّمة + حزمة تُنزَّل من GitHub) يعطيك نفس النتيجة — تحديث فوري بلا APK جديد — مع بقاء العمل دون اتصال.

### الكاميرا والميكروفون (WebRTC)

لا يحتاج الأمر أي بلاجن. عند استدعاء الويب لـ:

```js
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
```

يستقبل `BridgeWebChromeClient.onPermissionRequest` في Capacitor الطلب، ويحوّله إلى
طلب صلاحيات أندرويد (`CAMERA` + `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`)، ويمنح
الـ WebView الإذن بعد موافقة المستخدم. الصلاحيات الثلاث معلنة مسبقاً في الـ Manifest،
لذلك تعمل الميزة بتحديث ويب فقط.

الشروط الثلاثة التي تحققت بالفعل:
1. الأصل آمن (`androidScheme: https`) ✅
2. الصلاحيات في الـ Manifest ✅
3. `mediaPlaybackRequiresUserGesture = false` (يضبطها Capacitor تلقائياً) ✅

---

## 2) الصلاحيات الموحّدة (Grand Permissions Shell)

كل الصلاحيات معلنة في `android/app/src/main/AndroidManifest.xml` قبل وسم `<application>`:

| المجموعة | الصلاحيات |
|---|---|
| الشبكة | `INTERNET`, `ACCESS_NETWORK_STATE` |
| الوسائط الحية | `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` |
| التخزين والمعرض | `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`, `READ_EXTERNAL_STORAGE` (maxSdk 32)، `WRITE_EXTERNAL_STORAGE` (maxSdk 28) |
| الموقع | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` |
| الإشعارات | `POST_NOTIFICATIONS`, `VIBRATE` |
| إضافية | `USE_BIOMETRIC`, `USE_FINGERPRINT`, `BLUETOOTH` (maxSdk 30), `BLUETOOTH_CONNECT` |
| الطبقة العائمة | `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE` |

**ملاحظات مهمة:**

- **الإعلان ≠ المنح.** الصلاحيات الخطرة تُطلب وقت التشغيل. ما ضمنّاه هو أن الطلب
  *ممكن* دون إعادة بناء الـ APK.
- `FOREGROUND_SERVICE_SPECIAL_USE` مضافة لأن `targetSdk = 36`؛ منذ Android 14 لا
  تعمل خدمة أمامية بلا نوع معلن.
- `uses-feature ... required="false"` تمنع Google Play من إخفاء التطبيق عن الأجهزة
  التي تنقصها الكاميرا أو البلوتوث أو GPS.
- الصلاحيات التي تحتاج بلاجن أصلي لاستعمالها من الويب (البصمة، البلوتوث، الإشعارات
  المحلية) تبقى معلنة وجاهزة، لكن إضافة البلاجن نفسه تتطلب بناء APK جديد. الجاهز
  للاستعمال فوراً من الويب هو: الكاميرا، الميكروفون، الموقع، اختيار الملفات،
  الاهتزاز (`navigator.vibrate`)، والزر العائم.

---

## 3) آلية استبدال حزمة الويب (`@capgo/capacitor-updater`)

> **اقرأ القسم 6 أولاً.** مصدر التحديثات في نور هو **GitHub** لا خوادم Capgo،
> و`autoUpdate` مضبوط على `false`. البلاجن يُستعمل هنا كـ«محرّك» فقط: هو ما
> يعرف كيف ينزّل حزمة Zip ويستبدل بها أصول الويب ويتراجع إن فشلت. وما تبقّى من
> هذا القسم يصف قدرات البلاجن وخدمة Capgo كخطة بديلة.

الوحدة البرمجية: [`islamic-app/live-updates.js`](../islamic-app/live-updates.js) — وفيها الشرح الكامل داخل الكود.

### الدورة العملية للتحديث

```bash
# 1. عدّل ما تشاء داخل islamic-app/
# 2. ارفع رقم النسخة
npm version patch                    # 1.0.0 → 1.0.1
# 3. انسخ إلى www وارفع الحزمة
npm run bundle:upload                # = sync:web + capgo bundle upload --channel production
```

`bundle upload` يضغط مجلد `www` في ملف **Zip**، يرفعه إلى Capgo، ويربطه بقناة
`production`. الأجهزة تلتقط التحديث خلال دقائق (`periodCheckDelay: 600` ثانية)
وتطبّقه عند إعادة فتح التطبيق. **الـ APK لا يُلمَس.**

مرة واحدة فقط قبل أول رفع:

```bash
npx @capgo/cli@latest init <API_KEY>   # من حسابك على https://capgo.app
```

### قنوات الاختبار

```bash
npx @capgo/cli@latest bundle upload --channel beta
```

ثم من داخل الويب على جهازك: `LiveUpdates.setChannel('beta')` — وللعودة
`LiveUpdates.setChannel('production')`.

### استضافة ذاتية (بدون Capgo)

```bash
npm run bundle:zip     # ينتج ملف Zip من مجلد www
```

ارفع الـ Zip على أي استضافة ثابتة، ثم جهّز نقطة نهاية ترد بـ:

```json
{ "version": "1.0.1", "url": "https://example.com/noor-1.0.1.zip", "checksum": "<sha256>" }
```

ووجّه البلاجن إليها عبر `plugins.CapacitorUpdater.updateUrl` في `capacitor.config.json`،
أو وقت التشغيل بـ `LiveUpdates.setUpdateUrl('https://…')`.

### واجهة `LiveUpdates` من الويب

```js
LiveUpdates.isSupported();          // داخل التطبيق الأصلي فقط
await LiveUpdates.current();        // الحزمة العاملة حالياً
await LiveUpdates.checkNow();       // فحص فوري (لزر "تحقق من التحديثات")
await LiveUpdates.setChannel('beta');
await LiveUpdates.reset();          // العودة لنسخة الويب المدمجة في الـ APK
LiveUpdates.onEvent((event, data) => console.log(event, data));
```

### ⚠️ `notifyAppReady()`

`live-updates.js` يستدعيها فور تحميله. لو حُذف الملف أو تعطّل قبلها، سيعتبر
البلاجن الحزمة الجديدة فاشلة ويتراجع تلقائياً للنسخة السابقة بعد 10 ثوانٍ
(`appReadyTimeout`). هذه في الواقع **شبكة أمان**: تحديث ويب مكسور لن يُعطّل
التطبيق على أجهزة المستخدمين.

### ما لا يمكن تحديثه لاسلكياً

صلاحيات الـ Manifest، كود جافا، إضافات Capacitor جديدة، أيقونة التطبيق واسمه.
لهذا السبب أُعلنت كل الصلاحيات مسبقاً وبُني الزر العائم بواجهة عامة قابلة
للتشكيل من الويب.

---

## 4) الزر العائم (System Overlay / Floating Widget)

### البنية

| الملف | الدور |
|---|---|
| `FloatingWidgetPlugin.java` | يستقبل نداءات الجافاسكريبت ويُطلق الأحداث نحوها |
| `FloatingWidgetService.java` | خدمة أمامية ترسم الطبقة العائمة عبر `WindowManager` |
| `FloatingWidgetConfig.java` | يحوّل JSON القادم من الويب إلى إعدادات، ويدعم التحديث الجزئي |
| `islamic-app/floating-widget.js` | الـ SDK الذي تستدعيه من الموقع |

الزر يعمل كـ **Foreground Service** حتى يبقى ظاهراً بعد خروج المستخدم من التطبيق،
مع إشعار صامت بأهمية `IMPORTANCE_MIN` (يفرضه نظام أندرويد لأي خدمة أمامية).

### الاستعمال من الويب

```js
// 1) الصلاحية: تُمنح من شاشة إعدادات النظام، مرة واحدة لكل جهاز
const { granted } = await FloatingWidget.requestPermission();

// 2) العرض
await FloatingWidget.show({
  text: "My Button",
  icon: "path/or/url",
  position: { x: 100, y: 200 },
  style: { backgroundColor: "#000", borderRadius: "50%" }
});

// 3) الاستماع للنقر
FloatingWidget.onClick((data) => {
  console.log('نُقر على الزر', data.x, data.y, data.payload);
});

// 4) تحديث جزئي — يكفي إرسال ما تغيّر
await FloatingWidget.update({ text: "١٥ ذكراً", style: { backgroundColor: "#C9A227" } });

// 5) الإخفاء
await FloatingWidget.hide();
```

### كل الخيارات

| الخيار | الافتراضي | الشرح |
|---|---|---|
| `text` | `null` | نص الزر (اتركه فارغاً لزر أيقونة فقط) |
| `icon` | `null` | `https://…` أو `data:image/png;base64,…` أو مسار داخل أصول الويب مثل `icons/star.png` |
| `position.x` / `position.y` | `16` / `200` | المسافة بالـ **dp** من حافة الـ anchor |
| `position.anchor` | `top-left` | `top-left` \| `top-right` \| `bottom-left` \| `bottom-right` |
| `width` / `height` | `wrap` | رقم بالـ dp أو `'wrap'` |
| `style.backgroundColor` | `#0F7B6C` | يقبل `#RGB`, `#RRGGBB`, `#AARRGGBB`, `rgb()`, `rgba()` |
| `style.borderRadius` | `50%` | رقم dp، أو `'24px'`، أو نسبة `'50%'` (تُحسب من أصغر بُعد → دائرة تامة) |
| `style.color` / `fontSize` / `fontWeight` | `#FFFFFF` / `14` / `normal` | خصائص النص |
| `style.borderColor` / `borderWidth` | `null` / `0` | إطار الزر |
| `style.padding` أو `paddingHorizontal`/`paddingVertical` | `16` | الحشو بالـ dp |
| `style.opacity` | `1` | من 0 إلى 1 |
| `style.elevation` | `8` | قوة الظل بالـ dp |
| `iconSize` | `26` | حجم الأيقونة بالـ dp |
| `draggable` | `true` | السحب بالإصبع |
| `snapToEdge` | `false` | الالتصاق بأقرب حافة بعد السحب |
| `vibrateOnClick` | `false` | اهتزاز قصير عند النقر |
| `clickAction` | `event` | `event` (حدث للويب فقط) \| `openApp` \| `openUrl` \| `eventAndOpenApp` |
| `clickUrl` | `null` | يُستعمل مع `clickAction: 'openUrl'` |
| `payload` | `null` | بيانات حرة تعود إليك داخل حدث النقر |
| `keepAliveInBackground` | `true` | البقاء ظاهراً بعد الخروج من التطبيق |
| `notification.title` / `.text` | `نور` / `الزر العائم يعمل` | نص الإشعار الملازم للخدمة |

### الأحداث

```js
FloatingWidget.on('widgetClick',     (d) => {});  // نقرة
FloatingWidget.on('widgetLongPress', (d) => {});  // ضغطة مطوّلة
FloatingWidget.on('widgetMove',      (d) => {});  // انتهاء السحب: { x, y, anchor }
```

الأحداث مُرسلة بخاصية *retain*، فلا تضيع إن وصلت قبل تسجيل المستمع (مثلاً بعد
إعادة تحميل الصفحة إثر تحديث مباشر).

### واجهة برمجية كاملة

```js
FloatingWidget.isSupported()        // true داخل الغلاف الأصلي
FloatingWidget.checkPermission()    // → { granted }
FloatingWidget.requestPermission()  // يفتح شاشة إعدادات النظام → { granted }
FloatingWidget.show(options)
FloatingWidget.update(patch)
FloatingWidget.setPosition({ x, y, anchor })
FloatingWidget.hide()
FloatingWidget.isVisible()          // → { visible }
FloatingWidget.on(event, handler)   // يُعيد دالة لإلغاء الاشتراك
FloatingWidget.onClick(handler)
FloatingWidget.defaults             // الإعدادات الافتراضية
```

### بديل المتصفح

خارج التطبيق الأصلي يرسم الـ SDK زراً عائماً داخل الصفحة (`position: fixed`)
بنفس الواجهة تماماً، فتستطيع تطوير الميزة وتجربتها على الديسكتوب. طبعاً لا
يستطيع بديل المتصفح الخروج خارج نافذة المتصفح — تلك ميزة أصلية حصراً.

### ملاحظات نظام

- `SYSTEM_ALERT_WINDOW` صلاحية خاصة: لا تُمنح عبر نافذة صلاحيات عادية، بل من
  شاشة إعدادات مستقلة يفتحها `requestPermission()`.
- في Android 12+ تحجب بعض واجهات النظام (شاشة القفل، الإعدادات، طلبات الصلاحيات)
  الطبقات العائمة — هذا سلوك أمني مقصود من أندرويد.
- إشعار الخدمة الأمامية يظهر إن مُنحت `POST_NOTIFICATIONS`؛ الخدمة تعمل حتى بدونها،
  لكن Android 13+ يخفي الإشعار.

---

## 5) ودجتات الشاشة الرئيسية (App Widgets)

ودجتان يُضافان إلى شاشة الهاتف الرئيسية ويعرضان الوقت المتبقي للصلاة القادمة:

| الودجت | الحجم المقترح | ما يعرضه |
|---|---|---|
| **البطاقة الكاملة** | 4×3 خانات | شارة «الصلاة القادمة»، اسم الصلاة، العدّاد الذهبي، شريط التقدّم، وأوقات اليوم الستة — بنفس شكل البطاقة داخل التطبيق |
| **العدّاد المصغّر** | 2×1 خانة | الوقت المتبقي فقط |

### البنية

| الملف | الدور |
|---|---|
| `widget/PrayerTimesCalculator.java` | نسخة جافا مطابقة لـ `prayer-times.js` — تحسب المواقيت والتطبيق مغلق |
| `widget/PrayerWidgetStore.java` | يحفظ مدخلات الحساب ويبني «لقطة» الصلاة القادمة والسابقة |
| `widget/PrayerWidgetRenderer.java` | يرسم الودجت بالحجم الفعلي ويجدول الاستيقاظ التالي |
| `widget/PrayerWidgetLargeProvider.java` / `…SmallProvider.java` | تسجيل الودجتين في النظام |
| `widget/PrayerWidgetReceiver.java` | إعادة الرسم بعد الإقلاع وتغيّر الساعة والمنطقة الزمنية |
| `widget/PrayerWidgetPlugin.java` | جسر الجافاسكريبت: `sync` و`requestPin` و`getStatus` |
| `islamic-app/prayer-widget.js` | الـ SDK الذي يستدعيه التطبيق |

### لماذا حاسب مواقيت ثانٍ بالجافا؟

الودجت يعمل والتطبيق **مغلق تماماً**: لا WebView ولا جافاسكريبت ولا وصول إلى
`localStorage`. ولو خزّنّا أوقات اليوم جاهزة لأصبحت خاطئة غداً. لذلك يدفع الويب
**مدخلات الحساب** فقط — الموقع، طريقة الحساب، المذهب، تصحيح الدقائق — ويعيد
الودجت الحساب بنفسه في كل رسم. النتيجة: الودجت صحيح بعد شهر من آخر مرة فُتح فيها
التطبيق، وبلا إنترنت.

الازدواج خطر لو افترق الملفان، لذلك يفشل البناء عند أول اختلاف:

```bash
npm run test:prayer-calc      # يشغّل الحاسبَين على 18 حالة ويقارنهما دقيقةً بدقيقة
```

الفحص جزء من `build-apk.yml`، ولا يحتاج غير `javac`.

### العدّاد الحيّ بلا استهلاك بطارية

العدّاد عنصر `Chronometer` في وضع العدّ التنازلي: نعطيه لحظة دخول الصلاة **مرة
واحدة**، ثم يحرّك النظام أرقامه ثانيةً بثانية داخل عملية الـ launcher. لا منبّه كل
دقيقة ولا خدمة خلفية.

التطبيق لا يُوقَظ إلا عند دخول وقت الصلاة (لينتقل العدّاد إلى الصلاة التالية)
وعند انقضاء رسالة «حان وقت الصلاة» — أي خمس أو ست مرات في اليوم. و
`updatePeriodMillis` نصف ساعة شبكة أمان إن ألغى النظام المنبّه.

> **ملاحظة:** أرقام `Chronometer` يرسمها النظام بلغة الجهاز، فقد تظهر بالأرقام
> العربية الهندية (٠١:٢٤:٣٦) على جهاز لغته عربية، بينما يعرضها التطبيق دائماً
> بالأرقام اللاتينية. الصيغة كذلك `س:دد:ثث` بلا صفر بادئ للساعات.

### التكيّف مع حجم الودجت

القياس الفعلي يأتي من `getAppWidgetOptions()` ويُقرأ في كل رسم، ويُعاد الرسم عند
كل تغيير حجم عبر `onAppWidgetOptionsChanged`. فإذا صغّر المستخدم الودجت تُخفى
العناصر بالترتيب — شريط الأوقات (أقل من 150dp ارتفاعاً)، ثم شريط التقدّم (أقل من
105dp)، ثم الشارة (أقل من 80dp) — ويبقى الاسم والعدّاد إلى آخر رمق، مع تصغير
الخطوط تناسبياً مع العرض.

### الإضافة من داخل التطبيق

**إعدادات المواقيت** ← **ودجت الشاشة الرئيسية** ← اختر الحجم. يستدعي التطبيق
`requestPinAppWidget` فتظهر نافذة تأكيد من الشاشة الرئيسية. بعض المشغّلات لا تدعم
ذلك، وعندها يرشد التطبيق المستخدم للطريقة اليدوية: ضغطة مطوّلة على الشاشة الرئيسية
← الودجتات ← نور.

### الاستعمال من الويب

```js
await PrayerWidget.sync();            // يُستدعى تلقائياً بعد كل حساب مواقيت
await PrayerWidget.getStatus();       // { hasData, largeCount, smallCount, pinSupported }
await PrayerWidget.requestPin('large');   // أو 'small'
await PrayerWidget.refresh();
await PrayerWidget.clear();
```

كل الدوال آمنة في المتصفح العادي — تعود بقيم فارغة بلا أخطاء.

### ملاحظات نظام

- المنبّه المضبوط (`setExactAndAllowWhileIdle`) يحتاج صلاحية مقيّدة منذ أندرويد 12،
  ولا تستحقّها ميزة عرض. فإن لم تكن ممنوحة نستعمل `setAndAllowWhileIdle` — يعمل رغم
  وضع Doze وقد يتأخر دقائق، وأسوأ أثر لذلك عدّاد سالب قصير يصحّح نفسه.
- `RECEIVE_BOOT_COMPLETED` صلاحية عادية تُمنح تلقائياً، ولزومها أن إعادة التشغيل
  تمحو كل المنبّهات.
- الودجت **ليس** من الأشياء التي تصل عبر تحديث الويب: أي تعديل على تخطيطه أو
  حسابه يحتاج بناء APK جديد.

---

## 6) التحديث الذاتي من GitHub

التطبيق يُوزَّع كـ APK مباشر لا عبر متجر، فيحدّث نفسه. لا خدمة خارجية ولا خادم:
**GitHub وحده** يكفي.

### مساران منفصلان

| | تحديث الويب | تحديث التطبيق (APK) |
|---|---|---|
| **متى؟** | أي تعديل على HTML/CSS/JS | تغيير أصلي: جافا، صلاحية، ودجت، أيقونة |
| **الحجم** | كيلوبايتات | ميجابايتات |
| **الموافقة** | لا يحتاج — صامت تماماً | يحتاج موافقة المستخدم |
| **الآلية** | تنزيل Zip وتبديل أصول الويب ثم إعادة تحميل | تنزيل APK وفتح شاشة التثبيت |

### مصدر الحقيقة: `version.json`

منشور على `https://tahershawki1.github.io/noor/version.json` (ونسخة فورية على
`raw.githubusercontent.com` يقرأها التطبيق أولاً لأنها لا تنتظر نشر Pages):

```json
{
  "app": {
    "version": "1.2.0",
    "versionCode": 10200,
    "apkUrl": "https://github.com/tahershawki1/noor/releases/download/v1.2.0/noor-1.2.0.apk",
    "sizeBytes": 15400000,
    "sha256": "…",
    "notes": "…",
    "mandatory": false
  },
  "web": {
    "version": "1.2.0",
    "url": "https://github.com/…/noor-web-1.2.0.zip",
    "checksum": "…"
  }
}
```

**تكتبه الـ CI لا اليد.** خطوة «تجهيز حزمة الويب وكتابة version.json» في
`release.yml` تحسب البصمات، تبني رابط الإصدار، وتدفع الملف مع كوميت الإصدار
فينشره GitHub Pages تلقائياً.

المقارنة للـ APK بـ **`versionCode`** لا بالاسم، لأنه الرقم الذي يفهمه أندرويد
ويرفض التثبيت فوق نسخة أحدث منه.

### الدورة كاملة

```
تعديل  →  release.yml  →  ┌─ يرفع النسخة ويبني APK
                          ├─ ينشر Release ومعه الـ APK وحزمة الويب
                          └─ يكتب version.json ويدفعه
                                     ↓
                    أجهزة المستخدمين تقرأ الملف عند الفتح
                                     ↓
              ┌────────────────────┴────────────────────┐
        حزمة ويب أحدث؟                          APK أحدث؟
        تنزيل + تطبيق صامت                 شريط داخل التطبيق + إشعار
        وإعادة تحميل التطبيق                وعند الموافقة: تنزيل وتثبيت
```

### البنية

| الملف | الدور |
|---|---|
| `islamic-app/app-updates.js` | العقل المدبّر: يقرأ الملف ويقرّر أي مسار |
| `islamic-app/live-updates.js` | `installBundle()` — تنزيل حزمة الويب وتطبيقها |
| `update/AppUpdaterPlugin.java` | تنزيل الـ APK عبر DownloadManager وفتح شاشة التثبيت |
| `update/UpdateNotifier.java` | إشعار «يوجد تحديث» في شريط النظام |

### سلوك مقصود

- **فاصل ست ساعات** بين الفحوص التلقائية، فلا نستهلك شبكة المستخدم عند كل فتح.
- **الرفض محفوظ**: من ضغط «لاحقاً» لا يُسأل عن النسخة نفسها مجدداً. لكن نسخة
  أحدث تُعرض، والفحص اليدوي يتجاوز الرفض عمداً.
- **`mandatory: true`** في `version.json` يجعل التحديث غير قابل للتأجيل.
- **الويب أولاً**: لو وُجد تحديث ويب طُبّق فوراً وأعاد التطبيق تحميل نفسه، فلا
  يُعرض تحديث الـ APK في نفس الجولة — قد يكون تحديث الويب كافياً أصلاً.
- **`checksum`** يجعل البلاجن يرفض أي حزمة وصلت ناقصة أو معطوبة.
- **التراجع التلقائي**: حزمة ويب لا تستدعي `notifyAppReady()` خلال عشر ثوانٍ
  تُعتبر فاشلة ويعود التطبيق للسابقة. تحديث ويب مكسور لا يُعطّل أجهزة الناس.

### الصلاحية

تثبيت APK من خارج المتجر يحتاج `REQUEST_INSTALL_PACKAGES` **وموافقة صريحة**
من شاشة «السماح بتثبيت تطبيقات غير معروفة». يفتحها التطبيق تلقائياً عند أول
محاولة تثبيت (`AppUpdater.requestInstallPermission`).

### الحالة الخطرة: تغيّر مفتاح التوقيع

أندرويد يرفض استبدال تطبيق بآخر موقّع بمفتاح مختلف. ولا حلّ إلا حذف القديم —
**وحذفه يمحو بيانات المستخدم**. تحدث هذه الحالة عند الانتقال من بناء debug إلى
مفتاح release، أو عند تغيير المفتاح لأي سبب.

يكتشفها التطبيق **قبل التنزيل** بمقارنة بصمتين:

| | من أين تأتي |
|---|---|
| بصمة النسخة المثبّتة | `AppUpdater.getInstalled().signature` — من `PackageInfo` على الجهاز |
| بصمة النسخة المنشورة | `version.json → app.sha256Cert` — تكتبها الـ CI عبر `apksigner verify --print-certs` |

واختلافهما يحوّل التحديث إلى مسار مختلف تماماً (`AppUpdates.prepareReinstall`):

1. **تُحفظ النسخة الاحتياطية أولاً**، ولا يكمل شيء إن فشلت.
2. **يُنزَّل الـ APK إلى «التنزيلات» العامة** لا مجلد التطبيق — لأن الحذف يمحو
   مجلد التطبيق ومعه الملف الذي نزّلناه.
3. **ثم** تُفتح شاشة الحذف، ويثبّت المستخدم الملف من مدير الملفات.

الترتيب ليس تفصيلاً تجميلياً: أي خطأ فيه يضيّع بيانات المستخدم، ولذلك يغطّيه
`tests/update-flow.mjs` صراحةً — بما في ذلك أن فشل النسخة الاحتياطية يوقف كل شيء.

---

## 7) النسخة الاحتياطية

### لماذا لا تكفي ذاكرة التطبيق؟

حذف أي تطبيق أندرويد يمحو مجلّده بالكامل — وهو حيث يعيش `localStorage` الخاص
بالـ WebView. وينطبق ذلك أيضاً على `getExternalFilesDir()` رغم وقوعه على البطاقة.
**أي مكان «مملوك للتطبيق» يذهب مع التطبيق.**

الناجي الوحيد هو **التخزين المشترك**، ولذلك تُكتب النسخة في
`المستندات/Noor/noor-backup.json`.

### لماذا الاسترجاع باختيار الملف؟

منذ أندرويد 10 تُنسب ملفات التخزين المشترك إلى التطبيق الذي أنشأها، وحذف التطبيق
يفقده تلك النسبة. فالملف يبقى على الجهاز لكن التطبيق المُعاد تثبيته لا يراه إلا
بصلاحية تخزين واسعة لا تستحقّها ميزة كهذه. لذلك:

| | الآلية | الصلاحية |
|---|---|---|
| **الحفظ** | تلقائي وصامت عبر MediaStore | لا شيء (أندرويد 10+) |
| **الاسترجاع** | منتقي ملفات النظام | لا شيء |

وميزة إضافية: المنتقي يقرأ من Google Drive أو من بطاقة نُقلت من جهاز آخر كذلك.

### متى يُحفظ؟

- عند تصغير التطبيق أو إغلاقه (`visibilitychange` و`pagehide`) — أهم لحظة.
- بعد ثماني ثوانٍ من الإقلاع، لمن لا يغادر التطبيق أبداً.
- يدوياً من **الإعدادات ← النسخة الاحتياطية ← احفظ الآن**.
- إجبارياً قبل أي عملية تتطلّب حذف التطبيق.

ولا يُكتب الملف إن لم تتغيّر البيانات، ولا أكثر من مرة كل دقيقة.

### ماذا يُحفظ؟

كل `localStorage` عدا مفاتيح تشغيلية لا معنى لنقلها (وقت آخر فحص تحديث، النسخة
التي رفضها المستخدم، وبيانات النسخ الاحتياطي نفسها).

> استثناء مفاتيح النسخ نفسها ضروري لا تجميلي: لو دخلت في اللقطة لتغيّرت بصمتها
> بعد كل حفظ، فما عرفنا أبداً أن البيانات لم تتغيّر. وقد كشف هذا الخطأَ اختبارُ
> `tests/backup-flow.mjs` قبل أن يصل لأي جهاز.

### الواجهة البرمجية

```js
await NoorBackup.save({ force: true });   // حفظ فوري
await NoorBackup.restoreFromPicker();     // استرجاع باختيار ملف
await NoorBackup.restoreAuto();           // محاولة صامتة (نفس التثبيت)
await NoorBackup.exportManually();        // «حفظ باسم» إلى Drive مثلاً
NoorBackup.looksEmpty();                  // هل هذا تثبيت جديد؟
NoorBackup.getLastSaved();                // ISO أو null
```

### الاختبار

```bash
npm run test:backup     # 26 تحقّقاً
```

يحاكي الدورة كاملة: امتلاء البيانات ← حفظ ← **تفريغ localStorage (حذف التطبيق)**
← استرجاع ← التحقق أن كل قيمة عادت مطابقة، بما فيها النصوص العربية والمحفوظات
المُرمَّزة. ويغطّي رفض الملفات التالفة ومن صيغة أحدث.

### الاختبار

```bash
npm run test:update-flow    # 24 تحقّقاً بمحاكاة الطبقة الأصلية كاملة
```

يغطّي: عدم تنزيل حزمة يملكها الجهاز، احترام الرفض، التحديث الإجباري، رفض
التراجع لنسخة أقدم، المصدر البديل عند تعذّر الأول، والمقارنة الرقمية للنسخ
(`1.2.10` أحدث من `1.2.9`).

### الواجهة البرمجية

```js
await AppUpdates.check();               // فحص تلقائي (يحترم الفاصل والرفض)
await AppUpdates.check({ force: true }); // فحص يدوي (يتجاوزهما)
await AppUpdates.install();             // تنزيل وتثبيت
AppUpdates.dismiss();                   // «لاحقاً»
await AppUpdates.getInstalled();        // { versionName, versionCode }
AppUpdates.on((event, data) => { … });  // downloadProgress وغيره
```

### ملاحظة عن Capgo

`autoUpdate` صار `false` في `capacitor.config.json`: مصدر التحديثات هو GitHub
الآن. عناوين Capgo باقية في الإعدادات كخطة بديلة، و`release.yml` ما زال يرفع
الحزمة لـ Capgo إن ضُبط سر `CAPGO_TOKEN` — لكن لا شيء يعتمد عليها.

---

## البناء

### الطريقة الأسهل: GitHub Actions يبني الـ APK نيابةً عنك

الـ workflow في `.github/workflows/build-apk.yml` يجهّز Java 21 و Node و Android SDK
ويبني الـ APK على خوادم GitHub — لا تحتاج Android Studio ولا SDK على جهازك.

**البناء اليدوي:** تبويب **Actions** → *بناء تطبيق الأندرويد (APK)* → **Run workflow**
→ اختر `debug` أو `release`. بعد انتهاء التشغيل ستجد الملف في قسم **Artifacts**
باسم `noor-<version>-<type>.apk`.

**يعمل تلقائياً أيضاً** عند أي دفعة إلى `main` تمسّ `android/` أو `islamic-app/`
أو `www/` أو `capacitor.config.json`، وعند نشر Release (فيُرفَق الـ APK بالإصدار).

#### نسخة debug أم release؟

`debug` تعمل فوراً بلا أي إعداد، وتُثبَّت على الهاتف عادياً — وهي كافية تماماً
للتوزيع الشخصي. أما `release` فتحتاج مفتاح توقيع؛ وبدونه يتراجع الـ workflow
تلقائياً إلى `debug` بدل أن ينتج ملفاً غير قابل للتثبيت.

#### تفعيل نسخة release الموقّعة

أنشئ مفتاحاً مرة واحدة:

```bash
keytool -genkey -v -keystore noor.keystore -alias noor \
        -keyalg RSA -keysize 2048 -validity 10000
base64 -w 0 noor.keystore > noor.keystore.b64     # على macOS: base64 -i noor.keystore
```

ثم أضف في **Settings → Secrets and variables → Actions**:

| السر | القيمة |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | محتوى `noor.keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | كلمة مرور المخزن |
| `ANDROID_KEY_ALIAS` | `noor` |
| `ANDROID_KEY_PASSWORD` | كلمة مرور المفتاح |

⚠️ احتفظ بنسخة من `noor.keystore` في مكان آمن. لو ضاع لن تستطيع نشر تحديث
يستبدل التطبيق المثبّت على الأجهزة — سيرفضه أندرويد لاختلاف التوقيع.

`android/app/build.gradle` يقرأ المفتاح من متغيّرات البيئة
(`NOOR_KEYSTORE_PATH`, `NOOR_KEYSTORE_PASSWORD`, `NOOR_KEY_ALIAS`, `NOOR_KEY_PASSWORD`)،
لذلك لا يُخزَّن أي سر داخل الريبو، ونفس الطريقة تعمل محلياً.

### البناء محلياً (يتطلب Android SDK)

```bash
npm install
npm run build:debug      # أو build:release
```

### إصدار نسخة جديدة (workflow منفصل)

`.github/workflows/release.yml` — تبويب Actions → «إصدار جديد (نسخة + APK)».

الفرق بينه وبين `build-apk.yml`:

| | build-apk.yml | release.yml |
|---|---|---|
| الغرض | تحقّق مستمر وبناء عند الطلب | إصدار مرقّم للتوزيع |
| المُخرَج | Artifact مؤقت (90 يوماً، يتطلب تسجيل دخول) | **Release برابط مباشر دائم وعام** |
| رقم النسخة | كما هو | يُرفع ويُثبَّت ويُوسَم |
| اختبار الأوفلاين | لا | نعم — يمنع الإصدار إن فشل |
| Capgo | لا | يرفع حزمة الويب إن ضُبط `CAPGO_TOKEN` |

**مصدر النسخة الوحيد** هو `package.json`. يقرؤه `android/app/build.gradle` ويشتق:

- `versionName` = نفس الرقم (`1.0.1`) — وهو ما يراه المستخدم
- `versionCode` = `major*10000 + minor*100 + patch` (`1.0.1` ← `10001`)

`versionCode` رقم متزايد يفرض أندرويد زيادته في كل إصدار، وإلا رفض تثبيت النسخة
الجديدة فوق القديمة. الاشتقاق التلقائي يمنع نسيانه. الحد الأقصى 99 للـ minor
والـ patch، ويفشل البناء صراحةً إن تُجووِز.

قبل نشر الإصدار يتحقق الأكشن أن رقم النسخة **داخل الـ APK نفسه** يطابق المطلوب
(عبر `aapt2 dump badging`) — حتى لا يُنشر ملف بنسخة قديمة.

### بعد أول APK

الـ APK يُبنى **مرة واحدة فقط**. كل تحديث لاحق لكود الويب:

```bash
npm version patch && npm run bundle:upload
```

لا داعي لتشغيل الـ workflow إلا إن غيّرت شيئاً أصلياً (صلاحية جديدة، كود جافا،
بلاجن Capacitor جديد، أيقونة أو اسم التطبيق).
