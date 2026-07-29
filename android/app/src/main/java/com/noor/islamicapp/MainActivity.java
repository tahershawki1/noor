package com.noor.islamicapp;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.noor.islamicapp.floating.FloatingWidgetPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // تسجيل البلاجن المحلي قبل super.onCreate ليكون متاحاً للجسر
        // منذ أول لحظة يبدأ فيها الـ WebView بتنفيذ الجافاسكريبت.
        registerPlugin(FloatingWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
