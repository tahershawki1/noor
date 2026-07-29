/* ============================================================================
 * PrayerWidget — واجهة الجافاسكريبت لودجتات الشاشة الرئيسية
 * ============================================================================
 *
 * ودجتان:
 *   • الكبير  — بطاقة الصلاة القادمة بنفس شكلها داخل التطبيق: الاسم، العدّاد،
 *              شريط التقدّم، وأوقات اليوم الستة.
 *   • الصغير  — الوقت المتبقي فقط، بأصغر حجم.
 *
 * الودجت يعمل والتطبيق مغلق تماماً، فلا يستطيع قراءة localStorage. لذلك ندفع
 * إليه «مدخلات الحساب» (الموقع، طريقة الحساب، المذهب، تصحيح الدقائق) وهو يعيد
 * حساب المواقيت بنفسه بنسخة جافا مطابقة لـ prayer-times.js. النتيجة: الودجت
 * يبقى صحيحاً غداً وبعد شهر، حتى لو لم يُفتح التطبيق ولا مرة.
 *
 * الاستعمال:
 *   PrayerWidget.sync();                 // بعد كل تغيير في المواقيت أو إعداداتها
 *   await PrayerWidget.requestPin('large');
 *   await PrayerWidget.getStatus();      // { hasData, largeCount, smallCount, pinSupported }
 *
 * كل الدوال آمنة في المتصفح العادي: تعود بقيم فارغة بلا أخطاء.
 * ========================================================================== */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1) الاتصال بالبلاجن الأصلي
  // ---------------------------------------------------------------------------
  var capacitor = global.Capacitor;
  var isNative = !!(capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform());
  var native = null;

  if (isNative) {
    if (capacitor.registerPlugin) {
      native = capacitor.registerPlugin('PrayerWidget');
    } else if (capacitor.Plugins) {
      native = capacitor.Plugins.PrayerWidget;
    }
  }

  var EMPTY_STATUS = { hasData: false, largeCount: 0, smallCount: 0, pinSupported: false };

  // ---------------------------------------------------------------------------
  // 2) قراءة إعدادات المواقيت من التخزين المحلي
  // ---------------------------------------------------------------------------

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (error) {
      return null;
    }
  }

  /**
   * يجمع مدخلات الحساب الحالية، أو null إن لم يحدد المستخدم موقعه بعد.
   * الإحداثيات تأتي من prayerResolvedCoords التي يكتبها app.js عند كل حساب،
   * سواء جاء الموقع من الـ GPS أو من اختيار مدينة من القائمة.
   */
  function collect() {
    var coords = readJson('prayerResolvedCoords');
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
      return null;
    }
    var lastData = readJson('prayerLastData');
    return {
      latitude: coords.lat,
      longitude: coords.lng,
      method: Number(localStorage.getItem('prayerMethod') || 5),
      school: Number(localStorage.getItem('prayerMadhab') || 0),
      elevation: 0,
      locationLabel: (lastData && lastData.locationLabel) || '',
      tune: readJson('prayerTune') || {}
    };
  }

  // ---------------------------------------------------------------------------
  // 3) الواجهة
  // ---------------------------------------------------------------------------
  var PrayerWidget = {

    /** هل نعمل داخل الغلاف الأصلي (لا في متصفح عادي)؟ */
    isAvailable: function () {
      return !!native;
    },

    /**
     * يدفع إعدادات المواقيت الحالية إلى الودجت ويعيد رسمه.
     * يُستدعى بعد كل حساب أو تغيير إعداد — وهو رخيص جداً (كتابة SharedPreferences).
     */
    sync: function () {
      if (!native) {
        return Promise.resolve(EMPTY_STATUS);
      }
      var payload = collect();
      if (!payload) {
        return Promise.resolve(EMPTY_STATUS);
      }
      return native.sync(payload).catch(function () {
        return EMPTY_STATUS;
      });
    },

    /** يعيد رسم الودجتات بالإعدادات المحفوظة دون تغييرها. */
    refresh: function () {
      if (!native) {
        return Promise.resolve(EMPTY_STATUS);
      }
      return native.refresh().catch(function () {
        return EMPTY_STATUS;
      });
    },

    /** حالة الودجتات: كم ودجتاً مضافاً، وهل تدعم الشاشة الرئيسية الإضافة من التطبيق. */
    getStatus: function () {
      if (!native) {
        return Promise.resolve(EMPTY_STATUS);
      }
      return native.getStatus().catch(function () {
        return EMPTY_STATUS;
      });
    },

    /**
     * يطلب من الشاشة الرئيسية إضافة الودجت، فتظهر نافذة تأكيد للمستخدم.
     * يعود بـ { requested, reason } — و requested=false تعني أن على المستخدم
     * إضافته يدوياً (ضغطة مطوّلة على الشاشة الرئيسية ← الودجتات ← نور).
     *
     * @param {'large'|'small'} size
     */
    requestPin: function (size) {
      if (!native) {
        return Promise.resolve({ requested: false, reason: 'UNSUPPORTED' });
      }
      return native.requestPin({ size: size === 'small' ? 'small' : 'large' }).catch(function () {
        return { requested: false, reason: 'UNSUPPORTED' };
      });
    },

    /** يمحو بيانات الودجت فيعود إلى حالة «حدّد موقعك». */
    clear: function () {
      if (!native) {
        return Promise.resolve(EMPTY_STATUS);
      }
      return native.clear().catch(function () {
        return EMPTY_STATUS;
      });
    }
  };

  global.PrayerWidget = PrayerWidget;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PrayerWidget;
  }
})(typeof window !== 'undefined' ? window : this);
