package com.noor.islamicapp.adhan;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

/**
 * يستقبل منبّهي الأذان والتنبيه المسبق، وأحداث النظام التي تمحو المنبّهات
 * (الإقلاع، تغيير الساعة أو المنطقة الزمنية، تحديث التطبيق) فيعيد جدولتها.
 *
 * exported=true ضروري لبثوث النظام؛ وأكشنا المنبّه موجَّهان بالاسم إلى هذا
 * الصنف تحديداً فلا يستطيع تطبيق آخر إرسالهما، وأسوأ ما يفعله بث خارجي هو
 * إعادة جدولة لا أثر لها — نفس مبرّر {@code PrayerWidgetReceiver}.
 */
public class AdhanAlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();

        if (AdhanScheduler.ACTION_PRAYER.equals(action)) {
            int index = intent.getIntExtra(AdhanScheduler.EXTRA_PRAYER_INDEX, -1);
            if (index >= 0) {
                // الإشعار (بصوت الأذان الكامل) يحمل fullScreenIntent فيغطّي شاشة
                // القفل. ونحاول فتح الشاشة مباشرةً لتظهر فوق التطبيقات الأخرى
                // والجهاز غير مقفل — مسموح لأن التطبيق يملك صلاحية العرض فوق
                // التطبيقات. إن حُجبت، يتكفّل fullScreenIntent بشاشة القفل.
                AdhanNotifier.showPrayer(context, index);
                launchAdhanScreen(context, index);
            }
        } else if (AdhanScheduler.ACTION_PRE_ALERT.equals(action)) {
            int index = intent.getIntExtra(AdhanScheduler.EXTRA_PRAYER_INDEX, -1);
            int minutes = intent.getIntExtra(AdhanScheduler.EXTRA_MINUTES, 0);
            if (index >= 0 && minutes > 0) {
                AdhanNotifier.showPreAlert(context, index, minutes);
            }
        }

        // في كل الحالات — ومنها أحداث النظام — اضبط المنبّه التالي
        AdhanScheduler.reschedule(context);
    }

    /**
     * يفتح شاشة الأذان الكاملة مباشرةً. إطلاق نشاط من الخلفية محجوب منذ
     * أندرويد ١٠ إلا لمن يملك صلاحية العرض فوق التطبيقات — وهي متاحة لنا
     * (زر عائم). نتحقّق منها أولاً تفادياً لسجلّ أخطاء لا طائل منه.
     */
    private void launchAdhanScreen(Context context, int index) {
        boolean canStart = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            || Settings.canDrawOverlays(context);
        if (!canStart) {
            return; // fullScreenIntent يتكفّل بشاشة القفل
        }
        try {
            context.startActivity(AdhanAlarmActivity.intentFor(context, index));
        } catch (Exception e) {
            Log.w("NoorAdhan", "تعذّر فتح شاشة الأذان مباشرةً", e);
        }
    }
}
