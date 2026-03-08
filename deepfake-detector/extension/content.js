// ── State ─────────────────────────────────────────────────────────────────────
let _dfRecState     = 'idle';          // 'idle' | 'connecting' | 'live' | 'error'
let _dfMode         = 'current';       // 'current' | 'rolling'
let _dfCurrentLabel = 'idle';
let _dfRollingAvg   = null;            // 0–1 float
let _dfSilent       = false;           // true while no audio is detected

// ── Helpers ───────────────────────────────────────────────────────────────────

function labelShort(label) {
  if (label === 'likely_real') return 'REAL';
  if (label === 'likely_fake') return 'FAKE';
  if (label === 'uncertain')   return '?';
  return 'IDLE';
}

// Mirror backend thresholds: threshold_real_max=0.3, threshold_fake_min=0.7
function scoreToLabel(score) {
  if (score == null) return 'idle';
  if (score >= 0.7)  return 'likely_fake';
  if (score <= 0.3)  return 'likely_real';
  return 'uncertain';
}

function _dfApplyMode() {
  const circle   = document.getElementById('df-badge-circle');
  const badgeLbl = document.getElementById('df-badge-label');
  const modeText = document.getElementById('df-mode-text');
  if (!circle || !badgeLbl) return;

  const label = _dfSilent
    ? 'idle'
    : (_dfMode === 'rolling' ? scoreToLabel(_dfRollingAvg) : _dfCurrentLabel);

  circle.className = label;
  if (_dfRecState === 'live')       circle.classList.add('recording');
  if (_dfRecState === 'connecting') circle.classList.add('connecting');

  badgeLbl.textContent = labelShort(label);
  if (modeText) modeText.textContent = _dfMode === 'rolling' ? 'AVG' : 'NOW';
}

// ── Badge injection ───────────────────────────────────────────────────────────

function _dfInject() {
  if (document.getElementById('df-badge-root')) return;

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
      <div id="df-secondary-section">
        <div class="df-section-divider"></div>
        <h4>Content Analysis</h4>
        <div class="df-row"><span>Urgency</span><span id="df-urgency" class="df-urgency-badge">—</span></div>
        <div class="df-row"><span>Confidence</span><span id="df-secondary-confidence">—</span></div>
        <div id="df-reasoning-row" class="df-row df-reasoning-row"><span>Reason</span><span id="df-reasoning">—</span></div>
        <div id="df-transcript-row" class="df-row df-transcript-row"><span>Transcript</span><span id="df-transcript">—</span></div>
      </div>
    </div>
    <div id="df-badge-circle" class="idle">
      <div id="df-badge-label">IDLE</div>
      <div id="df-badge-mode-row">
        <button id="df-mode-prev" title="Toggle view">◀</button>
        <span id="df-mode-text">NOW</span>
        <button id="df-mode-next" title="Toggle view">▶</button>
      </div>
      <div id="df-rec-tag"><span class="df-rec-dot"></span><span id="df-rec-src">LIVE</span></div>
    </div>
  `;

  (document.body || document.documentElement).appendChild(root);

  const circle = document.getElementById('df-badge-circle');
  const panel  = document.getElementById('df-badge-panel');

  circle.addEventListener('click', () => panel.classList.toggle('visible'));

  // Arrow clicks toggle mode without opening the panel
  const toggle = (e) => {
    e.stopPropagation();
    _dfMode = _dfMode === 'current' ? 'rolling' : 'current';
    _dfApplyMode();
  };
  document.getElementById('df-mode-prev').addEventListener('click', toggle);
  document.getElementById('df-mode-next').addEventListener('click', toggle);

  // Re-apply current state so re-injected badge matches live data
  _dfApplyMode();
}

// Close panel when clicking outside — bound once
document.addEventListener('click', (e) => {
  const root  = document.getElementById('df-badge-root');
  const panel = document.getElementById('df-badge-panel');
  if (root && panel && !root.contains(e.target)) panel.classList.remove('visible');
});

// Initial injection
_dfInject();

// Re-inject on YouTube SPA navigations (Shorts ↔ Watch ↔ Home)
document.addEventListener('yt-navigate-finish', _dfInject);

// Re-inject if YouTube replaces <body> entirely
new MutationObserver(_dfInject).observe(document.documentElement, { childList: true });

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'silenceDetected') {
    _dfSilent = true;
    _dfApplyMode();
  }

  if (msg.action === 'updateBadge') {
    _dfSilent       = false;
    _dfCurrentLabel = msg.label ?? 'idle';
    _dfRollingAvg   = msg.rolling_avg ?? null;

    _dfApplyMode();

    if (msg.label) {
      document.getElementById('df-label').textContent    = _dfCurrentLabel.replace(/_/g, ' ');
      document.getElementById('df-score').textContent    = msg.score?.toFixed(2) ?? '—';
      document.getElementById('df-rolling').textContent  = msg.rolling_avg?.toFixed(2) ?? '—';
      document.getElementById('df-latency').textContent  = msg.latency_ms ? `${msg.latency_ms}ms` : '—';
    }
  }

  if (msg.action === 'updateSecondary') {
    const urgencyEl    = document.getElementById('df-urgency');
    const confidenceEl = document.getElementById('df-secondary-confidence');
    const reasoningEl  = document.getElementById('df-reasoning');
    const transcriptEl = document.getElementById('df-transcript');
    if (!urgencyEl) return;

    const level = msg.urgency_level ?? 'low';
    urgencyEl.textContent = level.toUpperCase();
    urgencyEl.className   = `df-urgency-badge df-urgency-${level}`;
    if (confidenceEl) confidenceEl.textContent = msg.confidence_score != null
      ? (msg.confidence_score * 100).toFixed(0) + '%'
      : '—';
    if (reasoningEl)  reasoningEl.textContent  = msg.reasoning || '—';
    if (transcriptEl) transcriptEl.textContent = msg.transcript
      ? msg.transcript.substring(0, 120) + (msg.transcript.length > 120 ? '…' : '')
      : '—';
  }

  if (msg.action === 'resetBadge') {
    _dfRecState     = 'idle';
    _dfCurrentLabel = 'idle';
    _dfRollingAvg   = null;
    _dfSilent       = false;

    const circle   = document.getElementById('df-badge-circle');
    const badgeLbl = document.getElementById('df-badge-label');
    const recTag   = document.getElementById('df-rec-tag');
    if (!circle || !badgeLbl) return;

    _dfApplyMode();
    if (recTag) recTag.style.display = 'none';

    document.getElementById('df-label').textContent      = '—';
    document.getElementById('df-score').textContent      = '—';
    document.getElementById('df-rolling').textContent    = '—';
    document.getElementById('df-latency').textContent    = '—';
    document.getElementById('df-rec-status').textContent = '—';

    const urgencyEl = document.getElementById('df-urgency');
    if (urgencyEl) { urgencyEl.textContent = '—'; urgencyEl.className = 'df-urgency-badge'; }
    const confidenceEl = document.getElementById('df-secondary-confidence');
    if (confidenceEl) confidenceEl.textContent = '—';
    const reasoningEl  = document.getElementById('df-reasoning');
    if (reasoningEl)  reasoningEl.textContent  = '—';
    const transcriptEl = document.getElementById('df-transcript');
    if (transcriptEl) transcriptEl.textContent = '—';
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
