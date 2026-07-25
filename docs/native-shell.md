# الغلاف الأصلي (Native Shell) — دليل كامل

هذا المستند يشرح البنية التي تجعل **الـ APK يُبنى مرة واحدة فقط**، وكل ما بعدها
(تحديث الكود، تفعيل الميزات، التحكم بالصلاحيات، الزر العائم) يُدار من كود الويب.

```
islamic-app/          ← مصدر الويب (المنشور على GitHub Pages + مصدر حزم التحديث)
  ├─ index.html
  ├─ app.js, styles.css, adhkar-data.js
  ├─ live-updates.js    ← وحدة التحديثات المباشرة (Capgo)
  └─ floating-widget.js ← الـ SDK الخاص بالزر العائم
www/                  ← نسخة الويب التي يحملها Capacitor (تُولَّد بـ npm run sync:web)
android/
  ├─ app/src/main/AndroidManifest.xml         ← كل الصلاحيات معلنة مسبقاً
  └─ app/src/main/java/com/noor/islamicapp/
       ├─ MainActivity.java                    ← يسجّل البلاجن المحلي
       └─ floating/
            ├─ FloatingWidgetPlugin.java       ← جسر الجافاسكريبت
            ├─ FloatingWidgetService.java      ← الطبقة العائمة فوق التطبيقات
            └─ FloatingWidgetConfig.java       ← نموذج الإعدادات القادمة من الويب
capacitor.config.json ← إعدادات Capacitor + Capgo
scripts/sync-web.js   ← islamic-app/ → www/
```

---

## 1) إعداد Capacitor والربط مع الموقع

`capacitor.config.json`:

| المفتاح | القيمة | السبب |
|---|---|---|
| `webDir` | `www` | أصول الويب تُحزم داخل الـ APK فتعمل بلا إنترنت، ثم تُستبدل لاسلكياً عبر Capgo |
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

الوضع الحالي (أصول محزّمة + Capgo) يعطيك نفس النتيجة — تحديث فوري بلا APK جديد — مع بقاء العمل دون اتصال.

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

## 3) التحديثات المباشرة (`@capgo/capacitor-updater`)

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

## البناء

الـ APK يُبنى **مرة واحدة فقط**:

```bash
npm install
npm run build:debug      # أو build:release للنسخة الموقّعة
```

بعدها، كل تحديث لاحق:

```bash
npm version patch && npm run bundle:upload
```
