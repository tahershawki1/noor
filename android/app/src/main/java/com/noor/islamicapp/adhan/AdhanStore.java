package com.noor.islamicapp.adhan;

import android.content.Context;
import android.content.SharedPreferences;

import com.noor.islamicapp.widget.PrayerTimesCalculator;

import org.json.JSONObject;

/**
 * إعدادات إشعارات الأذان — يدفعها كود الويب عبر {@link AdhanPlugin#sync}.
 *
 * تُخزَّن في SharedPreferences لأن منبّه الأذان يعمل والتطبيق مغلق ولا يستطيع
 * قراءة localStorage الخاص بالـ WebView (نفس فكرة {@code PrayerWidgetStore}).
 * أما مدخلات حساب المواقيت نفسها (الموقع والطريقة والتصحيح) فمصدرها
 * {@code PrayerWidgetStore} — مخزن واحد للحقيقة يتشاركه الودجت والأذان.
 */
public final class AdhanStore {

    private static final String PREFS = "noor_adhan_prefs";
    private static final String KEY_ENABLED_PREFIX = "enabled_";
    private static final String KEY_PRE_ALERT = "pre_alert_minutes";
    // الوضع الصامت بعد الأذان
    private static final String KEY_SILENT_ENABLED = "silent_enabled";
    private static final String KEY_SILENT_DELAY = "silent_delay_minutes";
    private static final String KEY_SILENT_DURATION = "silent_duration_minutes";
    // لحظة رفع الكتم المتوقّعة — تُستعمل للتعافي بعد إعادة الإقلاع كي لا يعلق الجهاز صامتاً
    private static final String KEY_SILENCE_OFF_AT = "silence_off_at";

    private AdhanStore() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** نفس افتراضيات الويب (getAdhanEnabledPrayers): الفجر والمغرب فقط. */
    public static boolean isEnabled(Context context, String prayer) {
        boolean fallback = "Fajr".equals(prayer) || "Maghrib".equals(prayer);
        return prefs(context).getBoolean(KEY_ENABLED_PREFIX + prayer, fallback);
    }

    /** دقائق التنبيه المسبق قبل الأذان — صفر يعني معطّل. */
    public static int preAlertMinutes(Context context) {
        return prefs(context).getInt(KEY_PRE_ALERT, 0);
    }

    /** هل يُفعَّل كتم الجهاز بعد الأذان؟ */
    public static boolean silentEnabled(Context context) {
        return prefs(context).getBoolean(KEY_SILENT_ENABLED, false);
    }

    /** كم دقيقة بعد الأذان يبدأ الكتم. */
    public static int silentDelayMinutes(Context context) {
        return Math.max(0, prefs(context).getInt(KEY_SILENT_DELAY, 0));
    }

    /** مدة الكتم بالدقائق. */
    public static int silentDurationMinutes(Context context) {
        return Math.max(1, prefs(context).getInt(KEY_SILENT_DURATION, 15));
    }

    /** لحظة رفع الكتم المتوقّعة (ms)، أو 0 إن لا كتم نشط. */
    public static long silenceOffAt(Context context) {
        return prefs(context).getLong(KEY_SILENCE_OFF_AT, 0L);
    }

    public static void setSilenceOffAt(Context context, long at) {
        prefs(context).edit().putLong(KEY_SILENCE_OFF_AT, at).apply();
    }

    public static void clearSilenceOffAt(Context context) {
        prefs(context).edit().remove(KEY_SILENCE_OFF_AT).apply();
    }

    public static void save(
        Context context,
        JSONObject enabledPrayers,
        int preAlertMinutes,
        boolean silentEnabled,
        int silentDelayMinutes,
        int silentDurationMinutes
    ) {
        SharedPreferences.Editor editor = prefs(context).edit()
            .putInt(KEY_PRE_ALERT, Math.max(0, preAlertMinutes))
            .putBoolean(KEY_SILENT_ENABLED, silentEnabled)
            .putInt(KEY_SILENT_DELAY, Math.max(0, silentDelayMinutes))
            .putInt(KEY_SILENT_DURATION, Math.max(1, silentDurationMinutes));
        if (enabledPrayers != null) {
            for (String prayer : PrayerTimesCalculator.MAIN) {
                if (enabledPrayers.has(prayer)) {
                    editor.putBoolean(KEY_ENABLED_PREFIX + prayer, enabledPrayers.optBoolean(prayer, false));
                }
            }
        }
        editor.apply();
    }
}
