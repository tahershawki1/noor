package com.noor.islamicapp.exit;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * خروج فعلي من التطبيق — يستدعيه الويب فقط بعد أن يقرر بنفسه (عبر منطق
 * زر الرجوع في settings-ui.js) أنه لا مزيد من الرجوع داخل التطبيق ممكناً.
 *
 * لا يعتمد المشروع {@code @capacitor/app} (الحل الرسمي المعتاد لهذا)، فبديل محلي
 * صغير بنفس نمط بقية البلاجنات هنا (BackupPlugin، AppUpdaterPlugin...) أبسط
 * من إضافة اعتماد جديد لدالة واحدة.
 */
@CapacitorPlugin(name = "AppExit")
public class AppExitPlugin extends Plugin {

    @PluginMethod
    public void exit(PluginCall call) {
        call.resolve();
        getActivity().finish();
    }
}
