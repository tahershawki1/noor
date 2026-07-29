package com.noor.islamicapp.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/**
 * ودجت العدّاد الصغير — الوقت المتبقي للصلاة القادمة فقط.
 */
public class PrayerWidgetSmallProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            PrayerWidgetRenderer.render(context, manager, id, false);
        }
        PrayerWidgetRenderer.scheduleNextWake(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(
        Context context,
        AppWidgetManager manager,
        int appWidgetId,
        Bundle newOptions
    ) {
        PrayerWidgetRenderer.render(context, manager, appWidgetId, false);
    }

    @Override
    public void onDisabled(Context context) {
        if (!PrayerWidgetRenderer.hasAnyWidget(context)) {
            PrayerWidgetRenderer.cancelWake(context);
        }
    }
}
