package com.noor.islamicapp.perms;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * جسر فحص/طلب صلاحيات أندرويد التي يحتاجها التطبيق.
 *
 * سبب وجوده: تحديد الموقع في التطبيق يمرّ عبر {@code navigator.geolocation}
 * داخل الـ WebView، وهذا لا يعمل ما لم تُمنَح صلاحية الموقع للتطبيق على مستوى
 * النظام. فبلا طلبٍ صريح للصلاحية، ينتظر {@code getCurrentPosition} بلا نتيجة
 * ثم يفشل بصمت. هذا الجسر يفحص الصلاحية ويطلبها عند الحاجة.
 *
 * الاستدعاء من الويب (app-shell.js):
 *   const NativePerms = Capacitor.registerPlugin('NativePerms');
 *   const st = await NativePerms.check();          // حالة كل الصلاحيات
 *   const st2 = await NativePerms.requestLocation(); // يطلب صلاحية الموقع
 *
 * في المتصفح plugin = null فيتكفّل المتصفح نفسه بحوار الإذن.
 */
@CapacitorPlugin(
    name = "NativePerms",
    permissions = {
        @Permission(
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            },
            alias = "location"
        )
    }
)
public class PermissionsPlugin extends Plugin {

    /** حالة كل الصلاحيات المطلوبة دفعةً واحدة — تعرضها واجهة الأونبوردنج. */
    @PluginMethod
    public void check(PluginCall call) {
        call.resolve(status());
    }

    /** يطلب صلاحية الموقع إن لم تكن ممنوحة، ثم يعيد الحالة المحدَّثة. */
    @PluginMethod
    public void requestLocation(PluginCall call) {
        if (hasLocation()) {
            call.resolve(status());
            return;
        }
        requestPermissionForAlias("location", call, "locationCallback");
    }

    @PermissionCallback
    private void locationCallback(PluginCall call) {
        call.resolve(status());
    }

    /** الموقع ممنوح لو مُنحت الدقيقة أو التقريبية (التقريبية تكفي لحساب المواقيت). */
    private boolean hasLocation() {
        Context c = getContext();
        return ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject status() {
        Context context = getContext();
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("location", hasLocation());
        result.put("notifications",
            NotificationManagerCompat.from(context).areNotificationsEnabled());

        NotificationManager nm =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        result.put("dnd", nm != null && nm.isNotificationPolicyAccessGranted());

        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        boolean exact = alarms != null
            && (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms());
        result.put("exactAlarms", exact);
        return result;
    }
}
