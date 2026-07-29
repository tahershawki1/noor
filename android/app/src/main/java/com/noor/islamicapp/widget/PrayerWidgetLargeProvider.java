package com.noor.islamicapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/**
 * ودجت «الصلاة القادمة» الكبير — البطاقة الكاملة بنفس شكلها داخل التطبيق.
 *
 * كل المنطق في {@link PrayerWidgetRenderer}؛ هذا الصنف مجرّد نقطة تسجيل في
 * الـ Manifest تخبر النظام بأي تخطيط وبأي حجم مبدئي يُنشأ الودجت.
 */
public class PrayerWidgetLargeProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            PrayerWidgetRenderer.render(context, manager, id, true);
        }
        PrayerWidgetRenderer.scheduleNextWake(context);
    }

    /** يُستدعى كلما غيّر المستخدم حجم الودجت بسحب مقابضه. */
    @Override
    public void onAppWidgetOptionsChanged(
        Context context,
        AppWidgetManager manager,
        int appWidgetId,
        Bundle newOptions
    ) {
        PrayerWidgetRenderer.render(context, manager, appWidgetId, true);
    }

    @Override
    public void onDisabled(Context context) {
        // لم يبقَ من هذا النوع شيء — لكن قد يبقى الودجت الصغير، فالإلغاء مشروط
        if (!PrayerWidgetRenderer.hasAnyWidget(context)) {
            PrayerWidgetRenderer.cancelWake(context);
        }
    }
}
