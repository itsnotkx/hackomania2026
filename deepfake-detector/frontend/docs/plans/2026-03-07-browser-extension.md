# Browser Extension Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Chrome MV3 browser extension that captures tab audio, batches 2-second int16 PCM chunks, streams them to the deepfake detection backend via WebSocket, and shows a floating color badge overlay on the page.

**Architecture:** Service worker orchestrates session lifecycle and message routing. An offscreen document (required by MV3 for MediaStream APIs) captures tab audio via `tabCapture` stream ID, processes PCM, and owns the WebSocket connection. A content script injects a floating badge widget into the active page.

**Tech Stack:** Chrome Manifest V3, Web Audio API (AudioContext + ScriptProcessorNode), WebSocket, plain HTML/CSS/JS (no build tools)

---

### Task 1: Scaffold the extension manifest and folder structure

**Files:**
- Create: `frontend/manifest.json`
- Create: `frontend/icons/icon16.png` (placeholder — can use any 16x16 PNG)
- Create: `frontend/icons/icon48.png`
- Create: `frontend/icons/icon128.png`

**Step 1: Create the manifest**

```json
{
  "manifest_version": 3,
  "name": "Deepfake Audio Detector",
  "version": "1.0.0",
  "description": "Real-time deepfake audio detection overlay",
  "permissions": [
    "tabCapture",
    "offscreen",
    "activeTab",
    "scripting",
    "storage"
  ],
  "host_permissions": [
    "https://detectible-judy-overderisive.ngrok-free.dev/*"
  ],
  "background": {
    "service_worker": "service-worker.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_end"
    }
  ]
}
```

**Step 2: Create placeholder icons**

Create `frontend/icons/` directory. You can use any small PNG files for now — Chrome will use them as the toolbar icon. A 1x1 green PNG is fine for development.

You can generate a simple icon using any image editor, or download a free icon. For a quick placeholder, create a simple colored square.

**Step 3: Verify the extension loads**

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked" → select the `frontend/` folder
4. Extension should appear without errors
5. If errors appear, fix manifest JSON syntax

**Step 4: Commit**

```bash
git add frontend/manifest.json frontend/icons/
git commit -m "feat: scaffold MV3 extension manifest"
```

---

### Task 2: Build the popup UI

**Files:**
- Create: `frontend/popup.html`
- Create: `frontend/popup.js`

**Step 1: Write popup.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      width: 220px;
      padding: 16px;
      font-family: system-ui, sans-serif;
      font-size: 14px;
      margin: 0;
    }
    h3 { margin: 0 0 12px; font-size: 15px; }
    #status {
      margin-bottom: 12px;
      padding: 6px 8px;
      border-radius: 6px;
      background: #f3f4f6;
      color: #374151;
      font-size: 12px;
    }
    button {
      width: 100%;
      padding: 8px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }
    #toggleBtn.start { background: #22c55e; color: white; }
    #toggleBtn.stop  { background: #ef4444; color: white; }
    #toggleBtn:disabled { background: #d1d5db; color: #9ca3af; cursor: not-allowed; }
  </style>
</head>
<body>
  <h3>Deepfake Detector</h3>
  <div id="status">Idle</div>
  <button id="toggleBtn" class="start">Start Detection</button>
  <script src="popup.js"></script>
</body>
</html>
```

**Step 2: Write popup.js**

```javascript
const btn = document.getElementById('toggleBtn');
const statusEl = document.getElementById('status');

// Ask service worker for current state on open
chrome.runtime.sendMessage({ action: 'getState' }, (resp) => {
  applyState(resp?.state ?? 'idle');
});

// Listen for state updates pushed from service worker
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'stateChanged') applyState(msg.state, msg.error);
});

btn.addEventListener('click', () => {
  const isRunning = btn.classList.contains('stop');
  btn.disabled = true;
  statusEl.textContent = isRunning ? 'Stopping...' : 'Connecting...';
  chrome.runtime.sendMessage({ action: isRunning ? 'stop' : 'start' });
});

function applyState(state, error) {
  btn.disabled = false;
  switch (state) {
    case 'idle':
      statusEl.textContent = 'Idle';
      btn.textContent = 'Start Detection';
      btn.className = 'start';
      break;
    case 'connecting':
      statusEl.textContent = 'Connecting...';
      btn.textContent = 'Stop';
      btn.className = 'stop';
      break;
    case 'live':
      statusEl.textContent = 'Live — detecting';
      btn.textContent = 'Stop Detection';
      btn.className = 'stop';
      break;
    case 'error':
      statusEl.textContent = `Error: ${error ?? 'unknown'}`;
      btn.textContent = 'Retry';
      btn.className = 'start';
      break;
  }
}
```

**Step 3: Verify popup renders**

1. Reload the extension in `chrome://extensions`
2. Click the extension icon — popup should open showing "Idle" and a green "Start Detection" button
3. Button should be visible, no JS errors in popup's DevTools (right-click popup → Inspect)

**Step 4: Commit**

```bash
git add frontend/popup.html frontend/popup.js
git commit -m "feat: add extension popup UI"
```

---

### Task 3: Build the content script floating badge

**Files:**
- Create: `frontend/content.js`
- Create: `frontend/content.css`

**Step 1: Write content.css**

```css
#df-badge-root {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483647;
  font-family: system-ui, sans-serif;
  user-select: none;
}

#df-badge-circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #6b7280;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  transition: background 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
}

#df-badge-circle.likely_real   { background: #22c55e; }
#df-badge-circle.uncertain     { background: #eab308; }
#df-badge-circle.likely_fake   { background: #ef4444; }
#df-badge-circle.idle          { background: #6b7280; }

#df-badge-panel {
  position: absolute;
  bottom: 56px;
  right: 0;
  background: white;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  padding: 12px 14px;
  min-width: 160px;
  display: none;
}

#df-badge-panel.visible { display: block; }

#df-badge-panel h4 {
  margin: 0 0 8px;
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.df-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 4px;
  color: #111827;
}

.df-row span:first-child { color: #6b7280; }
```

**Step 2: Write content.js**

```javascript
// Only inject once per page
if (!document.getElementById('df-badge-root')) {
  const root = document.createElement('div');
  root.id = 'df-badge-root';

  root.innerHTML = `
    <div id="df-badge-panel">
      <h4>Deepfake Detector</h4>
      <div class="df-row"><span>Label</span><span id="df-label">—</span></div>
      <div class="df-row"><span>Score</span><span id="df-score">—</span></div>
      <div class="df-row"><span>Rolling avg</span><span id="df-rolling">—</span></div>
      <div class="df-row"><span>Latency</span><span id="df-latency">—</span></div>
    </div>
    <div id="df-badge-circle" class="idle">idle</div>
  `;

  document.body.appendChild(root);

  const circle = document.getElementById('df-badge-circle');
  const panel  = document.getElementById('df-badge-panel');

  circle.addEventListener('click', () => {
    panel.classList.toggle('visible');
  });

  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) panel.classList.remove('visible');
  });
}

// Listen for result updates from service worker (via offscreen → SW → content)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'updateBadge') {
    const circle = document.getElementById('df-badge-circle');
    if (!circle) return;

    const label = msg.label ?? 'idle';
    circle.className = label;
    circle.textContent = labelShort(label);

    if (msg.label) {
      document.getElementById('df-label').textContent    = label.replace('_', ' ');
      document.getElementById('df-score').textContent    = msg.score?.toFixed(2) ?? '—';
      document.getElementById('df-rolling').textContent  = msg.rolling_avg?.toFixed(2) ?? '—';
      document.getElementById('df-latency').textContent  = msg.latency_ms ? `${msg.latency_ms}ms` : '—';
    }
  }

  if (msg.action === 'resetBadge') {
    const circle = document.getElementById('df-badge-circle');
    if (!circle) return;
    circle.className = 'idle';
    circle.textContent = 'idle';
    document.getElementById('df-label').textContent   = '—';
    document.getElementById('df-score').textContent   = '—';
    document.getElementById('df-rolling').textContent = '—';
    document.getElementById('df-latency').textContent = '—';
  }
});

function labelShort(label) {
  if (label === 'likely_real') return 'real';
  if (label === 'likely_fake') return 'FAKE';
  if (label === 'uncertain')   return '?';
  return 'idle';
}
```

**Step 3: Verify badge appears**

1. Reload extension
2. Navigate to any webpage (e.g., google.com)
3. A gray "idle" circle should appear in the bottom-right corner
4. Clicking it should toggle the info panel
5. Clicking outside should close the panel
6. Check browser console for JS errors

**Step 4: Commit**

```bash
git add frontend/content.js frontend/content.css
git commit -m "feat: add floating badge content script overlay"
```

---

### Task 4: Build the offscreen document (audio capture + PCM + WebSocket)

**Files:**
- Create: `frontend/offscreen.html`
- Create: `frontend/offscreen.js`

**Step 1: Write offscreen.html**

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
  <script src="offscreen.js"></script>
</body>
</html>
```

**Step 2: Write offscreen.js**

Key facts about audio processing:
- `AudioContext({sampleRate: 16000})` requests 16kHz from the browser. Chrome usually honours this.
- `ScriptProcessorNode` buffer of 4096 samples at 16kHz = 256ms per callback
- Accumulate until we have 32,000 samples (2 seconds), then send
- float32 → int16: `Math.max(-32768, Math.min(32767, sample * 32767))`
- Send as binary ArrayBuffer via WebSocket

```javascript
const BACKEND_URL = 'https://detectible-judy-overderisive.ngrok-free.dev';
const CHUNK_SAMPLES = 32000; // 2s at 16kHz
const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

let audioCtx = null;
let ws = null;
let sessionId = null;
let sampleBuffer = new Float32Array(0);

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'startCapture') {
    startCapture(msg.streamId, msg.sessionId).then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }
  if (msg.action === 'stopCapture') {
    stopCapture();
    sendResponse({ ok: true });
  }
});

async function startCapture(streamId, sid) {
  sessionId = sid;

  // Get tab audio stream using the streamId from tabCapture
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      }
    },
    video: false,
  });

  // Create audio context at 16kHz
  audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const source = audioCtx.createMediaStreamSource(stream);

  // ScriptProcessorNode to receive PCM callbacks
  const processor = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0); // float32, mono
    // Append to buffer
    const combined = new Float32Array(sampleBuffer.length + input.length);
    combined.set(sampleBuffer);
    combined.set(input, sampleBuffer.length);
    sampleBuffer = combined;

    // Send complete 2-second chunks
    while (sampleBuffer.length >= CHUNK_SAMPLES) {
      const chunk = sampleBuffer.slice(0, CHUNK_SAMPLES);
      sampleBuffer = sampleBuffer.slice(CHUNK_SAMPLES);
      sendChunk(chunk);
    }
  };

  source.connect(processor);
  processor.connect(audioCtx.destination); // must connect to destination to run

  // Open WebSocket
  const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
  ws = new WebSocket(`${wsUrl}/ws/v1/stream/${sessionId}`);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    chrome.runtime.sendMessage({ action: 'stateChanged', state: 'live' });
  };

  ws.onmessage = (e) => {
    try {
      const result = JSON.parse(e.data);
      if (result.type === 'result') {
        chrome.runtime.sendMessage({
          action: 'wsBroadcast',
          payload: {
            action: 'updateBadge',
            label: result.label,
            score: result.score,
            rolling_avg: result.rolling_avg,
            latency_ms: result.latency_ms,
          }
        });
      }
    } catch (_) {}
  };

  ws.onerror = () => {
    chrome.runtime.sendMessage({ action: 'stateChanged', state: 'error', error: 'WebSocket error' });
  };

  ws.onclose = () => {
    chrome.runtime.sendMessage({ action: 'stateChanged', state: 'idle' });
  };
}

function sendChunk(float32Samples) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // Convert float32 to int16
  const int16 = new Int16Array(float32Samples.length);
  for (let i = 0; i < float32Samples.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Samples[i]));
    int16[i] = s < 0 ? s * 32768 : s * 32767;
  }

  ws.send(int16.buffer);
}

function stopCapture() {
  if (ws) { ws.close(); ws = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  sampleBuffer = new Float32Array(0);
  sessionId = null;
  chrome.runtime.sendMessage({
    action: 'wsBroadcast',
    payload: { action: 'resetBadge' }
  });
}
```

**Step 3: Commit**

```bash
git add frontend/offscreen.html frontend/offscreen.js
git commit -m "feat: add offscreen document for audio capture and WebSocket streaming"
```

---

### Task 5: Build the service worker (session lifecycle + message routing)

**Files:**
- Create: `frontend/service-worker.js`

**Step 1: Write service-worker.js**

```javascript
const BACKEND_URL = 'https://detectible-judy-overderisive.ngrok-free.dev';
const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');

let state = 'idle'; // 'idle' | 'connecting' | 'live' | 'error'
let sessionId = null;

// ─── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'getState') {
    sendResponse({ state });
    return;
  }

  if (msg.action === 'start') {
    handleStart();
    return;
  }

  if (msg.action === 'stop') {
    handleStop();
    return;
  }

  if (msg.action === 'stateChanged') {
    setState(msg.state, msg.error);
    return;
  }

  // Offscreen → SW → content script relay
  if (msg.action === 'wsBroadcast') {
    broadcastToContent(msg.payload);
    return;
  }
});

// ─── Start flow ──────────────────────────────────────────────────────────────

async function handleStart() {
  try {
    setState('connecting');

    // 1. Create backend session
    const resp = await fetch(`${BACKEND_URL}/api/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '1',
      },
      body: JSON.stringify({ source_type: 'call', client_platform: 'web' }),
    });

    if (!resp.ok) throw new Error(`Session create failed: ${resp.status}`);
    const data = await resp.json();
    sessionId = data.session_id;

    // 2. Get tabCapture stream ID for the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');

    const streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(id);
      });
    });

    // 3. Create offscreen document if it doesn't exist
    await ensureOffscreen();

    // 4. Tell offscreen to start capturing
    await chrome.runtime.sendMessage({
      action: 'startCapture',
      streamId,
      sessionId,
    });

  } catch (err) {
    console.error('[SW] Start error:', err);
    setState('error', err.message);
  }
}

// ─── Stop flow ───────────────────────────────────────────────────────────────

async function handleStop() {
  try {
    // Tell offscreen to stop
    await chrome.runtime.sendMessage({ action: 'stopCapture' }).catch(() => {});

    // Delete backend session
    if (sessionId) {
      await fetch(`${BACKEND_URL}/api/v1/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'ngrok-skip-browser-warning': '1' },
      }).catch(() => {});
      sessionId = null;
    }

    // Close offscreen document
    await chrome.offscreen.closeDocument().catch(() => {});

  } catch (err) {
    console.error('[SW] Stop error:', err);
  } finally {
    setState('idle');
    broadcastToContent({ action: 'resetBadge' });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument().catch(() => false);
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Capture tab audio for deepfake detection',
    });
  }
}

function setState(newState, error) {
  state = newState;
  // Broadcast to popup (if open)
  chrome.runtime.sendMessage({ action: 'stateChanged', state, error }).catch(() => {});
}

async function broadcastToContent(payload) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
  }
}
```

**Step 2: Reload and verify full flow**

1. Reload extension at `chrome://extensions`
2. Open a YouTube video or video call tab (needs audio playing)
3. Click extension icon → "Start Detection"
4. Chrome should prompt "Share audio from tab" — select the tab
5. Check service worker logs: `chrome://extensions` → click "service worker" link → DevTools
6. After ~2 seconds, badge should change color (green/yellow/red)
7. Click badge to see label + score + rolling avg
8. Click "Stop Detection" — badge returns to gray "idle"

**Step 3: Debug common issues**

- `SESSION_NOT_FOUND` on WS connect → check session was created successfully (logs in SW)
- WS closes immediately → check ngrok URL is correct and backend is running
- Badge stays gray → check content script is injected (page DevTools → Console → no errors)
- `tabCapture.getMediaStreamId` fails → ensure tab is active and focused before clicking Start

**Step 4: Commit**

```bash
git add frontend/service-worker.js
git commit -m "feat: add service worker for session lifecycle and message routing"
```

---

### Task 6: End-to-end smoke test and polish

**Step 1: Full integration test**

Test scenario: open a YouTube video, start detection, let it run for 10+ seconds

Expected behaviour:
- Badge changes to green/yellow/red as chunks are processed
- Click badge → panel shows non-zero score and rolling_avg
- Latency field shows milliseconds
- Stop → badge returns gray, session deleted on backend

Check backend logs to confirm:
- Sessions are created and deleted cleanly
- Binary frames arriving at correct size (64,000 bytes each)
- No `INVALID_AUDIO` errors

**Step 2: Handle ngrok browser warning**

ngrok free tier injects a warning page on first browser visit. The `ngrok-skip-browser-warning: 1` header in fetch requests bypasses it for API calls. WebSocket connections are unaffected.

If the backend is unreachable, check:
- ngrok tunnel is still running (`https://detectible-judy-overderisive.ngrok-free.dev` is active)
- Backend process is running behind ngrok

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete deepfake detector browser extension"
```

---

## Notes

- **ScriptProcessorNode is deprecated** but still universally supported. AudioWorklet is the modern replacement but requires a separate worker file and is more complex — not worth it for a hackathon.
- **AudioContext sampleRate:** Chrome will try to honour `sampleRate: 16000`, but on some systems it may fall back to the device rate. If the backend returns `INVALID_AUDIO` errors, add resampling using an `OfflineAudioContext`.
- **Tab audio vs system audio:** `tabCapture` only captures the current tab's audio output, not system audio from other apps. This is intentional — it captures the remote caller's voice in a browser-based video call.
- **Mono audio:** The backend expects mono PCM. `getChannelData(0)` picks channel 0. If the source is stereo, only one channel is used (acceptable for voice detection).
