package com.noor.islamicapp.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import com.noor.islamicapp.MainActivity;
import com.noor.islamicapp.R;

import java.util.Locale;

/**
 * رسم ودجتات الشاشة الرئيسية وجدولة تحديثها.
 *
 * <h3>كيف يتحرّك العدّاد دون استنزاف البطارية؟</h3>
 * العدّاد عنصر {@code Chronometer} في وضع العدّ التنازلي: نعطيه لحظة دخول
 * الصلاة القادمة مرة واحدة، ثم يحرّك النظام أرقامه ثانيةً بثانية داخل عملية
 * الـ launcher نفسها. لا منبّه كل دقيقة، ولا خدمة تعمل في الخلفية، ومع ذلك
 * يبقى العدّاد حيّاً بنفس إحساس التطبيق.
 *
 * التطبيق لا يُوقَظ إلا في لحظتين: دخول وقت الصلاة (لينتقل العدّاد إلى الصلاة
 * التالية)، وانقضاء رسالة «حان وقت الصلاة». أي خمس أو ست مرات في اليوم.
 *
 * <h3>التكيّف مع حجم الودجت</h3>
 * قياس الودجت الفعلي يأتي من {@link AppWidgetManager#getAppWidgetOptions}
 * ويتغيّر كلما سحب المستخدم مقابضه. نقرأه في كل رسم فنكبّر الخطوط أو نصغّرها،
 * ونخفي العناصر الثانوية بالترتيب (شريط الأوقات ← شريط التقدّم ← الشارة) حتى
 * لا تتزاحم العناصر في الأحجام الصغيرة.
 */
public final class PrayerWidgetRenderer {

    private static final String TAG = "NoorPrayerWidget";

    /** مدة بقاء رسالة «حان وقت الصلاة» بعد دخول الوقت. */
    private static final long DONE_WINDOW_MS = 90_000L;

    private static final int ALARM_REQUEST_CODE = 9101;
    private static final int CLICK_REQUEST_CODE = 9102;

    /** أسماء الصلوات ورموزها — نفس PRAYER_NAMES في app.js. */
    private static final String[] PRAYER_AR = { "الفجر", "الشروق", "الظهر", "العصر", "المغرب", "العشاء" };
    private static final String[] PRAYER_ICON = { "🌄", "🌅", "☀️", "🌤️", "🌇", "🌙" };

    private PrayerWidgetRenderer() {
    }

    // ==================== نقاط الدخول ====================

    /** يعيد رسم كل ودجتات التطبيق ويعيد جدولة الاستيقاظ التالي. */
    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        refreshProvider(context, manager, PrayerWidgetLargeProvider.class, true);
        refreshProvider(context, manager, PrayerWidgetSmallProvider.class, false);
        scheduleNextWake(context);
    }

    private static void refreshProvider(
        Context context,
        AppWidgetManager manager,
        Class<?> provider,
        boolean large
    ) {
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, provider));
        for (int id : ids) {
            render(context, manager, id, large);
        }
    }

    /** يرسم ودجتاً واحداً بالحجم الذي يشغله فعلياً على الشاشة. */
    public static void render(Context context, AppWidgetManager manager, int appWidgetId, boolean large) {
        long now = System.currentTimeMillis();
        PrayerWidgetStore.Snapshot snapshot = PrayerWidgetStore.snapshot(context, now);

        int layout = large ? R.layout.widget_prayer_large : R.layout.widget_prayer_small;
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);

        // النقر على أي موضع من الودجت يفتح التطبيق — بما في ذلك حالة «حدّد موقعك»
        views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context));

        if (snapshot == null) {
            showEmptyState(views, large);
        } else {
            Bundle options = manager.getAppWidgetOptions(appWidgetId);
            int widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, large ? 250 : 110);
            int heightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, large ? 160 : 40);
            if (large) {
                renderLarge(context, views, snapshot, now, widthDp, heightDp);
            } else {
                renderSmall(views, snapshot, now, widthDp, heightDp);
            }
        }

        manager.updateAppWidget(appWidgetId, views);
    }

    private static void showEmptyState(RemoteViews views, boolean large) {
        views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
        views.setViewVisibility(R.id.widget_countdown, View.GONE);
        views.setViewVisibility(R.id.widget_countdown_done, View.GONE);
        if (large) {
            views.setViewVisibility(R.id.widget_content, View.GONE);
        }
    }

    // ==================== الودجت الكبير ====================

    private static void renderLarge(
        Context context,
        RemoteViews views,
        PrayerWidgetStore.Snapshot snapshot,
        long now,
        int widthDp,
        int heightDp
    ) {
        views.setViewVisibility(R.id.widget_empty, View.GONE);
        views.setViewVisibility(R.id.widget_content, View.VISIBLE);

        int nextIndex = PrayerTimesCalculator.indexOf(snapshot.nextKey);
        views.setTextViewText(R.id.widget_prayer_name, PRAYER_AR[nextIndex]);

        bindCountdown(views, snapshot, now);
        views.setProgressBar(R.id.widget_progress, 100, snapshot.progressPercent(now), false);

        // شريط أوقات اليوم الستة — نفس ترتيب ‎.prayer-strip في التطبيق
        for (int i = 0; i < PrayerTimesCalculator.ALL.length; i++) {
            boolean isNext = i == nextIndex;
            views.setTextViewText(cellIcon(i), PRAYER_ICON[i]);
            views.setTextViewText(cellName(i), PRAYER_AR[i]);
            views.setTextViewText(cellTime(i), formatTime12(snapshot.todayMinutes[i]));
            views.setInt(cell(i), "setBackgroundResource",
                isNext ? R.drawable.widget_strip_cell_next : R.drawable.widget_strip_cell);
            views.setTextColor(cellName(i),
                color(context, isNext ? R.color.widget_white_90 : R.color.widget_white_68));
            views.setTextColor(cellTime(i),
                color(context, isNext ? R.color.widget_gold : R.color.widget_white));
        }

        // ------- التكيّف مع الحجم -------
        // الترتيب مقصود: نتخلّى عن شريط الأوقات أولاً لأنه أقل المعلومات إلحاحاً،
        // ثم شريط التقدّم، ثم الشارة، ويبقى الاسم والعدّاد إلى آخر رمق.
        boolean showStrip = heightDp >= 150;
        boolean showProgress = heightDp >= 105;
        boolean showLabel = heightDp >= 80;

        views.setViewVisibility(R.id.widget_strip, showStrip ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_progress, showProgress ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_label, showLabel ? View.VISIBLE : View.GONE);

        float countdownSize = clamp(widthDp * 0.115f, 16f, 34f);
        float nameSize = clamp(widthDp * 0.070f, 11f, 21f);
        // في الأحجام القصيرة نصغّر العدّاد أكثر حتى لا يزاحم اسم الصلاة
        if (!showProgress) {
            countdownSize = Math.min(countdownSize, heightDp * 0.42f);
        }

        views.setTextViewTextSize(R.id.widget_countdown, TypedValue.COMPLEX_UNIT_SP, countdownSize);
        views.setTextViewTextSize(R.id.widget_countdown_done, TypedValue.COMPLEX_UNIT_SP, countdownSize * 0.55f);
        views.setTextViewTextSize(R.id.widget_prayer_name, TypedValue.COMPLEX_UNIT_SP, nameSize);
    }

    // ==================== الودجت الصغير ====================

    private static void renderSmall(
        RemoteViews views,
        PrayerWidgetStore.Snapshot snapshot,
        long now,
        int widthDp,
        int heightDp
    ) {
        views.setViewVisibility(R.id.widget_empty, View.GONE);
        bindCountdown(views, snapshot, now);

        // العدّاد وحده هو كل محتوى هذا الودجت، فيأخذ أكبر خط يتّسع له الإطار:
        // محكوم بالارتفاع من جهة، وبعرض ثماني خانات (0:00:00) من جهة أخرى.
        float size = clamp(Math.min(heightDp * 0.55f, widthDp * 0.20f), 11f, 40f);
        views.setTextViewTextSize(R.id.widget_countdown, TypedValue.COMPLEX_UNIT_SP, size);
        views.setTextViewTextSize(R.id.widget_countdown_done, TypedValue.COMPLEX_UNIT_SP, clamp(size * 0.5f, 9f, 16f));
    }

    // ==================== العدّاد ====================

    /**
     * يربط العدّاد التنازلي، أو يستبدله برسالة «حان وقت الصلاة» في الدقيقة
     * والنصف التالية لدخول الوقت — كما يفعل التطبيق تماماً.
     */
    private static void bindCountdown(RemoteViews views, PrayerWidgetStore.Snapshot snapshot, long now) {
        boolean justEntered = now >= snapshot.previousAtMillis
            && now < snapshot.previousAtMillis + DONE_WINDOW_MS;

        views.setViewVisibility(R.id.widget_countdown, justEntered ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.widget_countdown_done, justEntered ? View.VISIBLE : View.GONE);

        if (justEntered) {
            return;
        }

        // Chronometer يعمل بساعة elapsedRealtime، فنحوّل لحظة الصلاة إليها
        long base = SystemClock.elapsedRealtime() + (snapshot.nextAtMillis - now);
        views.setChronometer(R.id.widget_countdown, base, null, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            views.setChronometerCountDown(R.id.widget_countdown, true);
        }
    }

    // ==================== الجدولة ====================

    /**
     * يضبط منبّهاً على أقرب لحظة يتغيّر فيها ما يعرضه الودجت: دخول الصلاة
     * القادمة، أو انقضاء رسالة «حان وقت الصلاة» إن كانت ظاهرة الآن.
     */
    public static void scheduleNextWake(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) {
            return;
        }
        PendingIntent intent = alarmIntent(context);

        if (!hasAnyWidget(context)) {
            alarms.cancel(intent);
            return;
        }

        long now = System.currentTimeMillis();
        PrayerWidgetStore.Snapshot snapshot = PrayerWidgetStore.snapshot(context, now);
        if (snapshot == null) {
            alarms.cancel(intent);
            return;
        }

        long doneUntil = snapshot.previousAtMillis + DONE_WINDOW_MS;
        long wakeAt = (now < doneUntil ? doneUntil : snapshot.nextAtMillis) + 1000L;

        try {
            // المنبّه المضبوط يحتاج صلاحية خاصة منذ أندرويد 12؛ وهي صلاحية
            // مقيّدة على متجر Play ولا تستحقّها ميزة عرض. فإن لم تكن ممنوحة
            // نستعمل منبّهاً غير مضبوط يعمل رغم وضع Doze، وقد يتأخر دقائق —
            // ولا ضرر: أسوأ ما يحدث أن يعرض العدّاد قيمة سالبة قصيرة ثم يصحّح.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarms.canScheduleExactAlarms()) {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, wakeAt, intent);
            } else {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, wakeAt, intent);
            }
        } catch (SecurityException e) {
            Log.w(TAG, "تعذّر ضبط منبّه مضبوط، سنكتفي بمنبّه تقريبي", e);
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, wakeAt, intent);
        }
    }

    /** يلغي المنبّه — يُستدعى عند حذف آخر ودجت. */
    public static void cancelWake(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) {
            alarms.cancel(alarmIntent(context));
        }
    }

    public static boolean hasAnyWidget(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        return manager.getAppWidgetIds(new ComponentName(context, PrayerWidgetLargeProvider.class)).length > 0
            || manager.getAppWidgetIds(new ComponentName(context, PrayerWidgetSmallProvider.class)).length > 0;
    }

    private static PendingIntent alarmIntent(Context context) {
        Intent intent = new Intent(context, PrayerWidgetReceiver.class)
            .setAction(PrayerWidgetReceiver.ACTION_TICK);
        return PendingIntent.getBroadcast(
            context, ALARM_REQUEST_CODE, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static PendingIntent openAppIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        return PendingIntent.getActivity(
            context, CLICK_REQUEST_CODE, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    // ==================== أدوات ====================

    /** "1:23 م" — نفس صيغة formatTime12 في app.js. */
    static String formatTime12(int minutesOfDay) {
        if (minutesOfDay == PrayerTimesCalculator.UNDEFINED) {
            return "—";
        }
        int hours = minutesOfDay / 60;
        int minutes = minutesOfDay % 60;
        String period = hours >= 12 ? "م" : "ص";
        int hours12 = hours % 12 == 0 ? 12 : hours % 12;
        return String.format(Locale.US, "%d:%02d %s", hours12, minutes, period);
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }

    @SuppressWarnings("deprecation")
    private static int color(Context context, int resId) {
        return context.getResources().getColor(resId);
    }

    private static int cell(int i) {
        switch (i) {
            case 0: return R.id.widget_cell_0;
            case 1: return R.id.widget_cell_1;
            case 2: return R.id.widget_cell_2;
            case 3: return R.id.widget_cell_3;
            case 4: return R.id.widget_cell_4;
            default: return R.id.widget_cell_5;
        }
    }

    private static int cellIcon(int i) {
        switch (i) {
            case 0: return R.id.widget_cell_icon_0;
            case 1: return R.id.widget_cell_icon_1;
            case 2: return R.id.widget_cell_icon_2;
            case 3: return R.id.widget_cell_icon_3;
            case 4: return R.id.widget_cell_icon_4;
            default: return R.id.widget_cell_icon_5;
        }
    }

    private static int cellName(int i) {
        switch (i) {
            case 0: return R.id.widget_cell_name_0;
            case 1: return R.id.widget_cell_name_1;
            case 2: return R.id.widget_cell_name_2;
            case 3: return R.id.widget_cell_name_3;
            case 4: return R.id.widget_cell_name_4;
            default: return R.id.widget_cell_name_5;
        }
    }

    private static int cellTime(int i) {
        switch (i) {
            case 0: return R.id.widget_cell_time_0;
            case 1: return R.id.widget_cell_time_1;
            case 2: return R.id.widget_cell_time_2;
            case 3: return R.id.widget_cell_time_3;
            case 4: return R.id.widget_cell_time_4;
            default: return R.id.widget_cell_time_5;
        }
    }
}
