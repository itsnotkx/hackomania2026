---
phase: 02-pc-client
plan: "03"
type: execute
wave: 2
depends_on: ["2-01", "2-02"]
files_modified:
  - electron-app/main.js
autonomous: false
requirements: [PC-01, PC-02, PC-03, OVER-01, OVER-03]

must_haves:
  truths:
    - "Starting monitoring captures system audio and the badge transitions from DISCONNECTED to ANALYZING"
    - "When the backend returns a verdict, the badge color updates in real time (green for HUMAN, red for AI DETECTED)"
    - "Stopping monitoring halts audio capture and WebSocket sending; badge returns to DISCONNECTED without opening any settings screen"
    - "If the backend connection is lost mid-session, the badge shows DISCONNECTED rather than a stale HUMAN/AI verdict"
    - "The badge remains visible on top of a fullscreen browser window throughout the demo"
  artifacts:
    - path: "electron-app/main.js"
      provides: "Complete wiring: AudioCapture feeds WsClient, verdicts pushed to renderer via IPC"
      contains: "AudioCapture"
    - path: "electron-app/main.js"
      provides: "audio:start and audio:stop IPC handlers that actually start/stop capture and WebSocket"
      contains: "audio:start"
  key_links:
    - from: "electron-app/audio/capture.js"
      to: "electron-app/ws-client/client.js"
      via: "onChunkReady callback calls wsClient.send(frame)"
      pattern: "wsClient\\.send"
    - from: "electron-app/ws-client/client.js"
      to: "electron-app/renderer/renderer.js"
      via: "onVerdict → win.webContents.send('verdict:update', verdict)"
      pattern: "verdict:update"
    - from: "electron-app/ws-client/client.js"
      to: "electron-app/renderer/renderer.js"
      via: "onConnectionState → win.webContents.send('ws:state', state)"
      pattern: "ws:state"
---

<objective>
Wire the audio capture module and WebSocket client module into main.js to complete the end-to-end pipeline: system audio → 64000-byte chunks → WebSocket binary frames → backend verdict → IPC to renderer → badge color update. Replace the Plan 01 stub IPC handlers with real implementations. Then run the complete app against the backend for a human visual verification.

Purpose: This plan closes the loop. After this plan, the demo story is functional: open the app, press Start, play audio, watch the badge change color based on backend verdicts.

Output: A complete Electron app where pressing Start begins WASAPI audio capture and WebSocket streaming, and verdicts from the backend update the badge in real time.
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
@.planning/phases/02-pc-client/2-02-SUMMARY.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire AudioCapture and WsClient into main.js — complete end-to-end pipeline</name>
  <files>electron-app/main.js</files>
  <action>
Update `electron-app/main.js` (created in Plan 01) to replace the stub IPC handlers with real implementations that use `AudioCapture` and `WsClient`.

**Add at the top of main.js (after existing requires):**
```javascript
const { AudioCapture } = require('./audio/capture.js')
const { WsClient } = require('./ws-client/client.js')

// Backend WebSocket URL — update this to the deployed Railway URL after Phase 1 deploy
// For local testing: 'ws://localhost:8000/ws'
const BACKEND_WS_URL = process.env.NOSCAM_WS_URL || 'ws://localhost:8000/ws'
```

**Add module-level variables:**
```javascript
let audioCapture = null
let wsClient = null
let isMonitoring = false
```

**Replace the stub `notifyRenderer` function and IPC handlers:**

The `notifyRenderer(channel, data)` helper (already in main.js from Plan 01) pushes data to the renderer. Ensure it guards against `win` being null:
```javascript
function notifyRenderer(channel, data) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data)
  }
}
```

**Replace stub `ipcMain.handle('audio:start', ...)` with:**
```javascript
ipcMain.handle('audio:start', async () => {
  if (isMonitoring) return { ok: true }
  isMonitoring = true

  // Create WsClient first so it's ready when audio starts
  wsClient = new WsClient({
    url: BACKEND_WS_URL,
    onVerdict: (verdict) => {
      notifyRenderer('verdict:update', verdict)
    },
    onConnectionState: (state) => {
      notifyRenderer('ws:state', state)
    }
  })
  wsClient.connect()

  // Create AudioCapture — chunks go directly to WebSocket send
  audioCapture = new AudioCapture({
    onChunkReady: (frame) => {
      wsClient.send(frame)
    },
    onError: (err) => {
      console.error('[main] audio capture error:', err.message)
      // Notify renderer so badge reflects the problem
      notifyRenderer('ws:state', 'DISCONNECTED')
    }
  })

  // Small delay to let WebSocket establish before first chunk arrives
  setTimeout(() => {
    if (isMonitoring && audioCapture) {
      audioCapture.start()
    }
  }, 500)

  return { ok: true }
})
```

**Replace stub `ipcMain.handle('audio:stop', ...)` with:**
```javascript
ipcMain.handle('audio:stop', async () => {
  if (!isMonitoring) return { ok: true }
  isMonitoring = false

  if (audioCapture) {
    audioCapture.stop()
    audioCapture = null
  }

  if (wsClient) {
    wsClient.disconnect()
    wsClient = null
  }

  // Badge returns to DISCONNECTED — no stale verdict shown
  notifyRenderer('ws:state', 'DISCONNECTED')

  return { ok: true }
})
```

**Also update `app.on('window-all-closed', ...)` to clean up:**
```javascript
app.on('window-all-closed', () => {
  if (audioCapture) { try { audioCapture.stop() } catch (e) {} }
  if (wsClient) { try { wsClient.disconnect() } catch (e) {} }
  app.quit()
})
```

After updating main.js, do a quick syntax check:
```bash
cd /c/Code/noscam/electron-app && node --check main.js
```
Fix any syntax errors before proceeding to the checkpoint.

**IMPORTANT — naudiodon ABI check:**
When `npm start` runs and the user clicks Start, if naudiodon fails to load (ABI mismatch from incomplete electron-rebuild), `audioCapture.start()` will throw. The `onError` callback will catch this and notify the renderer with DISCONNECTED. In the console logs, look for "The module was compiled against a different Node.js version" — if seen, re-run `electron-rebuild`:
```bash
cd /c/Code/noscam/electron-app && ./node_modules/.bin/electron-rebuild
```
Then restart the app.

**IMPORTANT — WASAPI device log:**
When `start()` is called on `AudioCapture`, it logs all available devices. Capture this log output and record in the SUMMARY.md which device was selected (WASAPI loopback, VB-Cable, or default). This is the critical diagnostic for Phase 2.
  </action>
  <verify>
```bash
cd /c/Code/noscam/electron-app && node --check main.js && echo "syntax OK"
```
Must print "syntax OK".

Then check that the required functions/variables are present in main.js:
```bash
grep -n "AudioCapture\|WsClient\|audio:start\|audio:stop\|BACKEND_WS_URL\|isMonitoring" /c/Code/noscam/electron-app/main.js
```
Must find: AudioCapture require, WsClient require, BACKEND_WS_URL, isMonitoring variable, audio:start handler, audio:stop handler.
  </verify>
  <done>
`main.js` passes `node --check`. Grepping confirms AudioCapture, WsClient, BACKEND_WS_URL, isMonitoring, and both IPC handlers are present. The audio:stop handler calls both `audioCapture.stop()` and `wsClient.disconnect()` and notifies renderer with DISCONNECTED state.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Complete Electron overlay app:
- Plan 01: Transparent frameless BrowserWindow at screen-saver z-order, badge state machine with four states, start/stop toggle
- Plan 02: AudioCapture module (WASAPI loopback with VB-Cable fallback, 64000-byte chunk buffering, silence watchdog), WsClient module (keepalive ping, exponential backoff reconnect)
- Plan 03: Full wiring in main.js — AudioCapture feeds WsClient, verdicts update badge via IPC
  </what-built>
  <how-to-verify>
**Setup (do these in order):**

1. Start the backend (from Phase 1, if available). If Phase 1 backend is not yet deployed, skip audio testing — verify overlay behavior only. Set `NOSCAM_WS_URL=ws://your-backend-url/ws` as an environment variable, or edit the `BACKEND_WS_URL` constant in main.js to point to your backend.

2. Start the Electron app:
   ```
   cd electron-app
   npm start
   ```

**Verify each item:**

3. **Overlay visibility:** A small badge appears at the top-left of your screen showing "DISCONNECTED" in dark grey. It is frameless (no window title bar). It is NOT in the Windows taskbar.

4. **Always-on-top:** Open a browser window and drag it over the badge — the badge must remain visible above the browser. If you have a video playing fullscreen, Alt-Tab to the fullscreen window — the badge must still be visible.

5. **Start monitoring:** Click the "Start" button in the badge. The button should change to "Stop". Check the console output (visible in the terminal that ran `npm start`) — you should see device enumeration log lines listing audio devices, followed by "[AudioCapture] started on deviceId=...".

6. **ANALYZING state:** After clicking Start, the badge should transition to "ANALYZING" (grey) within 1-2 seconds as the WebSocket connects.

7. **DISCONNECTED on stop:** Click "Stop". The badge should return to "DISCONNECTED" (dark grey) immediately, without any settings screen opening.

8. **DISCONNECTED on backend loss (if backend is running):** With the backend running and monitoring active (badge showing ANALYZING or a verdict state), stop the backend process. Within ~5 seconds, the badge must switch to DISCONNECTED and should NOT show a stale HUMAN or AI verdict.

9. **Live verdicts (if backend is running and a model is available):** With monitoring running, play a YouTube video with human speech. Badge should eventually show HUMAN (green). Play a known AI-generated audio sample. Badge should show AI DETECTED (red).

**If naudiodon fails to load (error in console about Node.js version):**
- Run `./node_modules/.bin/electron-rebuild` in the `electron-app/` directory
- Restart `npm start`
- If still failing: check the console for VB-Cable fallback — the app should still start with default device capture

**Document in your response:**
- Which audio device was selected (from console log)
- Whether WASAPI loopback, VB-Cable, or default mic was used
- Any errors observed and whether they blocked the test
  </how-to-verify>
  <resume-signal>Type "approved" if all verified items pass. Or describe which items failed and what you observed (error messages, wrong badge states, overlay not visible).</resume-signal>
</task>

</tasks>

<verification>
1. `main.js` syntax check passes (`node --check main.js`)
2. `AudioCapture` and `WsClient` are imported and instantiated in `audio:start` IPC handler
3. `audio:stop` handler stops both AudioCapture and WsClient and sends DISCONNECTED state to renderer
4. BACKEND_WS_URL defaults to `ws://localhost:8000/ws` and can be overridden by `NOSCAM_WS_URL` env var
5. Human verification confirms: badge visible over fullscreen, start/stop toggle works, DISCONNECTED shown on backend loss
6. Console log shows device enumeration output identifying which audio device was selected
</verification>

<success_criteria>
- `node --check main.js` exits 0
- Badge overlay visible above fullscreen windows (screen-saver z-order confirmed visually)
- Start button transitions badge from DISCONNECTED to ANALYZING
- Stop button returns badge to DISCONNECTED without any settings screen
- Backend disconnect causes badge to show DISCONNECTED (not stale HUMAN/AI)
- Human approves checkpoint
</success_criteria>

<output>
After completion, create `.planning/phases/02-pc-client/2-03-SUMMARY.md`

The SUMMARY.md MUST include:
- Which audio device was selected on the demo machine (from console log)
- Whether the demo passed the fullscreen overlay test
- Any workarounds applied (e.g., VB-Cable used instead of WASAPI loopback)
- The final BACKEND_WS_URL used in the session
</output>
