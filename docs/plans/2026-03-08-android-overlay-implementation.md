# Android Overlay Deepfake Detector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A native Kotlin Android app with a floating overlay that streams 2s microphone chunks over WebSocket to the deepfake detection backend and shows live results.

**Architecture:** A `ForegroundService` owns `AudioRecord` (VOICE_COMMUNICATION, 16kHz mono PCM) and an OkHttp WebSocket. It adds a custom draggable pill view to `WindowManager`. `MainActivity` handles permission flow and backend URL config.

**Tech Stack:** Kotlin, OkHttp 4.x, kotlinx-coroutines-android, Gson, Android SDK 26+

---

## Project Location

All files go under: `deepfake-detector/android/`

Create the Android project there (via Android Studio: File > New Project > Empty Activity, package `com.noscam`, minSdk 26, language Kotlin).

---

### Task 1: Project Scaffold + Gradle Dependencies

**Files:**
- Modify: `deepfake-detector/android/app/build.gradle.kts`
- Modify: `deepfake-detector/android/build.gradle.kts`
- Modify: `deepfake-detector/android/gradle/wrapper/gradle-wrapper.properties`

**Step 1: Pin Gradle wrapper version**

In `gradle/wrapper/gradle-wrapper.properties`, set:
```properties
distributionUrl=https\://services.gradle.org/distributions/gradle-8.5-bin.zip
```

**Step 2: Add dependencies to `app/build.gradle.kts`**

```kotlin
android {
    compileSdk = 34
    defaultConfig {
        applicationId = "com.noscam"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }
    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("com.google.code.gson:gson:2.10.1")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
}
```

**Step 3: Sync and verify build**

Run in `deepfake-detector/android/`:
```bash
./gradlew assembleDebug
```
Expected: `BUILD SUCCESSFUL`

**Step 4: Commit**
```bash
git add deepfake-detector/android/
git commit -m "feat: scaffold Android overlay project"
```

---

### Task 2: AndroidManifest Permissions + Service Declaration

**Files:**
- Modify: `deepfake-detector/android/app/src/main/AndroidManifest.xml`

**Step 1: Write the manifest**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="true"
        android:label="NoScam"
        android:theme="@style/Theme.AppCompat.Light.NoActionBar">

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".service.DetectionService"
            android:foregroundServiceType="microphone"
            android:exported="false" />

    </application>
</manifest>
```

**Step 2: Verify manifest parses**
```bash
./gradlew assembleDebug
```
Expected: `BUILD SUCCESSFUL`

**Step 3: Commit**
```bash
git add deepfake-detector/android/app/src/main/AndroidManifest.xml
git commit -m "feat: add Android manifest with overlay and mic permissions"
```

---

### Task 3: Data Models

**Files:**
- Create: `app/src/main/java/com/noscam/model/DetectionResult.kt`
- Create: `app/src/main/java/com/noscam/model/SessionResponse.kt`
- Create: `app/src/test/java/com/noscam/model/DetectionResultTest.kt`

**Step 1: Write the failing test**

`app/src/test/java/com/noscam/model/DetectionResultTest.kt`:
```kotlin
package com.noscam.model

import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Test

class DetectionResultTest {
    private val gson = Gson()

    @Test
    fun `parses result json correctly`() {
        val json = """
            {
              "type": "result",
              "seq": 3,
              "score": 0.87,
              "label": "likely_fake",
              "confidence": 0.91,
              "rolling_avg": 0.64,
              "latency_ms": 120
            }
        """.trimIndent()

        val result = gson.fromJson(json, DetectionResult::class.java)

        assertEquals("result", result.type)
        assertEquals(3, result.seq)
        assertEquals(0.87f, result.score, 0.001f)
        assertEquals("likely_fake", result.label)
        assertEquals(0.64f, result.rollingAvg, 0.001f)
    }

    @Test
    fun `label maps to overlay state correctly`() {
        assertEquals(OverlayState.REAL, DetectionResult.labelToState("likely_real"))
        assertEquals(OverlayState.UNCERTAIN, DetectionResult.labelToState("uncertain"))
        assertEquals(OverlayState.FAKE, DetectionResult.labelToState("likely_fake"))
        assertEquals(OverlayState.DETECTING, DetectionResult.labelToState("unknown"))
    }
}
```

**Step 2: Run test — expect FAIL**
```bash
./gradlew test
```
Expected: compile error — `DetectionResult` not found.

**Step 3: Create data models**

`app/src/main/java/com/noscam/model/DetectionResult.kt`:
```kotlin
package com.noscam.model

import com.google.gson.annotations.SerializedName

enum class OverlayState { DETECTING, REAL, UNCERTAIN, FAKE, PAUSED }

data class DetectionResult(
    val type: String,
    val seq: Int,
    val score: Float,
    val label: String,
    val confidence: Float,
    @SerializedName("rolling_avg") val rollingAvg: Float,
    @SerializedName("latency_ms") val latencyMs: Int
) {
    companion object {
        fun labelToState(label: String): OverlayState = when (label) {
            "likely_real" -> OverlayState.REAL
            "uncertain"   -> OverlayState.UNCERTAIN
            "likely_fake" -> OverlayState.FAKE
            else          -> OverlayState.DETECTING
        }
    }
}
```

`app/src/main/java/com/noscam/model/SessionResponse.kt`:
```kotlin
package com.noscam.model

import com.google.gson.annotations.SerializedName

data class SessionResponse(
    @SerializedName("session_id") val sessionId: String,
    @SerializedName("created_at") val createdAt: String,
    val config: SessionConfig
)

data class SessionConfig(
    @SerializedName("recommended_chunk_ms") val recommendedChunkMs: Int,
    @SerializedName("sample_rate") val sampleRate: Int,
    val encoding: String,
    val channels: Int
)
```

**Step 4: Run test — expect PASS**
```bash
./gradlew test
```
Expected: `BUILD SUCCESSFUL`, all tests pass.

**Step 5: Commit**
```bash
git add deepfake-detector/android/app/src/
git commit -m "feat: add DetectionResult and SessionResponse models"
```

---

### Task 4: ApiClient (Session Create/Delete)

**Files:**
- Create: `app/src/main/java/com/noscam/network/ApiClient.kt`
- Create: `app/src/test/java/com/noscam/network/ApiClientTest.kt`

**Step 1: Write the failing test**

`app/src/test/java/com/noscam/network/ApiClientTest.kt`:
```kotlin
package com.noscam.network

import org.junit.Assert.assertTrue
import org.junit.Test

class ApiClientTest {

    @Test
    fun `builds correct session request body`() {
        val body = ApiClient.buildSessionRequestBody()
        assertTrue(body.contains("\"source_type\":\"call\""))
        assertTrue(body.contains("\"client_platform\":\"android\""))
        assertTrue(body.contains("\"sample_rate\":16000"))
        assertTrue(body.contains("\"chunk_duration_ms\":2000"))
    }
}
```

**Step 2: Run test — expect FAIL**
```bash
./gradlew test
```
Expected: compile error.

**Step 3: Implement ApiClient**

`app/src/main/java/com/noscam/network/ApiClient.kt`:
```kotlin
package com.noscam.network

import com.google.gson.Gson
import com.noscam.model.SessionResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class ApiClient(private val baseUrl: String) {

    private val client = OkHttpClient()
    private val gson = Gson()
    private val json = "application/json; charset=utf-8".toMediaType()

    suspend fun createSession(): SessionResponse = withContext(Dispatchers.IO) {
        val body = buildSessionRequestBody().toRequestBody(json)
        val request = Request.Builder()
            .url("$baseUrl/api/v1/sessions")
            .post(body)
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("Session create failed: ${response.code}")
            gson.fromJson(response.body!!.charStream(), SessionResponse::class.java)
        }
    }

    suspend fun deleteSession(sessionId: String) = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl/api/v1/sessions/$sessionId")
            .delete()
            .build()
        client.newCall(request).execute().use { /* fire and forget */ }
    }

    companion object {
        fun buildSessionRequestBody(): String = """
            {
              "source_type": "call",
              "client_platform": "android",
              "metadata": {
                "sample_rate": 16000,
                "chunk_duration_ms": 2000
              }
            }
        """.trimIndent()
    }
}
```

**Step 4: Run test — expect PASS**
```bash
./gradlew test
```
Expected: all tests pass.

**Step 5: Commit**
```bash
git add deepfake-detector/android/app/src/
git commit -m "feat: add ApiClient for session create/delete"
```

---

### Task 5: WebSocketClient

**Files:**
- Create: `app/src/main/java/com/noscam/network/WebSocketClient.kt`

No unit test here — OkHttp WebSocket requires a live server. Manual verification in Task 10.

**Step 1: Implement WebSocketClient**

`app/src/main/java/com/noscam/network/WebSocketClient.kt`:
```kotlin
package com.noscam.network

import com.google.gson.Gson
import com.noscam.model.DetectionResult
import com.noscam.model.OverlayState
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import java.util.concurrent.TimeUnit

class WebSocketClient(
    baseUrl: String,
    sessionId: String,
    private val onResult: (DetectionResult) -> Unit,
    private val onError: (String) -> Unit
) {
    private val wsUrl = baseUrl
        .replace("http://", "ws://")
        .replace("https://", "wss://")
        .let { "$it/ws/v1/stream/$sessionId" }

    private val gson = Gson()
    private var seq = 0
    private var startTimeMs = 0L
    private var ws: WebSocket? = null

    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    fun connect() {
        startTimeMs = System.currentTimeMillis()
        val request = Request.Builder().url(wsUrl).build()
        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching {
                    val result = gson.fromJson(text, DetectionResult::class.java)
                    if (result.type == "result") onResult(result)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                onError(t.message ?: "WebSocket error")
            }
        })
    }

    fun sendAudioChunk(pcmBytes: ByteArray) {
        val currentSeq = ++seq
        val timestampMs = System.currentTimeMillis() - startTimeMs

        // Send metadata as text frame first
        val meta = """{"type":"audio_chunk","seq":$currentSeq,"timestamp_ms":$timestampMs,"is_remote_speaker":true}"""
        ws?.send(meta)

        // Send raw PCM as binary frame
        ws?.send(pcmBytes.toByteString())
    }

    fun pause() = ws?.send("""{"type":"pause"}""")
    fun resume() = ws?.send("""{"type":"resume"}""")

    fun close() {
        ws?.send("""{"type":"close"}""")
        ws?.close(1000, "User stopped detection")
    }
}
```

**Step 2: Verify build**
```bash
./gradlew assembleDebug
```
Expected: `BUILD SUCCESSFUL`

**Step 3: Commit**
```bash
git add deepfake-detector/android/app/src/main/java/com/noscam/network/WebSocketClient.kt
git commit -m "feat: add WebSocketClient with binary PCM frame sending"
```

---

### Task 6: AudioCapture

**Files:**
- Create: `app/src/main/java/com/noscam/audio/AudioCapture.kt`

Hardware-dependent — no unit test. Manual verification in Task 10.

**Step 1: Implement AudioCapture**

`app/src/main/java/com/noscam/audio/AudioCapture.kt`:
```kotlin
package com.noscam.audio

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class AudioCapture(private val onChunk: (ByteArray) -> Unit) {

    companion object {
        const val SAMPLE_RATE = 16000
        const val CHUNK_SAMPLES = SAMPLE_RATE * 2          // 2 seconds
        const val CHUNK_BYTES = CHUNK_SAMPLES * 2          // 16-bit = 2 bytes/sample
    }

    private var recorder: AudioRecord? = null
    private var captureJob: Job? = null

    fun start() {
        val minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuf, CHUNK_BYTES)
        )
        recorder!!.startRecording()

        captureJob = CoroutineScope(Dispatchers.IO).launch {
            val buffer = ByteArray(CHUNK_BYTES)
            var offset = 0
            while (isActive) {
                val read = recorder!!.read(buffer, offset, CHUNK_BYTES - offset)
                if (read > 0) {
                    offset += read
                    if (offset >= CHUNK_BYTES) {
                        onChunk(buffer.copyOf(CHUNK_BYTES))
                        offset = 0
                    }
                }
            }
        }
    }

    fun stop() {
        captureJob?.cancel()
        recorder?.stop()
        recorder?.release()
        recorder = null
    }
}
```

**Step 2: Verify build**
```bash
./gradlew assembleDebug
```
Expected: `BUILD SUCCESSFUL`

**Step 3: Commit**
```bash
git add deepfake-detector/android/app/src/main/java/com/noscam/audio/AudioCapture.kt
git commit -m "feat: add AudioCapture with 2s PCM chunk loop"
```

---

### Task 7: OverlayView

**Files:**
- Create: `app/src/main/java/com/noscam/overlay/OverlayView.kt`
- Create: `app/src/main/res/layout/overlay_badge.xml`

**Step 1: Create overlay layout**

`app/src/main/res/layout/overlay_badge.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/overlayRoot"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:background="@drawable/pill_background"
    android:elevation="8dp"
    android:gravity="center_vertical"
    android:orientation="horizontal"
    android:padding="8dp">

    <!-- Status dot -->
    <View
        android:id="@+id/statusDot"
        android:layout_width="12dp"
        android:layout_height="12dp"
        android:background="@drawable/dot_grey" />

    <!-- Label -->
    <TextView
        android:id="@+id/statusLabel"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginStart="6dp"
        android:text="DETECTING..."
        android:textColor="#FFFFFF"
        android:textSize="12sp"
        android:textStyle="bold" />

    <!-- Score (hidden by default, shown when expanded) -->
    <TextView
        android:id="@+id/scoreLabel"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginStart="8dp"
        android:text=""
        android:textColor="#CCFFFFFF"
        android:textSize="11sp"
        android:visibility="gone" />

    <!-- Toggle button -->
    <TextView
        android:id="@+id/toggleBtn"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginStart="8dp"
        android:text="II"
        android:textColor="#CCFFFFFF"
        android:textSize="12sp" />

</LinearLayout>
```

**Step 2: Create drawable resources**

`app/src/main/res/drawable/pill_background.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <corners android:radius="20dp" />
    <solid android:color="#CC000000" />
</shape>
```

`app/src/main/res/drawable/dot_grey.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
    <solid android:color="#888888" />
</shape>
```

`app/src/main/res/drawable/dot_green.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
    <solid android:color="#4CAF50" />
</shape>
```

`app/src/main/res/drawable/dot_yellow.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
    <solid android:color="#FFC107" />
</shape>
```

`app/src/main/res/drawable/dot_red.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
    <solid android:color="#F44336" />
</shape>
```

`app/src/main/res/drawable/dot_blue.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
    <solid android:color="#2196F3" />
</shape>
```

**Step 3: Implement OverlayView**

`app/src/main/java/com/noscam/overlay/OverlayView.kt`:
```kotlin
package com.noscam.overlay

import android.content.Context
import android.graphics.PixelFormat
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import com.noscam.R
import com.noscam.model.DetectionResult
import com.noscam.model.OverlayState

class OverlayView(
    private val context: Context,
    private val onToggle: (paused: Boolean) -> Unit
) {
    private val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val root: View = LayoutInflater.from(context).inflate(R.layout.overlay_badge, null)

    private val statusDot = root.findViewById<View>(R.id.statusDot)
    private val statusLabel = root.findViewById<TextView>(R.id.statusLabel)
    private val scoreLabel = root.findViewById<TextView>(R.id.scoreLabel)
    private val toggleBtn = root.findViewById<TextView>(R.id.toggleBtn)

    private val params = WindowManager.LayoutParams(
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
        PixelFormat.TRANSLUCENT
    ).apply {
        gravity = Gravity.TOP or Gravity.START
        x = 40
        y = 120
    }

    private var expanded = false
    private var paused = false
    private var lastResult: DetectionResult? = null

    init {
        setupDrag()
        setupClickListeners()
    }

    fun show() = wm.addView(root, params)
    fun hide() = runCatching { wm.removeView(root) }

    fun updateState(state: OverlayState, result: DetectionResult? = null) {
        lastResult = result
        root.post {
            when (state) {
                OverlayState.DETECTING -> {
                    statusDot.setBackgroundResource(R.drawable.dot_blue)
                    statusLabel.text = "DETECTING..."
                }
                OverlayState.REAL -> {
                    statusDot.setBackgroundResource(R.drawable.dot_green)
                    statusLabel.text = "REAL"
                }
                OverlayState.UNCERTAIN -> {
                    statusDot.setBackgroundResource(R.drawable.dot_yellow)
                    statusLabel.text = "UNCERTAIN"
                }
                OverlayState.FAKE -> {
                    statusDot.setBackgroundResource(R.drawable.dot_red)
                    statusLabel.text = "FAKE"
                }
                OverlayState.PAUSED -> {
                    statusDot.setBackgroundResource(R.drawable.dot_grey)
                    statusLabel.text = "PAUSED"
                }
            }
            if (expanded && result != null) {
                scoreLabel.text = "Score: ${"%.2f".format(result.score)} · Avg: ${"%.2f".format(result.rollingAvg)}"
            }
        }
    }

    private fun setupClickListeners() {
        root.setOnClickListener {
            expanded = !expanded
            scoreLabel.visibility = if (expanded && lastResult != null) View.VISIBLE else View.GONE
            if (expanded && lastResult != null) {
                scoreLabel.text = "Score: ${"%.2f".format(lastResult!!.score)} · Avg: ${"%.2f".format(lastResult!!.rollingAvg)}"
            }
        }

        toggleBtn.setOnClickListener { v ->
            v.parent.requestDisallowInterceptTouchEvent(true)
            paused = !paused
            toggleBtn.text = if (paused) ">" else "II"
            onToggle(paused)
            if (paused) updateState(OverlayState.PAUSED)
        }
    }

    private fun setupDrag() {
        var startX = 0f; var startY = 0f
        var initX = 0; var initY = 0
        var dragging = false

        root.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    startX = event.rawX; startY = event.rawY
                    initX = params.x; initY = params.y
                    dragging = false
                    false
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - startX
                    val dy = event.rawY - startY
                    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                        dragging = true
                        params.x = (initX + dx).toInt()
                        params.y = (initY + dy).toInt()
                        wm.updateViewLayout(root, params)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> dragging  // consume if dragged, let click through if not
                else -> false
            }
        }
    }
}
```

**Step 4: Verify build**
```bash
./gradlew assembleDebug
```
Expected: `BUILD SUCCESSFUL`

**Step 5: Commit**
```bash
git add deepfake-detector/android/app/src/
git commit -m "feat: add OverlayView with pill badge, drag, expand, and toggle"
```

---

### Task 8: DetectionService

**Files:**
- Create: `app/src/main/java/com/noscam/service/DetectionService.kt`

**Step 1: Implement DetectionService**

`app/src/main/java/com/noscam/service/DetectionService.kt`:
```kotlin
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
                    onError = { msg -> overlay?.updateState(OverlayState.DETECTING) }
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
        sessionId?.let { id ->
            scope.launch { runCatching { apiClient?.deleteSession(id) } }
        }
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
```

**Step 2: Verify build**
```bash
./gradlew assembleDebug
```
Expected: `BUILD SUCCESSFUL`

**Step 3: Commit**
```bash
git add deepfake-detector/android/app/src/main/java/com/noscam/service/DetectionService.kt
git commit -m "feat: add DetectionService wiring audio, WS, and overlay"
```

---

### Task 9: MainActivity (Permission Flow + UI)

**Files:**
- Modify: `app/src/main/java/com/noscam/MainActivity.kt`
- Create: `app/src/main/res/layout/activity_main.xml`

**Step 1: Create main layout**

`app/src/main/res/layout/activity_main.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:gravity="center"
    android:orientation="vertical"
    android:padding="24dp">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="NoScam"
        android:textSize="28sp"
        android:textStyle="bold"
        android:layout_marginBottom="32dp" />

    <EditText
        android:id="@+id/backendUrl"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="Backend URL (e.g. http://192.168.1.x:8000)"
        android:inputType="textUri"
        android:layout_marginBottom="16dp" />

    <TextView
        android:id="@+id/permissionStatus"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginBottom="16dp"
        android:textSize="13sp"
        android:textColor="#888888" />

    <Button
        android:id="@+id/startBtn"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Start Detection" />

    <Button
        android:id="@+id/stopBtn"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Stop Detection"
        android:enabled="false"
        android:layout_marginTop="8dp" />

</LinearLayout>
```

**Step 2: Implement MainActivity**

`app/src/main/java/com/noscam/MainActivity.kt`:
```kotlin
package com.noscam

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.noscam.service.DetectionService

class MainActivity : AppCompatActivity() {

    private lateinit var urlInput: EditText
    private lateinit var permissionStatus: TextView
    private lateinit var startBtn: Button
    private lateinit var stopBtn: Button

    private val prefs by lazy { getSharedPreferences("noscam", MODE_PRIVATE) }

    private val requestPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { updatePermissionStatus() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        urlInput = findViewById(R.id.backendUrl)
        permissionStatus = findViewById(R.id.permissionStatus)
        startBtn = findViewById(R.id.startBtn)
        stopBtn = findViewById(R.id.stopBtn)

        urlInput.setText(prefs.getString("backend_url", ""))

        startBtn.setOnClickListener { startDetection() }
        stopBtn.setOnClickListener { stopDetection() }

        updatePermissionStatus()
    }

    override fun onResume() {
        super.onResume()
        updatePermissionStatus()
    }

    private fun startDetection() {
        val url = urlInput.text.toString().trimEnd('/')
        if (url.isBlank()) { urlInput.error = "Enter backend URL"; return }

        if (!allPermissionsGranted()) {
            requestMissingPermissions()
            return
        }
        if (!Settings.canDrawOverlays(this)) {
            openOverlayPermissionSettings()
            return
        }

        prefs.edit().putString("backend_url", url).apply()

        val intent = Intent(this, DetectionService::class.java)
            .putExtra(DetectionService.EXTRA_BASE_URL, url)
        startForegroundService(intent)

        startBtn.isEnabled = false
        stopBtn.isEnabled = true
    }

    private fun stopDetection() {
        stopService(Intent(this, DetectionService::class.java))
        startBtn.isEnabled = true
        stopBtn.isEnabled = false
    }

    private fun allPermissionsGranted(): Boolean {
        val perms = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        return perms.all { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }
    }

    private fun requestMissingPermissions() {
        val perms = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        requestPermissions.launch(perms.toTypedArray())
    }

    private fun openOverlayPermissionSettings() {
        startActivity(
            Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
        )
    }

    private fun updatePermissionStatus() {
        val micOk = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val overlayOk = Settings.canDrawOverlays(this)
        val notifOk = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        else true

        permissionStatus.text = buildString {
            appendLine("Microphone: ${if (micOk) "OK" else "REQUIRED — tap Start"}")
            appendLine("Draw over apps: ${if (overlayOk) "OK" else "REQUIRED — tap Start"}")
            appendLine("Notifications: ${if (notifOk) "OK" else "REQUIRED — tap Start"}")
        }
    }
}
```

**Step 3: Verify build**
```bash
./gradlew assembleDebug
```
Expected: `BUILD SUCCESSFUL` — APK produced at `app/build/outputs/apk/debug/app-debug.apk`

**Step 4: Commit**
```bash
git add deepfake-detector/android/app/src/
git commit -m "feat: add MainActivity with permission flow and start/stop controls"
```

---

### Task 10: End-to-End Manual Verification

**Prerequisites:**
- Backend running: `cd deepfake-detector/backend && docker-compose up`
- Android device connected via USB (or emulator with mic access)
- Backend URL: your machine's LAN IP, e.g. `http://192.168.1.50:8000`

**Step 1: Install APK**
```bash
adb install deepfake-detector/android/app/build/outputs/apk/debug/app-debug.apk
```

**Step 2: Verify health endpoint**
```bash
curl http://<backend-ip>:8000/health
```
Expected: `{"status":"ok","model_loaded":true,...}`

**Step 3: Run app and grant permissions**
- Open NoScam on device
- Tap "Start Detection" — system will prompt for Microphone + Notification permissions
- For "Draw over other apps": Settings opens automatically — toggle on, return to app
- Tap "Start Detection" again

**Step 4: Verify overlay appears**
- Floating pill badge appears, shows pulsing `DETECTING...`
- Wait ~2 seconds for first result — label changes to `REAL` / `UNCERTAIN` / `FAKE`
- Tap overlay to expand — score line appears: `Score: 0.xx · Avg: 0.xx`
- Drag overlay to a new position — confirm it moves and stays
- Tap `II` toggle — label changes to `PAUSED`, audio stops
- Tap `>` toggle — resumes, `DETECTING...` reappears

**Step 5: Verify notification**
- Pull down notification shade — "NoScam Active" notification visible
- Service continues when app is backgrounded

**Step 6: Stop and verify cleanup**
- Return to MainActivity, tap "Stop Detection"
- Overlay disappears
- Notification disappears
- Confirm no logcat errors:
```bash
adb logcat -s "DetectionService" -d
```

**Step 7: Commit if any final fixes made**
```bash
git add -p
git commit -m "fix: <description of any issues found>"
```

---

## Checklist

- [ ] Task 1: Project scaffold, gradle pinned, build passes
- [ ] Task 2: Manifest with all permissions
- [ ] Task 3: DetectionResult + SessionResponse models with passing tests
- [ ] Task 4: ApiClient with passing tests
- [ ] Task 5: WebSocketClient implemented
- [ ] Task 6: AudioCapture with 2s PCM loop
- [ ] Task 7: OverlayView with pill, drag, expand, toggle
- [ ] Task 8: DetectionService wiring all components
- [ ] Task 9: MainActivity with permission flow
- [ ] Task 10: End-to-end test on device
