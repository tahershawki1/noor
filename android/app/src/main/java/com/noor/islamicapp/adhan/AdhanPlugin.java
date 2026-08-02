package com.noor.islamicapp.adhan;

import android.app.AlarmManager;
import android.content.Context;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * الجسر بين كود الويب وإشعارات الأذان الأصلية.
 *
 * الاستدعاء من الويب (adhan-page.js):
 *   const AdhanNative = Capacitor.registerPlugin('AdhanNative');
 *   await AdhanNative.sync({ enabledPrayers: { Fajr: true, ... }, preAlertMinutes: 10 });
 *
 * مدخلات حساب المواقيت (الموقع والطريقة والتصحيح) لا تمرّ من هنا — مصدرها
 * {@code PrayerWidget.sync} الذي يدفعها إلى {@code PrayerWidgetStore} المشترك.
 */
@CapacitorPlugin(
    name = "AdhanNative",
    permissions = @Permission(strings = { "android.permission.POST_NOTIFICATIONS" }, alias = "notifications")
)
public class AdhanPlugin extends Plugin {

    /** يدفع إعدادات الأذان (الصلوات المفعّلة والتنبيه المسبق) ويعيد الجدولة. */
    @PluginMethod
    public void sync(PluginCall call) {
        AdhanStore.save(
            getContext(),
            call.getObject("enabledPrayers"),
            call.getInt("preAlertMinutes", 0)
        );
        AdhanScheduler.reschedule(getContext());
        call.resolve(status());
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    /** يطلب إذن الإشعارات (أندرويد 13+) — قبلها الإذن ممنوح ضمنياً. */
    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33
            || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(status());
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        call.resolve(status());
    }

    private JSObject status() {
        Context context = getContext();
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("notificationsEnabled",
            NotificationManagerCompat.from(context).areNotificationsEnabled());
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        boolean exact = alarms != null
            && (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms());
        result.put("exactAlarms", exact);
        return result;
    }
}
