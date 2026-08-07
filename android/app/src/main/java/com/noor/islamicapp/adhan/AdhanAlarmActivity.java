package com.noor.islamicapp.adhan;

import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.noor.islamicapp.MainActivity;
import com.noor.islamicapp.R;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * شاشة الأذان الكاملة — تُطلق من منبّه الأذان فتظهر فوق شاشة القفل وفوق أي
 * تطبيق آخر، تماماً كتطبيقات المنبّه. مرئية فقط: صوت الأذان الكامل يأتي من
 * قناة الإشعار (USAGE_ALARM) كما هو، فلا يتداخل صوتان.
 *
 * تظهر عبر مسارين متكاملين (انظر {@link AdhanAlarmReceiver}):
 *   ١) fullScreenIntent على الإشعار — يضمن ظهورها فوق شاشة القفل.
 *   ٢) startActivity مباشر من المستقبِل — يظهرها فوق التطبيقات الأخرى والجهاز
 *      غير مقفل، ويُسمح به لأن التطبيق يملك صلاحية العرض فوق التطبيقات.
 */
public class AdhanAlarmActivity extends AppCompatActivity {

    public static final String EXTRA_PRAYER_INDEX = "adhanPrayerIndex";

    /** أسماء الصلوات بترتيب {@code PrayerTimesCalculator.ALL}. */
    private static final String[] PRAYER_AR =
        { "الفجر", "الشروق", "الظهر", "العصر", "المغرب", "العشاء" };

    private static final String ADHAN_TEXT =
        "اللهُ أَكْبَرُ، اللهُ أَكْبَرُ\n"
        + "أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا اللهُ\n"
        + "أَشْهَدُ أَنَّ مُحَمَّدًا رَسُولُ اللهِ\n"
        + "حَيَّ عَلَى الصَّلَاةِ\n"
        + "حَيَّ عَلَى الْفَلَاحِ\n"
        + "اللهُ أَكْبَرُ، اللهُ أَكْبَرُ\n"
        + "لَا إِلَهَ إِلَّا اللهُ";

    /** يبني نيّة إطلاق الشاشة لصلاة بعينها. */
    public static Intent intentFor(Context context, int prayerIndex) {
        return new Intent(context, AdhanAlarmActivity.class)
            .putExtra(EXTRA_PRAYER_INDEX, prayerIndex)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.AppTheme_Adhan);
        super.onCreate(savedInstanceState);

        showOverLockScreen();
        setContentView(R.layout.activity_adhan_alarm);

        bind(getIntent());
        vibrate();

        Button open = findViewById(R.id.adhanAlarmOpen);
        open.setOnClickListener(v -> {
            startActivity(new Intent(this, MainActivity.class)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED));
            dismiss();
        });

        findViewById(R.id.adhanAlarmDismiss).setOnClickListener(v -> dismiss());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        bind(intent);
    }

    /** يملأ الشاشة باسم الصلاة والوقت الحالي ونص الأذان. */
    private void bind(Intent intent) {
        int index = intent != null ? intent.getIntExtra(EXTRA_PRAYER_INDEX, 0) : 0;
        if (index < 0 || index >= PRAYER_AR.length) {
            index = 0;
        }
        ((TextView) findViewById(R.id.adhanAlarmPrayer)).setText("صلاة " + PRAYER_AR[index]);

        String now = new SimpleDateFormat("h:mm", Locale.US).format(new Date());
        String period = new SimpleDateFormat("a", Locale.US).format(new Date());
        ((TextView) findViewById(R.id.adhanAlarmTime))
            .setText(now + ("AM".equals(period) ? " ص" : " م"));

        boolean isFajr = index == 0;
        String text = ADHAN_TEXT;
        if (isFajr) {
            text = text.replace(
                "حَيَّ عَلَى الْفَلَاحِ\n",
                "حَيَّ عَلَى الْفَلَاحِ\nالصَّلَاةُ خَيْرٌ مِنَ النَّوْمِ\n");
        }
        ((TextView) findViewById(R.id.adhanAlarmText)).setText(text);
    }

    /** يوقظ الشاشة ويعرضها فوق القفل. */
    private void showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = getSystemService(KeyguardManager.class);
            if (km != null) {
                km.requestDismissKeyguard(this, null);
            }
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void vibrate() {
        Vibrator vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vib == null || !vib.hasVibrator()) {
            return;
        }
        long[] pattern = { 0, 300, 200, 300 };
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vib.vibrate(VibrationEffect.createWaveform(pattern, -1));
        } else {
            vib.vibrate(pattern, -1);
        }
    }

    /** يغلق الشاشة ويمسح إشعار الأذان. */
    private void dismiss() {
        NotificationManager nm =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(AdhanNotifier.ID_ADHAN);
        }
        finish();
    }
}
