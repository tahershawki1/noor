package com.noor.islamicapp.widget;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * يعيد رسم الودجتات عند كل حدث يجعل ما تعرضه قديماً:
 *
 * <ul>
 *   <li>{@link #ACTION_TICK} — منبّهنا الخاص عند دخول وقت الصلاة.</li>
 *   <li>إقلاع الجهاز — المنبّهات تُمحى عند إعادة التشغيل فلا بد من إعادة ضبطها.</li>
 *   <li>تغيّر الساعة أو المنطقة الزمنية — المسافر تتغيّر مواقيته فوراً.</li>
 *   <li>تغيّر التاريخ عند منتصف الليل — يضمن انتقال الشريط إلى مواقيت اليوم الجديد.</li>
 *   <li>تحديث التطبيق — النظام يلغي منبّهات النسخة السابقة.</li>
 * </ul>
 */
public class PrayerWidgetReceiver extends BroadcastReceiver {

    public static final String ACTION_TICK = "com.noor.islamicapp.widget.TICK";

    @Override
    public void onReceive(Context context, Intent intent) {
        PrayerWidgetRenderer.refreshAll(context);
    }
}
