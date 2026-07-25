/* ============================================================================
 * LiveUpdates — التحديثات المباشرة داخل التطبيق (@capgo/capacitor-updater)
 * ============================================================================
 *
 * الفكرة باختصار:
 *   الـ APK يُبنى ويُوقَّع مرة واحدة فقط. بعدها يصبح كود الويب (HTML/CSS/JS)
 *   حزمة (bundle) منفصلة يمكن استبدالها لاسلكياً. عند كل فتح للتطبيق يسأل
 *   البلاجن الخادم: "هل توجد نسخة أحدث؟" فإن وُجدت نزّلها في الخلفية وطبّقها،
 *   ولن يحتاج المستخدم تحديث التطبيق من المتجر ولا تثبيت APK جديد.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ أين وكيف تُرفع تحديثات كود الويب (ملفات Zip)؟                              │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ▸ الطريقة (أ) — عبر خدمة Capgo السحابية (الأسهل والموصى بها)
 *
 *   1. مرة واحدة فقط، سجّل حساباً على https://capgo.app ثم اربط المشروع:
 *
 *        npx @capgo/cli@latest init <API_KEY>
 *
 *      (سيقرأ appId من capacitor.config.json = com.noor.islamicapp)
 *
 *   2. عند كل تحديث للموقع:
 *
 *        npm run sync:web           # ينسخ islamic-app/ → www/
 *        npm version patch          # ارفع رقم النسخة (1.0.0 → 1.0.1)
 *        npx @capgo/cli@latest bundle upload --channel production
 *
 *      الأمر الأخير يضغط مجلد `www` في ملف Zip، يرفعه لخوادم Capgo، ويربطه
 *      بقناة production. أجهزة المستخدمين تلتقطه خلال دقائق تلقائياً.
 *
 *   3. للتجربة قبل النشر للجميع: ارفع على قناة اختبار
 *
 *        npx @capgo/cli@latest bundle upload --channel beta
 *
 *      ثم من داخل الويب: `LiveUpdates.setChannel('beta')` على جهازك فقط.
 *      وللرجوع: `LiveUpdates.setChannel('production')`.
 *
 *   4. للتراجع عن تحديث سيّئ: من لوحة Capgo أعد ربط قناة production بالحزمة
 *      السابقة، أو نفّذ `LiveUpdates.reset()` على الجهاز للعودة لنسخة الـ APK.
 *
 * ▸ الطريقة (ب) — استضافة ذاتية (Self-hosted) بدون Capgo
 *
 *   1. جهّز ملف Zip لمجلد www:
 *
 *        npm run bundle:zip        # ينتج dist/noor-web-<version>.zip
 *
 *   2. ارفع الـ Zip على أي استضافة ثابتة (GitHub Releases، S3، خادمك).
 *
 *   3. جهّز نقطة نهاية JSON ترد على طلب البلاجن. البلاجن يرسل POST يحوي
 *      { platform, device_id, app_id, version_build, version_name, ... }
 *      والرد المتوقع:
 *
 *        { "version": "1.0.1",
 *          "url": "https://example.com/noor-web-1.0.1.zip",
 *          "checksum": "<sha256 للملف>",
 *          "session_key": "" }
 *
 *      وإن لم يوجد تحديث: { "message": "no update available" }
 *
 *   4. وجّه البلاجن لخادمك في capacitor.config.json:
 *
 *        "plugins": { "CapacitorUpdater": { "updateUrl": "https://example.com/updates" } }
 *
 *      أو ديناميكياً من الويب: `LiveUpdates.setUpdateUrl('https://…')`
 *      (متاحة لأن allowModifyUrl = true في الإعدادات).
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ تحذير مهم — notifyAppReady()                                              │
 * └───────────────────────────────────────────────────────────────────────────┘
 *   بعد تطبيق أي حزمة جديدة، ينتظر البلاجن استدعاء notifyAppReady() خلال
 *   appReadyTimeout (10 ثوانٍ هنا). إن لم يصله الاستدعاء يعتبر الحزمة معطوبة
 *   ويرجع تلقائياً للنسخة السابقة. هذا الملف يستدعيها فوراً عند التحميل،
 *   لذلك لا تحذفه ولا تؤجّل تحميله ولا تضعه خلف شرط.
 *
 * ما الذي لا يمكن تحديثه لاسلكياً؟
 *   أي شيء أصلي (Native): صلاحيات الـ Manifest، كود جافا، إضافات Capacitor
 *   جديدة، الأيقونة، اسم التطبيق. لهذا أُعلنت كل الصلاحيات مسبقاً في
 *   AndroidManifest.xml — فتفعيل أي ميزة لاحقاً يصبح تحديث ويب فقط.
 * ========================================================================== */

(function (global) {
  'use strict';

  var capacitor = global.Capacitor;
  var isNative = !!(capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform());
  var plugin = null;

  if (isNative && capacitor.Plugins) {
    // البلاجن الأصلي يسجّل نفسه باسم CapacitorUpdater، فنصل إليه بدون bundler
    plugin = capacitor.Plugins.CapacitorUpdater;
  }
  if (!plugin && isNative && capacitor.registerPlugin) {
    plugin = capacitor.registerPlugin('CapacitorUpdater');
  }

  var state = {
    ready: false,
    current: null,
    downloading: false,
    lastError: null
  };

  var handlers = [];

  function report(event, data) {
    var payload = data || {};
    console.log('[LiveUpdates] ' + event, payload);
    handlers.forEach(function (fn) {
      try {
        fn(event, payload);
      } catch (e) {
        console.error('[LiveUpdates] خطأ داخل مستمع الأحداث', e);
      }
    });
  }

  /**
   * الخطوة الحرجة: تخبر البلاجن أن الحزمة الحالية أقلعت بنجاح.
   * بدونها يتراجع التطبيق تلقائياً للنسخة السابقة بعد appReadyTimeout.
   */
  function notifyReady() {
    if (!plugin) {
      return Promise.resolve();
    }
    return plugin
      .notifyAppReady()
      .then(function (result) {
        state.ready = true;
        state.current = (result && result.bundle) || null;
        report('ready', { bundle: state.current });
      })
      .catch(function (error) {
        state.lastError = error;
        report('error', { stage: 'notifyAppReady', message: String(error) });
      });
  }

  /** يربط أحداث البلاجن بسجل موحّد يمكن للواجهة عرضه للمستخدم. */
  function bindEvents() {
    if (!plugin || !plugin.addListener) {
      return;
    }

    plugin.addListener('updateAvailable', function (data) {
      report('updateAvailable', data);
    });

    plugin.addListener('download', function (data) {
      state.downloading = true;
      report('downloadProgress', data);
    });

    plugin.addListener('downloadComplete', function (data) {
      state.downloading = false;
      // مع autoUpdate = true يُطبَّق التحديث تلقائياً عند إغلاق/إعادة فتح التطبيق
      report('downloadComplete', data);
    });

    plugin.addListener('noNeedUpdate', function (data) {
      report('upToDate', data);
    });

    plugin.addListener('updateFailed', function (data) {
      state.lastError = data;
      report('updateFailed', data);
    });

    plugin.addListener('downloadFailed', function (data) {
      state.downloading = false;
      state.lastError = data;
      report('downloadFailed', data);
    });

    plugin.addListener('appReloaded', function () {
      report('appReloaded', {});
    });
  }

  var LiveUpdates = {
    /** true داخل الغلاف الأصلي فقط — في المتصفح لا معنى للتحديث المباشر. */
    isSupported: function () {
      return !!plugin;
    },

    /** حالة آخر عملية: { ready, current, downloading, lastError } */
    getState: function () {
      return Object.assign({}, state);
    },

    /** معلومات الحزمة قيد التشغيل حالياً (النسخة، الأصل: built-in أم محدَّثة). */
    current: function () {
      if (!plugin) {
        return Promise.resolve(null);
      }
      return plugin.current();
    },

    /** فحص يدوي فوري — مفيد لزر "التحقق من التحديثات" داخل الإعدادات. */
    checkNow: function () {
      if (!plugin) {
        return Promise.resolve({ supported: false });
      }
      report('checking', {});
      // getLatest يسأل الخادم مباشرة دون انتظار الدورة التلقائية
      return plugin
        .getLatest()
        .then(function (latest) {
          report('latest', latest);
          return latest;
        })
        .catch(function (error) {
          state.lastError = error;
          report('error', { stage: 'checkNow', message: String(error) });
          throw error;
        });
    },

    /** ينزّل ويطبّق نسخة محددة يدوياً (للاستضافة الذاتية أو التجارب). */
    installBundle: function (options) {
      if (!plugin) {
        return Promise.reject(new Error('التحديث المباشر غير متاح خارج التطبيق'));
      }
      return plugin
        .download({ url: options.url, version: options.version })
        .then(function (bundle) {
          report('downloaded', bundle);
          return plugin.set({ id: bundle.id });
        });
    },

    /** تبديل قناة التحديث: production | beta | أي قناة أنشأتها في Capgo. */
    setChannel: function (channel) {
      if (!plugin) {
        return Promise.resolve();
      }
      return plugin.setChannel({ channel: channel, triggerAutoUpdate: true });
    },

    /** تغيير خادم التحديثات وقت التشغيل (يتطلب allowModifyUrl = true). */
    setUpdateUrl: function (url) {
      if (!plugin) {
        return Promise.resolve();
      }
      return plugin.setUpdateUrl({ url: url });
    },

    /** العودة إلى نسخة الويب المدمجة داخل الـ APK (خطة طوارئ). */
    reset: function () {
      if (!plugin) {
        return Promise.resolve();
      }
      return plugin.reset({ toLastSuccessful: false });
    },

    /** الاستماع لأحداث التحديث لعرضها في الواجهة (شريط تقدّم مثلاً). */
    onEvent: function (handler) {
      handlers.push(handler);
      return function off() {
        var index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      };
    }
  };

  global.LiveUpdates = LiveUpdates;

  // ---------------------------------------------------------------------------
  // الإقلاع: يُنفَّذ فور تحميل الملف — لا تؤجّله إلى DOMContentLoaded.
  // ---------------------------------------------------------------------------
  if (plugin) {
    bindEvents();
    notifyReady();
  }
})(typeof window !== 'undefined' ? window : this);
