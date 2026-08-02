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

    public static void save(Context context, JSONObject enabledPrayers, int preAlertMinutes) {
        SharedPreferences.Editor editor = prefs(context).edit()
            .putInt(KEY_PRE_ALERT, Math.max(0, preAlertMinutes));
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
