# Deepfake Detector — API Contract

**Version:** 1.0  
**Protocol:** HTTP REST + WebSocket  
**Base URL:** `http://<backend-host>:8000/api/v1`  
**WebSocket URL:** `ws://<backend-host>:8000/ws/v1`

---

## 1. Health Check

### `GET /health`

Quick liveness probe for the server and model status.

**Response `200 OK`**
```json
{
  "status": "ok",
  "model_loaded": true,
  "version": "1.0.0"
}
```

---

## 2. Session Management

### `POST /sessions`

Create a new detection session. Every analysis (call, video, file upload) operates within a session so the backend can track rolling statistics.

**Request Body**
```json
{
  "source_type": "call" | "video" | "file",
  "client_platform": "android" | "web" | "desktop",
  "metadata": {
    "app_name": "youtube",       // optional — app or site being monitored
    "sample_rate": 16000,        // audio sample rate in Hz (default: 16000)
    "chunk_duration_ms": 2000    // chunk size in ms (default: 2000)
  }
}
```

**Response `201 Created`**
```json
{
  "session_id": "sess_a1b2c3d4",
  "created_at": "2025-03-07T10:00:00Z",
  "config": {
    "recommended_chunk_ms": 2000,
    "sample_rate": 16000,
    "encoding": "pcm_s16le",
    "channels": 1
  }
}
```

> The `config` block tells the client exactly how to encode audio before sending. This avoids mismatches.

### `DELETE /sessions/{session_id}`

End a session and clean up server-side resources.

**Response `200 OK`**
```json
{
  "session_id": "sess_a1b2c3d4",
  "summary": {
    "total_chunks": 45,
    "avg_score": 0.23,
    "peak_score": 0.71,
    "verdict": "likely_real",
    "duration_s": 90
  }
}
```

---

## 3. Real-Time Streaming (WebSocket)

### `ws://host/ws/v1/stream/{session_id}`

Primary endpoint for real-time deepfake detection during calls and video playback.

#### Connection

```
ws://<host>/ws/v1/stream/sess_a1b2c3d4
```

Optional query params:
- `?token=<auth_token>` — if auth is enabled

#### Client → Server: Audio Chunk

**Binary frame** — raw PCM audio bytes (s16le, mono, 16kHz)  
OR **text frame** with base64-encoded audio:

```json
{
  "type": "audio_chunk",
  "seq": 1,
  "timestamp_ms": 0,
  "audio_b64": "<base64-encoded PCM bytes>",
  "is_remote_speaker": true
}
```

| Field              | Type    | Description                                                                 |
|--------------------|---------|-----------------------------------------------------------------------------|
| `seq`              | int     | Sequence number, monotonically increasing                                   |
| `timestamp_ms`     | int     | Offset from session start                                                    |
| `audio_b64`        | string  | Base64-encoded PCM audio (only if sending text frames)                      |
| `is_remote_speaker`| bool    | `true` if audio is from the remote party. `false` = user's own voice → skip |

> **Call mode:** The client is responsible for filtering out the user's own voice. On Android, use `VOICE_DOWNLINK` or local VAD to set `is_remote_speaker`. The backend will **ignore** chunks where `is_remote_speaker` is `false`.

#### Server → Client: Detection Result

```json
{
  "type": "result",
  "seq": 1,
  "score": 0.87,
  "label": "likely_fake",
  "confidence": 0.91,
  "rolling_avg": 0.64,
  "latency_ms": 120
}
```

| Field         | Type   | Description                                              |
|---------------|--------|----------------------------------------------------------|
| `seq`         | int    | Matches the chunk sequence number                        |
| `score`       | float  | 0.0 (real) → 1.0 (fake) for this chunk                  |
| `label`       | string | `"likely_real"` / `"uncertain"` / `"likely_fake"`        |
| `confidence`  | float  | Model confidence in the prediction                       |
| `rolling_avg` | float  | Smoothed score over the last N chunks (e.g. window of 5) |
| `latency_ms`  | int    | Server-side inference time                               |

**Label thresholds (configurable):**
- `score < 0.3` → `"likely_real"`
- `0.3 ≤ score < 0.7` → `"uncertain"`
- `score ≥ 0.7` → `"likely_fake"`

#### Server → Client: Error

```json
{
  "type": "error",
  "code": "INVALID_AUDIO",
  "message": "Audio chunk too short — expected ~2s of samples at 16kHz"
}
```

#### Client → Server: Control Messages

```json
{ "type": "pause" }    // pause detection (e.g. user muted / call on hold)
{ "type": "resume" }   // resume detection
{ "type": "close" }    // gracefully close the stream
```

---

## 4. File Upload (One-Shot Analysis)

### `POST /analyze`

Upload a complete audio/video file for batch analysis. Useful for checking downloaded media or recordings.

**Request:** `multipart/form-data`

| Field          | Type   | Required | Description                          |
|----------------|--------|----------|--------------------------------------|
| `file`         | binary | yes      | Audio/video file (.wav, .mp3, .mp4, .webm, .ogg) |
| `session_id`   | string | no       | Attach to existing session or auto-create |

**Response `200 OK`**
```json
{
  "session_id": "sess_x9y8z7",
  "file_name": "suspicious_call.wav",
  "duration_s": 34.5,
  "segments": [
    {
      "start_s": 0.0,
      "end_s": 2.0,
      "score": 0.12,
      "label": "likely_real"
    },
    {
      "start_s": 2.0,
      "end_s": 4.0,
      "score": 0.85,
      "label": "likely_fake"
    }
  ],
  "overall": {
    "avg_score": 0.43,
    "peak_score": 0.85,
    "verdict": "uncertain",
    "fake_segment_ratio": 0.35
  }
}
```

---

## 5. Session History

### `GET /sessions/{session_id}/history`

Retrieve all chunk results from a session. Useful for building a timeline visualization.

**Query Params**
- `?from_seq=10` — paginate from sequence number
- `?limit=50` — max results (default 50, max 200)

**Response `200 OK`**
```json
{
  "session_id": "sess_a1b2c3d4",
  "chunks": [
    {
      "seq": 1,
      "timestamp_ms": 0,
      "score": 0.15,
      "label": "likely_real",
      "confidence": 0.94
    },
    {
      "seq": 2,
      "timestamp_ms": 2000,
      "score": 0.82,
      "label": "likely_fake",
      "confidence": 0.88
    }
  ],
  "has_more": true,
  "next_seq": 52
}
```

---

## 6. Configuration

### `GET /config`

Retrieve current model and threshold configuration.

```json
{
  "model_name": "wav2vec2-asvspoof-finetuned",
  "thresholds": {
    "real_max": 0.3,
    "fake_min": 0.7
  },
  "rolling_window_size": 5,
  "supported_sample_rates": [8000, 16000, 44100],
  "max_chunk_duration_ms": 5000,
  "supported_formats": ["pcm_s16le", "wav", "mp3", "ogg", "webm"]
}
```

### `PATCH /config` *(optional, admin only)*

Override thresholds at runtime for tuning during the hackathon.

```json
{
  "thresholds": {
    "real_max": 0.25,
    "fake_min": 0.65
  },
  "rolling_window_size": 8
}
```

---

## 7. Error Codes

| Code                | HTTP | Description                                |
|---------------------|------|--------------------------------------------|
| `INVALID_AUDIO`     | 400  | Bad encoding, wrong sample rate, too short |
| `SESSION_NOT_FOUND` | 404  | Invalid or expired session ID              |
| `MODEL_UNAVAILABLE` | 503  | Model not loaded or server overloaded      |
| `UNSUPPORTED_FORMAT`| 415  | File type not supported                    |
| `RATE_LIMITED`      | 429  | Too many requests                          |

All errors follow this shape:
```json
{
  "error": {
    "code": "INVALID_AUDIO",
    "message": "Human-readable description of what went wrong",
    "details": {}
  }
}
```

---

## 8. Data Flow Summary

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENT                             │
│                                                         │
│  ┌──────────┐  POST /sessions  ┌──────────────────┐    │
│  │  Start    │────────────────→│  Get session_id   │    │
│  └──────────┘                  │  + audio config   │    │
│                                └────────┬─────────┘    │
│                                         │               │
│  ┌──────────────────────────────────────▼────────────┐  │
│  │          WebSocket /ws/v1/stream/{id}             │  │
│  │                                                    │  │
│  │  [Capture audio] → filter own voice → 2s chunk    │  │
│  │       │                                    ▲       │  │
│  │       ▼ binary/text frame                  │       │  │
│  │  ┌──────────┐                   ┌─────────┴──┐    │  │
│  │  │  Send    │                   │  Receive   │    │  │
│  │  │  chunk   │                   │  result    │    │  │
│  │  └────┬─────┘                   └─────┬──────┘    │  │
│  │       │                               │           │  │
│  └───────┼───────────────────────────────┼───────────┘  │
│          │                               │               │
└──────────┼───────────────────────────────┼───────────────┘
           │                               │
     ══════╪═══════════════════════════════╪════════
           │         NETWORK               │
     ══════╪═══════════════════════════════╪════════
           │                               │
┌──────────▼───────────────────────────────▼───────────────┐
│                      SERVER                               │
│                                                           │
│  [Receive chunk]                                          │
│       │                                                   │
│       ▼ is_remote_speaker == false? → discard             │
│       │                                                   │
│       ▼ Preprocess (resample, normalize)                  │
│       │                                                   │
│       ▼ Model inference (wav2vec2 / RawNet2)              │
│       │                                                   │
│       ▼ Compute rolling average                           │
│       │                                                   │
│       ▼ Return { score, label, rolling_avg }              │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

---

## Notes for the Hackathon Team

- **Audio format:** Standardize on **16kHz, mono, PCM signed 16-bit little-endian**. This is what most speech models expect. The client should resample before sending.
- **Binary vs Base64 WebSocket frames:** Binary frames are ~33% smaller and faster. Use binary when possible (Chrome extension, desktop app). Fall back to base64 text frames on platforms where binary is awkward.
- **Call mode voice filtering:** This is the trickiest part. For the demo, a simple approach: when the phone mic picks up loud local audio (high RMS energy), mark `is_remote_speaker: false` and skip. For Android `VOICE_DOWNLINK`, you get remote audio directly.
- **Rolling average window:** A window of 5 chunks (10s) smooths out noise while still responding to transitions. Tune during testing.
- **Latency budget:** Target < 200ms server-side inference per chunk so the overlay feels responsive.
