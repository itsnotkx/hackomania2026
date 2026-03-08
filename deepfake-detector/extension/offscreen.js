const BACKEND_URL = 'https://detectible-judy-overderisive.ngrok-free.dev';
const CHUNK_SAMPLES = 32000; // 2s at 16kHz
const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;

let audioCtx = null;
let processor = null;
let source = null;
let ws = null;
let sessionId = null;
let sampleBuffer = new Float32Array(0);

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

  // ScriptProcessorNode to receive PCM callbacks
  processor = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0); // float32, mono, channel 0
    // Append to rolling buffer
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
  processor.connect(audioCtx.destination); // must connect to destination to activate

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
  if (processor) { processor.disconnect(); processor = null; }
  if (source)    { source.disconnect();    source = null; }
  if (audioCtx)  { audioCtx.close();      audioCtx = null; }
  if (ws)        { ws.close();             ws = null; }
  sampleBuffer = new Float32Array(0);
  sessionId = null;
  chrome.runtime.sendMessage({
    action: 'wsBroadcast',
    payload: { action: 'resetBadge' }
  });
}
