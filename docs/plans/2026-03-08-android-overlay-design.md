# Android Overlay — Deepfake Audio Detection

**Date:** 2026-03-08
**Status:** Approved

---

## Overview

A native Kotlin Android app that captures microphone audio in 2-second PCM chunks and streams them over WebSocket to the deepfake detection backend. Results are displayed in a floating overlay that stays on top of other apps (e.g. during a phone call).

---

## Architecture

```
MainActivity (launcher)
    |
    +-- Permission setup screen
    |     - RECORD_AUDIO
    |     - SYSTEM_ALERT_WINDOW (redirects to Settings)
    |     - POST_NOTIFICATIONS
    |
    +-- Starts --> DetectionForegroundService
                        |
                        +-- AudioRecord (16kHz, mono, PCM s16le)
                        |     +-- 2s buffer loop -> raw ByteArray
                        |
                        +-- OkHttp WebSocket
                        |     +-- POST /sessions -> get session_id
                        |     +-- ws://.../stream/{session_id}
                        |     +-- sends binary frames, receives result JSON
                        |
                        +-- WindowManager overlay View
                              +-- Collapsed: pill badge + toggle
                              +-- Expanded (on tap): + rolling score
```

---

## Overlay UI States

| State | Appearance |
|---|---|
| Off / paused | Grey pill · PAUSED · toggle icon |
| Listening, waiting for result | Pulsing blue dot · DETECTING... |
| Result: real | Green dot · REAL |
| Result: uncertain | Yellow dot · UNCERTAIN |
| Result: fake | Red dot · FAKE |
| Expanded (tapped) | Same pill + `Score: 0.87 · Avg: 0.64` |

- Overlay is draggable so the user can reposition it.
- Toggle button pauses/resumes detection without closing the service.

---

## Audio Pipeline

- Source: `MediaRecorder.AudioSource.VOICE_COMMUNICATION` — applies Android's built-in echo cancellation and noise suppression.
- Format: 16kHz, mono, `AudioFormat.ENCODING_PCM_16BIT`
- Chunk size: 32,000 samples = 2 seconds
- Transport: binary WebSocket frame (raw PCM bytes, no base64)
- Frame metadata sent as JSON text frame before each binary chunk: `{ type, seq, timestamp_ms, is_remote_speaker: true }`

---

## Network Protocol

Follows `api-contract.md`:

1. `POST /api/v1/sessions` with `source_type: "call"`, `client_platform: "android"`
2. Open WebSocket at `ws://host/ws/v1/stream/{session_id}`
3. Send binary PCM frames every 2s
4. Receive `{ type: "result", score, label, rolling_avg }` JSON frames
5. On stop: send `{ type: "close" }`, then `DELETE /api/v1/sessions/{session_id}`

---

## File Structure

```
app/src/main/
+-- java/com/noscam/
|   +-- MainActivity.kt
|   +-- service/
|   |   +-- DetectionService.kt
|   +-- audio/
|   |   +-- AudioCapture.kt
|   +-- network/
|   |   +-- ApiClient.kt
|   |   +-- WebSocketClient.kt
|   +-- overlay/
|   |   +-- OverlayView.kt
|   +-- model/
|       +-- DetectionResult.kt
+-- res/layout/
|   +-- overlay_badge.xml
+-- AndroidManifest.xml
```

---

## Permissions

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO"/>
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.INTERNET"/>
```

---

## Config

- Backend URL entered in `MainActivity` text field before starting detection.
- Stored in `SharedPreferences` so it persists across sessions.

---

## Dependencies

- `com.squareup.okhttp3:okhttp` — WebSocket + HTTP
- `org.jetbrains.kotlinx:kotlinx-coroutines-android` — coroutine audio loop
- `com.google.code.gson:gson` — JSON parsing for WS results

No exotic libraries. Standard gradle setup with Gradle 8.x wrapper.
