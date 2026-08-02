package com.noor.islamicapp.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * مخزن إعدادات ودجت الشاشة الرئيسية، والجسر الذي يحوّلها إلى "لقطة" جاهزة للعرض.
 *
 * الودجت يعمل والتطبيق مغلق، ولا يستطيع قراءة localStorage الخاص بالـ WebView،
 * لذلك يدفع كود الويب إعدادات المواقيت إلى SharedPreferences عبر
 * {@link PrayerWidgetPlugin#sync}. ما يُخزَّن هنا هو <em>مدخلات الحساب</em>
 * (الموقع والطريقة والمذهب والتصحيح) لا الأوقات نفسها، حتى يبقى الودجت صحيحاً
 * بعد منتصف الليل وبعد أسابيع من آخر مرة فُتح فيها التطبيق.
 */
public final class PrayerWidgetStore {

    private static final String PREFS = "noor_prayer_widget_prefs";

    private static final String KEY_HAS_DATA = "has_data";
    private static final String KEY_LATITUDE = "latitude";
    private static final String KEY_LONGITUDE = "longitude";
    private static final String KEY_METHOD = "method";
    private static final String KEY_SCHOOL = "school";
    private static final String KEY_ELEVATION = "elevation";
    private static final String KEY_LOCATION_LABEL = "location_label";
    private static final String KEY_TUNE_PREFIX = "tune_";

    private PrayerWidgetStore() {
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ==================== الكتابة ====================

    /**
     * يحفظ مدخلات الحساب القادمة من الويب.
     * الإحداثيات تُخزَّن كنص لأن {@code putFloat} يفقد دقة كافية لتزحزح الأوقات.
     */
    public static void save(
        Context context,
        double latitude,
        double longitude,
        int method,
        int school,
        double elevation,
        String locationLabel,
        JSONObject tune
    ) {
        SharedPreferences.Editor editor = prefs(context).edit()
            .putBoolean(KEY_HAS_DATA, true)
            .putString(KEY_LATITUDE, Double.toString(latitude))
            .putString(KEY_LONGITUDE, Double.toString(longitude))
            .putInt(KEY_METHOD, method)
            .putInt(KEY_SCHOOL, school)
            .putString(KEY_ELEVATION, Double.toString(elevation))
            .putString(KEY_LOCATION_LABEL, locationLabel == null ? "" : locationLabel);

        for (String prayer : PrayerTimesCalculator.ALL) {
            int offset = tune == null ? 0 : tune.optInt(prayer, 0);
            editor.putInt(KEY_TUNE_PREFIX + prayer, offset);
        }
        editor.apply();
    }

    public static void clear(Context context) {
        prefs(context).edit().clear().apply();
    }

    public static boolean hasData(Context context) {
        return prefs(context).getBoolean(KEY_HAS_DATA, false);
    }

    // ==================== القراءة والحساب ====================

    /**
     * لقطة جاهزة للرسم: مواقيت اليوم، والصلاة القادمة، والصلاة السابقة لها
     * (لحساب شريط التقدّم).
     */
    public static final class Snapshot {
        /** مواقيت اليوم بالدقائق منذ منتصف الليل، بترتيب {@link PrayerTimesCalculator#ALL}. */
        public final int[] todayMinutes;
        /** مفتاح الصلاة القادمة، مثل "Asr". */
        public final String nextKey;
        /** لحظة دخول الصلاة القادمة (توقيت الجهاز بالمللي ثانية). */
        public final long nextAtMillis;
        /** لحظة دخول الصلاة التي قبلها — بداية المدة التي يقيسها شريط التقدّم. */
        public final long previousAtMillis;
        public final String locationLabel;

        Snapshot(int[] todayMinutes, String nextKey, long nextAtMillis, long previousAtMillis, String locationLabel) {
            this.todayMinutes = todayMinutes;
            this.nextKey = nextKey;
            this.nextAtMillis = nextAtMillis;
            this.previousAtMillis = previousAtMillis;
            this.locationLabel = locationLabel;
        }

        /** نسبة ما انقضى من المدة بين الصلاتين (0..100). */
        public int progressPercent(long nowMillis) {
            long span = nextAtMillis - previousAtMillis;
            if (span <= 0) {
                return 0;
            }
            long elapsed = nowMillis - previousAtMillis;
            return (int) Math.max(0, Math.min(100, (elapsed * 100L) / span));
        }
    }

    /**
     * يبني لقطة اللحظة الحالية، أو {@code null} إن لم يضبط المستخدم موقعه بعد.
     *
     * منطق اختيار الصلاة القادمة مطابق لدالة renderPrayerRowsAndCountdown في
     * app.js: أول صلاة من الخمس لم يدخل وقتها بعد، وإلا فجر الغد. والصلاة
     * السابقة هي التي قبلها، وإلا عشاء الأمس.
     */
    public static Snapshot snapshot(Context context, long nowMillis) {
        SharedPreferences p = prefs(context);
        if (!p.getBoolean(KEY_HAS_DATA, false)) {
            return null;
        }

        double latitude = parseDouble(p.getString(KEY_LATITUDE, null));
        double longitude = parseDouble(p.getString(KEY_LONGITUDE, null));
        if (Double.isNaN(latitude) || Double.isNaN(longitude)) {
            return null;
        }
        int method = p.getInt(KEY_METHOD, PrayerTimesCalculator.DEFAULT_METHOD);
        int school = p.getInt(KEY_SCHOOL, 0);
        double elevation = parseDouble(p.getString(KEY_ELEVATION, "0"));
        if (Double.isNaN(elevation)) {
            elevation = 0;
        }
        String label = p.getString(KEY_LOCATION_LABEL, "");

        Calendar today = midnight(nowMillis);
        int[] todayMinutes = tuned(p, PrayerTimesCalculator.calculate(latitude, longitude, method, school, elevation, today));

        // أول صلاة من الخمس لم يدخل وقتها بعد
        String nextKey = null;
        long nextAt = 0;
        long previousAt = 0;
        String previousKey = null;

        for (String prayer : PrayerTimesCalculator.MAIN) {
            int minutes = todayMinutes[PrayerTimesCalculator.indexOf(prayer)];
            if (minutes == PrayerTimesCalculator.UNDEFINED) {
                continue;
            }
            long at = today.getTimeInMillis() + minutes * 60_000L;
            if (at > nowMillis) {
                nextKey = prayer;
                nextAt = at;
                break;
            }
            previousKey = prayer;
            previousAt = at;
        }

        if (nextKey == null) {
            // انتهى عشاء اليوم — القادمة فجر الغد
            Calendar tomorrow = midnight(nowMillis);
            tomorrow.add(Calendar.DAY_OF_MONTH, 1);
            int[] tomorrowMinutes = tuned(p, PrayerTimesCalculator.calculate(latitude, longitude, method, school, elevation, tomorrow));
            int fajr = tomorrowMinutes[PrayerTimesCalculator.indexOf("Fajr")];
            if (fajr == PrayerTimesCalculator.UNDEFINED) {
                return null;
            }
            nextKey = "Fajr";
            nextAt = tomorrow.getTimeInMillis() + fajr * 60_000L;
        }

        if (previousKey == null) {
            // ما زلنا قبل فجر اليوم — السابقة عشاء الأمس
            Calendar yesterday = midnight(nowMillis);
            yesterday.add(Calendar.DAY_OF_MONTH, -1);
            int[] yesterdayMinutes = tuned(p, PrayerTimesCalculator.calculate(latitude, longitude, method, school, elevation, yesterday));
            int isha = yesterdayMinutes[PrayerTimesCalculator.indexOf("Isha")];
            previousAt = isha == PrayerTimesCalculator.UNDEFINED
                ? nextAt - 6 * 3600_000L
                : yesterday.getTimeInMillis() + isha * 60_000L;
        }

        return new Snapshot(todayMinutes, nextKey, nextAt, previousAt, label);
    }

    /**
     * لحظات دخول الصلوات الخمس القادمة خلال اليومين المقبلين، مرتّبة زمنياً.
     * كل عنصر: {@code { لحظة الدخول بالمللي ثانية، فهرس الصلاة في ALL }}.
     * يستعملها منبّه الأذان ({@code AdhanScheduler}) ليجد أقرب صلاة مفعّلة
     * ولو كانت فجر الغد. قائمة فارغة إن لم يُضبط الموقع بعد.
     */
    public static List<long[]> upcomingMainPrayers(Context context, long nowMillis) {
        List<long[]> result = new ArrayList<>();
        SharedPreferences p = prefs(context);
        if (!p.getBoolean(KEY_HAS_DATA, false)) {
            return result;
        }
        double latitude = parseDouble(p.getString(KEY_LATITUDE, null));
        double longitude = parseDouble(p.getString(KEY_LONGITUDE, null));
        if (Double.isNaN(latitude) || Double.isNaN(longitude)) {
            return result;
        }
        int method = p.getInt(KEY_METHOD, PrayerTimesCalculator.DEFAULT_METHOD);
        int school = p.getInt(KEY_SCHOOL, 0);
        double elevation = parseDouble(p.getString(KEY_ELEVATION, "0"));
        if (Double.isNaN(elevation)) {
            elevation = 0;
        }

        for (int dayOffset = 0; dayOffset <= 1; dayOffset++) {
            Calendar day = midnight(nowMillis);
            day.add(Calendar.DAY_OF_MONTH, dayOffset);
            int[] minutes = tuned(p,
                PrayerTimesCalculator.calculate(latitude, longitude, method, school, elevation, day));
            for (String prayer : PrayerTimesCalculator.MAIN) {
                int index = PrayerTimesCalculator.indexOf(prayer);
                if (minutes[index] == PrayerTimesCalculator.UNDEFINED) {
                    continue;
                }
                long at = day.getTimeInMillis() + minutes[index] * 60_000L;
                if (at > nowMillis) {
                    result.add(new long[] { at, index });
                }
            }
        }
        return result;
    }

    // ==================== أدوات ====================

    /** يطبّق تصحيح الدقائق الذي ضبطه المستخدم ليطابق مسجد حيّه. */
    private static int[] tuned(SharedPreferences p, int[] minutes) {
        for (int i = 0; i < PrayerTimesCalculator.ALL.length; i++) {
            if (minutes[i] == PrayerTimesCalculator.UNDEFINED) {
                continue;
            }
            int offset = p.getInt(KEY_TUNE_PREFIX + PrayerTimesCalculator.ALL[i], 0);
            minutes[i] = (((minutes[i] + offset) % 1440) + 1440) % 1440;
        }
        return minutes;
    }

    /** منتصف ليل اليوم الذي تقع فيه اللحظة المعطاة، بتوقيت الجهاز. */
    private static Calendar midnight(long millis) {
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(millis);
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        return calendar;
    }

    private static double parseDouble(String value) {
        if (value == null || value.isEmpty()) {
            return Double.NaN;
        }
        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException e) {
            return Double.NaN;
        }
    }
}
