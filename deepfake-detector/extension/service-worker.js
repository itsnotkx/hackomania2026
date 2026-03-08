const BACKEND_URL = 'https://nonperceivably-unblinding-orville.ngrok-free.dev';
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
  if (state === 'connecting' || state === 'live') return;
  try {
    setState('connecting');

    // Snapshot the active tab before any async work
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');

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

    const streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(id);
      });
    });

    // 3. Create offscreen document if it doesn't exist
    await ensureOffscreen();

    // 4. Tell offscreen to start capturing
    const captureResp = await chrome.runtime.sendMessage({
      action: 'startCapture',
      streamId,
      sessionId,
    });

    if (captureResp && !captureResp.ok) {
      throw new Error(captureResp.error ?? 'Capture failed');
    }

  } catch (err) {
    console.error('[SW] Start error:', err);
    setState('error', err.message);
  }
}

// ─── Stop flow ───────────────────────────────────────────────────────────────

async function handleStop() {
  if (state === 'idle') return;
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
  // Broadcast to popup (if open) — ignore errors if popup is closed
  chrome.runtime.sendMessage({ action: 'stateChanged', state, error }).catch(() => {});
  // Broadcast to content scripts so the badge reflects recording state
  broadcastToContent({ action: 'recordingStateChanged', state, error });
}

async function broadcastToContent(payload) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
  }
}
