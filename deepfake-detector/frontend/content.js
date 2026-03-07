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
