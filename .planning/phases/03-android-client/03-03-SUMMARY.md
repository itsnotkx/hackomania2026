---
plan: 03-03
phase: 03-android-client
status: complete
completed_at: 2026-03-07
---

# Plan 03-03: WebSocket Hook + Audio Service — COMPLETE

## What Was Built

### useWebSocket.ts
- `useWebSocket({ url, onVerdict })` hook managing full WebSocket lifecycle
- Exports `VerdictResult` type: `{ label: 'AI' | 'HUMAN' | 'UNCERTAIN', score, ms }`
- Badge state transitions: DISCONNECTED → ANALYZING (on open) → HUMAN/AI_DETECTED (on verdict) → DISCONNECTED (on close)
- 15-second keepalive JSON ping to prevent Railway/Fly.io idle timeout
- Exponential backoff reconnect: 1s → 2s → 4s → 8s (capped), resets to 1s on successful connect
- `intentionalDisconnectRef` prevents reconnect loop on explicit `disconnect()` call

### AudioCaptureService.ts
- `startAudioCapture(onChunkReady)` / `stopAudioCapture()` exports
- 16kHz, mono, int16, `audioSource: 6` (VOICE_COMMUNICATION)
- Foreground service started BEFORE `AudioRecord.init()` — required for Android 14
- 64000-byte chunk accumulation (2s at 16kHz mono int16) with remainder preservation
- Sends `chunk.buffer as ArrayBuffer` (binary WebSocket frame, not Buffer/base64)

### AudioCaptureService.java
- Android `Service` subclass in `com.noscamandroid` package
- `startForeground()` with persistent notification satisfies Android 14 foreground service requirement
- `START_STICKY` — OS restarts service after killing it under battery pressure
- `NotificationChannel` created for Android 8+ (API 26+)

## Deviations Auto-Fixed
- Plan imported `VIForegroundService` — actual export is `ReactNativeForegroundService` (default export from `@supersami/rn-foreground-service`). Methods are `startService()`/`stopService()` (correct in plan). Import name corrected.

## Key Files Created
- `NoScamAndroid/src/hooks/useWebSocket.ts`
- `NoScamAndroid/src/services/AudioCaptureService.ts`
- `NoScamAndroid/android/app/src/main/java/com/noscamandroid/AudioCaptureService.java`

## Commit
- `d51b8e0`: feat(03-03): implement useWebSocket hook and AudioCaptureService
