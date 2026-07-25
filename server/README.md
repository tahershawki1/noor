# باك اند نور

خادم Node.js يقدّم شيئين:

1. **ذاكرة التطبيق** — يحفظ كل مدخلات المستخدم (إعدادات، محفوظات، عدّادات، عمليات بحث)
   ويتيح مزامنتها بين الأجهزة واستعادتها.
2. **مراقبة تحديثات GitHub** — يعرف بالتحديث لحظة نشره ويبلّغ المتصفحات المفتوحة فوراً.

لا يحتاج قاعدة بيانات: كل جهاز ملف JSON داخل `DATA_DIR`.

## التشغيل

```bash
cd server
cp .env.example .env      # عدّل ما تحتاجه
npm install
npm start                 # http://localhost:8787
```

للتطوير مع إعادة التشغيل التلقائي: `npm run dev`
لتشغيل الاختبارات: `npm test`

الخادم يقدّم أيضاً ملفات الواجهة من `islamic-app/`، فيمكن فتح
<http://localhost:8787> مباشرة والحصول على الموقع + الـ API من نفس المصدر.

## المتغيرات المهمة

| المتغير | الغرض |
|---|---|
| `PORT` | منفذ الخادم (افتراضي 8787) |
| `DATA_DIR` | مجلد تخزين ملفات الذاكرة |
| `GITHUB_REPO` / `GITHUB_BRANCH` | المستودع والفرع المراقَب |
| `GITHUB_TOKEN` | اختياري — يرفع حد طلبات GitHub من 60 إلى 5000/ساعة |
| `GITHUB_WEBHOOK_SECRET` | **مطلوب للتحديث الفوري** — سرّ الويب هوك |
| `ALLOWED_ORIGINS` | أصول CORS المسموحة (فارغ = الجميع) |
| `API_TOKEN` | اختياري — يحمي واجهات الذاكرة بترويسة `x-noor-token` |

القائمة الكاملة في [`.env.example`](.env.example).

## الواجهات

### التحديثات

| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/api/health` | فحص صحة الخادم |
| GET | `/api/version` | النسخة وآخر commit معروف |
| GET | `/api/updates/check?current=<sha>` | هل يوجد أحدث من نسخة العميل؟ |
| GET | `/api/updates/latest?force=1` | آخر commit/إصدار مع حالة المراقبة |
| GET | `/api/updates/stream` | بثّ حيّ (SSE) بأحداث `hello` و `update` و `ping` |
| POST | `/api/github/webhook` | ويب هوك GitHub (توقيع `sha256` مُتحقَّق منه) |

### الذاكرة

`:id` هو معرّف الجهاز (6–64 حرفاً: أحرف وأرقام و `-` و `_`).

| الطريقة | المسار | الوصف |
|---|---|---|
| POST | `/api/memory/device` | يولّد معرّف جهاز جديد |
| POST | `/api/memory/:id/entries` | إضافة مدخلات (دفعة) |
| GET | `/api/memory/:id/entries?q=&type=&limit=&offset=` | قراءة/بحث |
| DELETE | `/api/memory/:id/entries` | مسح كل المدخلات |
| DELETE | `/api/memory/:id/entries/:entryId` | حذف مدخل |
| GET/PUT | `/api/memory/:id/state` | الحالة المحفوظة (PUT يدمج، و `?replace=1` يستبدل) |
| GET | `/api/memory/:id/stats` | إحصاءات |
| GET | `/api/memory/:id/export` | تصدير JSON |
| POST | `/api/memory/:id/import` | استيراد JSON |
| DELETE | `/api/memory/:id` | حذف الجهاز بالكامل |

## التحديث الفوري — كيف يعمل

```
git push  ─┬─►  GitHub Actions  ──►  نشر GitHub Pages (‏version.json جديد)
           │
           └─►  ويب هوك push  ──►  الخادم  ──►  SSE  ──►  المتصفحات المفتوحة
                                                          "يتوفر تحديث جديد"
```

الخادم يعرف بالـ push خلال ثوانٍ، لكنه لا يدفع العميل للتحديث مباشرة: عند وصول
الحدث يعيد العميل قراءة `version.json` عدة مرات حتى يكتمل نشر Pages، فلا يُطلب
منه التحديث قبل أن تكون الملفات الجديدة جاهزة فعلاً.

بدون ويب هوك يبقى كل شيء يعمل عبر الاستطلاع الدوري (دقيقة تقريباً).

### إعداد الويب هوك

1. اضبط `GITHUB_WEBHOOK_SECRET` في بيئة الخادم.
2. على GitHub: **Settings → Webhooks → Add webhook**
   - Payload URL: `https://<عنوان-خادمك>/api/github/webhook`
   - Content type: `application/json`
   - Secret: نفس القيمة أعلاه
   - Events: `push` (وأضف `release` إن كنت تستخدم الإصدارات)

## النشر

### Docker

```bash
docker build -t noor-backend server/
docker run -d -p 8787:8787 -v noor-data:/data \
  -e GITHUB_WEBHOOK_SECRET=... \
  -e ALLOWED_ORIGINS=https://tahershawki1.github.io \
  noor-backend
```

### منصات الاستضافة (Render / Railway / Fly)

- Root directory: `server`
- Build: `npm install`
- Start: `npm start`
- اضبط متغيرات البيئة من لوحة المنصة، واربط قرصاً دائماً على `DATA_DIR`
  (وإلا فُقدت الذاكرة عند كل إعادة نشر).

بعد التشغيل، افتح التطبيق ← **الذاكرة ← المزامنة مع الخادم**، وضع عنوان الخادم
وفعّل المزامنة.
