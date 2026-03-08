const BACKEND_URL = 'http://localhost:8000';
const CHUNK_SAMPLES = 32000; // 2s at 16kHz
const SAMPLE_RATE = 16000;

const SILENCE_RMS_THRESHOLD = 0.01;   // below this → treat chunk as silent
const SILENCE_CHUNKS_TO_IDLE = 1;     // consecutive silent chunks before going idle

let audioCtx = null;
let workletNode = null;
let source = null;
let ws = null;
let sessionId = null;
let _silentStreak = 0;

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'startCapture') {
    startCapture(msg.streamId, msg.sessionId)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }
  if (msg.action === 'stopCapture') {
    stopCapture();
    sendResponse({ ok: true });
  }
});

async function startCapture(streamId, sid) {
  if (audioCtx) { stopCapture(); }
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
  source = audioCtx.createMediaStreamSource(stream);

  // Load AudioWorklet processor module
  await audioCtx.audioWorklet.addModule(
    chrome.runtime.getURL('audio-worklet-processor.js')
  );

  workletNode = new AudioWorkletNode(audioCtx, 'chunk-processor');
  workletNode.port.onmessage = (e) => {
    if (e.data.type !== 'chunk') return;
    const { samples, rms } = e.data;

    if (rms < SILENCE_RMS_THRESHOLD) {
      _silentStreak++;
      if (_silentStreak >= SILENCE_CHUNKS_TO_IDLE) {
        chrome.runtime.sendMessage({
          action: 'wsBroadcast',
          payload: { action: 'silenceDetected' },
        });
      }
      return; // skip sending silent audio to the backend
    }

    _silentStreak = 0;
    sendChunk(samples);
  };

  source.connect(workletNode);
  workletNode.connect(audioCtx.destination);

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
      } else if (result.type === 'secondary_result') {
        chrome.runtime.sendMessage({
          action: 'wsBroadcast',
          payload: {
            action: 'updateSecondary',
            urgency_level: result.urgency_level,
            confidence_score: result.confidence_score,
            reasoning: result.reasoning,
            transcript: result.transcript,
            latency_ms: result.latency_ms,
          }
        });
      } else if (result.type === 'error') {
        chrome.runtime.sendMessage({
          action: 'stateChanged',
          state: 'error',
          error: result.message || result.code || 'Backend stream error',
        });
      }
    } catch (_err) {}
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
  _silentStreak = 0;
  if (workletNode) { workletNode.disconnect(); workletNode = null; }
  if (source)      { source.disconnect();      source = null; }
  if (audioCtx)    { audioCtx.close();         audioCtx = null; }
  if (ws)          { ws.close();               ws = null; }
  sessionId = null;
  chrome.runtime.sendMessage({
    action: 'wsBroadcast',
    payload: { action: 'resetBadge' }
  });
}
