# Browser Extension Design — Deepfake Audio Detector Overlay

Date: 2026-03-07

## Overview

A Chrome Manifest V3 browser extension that captures the active tab's audio, batches it into 2-second raw PCM chunks, streams them to the deepfake detection backend via WebSocket, and displays results as a floating color badge overlay on the page.

## Architecture

### Files

```
frontend/
  manifest.json         # MV3 manifest
  service-worker.js     # Session lifecycle, tabCapture streamId, message routing
  offscreen.html        # Minimal doc required for MediaStream APIs in MV3
  offscreen.js          # Audio capture + PCM processing + WebSocket client
  content.js            # Floating badge widget injected into the page
  content.css           # Badge styles
  popup.html            # Start/stop button UI
  popup.js              # Popup logic
```

### Permissions

```json
"permissions": ["tabCapture", "offscreen", "activeTab", "scripting", "storage"],
"host_permissions": ["https://nonperceivably-unblinding-orville.ngrok-free.dev/*"]
```

## Data Flow

1. User clicks extension icon → popup opens with "Start Detection" button
2. Popup → service worker: `{action: "start"}`
3. Service worker: `POST /api/v1/sessions` with `{source_type: "call", client_platform: "web"}` → `session_id`
4. Service worker: `chrome.tabCapture.getMediaStreamId({targetTabId})` → `streamId`
5. Service worker creates offscreen document, sends `{sessionId, streamId, backendUrl}`
6. Offscreen: `getUserMedia({audio: {mandatory: {chromeMediaSource: "tab", chromeMediaSourceId: streamId}}})` → tab audio MediaStream
7. `AudioContext({sampleRate: 16000})` + `ScriptProcessorNode` accumulates float32 samples
8. Every 2s (32,000 samples): convert float32 → int16 → send as binary WebSocket frame to `/ws/v1/stream/{session_id}`
9. WebSocket result `{label, score, rolling_avg, latency_ms}` → message to service worker → message to content script
10. Content script updates floating badge color + stores data for click-expand

## Audio Format

- Sample rate: 16,000 Hz (matches backend config)
- Chunk size: 2,000ms = 32,000 samples = 64,000 bytes (int16 LE)
- Encoding: raw int16 PCM (float32 * 32767, clamped, converted)
- Transport: binary WebSocket frames

## UI

### Floating Badge (content.js)
- Fixed position, bottom-right, 48px circle
- Colors by `rolling_avg` label:
  - `likely_real` → green (#22c55e)
  - `uncertain` → yellow (#eab308)
  - `likely_fake` → red (#ef4444)
  - idle/connecting → gray (#6b7280)
- Click → expands card showing: Label, Score (2dp), Rolling avg (2dp), Latency ms
- Click again or click outside → collapses

### Popup (popup.html)
- "Start Detection" / "Stop Detection" toggle button
- Status line: Connecting / Live / Stopped / Error
- Backend URL hardcoded: `https://nonperceivably-unblinding-orville.ngrok-free.dev`

## Backend API Reference

- `POST /api/v1/sessions` → `{session_id, config: {sample_rate, chunk_duration_ms, chunk_bytes}}`
- `DELETE /api/v1/sessions/{session_id}` → summary
- `WS /ws/v1/stream/{session_id}` → send binary PCM, receive `{type:"result", score, label, confidence, rolling_avg, latency_ms}`
- Score thresholds: < 0.3 = likely_real, > 0.7 = likely_fake, else uncertain
