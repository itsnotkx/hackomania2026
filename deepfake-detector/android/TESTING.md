# NoScam Android — Manual E2E Test Checklist

## Prerequisites

- Android device (API 26+) connected via USB, or emulator with mic support
- Backend running: `cd deepfake-detector/backend && docker-compose up`
- Find your machine's LAN IP: `ipconfig` (Windows) or `ip addr` (Linux)

## Install

```bash
cd deepfake-detector/android
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Test Steps

### 1. Permission flow
- [ ] Open NoScam on device
- [ ] Permission status shows all three items with "REQUIRED" in red/grey
- [ ] Tap "Start Detection" — system dialog requests Microphone + Notification permissions
- [ ] Grant both permissions — status updates to "OK"
- [ ] Tap "Start Detection" again — Settings > Draw over other apps opens automatically
- [ ] Toggle "Allow display over other apps" ON for NoScam, return to app
- [ ] Tap "Start Detection" once more — service starts, Start button disables, Stop enables

### 2. Overlay appears
- [ ] Floating pill badge appears on screen (default position: top-left)
- [ ] Shows blue dot + "DETECTING..." text
- [ ] Notification shade shows "NoScam Active — Monitoring audio for deepfakes"

### 3. Detection results
- [ ] Within ~2 seconds, label changes from "DETECTING..." to one of: REAL / UNCERTAIN / FAKE
- [ ] Dot color matches: green=REAL, yellow=UNCERTAIN, red=FAKE

### 4. Expand / collapse
- [ ] Tap the overlay body — score line appears: `Score: 0.xx · Avg: 0.xx`
- [ ] Tap again — score line hides

### 5. Drag to reposition
- [ ] Press and drag the overlay to a new position on screen
- [ ] Overlay stays in new position after release
- [ ] Single tap still works after drag

### 6. Toggle pause / resume
- [ ] Tap the "II" toggle button — label changes to "PAUSED", dot goes grey, score hides if expanded
- [ ] Tap ">" to resume — overlay shows "DETECTING..." and resumes receiving results

### 7. Background / foreground
- [ ] With overlay visible, open another app (e.g. Phone, WhatsApp)
- [ ] Overlay remains visible on top of the other app
- [ ] Detection continues (label still updates)

### 8. Stop and cleanup
- [ ] Return to NoScam app
- [ ] Tap "Stop Detection"
- [ ] Overlay disappears
- [ ] Notification disappears
- [ ] Start button re-enables, Stop button disables

### 9. URL persistence
- [ ] Force-stop and reopen the app
- [ ] Backend URL is pre-filled from previous session

### 10. Error handling
- [ ] Enter an invalid URL (e.g. `http://0.0.0.0:9999`), tap Start
- [ ] Overlay appears briefly as "DETECTING...", then shows "PAUSED" (session create failure)

## Verify backend logs

```bash
docker logs <backend-container> | tail -30
```

Expected: session create entries, WebSocket connect, audio chunk receive, inference results.

## Debug

```bash
adb logcat -s "DetectionService" -s "AudioCapture" -s "WebSocketClient" -d
```
