package com.noor.islamicapp;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.noor.islamicapp.backup.BackupPlugin;
import com.noor.islamicapp.floating.FloatingWidgetPlugin;
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
        super.onCreate(savedInstanceState);
    }
}
