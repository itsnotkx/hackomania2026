package com.noscam.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import com.noscam.audio.AudioCapture
import com.noscam.model.DetectionResult
import com.noscam.model.OverlayState
import com.noscam.network.ApiClient
import com.noscam.network.WebSocketClient
import com.noscam.overlay.OverlayView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class DetectionService : Service() {

    companion object {
        const val EXTRA_BASE_URL = "base_url"
        const val NOTIF_CHANNEL = "noscam_detection"
        const val NOTIF_ID = 1
    }

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var overlay: OverlayView? = null
    private var audio: AudioCapture? = null
    private var wsClient: WebSocketClient? = null
    private var apiClient: ApiClient? = null
    private var sessionId: String? = null
    private var paused = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val baseUrl = intent?.getStringExtra(EXTRA_BASE_URL) ?: return START_NOT_STICKY
        createNotificationChannel()
        startForeground(NOTIF_ID, buildNotification())

        apiClient = ApiClient(baseUrl)

        overlay = OverlayView(this) { isPaused ->
            paused = isPaused
            if (isPaused) {
                audio?.stop()
                wsClient?.pause()
            } else {
                wsClient?.resume()
                audio?.start()
            }
        }
        overlay?.show()
        overlay?.updateState(OverlayState.DETECTING)

        scope.launch {
            runCatching {
                val session = apiClient!!.createSession()
                sessionId = session.sessionId

                wsClient = WebSocketClient(
                    baseUrl = baseUrl,
                    sessionId = session.sessionId,
                    onResult = { result -> onDetectionResult(result) },
                    onError = { _ -> overlay?.updateState(OverlayState.DETECTING) }
                )
                wsClient?.connect()

                audio = AudioCapture { chunk ->
                    if (!paused) wsClient?.sendAudioChunk(chunk)
                }
                audio?.start()
            }.onFailure {
                overlay?.updateState(OverlayState.PAUSED)
            }
        }

        return START_STICKY
    }

    private fun onDetectionResult(result: DetectionResult) {
        val state = DetectionResult.labelToState(result.label)
        overlay?.updateState(state, result)
    }

    override fun onDestroy() {
        audio?.stop()
        wsClient?.close()
        overlay?.hide()
        val capturedClient = apiClient
        val capturedId = sessionId
        if (capturedClient != null && capturedId != null) {
            kotlinx.coroutines.GlobalScope.launch {
                runCatching { capturedClient.deleteSession(capturedId) }
            }
        }
        scope.cancel()
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            NOTIF_CHANNEL,
            "NoScam Detection",
            NotificationManager.IMPORTANCE_LOW
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification =
        Notification.Builder(this, NOTIF_CHANNEL)
            .setContentTitle("NoScam Active")
            .setContentText("Monitoring audio for deepfakes")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .build()
}
