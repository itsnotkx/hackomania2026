const btn = document.getElementById('toggleBtn');
const statusEl = document.getElementById('status');

// Ask service worker for current state on open
chrome.runtime.sendMessage({ action: 'getState' }, (resp) => {
  if (chrome.runtime.lastError) { /* service worker inactive — default to idle */ }
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
  chrome.runtime.sendMessage({ action: isRunning ? 'stop' : 'start' }, (resp) => {
    if (chrome.runtime.lastError) {
      // Service worker unresponsive — reset UI
      applyState('error', 'Extension error — try reloading');
    }
  });
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
    default:
      statusEl.textContent = 'Idle';
      btn.textContent = 'Start Detection';
      btn.className = 'start';
      break;
  }
}
