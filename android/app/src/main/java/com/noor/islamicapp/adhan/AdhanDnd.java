package com.noor.islamicapp.adhan;

import android.app.NotificationManager;
import android.content.Context;
import android.util.Log;

/**
 * كتم/رفع كتم الجهاز عبر «عدم الإزعاج» (DND) للوضع الصامت بعد الأذان.
 *
 * يتطلّب إذن {@code ACCESS_NOTIFICATION_POLICY} الذي يمنحه المستخدم من إعدادات
 * النظام (لا عبر حوار runtime) — نتحقّق منه قبل أي محاولة فنتجنّب الاستثناءات.
 */
public final class AdhanDnd {

    private static final String TAG = "NoorAdhan";

    private AdhanDnd() {
    }

    private static NotificationManager manager(Context context) {
        return (NotificationManager) context.getApplicationContext()
            .getSystemService(Context.NOTIFICATION_SERVICE);
    }

    /** هل مُنح إذن التحكّم في «عدم الإزعاج»؟ */
    public static boolean hasAccess(Context context) {
        NotificationManager nm = manager(context);
        return nm != null && nm.isNotificationPolicyAccessGranted();
    }

    /** يكتم الجهاز: يمرّر فقط الأولويات (المنبّهات تظل تعمل). */
    public static void silence(Context context) {
        NotificationManager nm = manager(context);
        if (nm == null || !nm.isNotificationPolicyAccessGranted()) {
            return;
        }
        try {
            nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY);
        } catch (Exception e) {
            Log.w(TAG, "تعذّر تفعيل الوضع الصامت", e);
        }
    }

    /** يرفع الكتم ويعيد الصوت الكامل. */
    public static void restore(Context context) {
        NotificationManager nm = manager(context);
        if (nm == null || !nm.isNotificationPolicyAccessGranted()) {
            return;
        }
        try {
            nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL);
        } catch (Exception e) {
            Log.w(TAG, "تعذّر رفع الوضع الصامت", e);
        }
    }
}
