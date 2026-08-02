package com.noor.islamicapp.adhan;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

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
                AdhanNotifier.showPrayer(context, index);
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
}
