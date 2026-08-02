package com.noor.islamicapp.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/**
 * الجسر بين كود الويب وودجتات الشاشة الرئيسية.
 *
 * <h3>لماذا يدفع الويب «مدخلات الحساب» لا الأوقات؟</h3>
 * الودجت يعمل والتطبيق مغلق، وقد يمرّ أسبوع لا يُفتح فيه. لو خزّنّا أوقات اليوم
 * لأصبحت خاطئة غداً. لذلك يرسل الويب الموقع وطريقة الحساب والمذهب والتصحيح،
 * ويعيد الودجت الحساب بنفسه في كل مرة عبر {@link PrayerTimesCalculator} — وهي
 * نسخة جافا مطابقة لـ prayer-times.js، فلا تختلف النتيجة عن شاشة التطبيق.
 *
 * الاستدعاء من الويب (أو عبر الغلاف الجاهز في www/prayer-widget.js):
 *   const PrayerWidget = Capacitor.registerPlugin('PrayerWidget');
 *   await PrayerWidget.sync({ latitude: 30.04, longitude: 31.24, method: 5 });
 */
@CapacitorPlugin(name = "PrayerWidget")
public class PrayerWidgetPlugin extends Plugin {

    /** يدفع مدخلات حساب المواقيت إلى الودجت ويعيد رسمه فوراً. */
    @PluginMethod
    public void sync(PluginCall call) {
        Double latitude = call.getDouble("latitude");
        Double longitude = call.getDouble("longitude");
        if (latitude == null || longitude == null) {
            call.reject("latitude و longitude مطلوبان", "INVALID_ARGS");
            return;
        }

        JSObject tune = call.getObject("tune");
        PrayerWidgetStore.save(
            getContext(),
            latitude,
            longitude,
            call.getInt("method", PrayerTimesCalculator.DEFAULT_METHOD),
            call.getInt("school", 0),
            call.getDouble("elevation", 0d),
            call.getString("locationLabel", ""),
            tune == null ? new JSONObject() : tune
        );

        PrayerWidgetRenderer.refreshAll(getContext());
        // مدخلات الحساب تغيّرت — منبّه الأذان يقرأ من نفس المخزن فيُعاد ضبطه
        com.noor.islamicapp.adhan.AdhanScheduler.reschedule(getContext());
        call.resolve(status());
    }

    /** يعيد رسم الودجتات بالإعدادات المحفوظة (دون تغييرها). */
    @PluginMethod
    public void refresh(PluginCall call) {
        PrayerWidgetRenderer.refreshAll(getContext());
        call.resolve(status());
    }

    /** يمحو الإعدادات فيعود الودجت إلى حالة «حدّد موقعك». */
    @PluginMethod
    public void clear(PluginCall call) {
        PrayerWidgetStore.clear(getContext());
        PrayerWidgetRenderer.refreshAll(getContext());
        call.resolve(status());
    }

    /** كم ودجتاً مضافاً، وهل يدعم المشغّل الإضافة من داخل التطبيق؟ */
    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    /**
     * يطلب من مشغّل الشاشة الرئيسية تثبيت ودجت، فتظهر للمستخدم نافذة تأكيد.
     *
     * متاح منذ أندرويد 8، ومشروط بدعم المشغّل نفسه (بعض المشغّلات لا تدعمه).
     * إن تعذّر، على الويب أن يرشد المستخدم إلى الطريقة اليدوية: ضغطة مطوّلة على
     * الشاشة الرئيسية ← الودجتات ← نور.
     *
     * @param call size: "large" (الافتراضي) أو "small"
     */
    @PluginMethod
    public void requestPin(PluginCall call) {
        String size = call.getString("size", "large");
        boolean small = "small".equalsIgnoreCase(size);

        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !manager.isRequestPinAppWidgetSupported()) {
            JSObject result = new JSObject();
            result.put("requested", false);
            result.put("reason", "UNSUPPORTED");
            call.resolve(result);
            return;
        }

        ComponentName provider = new ComponentName(
            getContext(),
            small ? PrayerWidgetSmallProvider.class : PrayerWidgetLargeProvider.class
        );

        boolean requested = manager.requestPinAppWidget(provider, null, null);
        JSObject result = new JSObject();
        result.put("requested", requested);
        if (!requested) {
            result.put("reason", "REFUSED_BY_LAUNCHER");
        }
        call.resolve(result);
    }

    // ==================== أدوات ====================

    private JSObject status() {
        Context context = getContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);

        JSObject result = new JSObject();
        result.put("hasData", PrayerWidgetStore.hasData(context));
        result.put("largeCount", count(context, manager, PrayerWidgetLargeProvider.class));
        result.put("smallCount", count(context, manager, PrayerWidgetSmallProvider.class));
        result.put("pinSupported",
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.isRequestPinAppWidgetSupported());
        return result;
    }

    private static int count(Context context, AppWidgetManager manager, Class<?> provider) {
        return manager.getAppWidgetIds(new ComponentName(context, provider)).length;
    }
}
