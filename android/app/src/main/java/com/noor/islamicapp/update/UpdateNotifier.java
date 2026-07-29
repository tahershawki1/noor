package com.noor.islamicapp.update;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.noor.islamicapp.MainActivity;
import com.noor.islamicapp.R;

/**
 * إشعار «يوجد تحديث جديد للتطبيق».
 *
 * ينبّه المستخدم حتى لو لم يكن التطبيق مفتوحاً وقت اكتشاف التحديث، والنقر عليه
 * يفتح التطبيق ليكمل التنزيل والتثبيت.
 *
 * ملاحظة: منذ أندرويد 13 لا يظهر أي إشعار ما لم تُمنح POST_NOTIFICATIONS.
 * الإشعار هنا تكميلي لا أساسي — الشريط داخل التطبيق يظهر في كل الأحوال.
 */
public final class UpdateNotifier {

    private static final String CHANNEL_ID = "noor_app_updates";
    private static final int NOTIFICATION_ID = 8901;

    private UpdateNotifier() {
    }

    public static void show(Context context, String version, String notes) {
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }
        ensureChannel(manager, context);

        Intent open = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        PendingIntent intent = PendingIntent.getActivity(
            context, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String text = notes == null || notes.trim().isEmpty()
            ? "النسخة " + version + " جاهزة — اضغط للتثبيت"
            : notes.trim();

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("تحديث جديد لتطبيق نور")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(intent)
            .setAutoCancel(true)
            .build();

        manager.notify(NOTIFICATION_ID, notification);
    }

    public static void cancel(Context context) {
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(NOTIFICATION_ID);
        }
    }

    private static void ensureChannel(NotificationManager manager, Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "تحديثات التطبيق",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("إشعار عند توفّر نسخة جديدة من نور");
        manager.createNotificationChannel(channel);
    }
}
