// Only inject once per page
if (!document.getElementById('df-badge-root')) {
  const root = document.createElement('div');
  root.id = 'df-badge-root';

  root.innerHTML = `
    <div id="df-badge-panel">
      <h4>Deepfake Detector</h4>
      <div class="df-row"><span>Status</span><span id="df-rec-status">—</span></div>
      <div class="df-row"><span>Label</span><span id="df-label">—</span></div>
      <div class="df-row"><span>Score</span><span id="df-score">—</span></div>
      <div class="df-row"><span>Rolling avg</span><span id="df-rolling">—</span></div>
      <div class="df-row"><span>Latency</span><span id="df-latency">—</span></div>
    </div>
    <div id="df-badge-circle" class="idle">
      <div id="df-badge-label">IDLE</div>
      <div id="df-rec-tag"><span class="df-rec-dot"></span><span id="df-rec-src">LIVE</span></div>
    </div>
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

// Track recording state so updateBadge can preserve animation classes
let _dfRecState = 'idle';

// Listen for result updates from service worker (via offscreen → SW → content)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'updateBadge') {
    const circle   = document.getElementById('df-badge-circle');
    const badgeLbl = document.getElementById('df-badge-label');
    if (!circle || !badgeLbl) return;

    const label = msg.label ?? 'idle';
    circle.className = label;
    // Re-apply recording/connecting animation class if still active
    if (_dfRecState === 'live')       circle.classList.add('recording');
    if (_dfRecState === 'connecting') circle.classList.add('connecting');

    badgeLbl.textContent = labelShort(label);

    if (msg.label) {
      document.getElementById('df-label').textContent    = label.replace(/_/g, ' ');
      document.getElementById('df-score').textContent    = msg.score?.toFixed(2) ?? '—';
      document.getElementById('df-rolling').textContent  = msg.rolling_avg?.toFixed(2) ?? '—';
      document.getElementById('df-latency').textContent  = msg.latency_ms ? `${msg.latency_ms}ms` : '—';
    }
  }

  if (msg.action === 'resetBadge') {
    _dfRecState = 'idle';
    const circle   = document.getElementById('df-badge-circle');
    const badgeLbl = document.getElementById('df-badge-label');
    const recTag   = document.getElementById('df-rec-tag');
    if (!circle || !badgeLbl) return;
    circle.className = 'idle';
    badgeLbl.textContent = 'IDLE';
    if (recTag) recTag.style.display = 'none';
    document.getElementById('df-label').textContent      = '—';
    document.getElementById('df-score').textContent      = '—';
    document.getElementById('df-rolling').textContent    = '—';
    document.getElementById('df-latency').textContent    = '—';
    document.getElementById('df-rec-status').textContent = '—';
  }

  if (msg.action === 'recordingStateChanged') {
    _dfRecState = msg.state;
    const circle   = document.getElementById('df-badge-circle');
    const recTag   = document.getElementById('df-rec-tag');
    const recSrc   = document.getElementById('df-rec-src');
    const recStat  = document.getElementById('df-rec-status');
    const badgeLbl = document.getElementById('df-badge-label');
    if (!circle) return;

    circle.classList.remove('recording', 'connecting');

    if (msg.state === 'live') {
      circle.classList.add('recording');
      if (recTag) recTag.style.display = 'flex';
      if (recSrc) {
        // Show the hostname of the tab being recorded
        const host = (window.location.hostname || 'recording')
          .replace(/^www\./, '').substring(0, 14);
        recSrc.textContent = host;
      }
      if (recStat) recStat.textContent = 'Recording';
    } else if (msg.state === 'connecting') {
      circle.classList.add('connecting');
      if (recTag) recTag.style.display = 'none';
      if (badgeLbl) badgeLbl.textContent = '···';
      if (recStat) recStat.textContent = 'Connecting…';
    } else if (msg.state === 'error') {
      if (recTag) recTag.style.display = 'none';
      if (badgeLbl) badgeLbl.textContent = 'ERR';
      circle.className = 'likely_fake';
      if (recStat) recStat.textContent = msg.error ? msg.error.substring(0, 30) : 'Error';
    } else { // idle
      if (recTag) recTag.style.display = 'none';
      if (recStat) recStat.textContent = '—';
    }
  }
});

function labelShort(label) {
  if (label === 'likely_real') return 'REAL';
  if (label === 'likely_fake') return 'FAKE';
  if (label === 'uncertain')   return '?';
  return 'IDLE';
}

