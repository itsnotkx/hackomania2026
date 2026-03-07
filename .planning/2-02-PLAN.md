---
phase: 02-pc-client
plan: "02"
type: execute
wave: 2
depends_on: ["2-01"]
files_modified:
  - electron-app/audio/capture.js
  - electron-app/ws-client/client.js
autonomous: true
requirements: [PC-01, PC-03]

must_haves:
  truths:
    - "System audio is captured from the WASAPI loopback device (or VB-Cable fallback) as 16kHz mono int16 PCM"
    - "Audio is buffered into exact 64000-byte chunks (2 seconds at 16kHz 16-bit mono) before sending"
    - "During silence (no audio playing), zero-filled chunks are still sent every ~2 seconds via watchdog timer"
    - "The WebSocket client connects to the backend URL, sends a keepalive ping every 15 seconds, and shows DISCONNECTED during reconnect attempts"
    - "On WebSocket disconnect, reconnect retries with exponential backoff: 1s, 2s, 4s, 8s (capped)"
  artifacts:
    - path: "electron-app/audio/capture.js"
      provides: "naudiodon WASAPI loopback capture with chunk buffering and VB-Cable fallback"
      contains: "getDevices"
    - path: "electron-app/ws-client/client.js"
      provides: "WebSocket client with keepalive ping, exponential backoff reconnect, and verdict parsing"
      contains: "reconnectDelay"
  key_links:
    - from: "electron-app/audio/capture.js"
      to: "electron-app/main.js"
      via: "onChunkReady callback passed at construction"
      pattern: "onChunkReady"
    - from: "electron-app/ws-client/client.js"
      to: "electron-app/main.js"
      via: "notifyRenderer callback passed at construction for verdict and connection state"
      pattern: "notifyRenderer"
    - from: "electron-app/ws-client/client.js"
      to: "backend WebSocket /ws endpoint"
      via: "ws.send(pcmBuffer) — 64000-byte binary frame"
      pattern: "ws\\.send"
---

<objective>
Create the two independent modules that handle system audio capture and WebSocket communication. These modules are self-contained with callback-based APIs so they can be tested individually and then wired into main.js in Plan 03.

Purpose: Isolating audio capture and WebSocket into separate modules with clean APIs makes Plan 03 integration straightforward and makes each module individually testable. The audio capture module handles all WASAPI/VB-Cable complexity. The WebSocket module handles all reconnect/keepalive complexity.

Output: `audio/capture.js` (exports `AudioCapture` class) and `ws-client/client.js` (exports `WsClient` class). Both are pure Node.js modules with no Electron-specific dependencies.
</objective>

<execution_context>
@C:/Users/admin/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/admin/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-pc-client/2-RESEARCH.md
@.planning/phases/02-pc-client/2-01-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audio capture module with WASAPI loopback, chunk buffering, and silence watchdog</name>
  <files>electron-app/audio/capture.js</files>
  <action>
Create `electron-app/audio/capture.js`. This module wraps naudiodon and produces exact 64000-byte PCM chunks via callback.

**Constants (at top of file):**
```javascript
const SAMPLE_RATE = 16000
const CHANNELS = 1
const BIT_DEPTH = 16
const CHUNK_BYTES = SAMPLE_RATE * CHANNELS * (BIT_DEPTH / 8) * 2  // 64000 = 2s at 16kHz 16-bit mono
const SILENCE_TIMEOUT_MS = 500
```

**Device selection function `selectAudioDevice()`:**
Priority order:
1. WASAPI loopback: `devices.find(d => d.hostAPIName && d.hostAPIName.includes('WASAPI') && d.name && d.name.toLowerCase().includes('loopback'))`
2. VB-Cable: `devices.find(d => d.name && d.name.includes('CABLE Output'))`
3. Default fallback: return `-1` (will capture default input device — warn in log)

Log ALL available devices on startup (name and hostAPIName) so the output log shows exactly what was found on this machine. This is the critical diagnostic step per research.

**Class `AudioCapture`:**

Constructor: `constructor({ onChunkReady, onError })`
- `this.onChunkReady = onChunkReady` — called with a 64000-byte Buffer each time a complete chunk is ready
- `this.onError = onError` — called with an Error on capture failure
- `this.audioInput = null`
- `this.buffer = Buffer.alloc(0)`
- `this.silenceWatchdog = null`
- `this.running = false`

Method `start()`:
```javascript
start() {
  const portAudio = require('naudiodon')
  const deviceId = selectAudioDevice()

  this.audioInput = new portAudio.AudioIO({
    inOptions: {
      channelCount: CHANNELS,
      sampleFormat: portAudio.SampleFormat16Bit,
      sampleRate: SAMPLE_RATE,   // PortAudio will resample from native rate if needed
      deviceId: deviceId,
      closeOnError: false
    }
  })

  this.audioInput.on('data', (chunk) => {
    clearTimeout(this.silenceWatchdog)
    this.buffer = Buffer.concat([this.buffer, chunk])
    this._flushChunks()
    this._resetWatchdog()
  })

  this.audioInput.on('error', (err) => {
    console.error('[AudioCapture] error:', err)
    if (this.onError) this.onError(err)
  })

  this.audioInput.start()
  this.running = true
  console.log(`[AudioCapture] started on deviceId=${deviceId}`)
}
```

Method `stop()`:
```javascript
stop() {
  clearTimeout(this.silenceWatchdog)
  if (this.audioInput) {
    try { this.audioInput.quit() } catch (e) {}
    this.audioInput = null
  }
  this.buffer = Buffer.alloc(0)
  this.running = false
  console.log('[AudioCapture] stopped')
}
```

Private method `_flushChunks()`:
```javascript
_flushChunks() {
  while (this.buffer.length >= CHUNK_BYTES) {
    const frame = this.buffer.slice(0, CHUNK_BYTES)
    this.buffer = this.buffer.slice(CHUNK_BYTES)
    this.onChunkReady(frame)
  }
}
```

Private method `_resetWatchdog()`:
```javascript
_resetWatchdog() {
  this.silenceWatchdog = setTimeout(() => {
    // No data for 500ms — send a silence chunk to keep pipeline alive
    const silenceFrame = Buffer.alloc(CHUNK_BYTES, 0)
    this.onChunkReady(silenceFrame)
    this._resetWatchdog()  // Re-arm watchdog for continued silence
  }, SILENCE_TIMEOUT_MS)
}
```

Export: `module.exports = { AudioCapture }`

**IMPORTANT NOTES from research:**
- `sampleRate: 16000` in inOptions causes PortAudio to software-resample from the device's native rate (44100Hz or 48000Hz). This is intentional and correct.
- If `naudiodon` is not installed or electron-rebuild failed, `require('naudiodon')` will throw. Wrap the `require` in a try/catch in `start()` and call `onError` with a descriptive message so the app can surface the issue rather than crashing silently.
- Do NOT use `deviceId: -1` if a loopback device was found — `-1` captures the default mic, not system audio.
  </action>
  <verify>
```bash
cd /c/Code/noscam/electron-app && node -e "
const { AudioCapture } = require('./audio/capture.js')
const cap = new AudioCapture({
  onChunkReady: (buf) => console.log('chunk ready, bytes:', buf.length),
  onError: (err) => console.error('error:', err.message)
})
// Don't call start() — just verify module loads and class can be instantiated
console.log('AudioCapture instantiated OK, running:', cap.running)
"
```
Module must load without errors and `cap.running` must be `false`.
  </verify>
  <done>
`audio/capture.js` exists. `require('./audio/capture.js')` succeeds (in plain Node.js — Electron ABI for naudiodon itself tested at runtime). The `AudioCapture` class can be instantiated. All constants are defined: `CHUNK_BYTES === 64000`. Device selection function logs available devices when `start()` is called.
  </done>
</task>

<task type="auto">
  <name>Task 2: WebSocket client module with keepalive ping and exponential backoff reconnect</name>
  <files>electron-app/ws-client/client.js</files>
  <action>
Create `electron-app/ws-client/client.js`. This module wraps the `ws` package with keepalive ping and exponential backoff reconnect. It calls back into main.js when verdicts arrive and when connection state changes.

**Class `WsClient`:**

Constructor: `constructor({ url, onVerdict, onConnectionState })`
- `this.url = url` — WebSocket backend URL, e.g. `'ws://your-backend.railway.app/ws'`
- `this.onVerdict = onVerdict` — called with `{ label, score, ms }` on each verdict
- `this.onConnectionState = onConnectionState` — called with `'ANALYZING' | 'DISCONNECTED'`
- `this.ws = null`
- `this.reconnectDelay = 1000`
- `this.pingInterval = null`
- `this.shouldReconnect = true` — set to false on explicit `disconnect()` call

Method `connect()`:
```javascript
connect() {
  if (this.ws && this.ws.readyState === WebSocket.OPEN) return
  this.shouldReconnect = true

  const WebSocket = require('ws')
  this.onConnectionState('DISCONNECTED')
  this.ws = new WebSocket(this.url)

  this.ws.on('open', () => {
    this.reconnectDelay = 1000  // Reset backoff on successful connect
    this.onConnectionState('ANALYZING')
    console.log('[WsClient] connected to', this.url)

    // Keepalive ping every 15s to prevent cloud idle timeout
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping()
      }
    }, 15000)
  })

  this.ws.on('message', (data) => {
    try {
      const verdict = JSON.parse(data.toString())
      // Expected shape: { label: 'HUMAN' | 'AI' | 'UNCERTAIN', score: 0.87, ms: 340 }
      console.log('[WsClient] verdict:', verdict)
      this.onVerdict(verdict)
    } catch (e) {
      console.error('[WsClient] malformed message:', e.message)
    }
  })

  this.ws.on('close', () => {
    clearInterval(this.pingInterval)
    this.pingInterval = null
    this.onConnectionState('DISCONNECTED')
    console.log(`[WsClient] disconnected — reconnecting in ${this.reconnectDelay}ms`)

    if (this.shouldReconnect) {
      setTimeout(() => this.connect(), this.reconnectDelay)
      // Exponential backoff, cap at 8s
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000)
    }
  })

  this.ws.on('error', (err) => {
    // 'close' fires after 'error' — reconnect handled in 'close' handler
    console.error('[WsClient] error:', err.message)
  })
}
```

Method `send(buffer)`:
```javascript
send(buffer) {
  if (this.ws && this.ws.readyState === 1 /* OPEN */) {
    this.ws.send(buffer)  // Buffer sent as binary frame — no encoding needed
  }
}
```

Method `disconnect()`:
```javascript
disconnect() {
  this.shouldReconnect = false
  clearInterval(this.pingInterval)
  this.pingInterval = null
  if (this.ws) {
    this.ws.close()
    this.ws = null
  }
  this.reconnectDelay = 1000  // Reset for next connect()
  console.log('[WsClient] disconnected by user')
}
```

Export: `module.exports = { WsClient }`

**IMPORTANT NOTES from research:**
- The `ws` library sends `Buffer` directly as a binary WebSocket frame. Do NOT base64-encode audio. The backend expects raw int16 PCM binary frames.
- The keepalive ping uses `ws.ping()` (ws library protocol-level ping), NOT a JSON message. This is handled by the ws library — no pong listener needed unless debugging.
- `WebSocket.OPEN` is `1` — using the numeric literal as a fallback avoids needing to require ws just to check readyState in `send()`.
- The URL must be configurable at construction time. In Plan 03, main.js will pass the backend URL (can be hardcoded as a constant in main.js for now, e.g., `'ws://localhost:8000/ws'` for local testing).
  </action>
  <verify>
```bash
cd /c/Code/noscam/electron-app && node -e "
const { WsClient } = require('./ws-client/client.js')
const client = new WsClient({
  url: 'ws://localhost:9999/ws',
  onVerdict: (v) => console.log('verdict:', v),
  onConnectionState: (s) => console.log('state:', s)
})
console.log('WsClient instantiated OK')
console.log('shouldReconnect:', client.shouldReconnect)
client.disconnect()  // Should not crash even without connecting
"
```
Must print "WsClient instantiated OK", then "state: DISCONNECTED" should NOT print (connect() not called), then exit cleanly.
  </verify>
  <done>
`ws-client/client.js` exists. `require('./ws-client/client.js')` succeeds. `WsClient` can be instantiated and `disconnect()` can be called without error. The exponential backoff logic is present (`reconnectDelay` doubles up to 8000ms). The keepalive ping is scheduled at 15000ms intervals on connect.
  </done>
</task>

</tasks>

<verification>
1. `electron-app/audio/capture.js` exists and exports `{ AudioCapture }`
2. `CHUNK_BYTES === 64000` (16000 * 1 * 2 * 2)
3. Device selection tries WASAPI loopback first, then VB-Cable, then `-1`
4. Silence watchdog re-arms itself for continued silence (calls `_resetWatchdog()` recursively)
5. `electron-app/ws-client/client.js` exists and exports `{ WsClient }`
6. Reconnect delay doubles on each disconnect, capped at 8000ms
7. `ws.ping()` (not a JSON message) used for keepalive at 15s interval
8. `ws.send(buffer)` sends Buffer directly as binary frame (no encoding)
9. Both modules load in plain Node.js without crashing (naudiodon require inside `start()`, so module loads even if native addon not available)
</verification>

<success_criteria>
- `audio/capture.js` and `ws-client/client.js` both exist and can be required in Node.js without errors
- `AudioCapture` produces 64000-byte chunks and has silence watchdog
- `WsClient` has connect/disconnect/send methods with exponential backoff and keepalive ping
- Both modules use callback-based APIs compatible with main.js wiring in Plan 03
</success_criteria>

<output>
After completion, create `.planning/phases/02-pc-client/2-02-SUMMARY.md`
</output>
