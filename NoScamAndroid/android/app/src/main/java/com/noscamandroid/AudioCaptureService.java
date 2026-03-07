package com.noscamandroid;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * AudioCaptureService — foreground service keeping the process alive for mic capture.
 * android:foregroundServiceType="microphone" in AndroidManifest.xml is what grants
 * microphone access from background on Android 14+. This class calls startForeground()
 * with a visible notification to satisfy Android's foreground service requirement.
 *
 * The actual audio capture is handled by react-native-audio-record in JS — this service
 * only exists to prevent the OS from killing the process.
 *
 * @supersami/rn-foreground-service manages starting/stopping this service from JS.
 */
public class AudioCaptureService extends Service {

    private static final String CHANNEL_ID = "noscam_capture_channel";
    private static final int NOTIFICATION_ID = 1001;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("NoScam")
                .setContentText("Monitoring for AI-generated speech...")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();

        startForeground(NOTIFICATION_ID, notification);

        // START_STICKY: OS restarts the service after killing it under battery pressure
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // Not a bound service
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopForeground(true);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Audio Monitoring",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("NoScam audio capture service");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
