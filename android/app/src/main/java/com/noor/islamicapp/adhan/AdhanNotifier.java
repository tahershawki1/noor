package com.noor.islamicapp.adhan;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.noor.islamicapp.MainActivity;
import com.noor.islamicapp.R;

/**
 * إشعارا الأذان والتنبيه المسبق.
 *
 * صوت قناة الأذان هو ملف الأذان الكامل المدمج في الـ APK (res/raw) بسمة
 * «منبّه» (USAGE_ALARM)، فيُسمع الأذان كاملاً حتى والتطبيق مغلق ودون إنترنت.
 * ملاحظة أندرويد 8+: صوت القناة يثبت عند إنشائها — تغييره لاحقاً يتطلب
 * قناة بمعرّف جديد.
 */
public final class AdhanNotifier {

    private static final String CHANNEL_ADHAN = "noor_adhan";
    private static final String CHANNEL_PRE = "noor_adhan_pre";
    /** معرّف إشعار الأذان — تمسحه {@link AdhanAlarmActivity} عند الإغلاق. */
    public static final int ID_ADHAN = 9301;
    private static final int ID_PRE = 9302;

    /** أسماء الصلوات بترتيب {@code PrayerTimesCalculator.ALL}. */
    private static final String[] PRAYER_AR = { "الفجر", "الشروق", "الظهر", "العصر", "المغرب", "العشاء" };

    private AdhanNotifier() {
    }

    /** إشعار «حان وقت الصلاة» بصوت الأذان الكامل. */
    public static void showPrayer(Context context, int prayerIndex) {
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || prayerIndex < 0 || prayerIndex >= PRAYER_AR.length) {
            return;
        }
        ensureChannels(manager, context);

        String name = PRAYER_AR[prayerIndex];
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ADHAN)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("🕌 حان الآن وقت صلاة " + name)
            .setContentText("الله أكبر الله أكبر — اضغط لفتح تطبيق نور")
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(openAppIntent(context))
            // شاشة الأذان الكاملة فوق شاشة القفل — كتطبيقات المنبّه
            .setFullScreenIntent(adhanScreenIntent(context, prayerIndex), true)
            .setAutoCancel(true);

        // قبل أندرويد 8 لا قنوات — الصوت يُضبط على الإشعار نفسه
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setSound(adhanSoundUri(context), android.media.AudioManager.STREAM_ALARM);
        }

        manager.notify(ID_ADHAN, builder.build());
    }

    /** تنبيه مسبق هادئ: «الصلاة بعد كذا دقيقة». */
    public static void showPreAlert(Context context, int prayerIndex, int minutes) {
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || prayerIndex < 0 || prayerIndex >= PRAYER_AR.length) {
            return;
        }
        ensureChannels(manager, context);

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_PRE)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("⏰ اقترب وقت صلاة " + PRAYER_AR[prayerIndex])
            .setContentText("الصلاة بعد " + minutes + " دقيقة")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(openAppIntent(context))
            .setAutoCancel(true)
            .build();

        manager.notify(ID_PRE, notification);
    }

    private static Uri adhanSoundUri(Context context) {
        return Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.adhan_alafasy);
    }

    /** نيّة معلّقة تطلق شاشة الأذان الكاملة لصلاة بعينها. */
    private static PendingIntent adhanScreenIntent(Context context, int prayerIndex) {
        return PendingIntent.getActivity(
            context, 9310 + prayerIndex,
            AdhanAlarmActivity.intentFor(context, prayerIndex),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static void ensureChannels(NotificationManager manager, Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationChannel adhan = new NotificationChannel(
            CHANNEL_ADHAN, "الأذان", NotificationManager.IMPORTANCE_HIGH);
        adhan.setDescription("إشعار بصوت الأذان الكامل عند دخول وقت الصلاة");
        adhan.setSound(adhanSoundUri(context), new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build());
        manager.createNotificationChannel(adhan);

        NotificationChannel pre = new NotificationChannel(
            CHANNEL_PRE, "تنبيه قبل الأذان", NotificationManager.IMPORTANCE_DEFAULT);
        pre.setDescription("تذكير قبل دخول وقت الصلاة بالدقائق التي تختارها");
        manager.createNotificationChannel(pre);
    }

    private static PendingIntent openAppIntent(Context context) {
        Intent open = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        return PendingIntent.getActivity(
            context, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
