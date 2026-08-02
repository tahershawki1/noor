package com.noor.islamicapp.adhan;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.noor.islamicapp.widget.PrayerTimesCalculator;
import com.noor.islamicapp.widget.PrayerWidgetStore;

import java.util.List;

/**
 * جدولة منبّه الأذان — الحل الجذري لمشكلة «الأذان لا يعمل والتطبيق مغلق».
 *
 * كان تشغيل الأذان معلّقاً على مؤقّت جافاسكريبت داخل الـ WebView، وأندرويد
 * يجمّد هذه المؤقتات بمجرد ذهاب التطبيق للخلفية. هنا نضبط منبّه نظام
 * (AlarmManager) على لحظة أقرب صلاة <em>مفعّلة</em>، فيوقظ الجهاز
 * {@link AdhanAlarmReceiver} الذي يعرض إشعاراً بصوت الأذان الكامل ثم يجدول
 * الصلاة التالية — بلا خدمة دائمة ولا استنزاف بطارية، مرات معدودة في اليوم.
 */
public final class AdhanScheduler {

    private static final String TAG = "NoorAdhan";

    static final String ACTION_PRAYER = "com.noor.islamicapp.adhan.PRAYER";
    static final String ACTION_PRE_ALERT = "com.noor.islamicapp.adhan.PRE_ALERT";
    static final String EXTRA_PRAYER_INDEX = "prayerIndex";
    static final String EXTRA_MINUTES = "minutes";

    private static final int REQUEST_PRAYER = 9201;
    private static final int REQUEST_PRE_ALERT = 9202;

    private AdhanScheduler() {
    }

    /** يعيد ضبط المنبّهين من الصفر — بعد أي تغيّر في الإعدادات أو الموقع أو الساعة. */
    public static void reschedule(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) {
            return;
        }

        // إلغاء ما سبق دائماً — قد يكون المستخدم عطّل كل الصلوات للتو
        alarms.cancel(intentFor(context, ACTION_PRAYER, REQUEST_PRAYER, -1, 0));
        alarms.cancel(intentFor(context, ACTION_PRE_ALERT, REQUEST_PRE_ALERT, -1, 0));

        long now = System.currentTimeMillis();
        List<long[]> upcoming = PrayerWidgetStore.upcomingMainPrayers(context, now);
        long[] next = null;
        for (long[] candidate : upcoming) {
            String key = PrayerTimesCalculator.ALL[(int) candidate[1]];
            if (AdhanStore.isEnabled(context, key)) {
                next = candidate;
                break;
            }
        }
        if (next == null) {
            return; // لا موقع محفوظاً بعد، أو كل الصلوات معطّلة
        }

        setExact(alarms, next[0] + 500L,
            intentFor(context, ACTION_PRAYER, REQUEST_PRAYER, (int) next[1], 0));

        int preMinutes = AdhanStore.preAlertMinutes(context);
        if (preMinutes > 0) {
            long preAt = next[0] - preMinutes * 60_000L;
            if (preAt > now) {
                setExact(alarms, preAt,
                    intentFor(context, ACTION_PRE_ALERT, REQUEST_PRE_ALERT, (int) next[1], preMinutes));
            }
        }
    }

    /**
     * منبّه مضبوط ما أمكن — USE_EXACT_ALARM معلَنة في الـ Manifest فتُمنح
     * تلقائياً، لكن نتحوّط بمنبّه تقريبي لو حُجبت لأي سبب: تأخّر دقائق خير
     * من لا أذان.
     */
    private static void setExact(AlarmManager alarms, long at, PendingIntent intent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarms.canScheduleExactAlarms()) {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
            } else {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
            }
        } catch (SecurityException e) {
            Log.w(TAG, "تعذّر ضبط منبّه مضبوط للأذان، سنكتفي بتقريبي", e);
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
        }
    }

    private static PendingIntent intentFor(
        Context context,
        String action,
        int requestCode,
        int prayerIndex,
        int minutes
    ) {
        Intent intent = new Intent(context, AdhanAlarmReceiver.class).setAction(action);
        if (prayerIndex >= 0) {
            intent.putExtra(EXTRA_PRAYER_INDEX, prayerIndex);
        }
        if (minutes > 0) {
            intent.putExtra(EXTRA_MINUTES, minutes);
        }
        return PendingIntent.getBroadcast(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
