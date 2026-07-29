/* ============================================================================
 * AppUpdates — نظام التحديث الذاتي لتطبيق نور
 * ============================================================================
 *
 * التطبيق يُوزَّع كـ APK مباشر لا عبر متجر، فيحدّث نفسه من GitHub على مسارين
 * منفصلين تماماً:
 *
 *   ▸ تحديث الويب (فوري، صامت، بلا تدخّل من المستخدم)
 *     أي تعديل على HTML/CSS/JS يصل كحزمة Zip. التطبيق ينزّلها ويطبّقها ثم
 *     يعيد تحميل نفسه. المستخدم لا يرى إلا أن التطبيق «اتحدّث لوحده».
 *
 *   ▸ تحديث التطبيق نفسه (APK) — يحتاج موافقة المستخدم
 *     يلزم فقط حين يتغيّر شيء أصلي: كود جافا، صلاحية، ودجت، أيقونة. عندها
 *     يظهر شريط داخل التطبيق وإشعار في شريط الإشعارات، وعند الموافقة يُنزَّل
 *     الـ APK وتُفتح شاشة التثبيت.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ مصدر الحقيقة: version.json                                                │
 * └───────────────────────────────────────────────────────────────────────────┘
 * تكتبه الـ CI عند كل إصدار (release.yml) وتدفعه إلى المستودع:
 *
 *   { "app": { "version", "versionCode", "apkUrl", "sha256", "notes", "mandatory" },
 *     "web": { "version", "url", "checksum" } }
 *
 * المقارنة للـ APK بـ versionCode لا بالاسم، لأنه الرقم الذي يفهمه أندرويد.
 *
 * كل شيء هنا لا يعمل إلا داخل التطبيق الأصلي: في المتصفح لا معنى لتحديث APK،
 * وصفحة GitHub Pages محدَّثة أصلاً بطبيعتها.
 * ========================================================================== */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1) الإعدادات
  // ---------------------------------------------------------------------------

  /**
   * مصدران للملف نفسه: raw أولاً لأنه يعكس main فوراً ولا ينتظر نشر Pages،
   * وPages احتياطياً إن حجبت شبكةٌ ما نطاق raw.
   */
  var MANIFEST_SOURCES = [
    'https://raw.githubusercontent.com/tahershawki1/noor/main/islamic-app/version.json',
    'https://tahershawki1.github.io/noor/version.json'
  ];

  /** لا نضايق المستخدم بنفس النسخة مرتين — نتذكّر ما رفضه. */
  var DISMISSED_KEY = 'updateDismissedVersionCode';
  var LAST_CHECK_KEY = 'updateLastCheckAt';

  /** أقل فاصل بين فحصين تلقائيين (ست ساعات) حتى لا نفحص عند كل فتح. */
  var CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

  var FETCH_TIMEOUT_MS = 12000;

  // ---------------------------------------------------------------------------
  // 2) الاتصال بالطبقة الأصلية
  // ---------------------------------------------------------------------------
  var capacitor = global.Capacitor;
  var isNative = !!(capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform());
  var updater = null;

  if (isNative) {
    if (capacitor.Plugins && capacitor.Plugins.AppUpdater) {
      updater = capacitor.Plugins.AppUpdater;
    } else if (capacitor.registerPlugin) {
      updater = capacitor.registerPlugin('AppUpdater');
    }
  }

  var listeners = [];

  function emit(event, data) {
    listeners.forEach(function (fn) {
      try {
        fn(event, data || {});
      } catch (error) {
        console.error('[AppUpdates] خطأ داخل مستمع', error);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 3) قراءة الملف
  // ---------------------------------------------------------------------------

  function fetchWithTimeout(url) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, FETCH_TIMEOUT_MS);

    // كسر التخزين المؤقت: شبكة GitHub تخدم الملف من CDN
    var bustedUrl = url + (url.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now();

    return fetch(bustedUrl, {
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        clearTimeout(timer);
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .catch(function (error) {
        clearTimeout(timer);
        throw error;
      });
  }

  /** يجرّب المصادر بالترتيب ويعيد أول ملف صالح، أو null إن فشلت كلها. */
  function fetchManifest() {
    var attempt = function (index) {
      if (index >= MANIFEST_SOURCES.length) {
        return Promise.resolve(null);
      }
      return fetchWithTimeout(MANIFEST_SOURCES[index]).catch(function () {
        return attempt(index + 1);
      });
    };
    return attempt(0);
  }

  // ---------------------------------------------------------------------------
  // 4) مقارنة النسخ
  // ---------------------------------------------------------------------------

  /** يقارن "1.2.10" بـ "1.2.9" رقمياً لا نصياً. */
  function isNewerVersion(candidate, current) {
    if (!candidate) return false;
    if (!current) return true;
    var a = String(candidate).split('.').map(Number);
    var b = String(current).split('.').map(Number);
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      var x = a[i] || 0;
      var y = b[i] || 0;
      if (x !== y) return x > y;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // 5) مسار تحديث الويب — صامت
  // ---------------------------------------------------------------------------

  /**
   * ينزّل حزمة الويب الأحدث ويطبّقها. الاستدعاء الأخير يعيد تحميل التطبيق،
   * لذلك لا يعود هذا الوعد أبداً في الحالة الناجحة.
   */
  function applyWebUpdate(web) {
    if (!web || !web.url || !web.version) {
      return Promise.resolve(false);
    }
    if (typeof LiveUpdates === 'undefined' || !LiveUpdates.isSupported()) {
      return Promise.resolve(false);
    }

    return LiveUpdates.current()
      .then(function (result) {
        var running = result && result.bundle ? result.bundle.version : null;

        // على تثبيت جديد تكون الحزمة العاملة هي المدمجة في الـ APK ويسمّيها
        // البلاجن "builtin". نسختها الحقيقية هي نسخة التطبيق نفسه (result.native)،
        // وبدون هذا التصحيح سيحسبها التطبيق أقدم من أي شيء فينزّل حزمة يملكها.
        if (!running || running === 'builtin') {
          running = (result && result.native) || null;
        }
        if (!isNewerVersion(web.version, running)) {
          return false;
        }
        emit('webUpdateStarted', { version: web.version });
        return LiveUpdates.installBundle({
          url: web.url,
          version: web.version,
          checksum: web.checksum
        }).then(function () {
          return true;
        });
      })
      .catch(function (error) {
        // فشل تحديث الويب ليس كارثة: التطبيق يكمل بالحزمة الحالية
        console.warn('[AppUpdates] تعذّر تحديث حزمة الويب', error);
        emit('webUpdateFailed', { message: String(error) });
        return false;
      });
  }

  // ---------------------------------------------------------------------------
  // 6) مسار تحديث الـ APK — يحتاج موافقة
  // ---------------------------------------------------------------------------

  function getInstalled() {
    if (!updater) {
      return Promise.resolve(null);
    }
    return updater.getInstalled().catch(function () {
      return null;
    });
  }

  /** هل النسخة المنشورة أحدث من المثبّتة، ولم يرفضها المستخدم من قبل؟ */
  function evaluateAppUpdate(app, installed, options) {
    if (!app || !app.apkUrl || !installed) {
      return null;
    }
    var published = Number(app.versionCode || 0);
    var current = Number(installed.versionCode || 0);
    if (!published || published <= current) {
      return null;
    }
    if (!options.force && !app.mandatory) {
      var dismissed = Number(localStorage.getItem(DISMISSED_KEY) || 0);
      if (dismissed >= published) {
        return null;
      }
    }
    // أخطر حالة في التحديث: اختلاف مفتاح التوقيع. أندرويد يرفض عندها استبدال
    // التطبيق المثبَّت، فلا سبيل إلا حذفه — وحذفه يمحو بيانات المستخدم. نكتشفها
    // هنا قبل التنزيل، فيتحوّل التحديث إلى مسار مختلف: احفظ بياناتك أولاً.
    var requiresReinstall = !!(app.sha256Cert && installed.signature
      && String(app.sha256Cert).toLowerCase() !== String(installed.signature).toLowerCase());

    return {
      version: app.version,
      versionCode: published,
      url: app.apkUrl,
      notes: app.notes || '',
      sizeBytes: app.sizeBytes || 0,
      mandatory: !!app.mandatory,
      installedVersion: installed.versionName,
      requiresReinstall: requiresReinstall
    };
  }

  // ---------------------------------------------------------------------------
  // 7) الواجهة
  // ---------------------------------------------------------------------------

  var pendingUpdate = null;

  var AppUpdates = {

    /** هل نحن داخل التطبيق الأصلي؟ خارجه لا شيء من هذا يعمل. */
    isAvailable: function () {
      return !!updater;
    },

    /** آخر تحديث APK اكتُشف ولم يُثبَّت بعد. */
    getPending: function () {
      return pendingUpdate;
    },

    /**
     * الفحص الكامل: يحدّث الويب صامتاً، ويعيد تحديث الـ APK إن وُجد.
     *
     * @param {object} options
     *   force — يعني «فحص يدوي طلبه المستخدم»، فيتجاوز أمرين معاً: فاصل الست
     *           ساعات، ورفض المستخدم لهذه النسخة سابقاً. من ضغط زر «تحقق من
     *           التحديثات» يريد جواباً الآن ولو كان قد أجّل النسخة أمس.
     *           الفحص التلقائي عند فتح التطبيق يستدعيها بلا خيارات، فيحترم
     *           الاثنين.
     * @returns {Promise<object|null>} تفاصيل تحديث الـ APK أو null
     */
    check: function (options) {
      var settings = options || {};
      if (!isNative) {
        return Promise.resolve(null);
      }

      if (!settings.force) {
        var last = Number(localStorage.getItem(LAST_CHECK_KEY) || 0);
        if (last && Date.now() - last < CHECK_INTERVAL_MS) {
          return Promise.resolve(null);
        }
      }

      return fetchManifest().then(function (manifest) {
        if (!manifest) {
          emit('checkFailed', {});
          return null;
        }
        localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

        // الويب أولاً: أخفّ وأسرع، وقد يحمل بنفسه إصلاح المشكلة التي فُتح
        // التطبيق بسببها. ولو طُبّق فعلاً فالتطبيق يعيد التحميل ولن نصل لما بعده.
        return applyWebUpdate(manifest.web).then(function (applied) {
          if (applied) {
            return null;
          }
          return getInstalled().then(function (installed) {
            var update = evaluateAppUpdate(manifest.app, installed, settings);
            pendingUpdate = update;
            if (update) {
              emit('appUpdateAvailable', update);
              // إشعار النظام حتى ينتبه المستخدم لو لم يكن ينظر إلى الشاشة
              updater.notifyUpdateAvailable({
                version: update.version,
                notes: update.requiresReinstall
                  ? 'هذا التحديث يتطلّب حذف النسخة القديمة — افتح التطبيق لحفظ بياناتك أولاً'
                  : update.notes
              }).catch(function () { /* الإشعارات قد تكون محجوبة */ });
            }
            return update;
          });
        });
      });
    },

    /**
     * مسار التحديث الذي يتطلّب حذف النسخة القديمة (اختلاف مفتاح التوقيع).
     *
     * الترتيب هنا ليس تفصيلاً تجميلياً — أي خطأ فيه يضيّع بيانات المستخدم:
     *   1. تُحفظ النسخة الاحتياطية في التخزين المشترك، ولا نكمل إن فشلت.
     *   2. يُنزَّل الـ APK إلى «التنزيلات» العامة لا مجلد التطبيق، لأن الحذف
     *      يمحو مجلد التطبيق ومعه الملف الذي نزّلناه.
     *   3. عندها فقط تُفتح شاشة الحذف، ويثبّت المستخدم الملف من مدير الملفات.
     */
    prepareReinstall: function (update) {
      var target = update || pendingUpdate;
      if (!updater || !target) {
        return Promise.resolve({ ready: false, reason: 'NO_UPDATE' });
      }

      var backup = (typeof NoorBackup !== 'undefined' && NoorBackup.isAvailable())
        ? NoorBackup.save({ force: true })
        : Promise.resolve({ saved: false, reason: 'UNSUPPORTED' });

      return backup.then(function (result) {
        if (!result || !result.saved) {
          // لا نُقدِم على خطوة تمحو البيانات وقد فشل حفظها
          emit('backupFailed', result || {});
          return { ready: false, reason: 'BACKUP_FAILED', detail: result };
        }
        emit('backupReady', result);
        return updater.downloadAndInstall({
          url: target.url,
          version: target.version,
          publicDownloads: true,
          autoInstall: false
        }).then(function (download) {
          return { ready: true, backup: result, destination: download && download.destination };
        });
      }).catch(function (error) {
        emit('downloadFailed', { message: String(error) });
        return { ready: false, reason: String(error) };
      });
    },

    /** يفتح شاشة حذف التطبيق — بعد أن تكون النسخة الاحتياطية والملف جاهزين. */
    uninstall: function () {
      if (!updater) {
        return Promise.resolve();
      }
      return updater.uninstallSelf().catch(function () { /* المستخدم قد يلغي */ });
    },

    /**
     * ينزّل الـ APK ويفتح شاشة التثبيت. يطلب صلاحية «تثبيت تطبيقات غير
     * معروفة» أولاً إن لم تكن ممنوحة.
     */
    install: function (update) {
      var target = update || pendingUpdate;
      if (!updater || !target) {
        return Promise.resolve({ started: false, reason: 'NO_UPDATE' });
      }
      // بالاسم لا بـ this: الدالة قد تُمرَّر كمرجع (onclick مثلاً) فيضيع السياق
      if (target.requiresReinstall) {
        return AppUpdates.prepareReinstall(target);
      }

      return updater.canInstall().then(function (status) {
        if (status && status.granted) {
          return true;
        }
        return updater.requestInstallPermission().then(function (result) {
          return !!(result && result.granted);
        });
      }).then(function (granted) {
        if (!granted) {
          emit('installPermissionDenied', target);
          return { started: false, reason: 'PERMISSION_DENIED' };
        }
        emit('downloadStarted', target);
        return updater.downloadAndInstall({ url: target.url, version: target.version });
      }).catch(function (error) {
        emit('downloadFailed', { message: String(error) });
        return { started: false, reason: String(error) };
      });
    },

    /** يتجاهل هذه النسخة فلا يُسأل عنها مجدداً (إلا لو كانت إجبارية). */
    dismiss: function (update) {
      var target = update || pendingUpdate;
      if (target && !target.mandatory) {
        localStorage.setItem(DISMISSED_KEY, String(target.versionCode));
      }
      pendingUpdate = null;
      if (updater) {
        updater.cancelNotification().catch(function () { /* لا يهم */ });
      }
      emit('dismissed', target || {});
    },

    /** نسخة التطبيق المثبّتة: { versionName, versionCode, packageName } */
    getInstalled: getInstalled,

    /**
     * الأحداث: webUpdateStarted | webUpdateFailed | appUpdateAvailable |
     * downloadStarted | downloadProgress | downloadFailed | dismissed | checkFailed
     */
    on: function (handler) {
      listeners.push(handler);
      return function off() {
        var index = listeners.indexOf(handler);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      };
    }
  };

  // تقدّم التنزيل يأتي من الطبقة الأصلية — نمرّره كما هو للواجهة
  if (updater && updater.addListener) {
    updater.addListener('downloadProgress', function (data) {
      emit('downloadProgress', data);
    });
    updater.addListener('downloadFailed', function (data) {
      emit('downloadFailed', data);
    });
  }

  global.AppUpdates = AppUpdates;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppUpdates;
  }
})(typeof window !== 'undefined' ? window : this);
