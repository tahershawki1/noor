package com.noor.islamicapp;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.noor.islamicapp.adhan.AdhanPlugin;
import com.noor.islamicapp.backup.BackupPlugin;
import com.noor.islamicapp.exit.AppExitPlugin;
import com.noor.islamicapp.floating.FloatingWidgetPlugin;
import com.noor.islamicapp.perms.PermissionsPlugin;
import com.noor.islamicapp.update.AppUpdaterPlugin;
import com.noor.islamicapp.widget.PrayerWidgetPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // تسجيل البلاجنات المحلية قبل super.onCreate لتكون متاحة للجسر
        // منذ أول لحظة يبدأ فيها الـ WebView بتنفيذ الجافاسكريبت.
        registerPlugin(FloatingWidgetPlugin.class);
        registerPlugin(PrayerWidgetPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(BackupPlugin.class);
        registerPlugin(AppExitPlugin.class);
        registerPlugin(AdhanPlugin.class);
        registerPlugin(PermissionsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * لا اعتماد {@code @capacitor/app} في المشروع، فزر الرجوع الفعلي (المادي أو
     * إيماءة النظام) لا يصل لأي معالج جافاسكريبت افتراضياً — وبلا معالجة هنا
     * كان يُنهي النشاط مباشرة (يُغلق التطبيق بالكامل) بدل الرجوع داخل
     * التطبيق أولاً. نُرسل نفس حدث Cordova القديم الذي يستمع له الويب أصلاً
     * (settings-ui.js) فيقرر هو: رجوع داخل الأقسام، أو خروج فعلي عبر
     * AppExitPlugin لو كان في الصفحة الرئيسية أصلاً.
     */
    @Override
    public void onBackPressed() {
        getBridge().getWebView().evaluateJavascript(
            "document.dispatchEvent(new CustomEvent('backbutton'));", null);
    }
}
