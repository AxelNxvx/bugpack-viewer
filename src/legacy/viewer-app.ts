// @ts-nocheck — migración incremental desde index.legacy.html
import { unzipSync, zipSync, gunzipSync } from "fflate";
import { redactText, redactHeaders, scanSessionForPii } from "./pii-redaction";

const fflate = { unzipSync, zipSync, gunzipSync };

export function initLegacyViewer(): void {
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.log-list').forEach(l => l.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('list-' + tab).classList.add('active');
}


document.getElementById('btn-open').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', (e) => {
  if (e.target.files[0]) loadFile(e.target.files[0]);
});

function setupExtensionImport() {
  window.addEventListener('bugpack-import', (e) => {
    const { bytes, filename } = e.detail || {};
    if (!bytes?.length) return;
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const file = new File([u8], filename || 'report.bugpack', { type: 'application/octet-stream' });
    loadFile(file);
  });
  window.addEventListener('bugpack-import-error', (e) => {
    alert('No se pudo cargar desde la extensión: ' + (e.detail?.error || 'error desconocido'));
  });
}
setupExtensionImport();

const dropZone = document.getElementById('drop-zone');
let currentVideoUrl = null;
const videoPlayer = document.getElementById('video-player');
const videoWrap = document.getElementById('video-wrap');
const videoZoomLayer = document.getElementById('video-zoom-layer');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnStop = document.getElementById('btn-stop');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');
const btnFullscreen = document.getElementById('btn-fullscreen');
const zoomLabel = document.getElementById('zoom-label');
let videoZoom = 1;
let videoPanX = 0;
let videoPanY = 0;
let isVideoPanning = false;
let videoPanStart = null;
const VIDEO_ZOOM_MIN = 1;
const VIDEO_ZOOM_MAX = 4;
const VIDEO_ZOOM_STEP = 0.25;
const playbackSpeed = document.getElementById('playback-speed');
const seekBar = document.getElementById('seek-bar');
const timeCurrentEl = document.getElementById('time-current');
const timeDurationEl = document.getElementById('time-duration');
let sessionEvents = { console: [], network: [], timelineStart: 0 };
let sessionDurationHint = 0;
let networkFilterState = {
  showImages: false,
  showScripts: true,
  showStyles: true,
  showFonts: true,
  showMedia: true,
  showXHR: true,
  showWebSocket: true,
  showOther: true
};
let logQuickFilter = 'all';
let piiRedactLive = false;
let expandedNetworkId = null;
let expandedNetworkTab = 'headers';
let responseBodyFormatted = true;
let isSeeking = false;
let speedMultiplier = 1;
let speedRaf = null;
let speedLastTs = 0;
let loadedPackage = null;
let sessionData = null;
let annotations = [];
let importedAnnotationIds = new Set();
let annotationsBaseline = [];
let baselineImportedIds = new Set();
let annotateTool = 'select';
let annotateColor = '#ff6b6b';
let annotateStroke = 3;
let selectedAnnotationId = null;
let drawInProgress = null;
let editDrag = null;
let pendingNotePoint = null;
const HANDLE_HIT = 0.032;
const LINE_HIT = 0.022;
const annotateOverlay = document.getElementById('annotate-overlay');
const annotateToolbar = document.getElementById('annotate-toolbar');
const annotateColorInput = document.getElementById('annotate-color');
const annotateNoteColorInput = document.getElementById('annotate-note-color');
const annotateStrokeSelect = document.getElementById('annotate-stroke');
const annotateStrokeRange = document.getElementById('annotate-stroke-range');
const annotateBlurSelect = document.getElementById('annotate-blur');
const annotateBlurRange = document.getElementById('annotate-blur-range');
const annotateBlurValue = document.getElementById('annotate-blur-value');
const annStyleHint = document.getElementById('ann-style-hint');
const annToolsTrack = document.getElementById('ann-tools-track');
const annToolsGlider = document.getElementById('ann-tools-glider');
const annotateSaveBtn = document.getElementById('annotate-save');
const annotateCancelBtn = document.getElementById('annotate-cancel');
const noteModalEl = document.getElementById('note-modal');
const noteModalBackdrop = document.getElementById('note-modal-backdrop');
const noteModalTitle = document.getElementById('note-modal-title');
const noteModalHint = document.getElementById('note-modal-hint');
const noteModalCancel = document.getElementById('note-modal-cancel');
const noteModalClose = document.getElementById('note-modal-close');
let noteModalViewOnly = false;
const noteModalSubtitle = document.getElementById('note-modal-subtitle');
const noteModalText = document.getElementById('note-modal-text');
const noteModalMeta = document.getElementById('note-modal-meta');
const noteModalCount = document.getElementById('note-modal-count');
const noteModalColor = document.getElementById('note-modal-color');
const noteModalOk = document.getElementById('note-modal-ok');

function stripInjectedSpeedUi() {
  document.querySelectorAll('.vsc-controller, #vsc-controller').forEach(el => {
    if (el.closest('.video-panel') || el.closest('.player-shell')) el.remove();
  });
}

function stopSpeedLoop() {
  if (speedRaf != null) cancelAnimationFrame(speedRaf);
  speedRaf = null;
  speedLastTs = 0;
}

function startSpeedLoop() {
  if (speedRaf != null) return;
  speedRaf = requestAnimationFrame(speedLoop);
}

function speedLoop(ts) {
  if (videoPlayer.paused || isSeeking || speedMultiplier === 1) {
    stopSpeedLoop();
    return;
  }
  if (!speedLastTs) speedLastTs = ts;
  const dt = (ts - speedLastTs) / 1000;
  speedLastTs = ts;
  const dur = resolveVideoDuration() || videoPlayer.duration || 0;
  const next = videoPlayer.currentTime + dt * (speedMultiplier - 1);
  if (dur > 0 && next >= dur - 0.05) {
    videoPlayer.currentTime = dur;
    videoPlayer.pause();
    updatePlayPauseUi();
    stopSpeedLoop();
    return;
  }
  videoPlayer.currentTime = next;
  speedRaf = requestAnimationFrame(speedLoop);
}

function applyPlaybackSpeed(rate) {
  speedMultiplier = rate;
  videoPlayer.playbackRate = 1;
  stopSpeedLoop();
  if (rate !== 1 && !videoPlayer.paused) startSpeedLoop();
}

function resolveVideoDuration() {
  const candidates = [];
  const d = videoPlayer.duration;
  if (Number.isFinite(d) && d > 0) candidates.push(d);
  try {
    if (videoPlayer.seekable?.length) {
      const end = videoPlayer.seekable.end(videoPlayer.seekable.length - 1);
      if (Number.isFinite(end) && end > 0) candidates.push(end);
    }
    if (videoPlayer.buffered?.length) {
      const end = videoPlayer.buffered.end(videoPlayer.buffered.length - 1);
      if (Number.isFinite(end) && end > 0) candidates.push(end);
    }
  } catch (_) {}
  if (sessionDurationHint > 0) candidates.push(sessionDurationHint);
  return candidates.length ? Math.max(...candidates) : 0;
}

function updatePlayerTimeUi() {
  const dur = resolveVideoDuration();
  const cur = videoPlayer.currentTime || 0;
  timeDurationEl.textContent = formatTime(dur);
  timeCurrentEl.textContent = formatTime(cur);
  if (dur > 0) {
    const maxVal = Math.max(100, Math.ceil(dur * 100));
    seekBar.max = String(maxVal);
    if (!isSeeking) {
      seekBar.value = String(Math.min(Math.ceil(cur * 100), maxVal));
    }
  }
}

function updateSessionDurationHintFromEvents() {
  const stamps = [...sessionEvents.console, ...sessionEvents.network]
    .map(e => e.timestamp).filter(Boolean);
  if (!stamps.length || !sessionEvents.timelineStart) return;
  const spanSec = (Math.max(...stamps) - sessionEvents.timelineStart) / 1000;
  if (spanSec > sessionDurationHint) sessionDurationHint = spanSec + 1;
}
let copyTextStore = new Map();
let copyIdSeq = 0;

function resetCopyStore() {
  copyTextStore.clear();
  copyIdSeq = 0;
}

function registerCopyText(text) {
  const id = `c${++copyIdSeq}`;
  copyTextStore.set(id, String(text ?? ''));
  return id;
}

function isOpenableUrl(url) {
  return typeof url === 'string' && /^(https?|wss?):\/\//i.test(url.trim());
}

function maybeRedact(text) {
  if (text == null || text === '') return String(text ?? '');
  return piiRedactLive ? redactText(String(text)) : String(text);
}

function maybeRedactHeaders(headers) {
  if (!headers) return headers;
  return piiRedactLive ? redactHeaders(headers) : headers;
}

function getResponseTextForPii(ev) {
  const decoded = decodeResponseBody(ev);
  if (decoded.kind === 'text') return decoded.text || null;
  return null;
}

function scanCurrentSessionPii() {
  return scanSessionForPii({
    consoleEvents: sessionEvents.console,
    networkEvents: sessionEvents.network,
    annotations,
    getResponseText: getResponseTextForPii
  });
}

function refreshPiiRedactionViews() {
  const t = videoPlayer?.currentTime ?? 0;
  syncLogsToVideo(t, { lightNetwork: true });
  if (expandedNetworkId) refreshOpenNetworkDetail();
}

function setPiiRedactLive(enabled) {
  piiRedactLive = enabled;
  const btn = document.getElementById('btn-redact-pii');
  if (btn) {
    btn.classList.toggle('active', enabled);
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.textContent = enabled ? 'Mask Data · On' : 'Mask Data';
  }
  refreshPiiRedactionViews();
}

function syncPiiExportConfirmState() {
  const redactCb = document.getElementById('pii-export-redact');
  const confirmBtn = document.getElementById('pii-export-confirm');
  if (!redactCb || !confirmBtn) return;
  confirmBtn.disabled = redactCb.checked === false;
  confirmBtn.title = confirmBtn.disabled
    ? 'Activa la opción para copiar el informe con redacción'
    : 'Copiar informe';
}

function closePiiExportModal() {
  document.getElementById('pii-export-backdrop')?.classList.remove('open');
  document.getElementById('pii-export-backdrop')?.setAttribute('aria-hidden', 'true');
}

function openPiiExportModal(scan) {
  const backdrop = document.getElementById('pii-export-backdrop');
  const list = document.getElementById('pii-finding-list');
  const lead = document.getElementById('pii-export-lead');
  const subtitle = document.getElementById('pii-export-subtitle');
  if (!backdrop || !list || !lead) return;

  lead.textContent = `Found ${scan.totalMatches} potential sensitive value${scan.totalMatches === 1 ? '' : 's'} in this session.`;
  if (subtitle) {
    subtitle.textContent = scan.findings.length === 1
      ? '1 category of sensitive data'
      : `${scan.findings.length} categories of sensitive data`;
  }

  list.innerHTML = scan.findings.slice(0, 12).map(f =>
    `<li class="pii-finding-item">
      <span class="pii-finding-badge">${esc(f.label)}</span>
      <span class="pii-finding-source">${esc(f.source)}</span>
      <span class="pii-finding-meta">${f.count}× · <code>${esc(f.preview)}</code></span>
    </li>`
  ).join('');
  if (scan.findings.length > 12) {
    list.innerHTML += `<li class="pii-finding-more">… and ${scan.findings.length - 12} more locations</li>`;
  }

  const redactCb = document.getElementById('pii-export-redact');
  if (redactCb) redactCb.checked = true;

  syncPiiExportConfirmState();

  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
}

function renderCopyBtn(text, label = 'Copy') {
  const id = registerCopyText(maybeRedact(text));
  return `<button type="button" class="copy-btn" data-copy-id="${id}" title="Copy to clipboard">${label}</button>`;
}

function renderUrlActions(url, { compact = false, copyUrl } = {}) {
  if (!url || url === '—') return esc('—');
  const abs = String(url).trim();
  const copyTarget = (copyUrl != null ? String(copyUrl) : abs).trim();
  const copyBtn = renderCopyBtn(copyTarget, 'Copy URL');
  const openBtn = isOpenableUrl(abs)
    ? `<a class="url-link" href="${esc(abs)}" target="_blank" rel="noopener noreferrer" title="Open in new tab">${compact ? 'Open' : esc(abs)}</a>`
    : `<span class="url-text">${esc(abs)}</span>`;
  return `<span class="url-actions">${openBtn}${copyBtn}</span>`;
}

function toGeneralSiteUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw || raw === '—') return raw;
  try {
    const u = new URL(raw);
    if (!/^https?:$/i.test(u.protocol)) return raw;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length > 1) parts.pop();
    u.pathname = parts.length ? `/${parts.join('/')}/` : '/';
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return raw;
  }
}

function setMetaUrlDisplay(url) {
  const wrap = document.getElementById('meta-url-wrap');
  if (!wrap) return;
  if (!url || url === '—') {
    wrap.textContent = '—';
    wrap.removeAttribute('title');
    return;
  }
  const full = String(url).trim();
  const general = toGeneralSiteUrl(full);
  wrap.title = full !== general ? `Página grabada: ${full}` : '';
  wrap.innerHTML = renderUrlActions(general, { compact: false, copyUrl: general });
}

async function handleCopyClick(btn) {
  const text = copyTextStore.get(btn.dataset.copyId);
  if (text == null) return;
  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add('copied');
    const prev = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => {
      btn.textContent = prev;
      btn.classList.remove('copied');
    }, 1400);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      btn.textContent = 'Copied';
    } catch (_) {}
    document.body.removeChild(ta);
  }
}

function setupCopyDelegation() {
  const root = document.getElementById('viewer');
  if (!root) return;
  root.addEventListener('click', (e) => {
    const jsonUrl = e.target.closest('a.json-url[data-copy-id]');
    if (jsonUrl && (e.shiftKey || e.altKey)) {
      e.preventDefault();
      handleCopyClick(jsonUrl);
      return;
    }
    const btn = e.target.closest('.copy-btn[data-copy-id]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    handleCopyClick(btn);
  });
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatTimePrecise(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00.0';
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m}:${s.padStart(4, '0')}`;
}

function newAnnotationId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ann-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getVideoDisplayRect() {
  const w = videoPlayer.clientWidth || annotateOverlay.clientWidth;
  const h = videoPlayer.clientHeight || annotateOverlay.clientHeight;
  return { left: 0, top: 0, width: Math.max(1, w), height: Math.max(1, h), scaleX: w, scaleY: h };
}

function annotationScreenScale() {
  return 1 / Math.max(1, videoZoom);
}

function applyVideoTransform() {
  if (!videoZoomLayer) return;
  videoZoomLayer.style.transform = `translate(${videoPanX}px, ${videoPanY}px) scale(${videoZoom})`;
  if (zoomLabel) zoomLabel.textContent = `${Math.round(videoZoom * 100)}%`;
  videoWrap.classList.toggle('is-zoomed', videoZoom > 1.01);
  resizeAnnotateCanvas();
}

function resetVideoZoom() {
  videoZoom = 1;
  videoPanX = 0;
  videoPanY = 0;
  applyVideoTransform();
}

function setVideoZoom(nextZoom) {
  videoZoom = Math.max(VIDEO_ZOOM_MIN, Math.min(VIDEO_ZOOM_MAX, Math.round(nextZoom * 100) / 100));
  if (videoZoom <= 1.01) resetVideoZoom();
  else applyVideoTransform();
}

function stepVideoZoom(delta) {
  setVideoZoom(videoZoom + delta);
}

function toggleFullscreen() {
  const target = videoWrap;
  if (!document.fullscreenElement) {
    target.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.();
  }
}

function clientToNorm(clientX, clientY) {
  const rect = annotateOverlay.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
  return { x: x / rect.width, y: y / rect.height };
}

function normToCanvas(nx, ny, r) {
  return { x: nx * r.width, y: ny * r.height };
}

function resizeAnnotateCanvas() {
  const r = getVideoDisplayRect();
  const dpr = window.devicePixelRatio || 1;
  annotateOverlay.width = Math.max(1, Math.round(r.width * dpr));
  annotateOverlay.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = annotateOverlay.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redrawAnnotationOverlay();
}

function shouldShowAnnotationOnVideo(ann) {
  if (ann.id === selectedAnnotationId) return true;
  const t = videoPlayer.currentTime ?? 0;
  return Math.abs(t - ann.videoTimeSec) <= 0.4;
}

function getSelectedAnnotation() {
  return annotations.find(a => a.id === selectedAnnotationId) || null;
}

function isImportedAnnotation(ann) {
  return !!ann && importedAnnotationIds.has(ann.id);
}

function normalizeBox(box) {
  return [
    Math.min(box[0], box[2]), Math.min(box[1], box[3]),
    Math.max(box[0], box[2]), Math.max(box[1], box[3])
  ];
}

function cloneAnnotation(ann) {
  return JSON.parse(JSON.stringify(ann));
}

function distPointSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function drawBlurRegion(ctx, ann, r) {
  const box = normalizeBox(ann.box);
  const vw = videoPlayer.videoWidth;
  const vh = videoPlayer.videoHeight;
  if (!vw || !vh || !box) return;
  const sx = box[0] * vw;
  const sy = box[1] * vh;
  const sw = (box[2] - box[0]) * vw;
  const sh = (box[3] - box[1]) * vh;
  if (sw < 2 || sh < 2) return;
  const a = normToCanvas(box[0], box[1], r);
  const b = normToCanvas(box[2], box[3], r);
  const dw = b.x - a.x;
  const dh = b.y - a.y;
  const blurPx = (ann.blurRadius || 14) * annotationScreenScale();
  ctx.save();
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(videoPlayer, sx, sy, sw, sh, a.x, a.y, dw, dh);
  ctx.filter = 'none';
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = 1.5 * annotationScreenScale();
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(a.x, a.y, dw, dh);
  ctx.setLineDash([]);
  ctx.restore();
}

function drawAnnotationShape(ctx, ann, r, alpha = 1) {
  if (ann.type === 'blur' && ann.box) {
    ctx.save();
    ctx.globalAlpha = alpha;
    drawBlurRegion(ctx, ann, r);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  const s = annotationScreenScale();
  ctx.strokeStyle = ann.color || '#ff6b6b';
  ctx.fillStyle = ann.color || '#ff6b6b';
  ctx.lineWidth = (ann.strokeWidth || 3) * s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (ann.type === 'draw' && ann.points?.length) {
    ctx.beginPath();
    ann.points.forEach((p, i) => {
      const c = normToCanvas(p[0], p[1], r);
      if (i === 0) ctx.moveTo(c.x, c.y);
      else ctx.lineTo(c.x, c.y);
    });
    ctx.stroke();
  } else if (ann.type === 'rect' && ann.box) {
    const box = normalizeBox(ann.box);
    const a = normToCanvas(box[0], box[1], r);
    const b = normToCanvas(box[2], box[3], r);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  } else if (ann.type === 'arrow' && ann.box) {
    const a = normToCanvas(ann.box[0], ann.box[1], r);
    const b = normToCanvas(ann.box[2], ann.box[3], r);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const head = Math.min(14 * s, len * 0.35);
    const ux = dx / len;
    const uy = dy / len;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - ux * head - uy * head * 0.5, b.y - uy * head + ux * head * 0.5);
    ctx.lineTo(b.x - ux * head + uy * head * 0.5, b.y - uy * head - ux * head * 0.5);
    ctx.closePath();
    ctx.fill();
  } else if (ann.type === 'note' && ann.point) {
    const c = normToCanvas(ann.point[0], ann.point[1], r);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    const label = (ann.text || '').trim();
    if (label && (ann.id === selectedAnnotationId || label.length <= 40)) {
      const short = label.length > 48 ? label.slice(0, 45) + '…' : label;
      ctx.font = `500 ${11 * s}px var(--sans), sans-serif`;
      const tw = ctx.measureText(short).width;
      const pad = 8 * s;
      const bw = tw + pad * 2;
      const bh = 22 * s;
      let bx = c.x + 12;
      let by = c.y - bh / 2;
      if (bx + bw > r.width - 4) bx = c.x - 12 - bw;
      if (by < 4) by = 4;
      if (by + bh > r.height - 4) by = r.height - bh - 4;
      ctx.fillStyle = 'rgba(12,13,16,.92)';
      ctx.strokeStyle = ann.color || '#ff6b6b';
      ctx.lineWidth = 1.5;
      roundRect(ctx, bx, by, bw, bh, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e8eaf0';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(short, bx + pad, by + bh / 2);
    } else {
      ctx.fillStyle = '#0c0d10';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', c.x, c.y + 0.5);
    }
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function drawSelectionHandles(ctx, ann, r) {
  if (isImportedAnnotation(ann)) {
    ctx.save();
    ctx.strokeStyle = 'rgba(148,153,173,.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    if ((ann.type === 'rect' || ann.type === 'blur') && ann.box) {
      const box = normalizeBox(ann.box);
      const a = normToCanvas(box[0], box[1], r);
      const b = normToCanvas(box[2], box[3], r);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    } else if (ann.type === 'arrow' && ann.box) {
      const a = normToCanvas(ann.box[0], ann.box[1], r);
      const b = normToCanvas(ann.box[2], ann.box[3], r);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else if (ann.type === 'note' && ann.point) {
      const c = normToCanvas(ann.point[0], ann.point[1], r);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 11 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const stroke = '#1db96a';
  const s = annotationScreenScale();
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 2 * s;
  const drawHandle = (nx, ny) => {
    const c = normToCanvas(nx, ny, r);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };
  if (ann.type === 'blur' || ann.type === 'rect') {
    const box = normalizeBox(ann.box);
    const a = normToCanvas(box[0], box[1], r);
    const b = normToCanvas(box[2], box[3], r);
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.setLineDash([]);
    drawHandle(box[0], box[1]);
    drawHandle(box[2], box[1]);
    drawHandle(box[0], box[3]);
    drawHandle(box[2], box[3]);
  } else if (ann.type === 'arrow' && ann.box) {
    drawHandle(ann.box[0], ann.box[1]);
    drawHandle(ann.box[2], ann.box[3]);
  } else if (ann.type === 'note' && ann.point) {
    drawHandle(ann.point[0], ann.point[1]);
  }
  ctx.restore();
}

function hitTestAnnotation(nx, ny) {
  const r = getVideoDisplayRect();
  const candidates = annotations.filter(shouldShowAnnotationOnVideo).slice().reverse();
  const sel = getSelectedAnnotation();
  if (sel && shouldShowAnnotationOnVideo(sel) && !isImportedAnnotation(sel)) {
    const handleHit = hitTestHandles(sel, nx, ny);
    if (handleHit) return { ann: sel, mode: handleHit };
  }
  for (const ann of candidates) {
    const body = hitTestAnnotationBody(ann, nx, ny);
    if (body) {
      if (isImportedAnnotation(ann) && body === 'move') return { ann, mode: 'select' };
      return { ann, mode: body };
    }
  }
  return null;
}

function hitTestHandles(ann, nx, ny) {
  const near = (hx, hy) => Math.hypot(nx - hx, ny - hy) < HANDLE_HIT;
  if ((ann.type === 'rect' || ann.type === 'blur') && ann.box) {
    const box = normalizeBox(ann.box);
    const corners = [
      ['resize-tl', box[0], box[1]],
      ['resize-tr', box[2], box[1]],
      ['resize-bl', box[0], box[3]],
      ['resize-br', box[2], box[3]]
    ];
    for (const [mode, hx, hy] of corners) if (near(hx, hy)) return mode;
    const onBox = nx >= box[0] && nx <= box[2] && ny >= box[1] && ny <= box[3];
    if (onBox) {
      if (Math.abs(nx - box[2]) < HANDLE_HIT) return 'resize-e';
      if (Math.abs(nx - box[0]) < HANDLE_HIT) return 'resize-w';
      if (Math.abs(ny - box[1]) < HANDLE_HIT) return 'resize-n';
      if (Math.abs(ny - box[3]) < HANDLE_HIT) return 'resize-s';
      return 'move';
    }
  }
  if (ann.type === 'arrow' && ann.box) {
    if (near(ann.box[0], ann.box[1])) return 'resize-start';
    if (near(ann.box[2], ann.box[3])) return 'resize-end';
    if (distPointSeg(nx, ny, ann.box[0], ann.box[1], ann.box[2], ann.box[3]) < LINE_HIT) return 'move';
  }
  if (ann.type === 'note' && ann.point) {
    if (near(ann.point[0], ann.point[1])) return 'move';
  }
  return null;
}

function hitTestAnnotationBody(ann, nx, ny) {
  if (ann.type === 'note' && ann.point) {
    if (Math.hypot(nx - ann.point[0], ny - ann.point[1]) < HANDLE_HIT * 1.2) return 'move';
  }
  if ((ann.type === 'rect' || ann.type === 'blur') && ann.box) {
    const box = normalizeBox(ann.box);
    if (nx >= box[0] && nx <= box[2] && ny >= box[1] && ny <= box[3]) return 'move';
  }
  if (ann.type === 'arrow' && ann.box) {
    if (distPointSeg(nx, ny, ann.box[0], ann.box[1], ann.box[2], ann.box[3]) < LINE_HIT) return 'move';
  }
  if (ann.type === 'draw' && ann.points?.length) {
    for (let i = 1; i < ann.points.length; i++) {
      const p0 = ann.points[i - 1];
      const p1 = ann.points[i];
      if (distPointSeg(nx, ny, p0[0], p0[1], p1[0], p1[1]) < LINE_HIT) return 'move';
    }
  }
  return null;
}

function applyEditDrag(ann, drag, p) {
  if (isImportedAnnotation(ann)) return;
  const dx = p.x - drag.start.x;
  const dy = p.y - drag.start.y;
  const s = drag.snapshot;
  if (drag.mode === 'move') {
    if (ann.type === 'note' && s.point) {
      ann.point = [clamp01(s.point[0] + dx), clamp01(s.point[1] + dy)];
    } else if (s.box) {
      ann.box = [
        clamp01(s.box[0] + dx), clamp01(s.box[1] + dy),
        clamp01(s.box[2] + dx), clamp01(s.box[3] + dy)
      ];
    } else if (s.points) {
      ann.points = s.points.map(pt => [clamp01(pt[0] + dx), clamp01(pt[1] + dy)]);
    }
  } else if (drag.mode === 'resize-start' && ann.box) {
    ann.box = [clamp01(s.box[0] + dx), clamp01(s.box[1] + dy), s.box[2], s.box[3]];
  } else if (drag.mode === 'resize-end' && ann.box) {
    ann.box = [s.box[0], s.box[1], clamp01(s.box[2] + dx), clamp01(s.box[3] + dy)];
  } else if (drag.mode === 'resize-tl' && ann.box) {
    ann.box = [clamp01(s.box[0] + dx), clamp01(s.box[1] + dy), s.box[2], s.box[3]];
  } else if (drag.mode === 'resize-tr' && ann.box) {
    ann.box = [s.box[0], clamp01(s.box[1] + dy), clamp01(s.box[2] + dx), s.box[3]];
  } else if (drag.mode === 'resize-bl' && ann.box) {
    ann.box = [clamp01(s.box[0] + dx), s.box[1], s.box[2], clamp01(s.box[3] + dy)];
  } else if (drag.mode === 'resize-br' && ann.box) {
    ann.box = [s.box[0], s.box[1], clamp01(s.box[2] + dx), clamp01(s.box[3] + dy)];
  } else if (drag.mode === 'resize-e' && ann.box) {
    ann.box = [s.box[0], s.box[1], clamp01(s.box[2] + dx), s.box[3]];
  } else if (drag.mode === 'resize-w' && ann.box) {
    ann.box = [clamp01(s.box[0] + dx), s.box[1], s.box[2], s.box[3]];
  } else if (drag.mode === 'resize-n' && ann.box) {
    ann.box = [s.box[0], clamp01(s.box[1] + dy), s.box[2], s.box[3]];
  } else if (drag.mode === 'resize-s' && ann.box) {
    ann.box = [s.box[0], s.box[1], s.box[2], clamp01(s.box[3] + dy)];
  }
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function redrawAnnotationOverlay() {
  const ctx = annotateOverlay.getContext('2d');
  const r = getVideoDisplayRect();
  ctx.clearRect(0, 0, r.width, r.height);
  annotations.forEach(ann => {
    if (shouldShowAnnotationOnVideo(ann)) drawAnnotationShape(ctx, ann, r);
  });
  if (drawInProgress) drawAnnotationShape(ctx, drawInProgress, r, 0.85);
  const sel = getSelectedAnnotation();
  if (sel && shouldShowAnnotationOnVideo(sel)) drawSelectionHandles(ctx, sel, r);
}

const TOOL_META = {
  pan: { label: 'Hand', desc: 'Drag to pan when zoomed (+/− or Ctrl+wheel). Shift+drag also pans.', panel: 'hint' },
  select: { label: 'Move', desc: 'Click an annotation to select it. Drag to reposition; use corner handles on boxes and blur areas.', panel: 'none' },
  note: { label: 'Note', desc: 'Click on the video to place a text marker at the current playback time.', panel: 'note' },
  draw: { label: 'Pen', desc: 'Click and drag to draw freely on this frame. Release to finish the stroke.', panel: 'stroke' },
  rect: { label: 'Box', desc: 'Click and drag to draw a rectangle highlight on this frame.', panel: 'stroke' },
  arrow: { label: 'Arrow', desc: 'Click where the arrow starts, drag to the tip, then release.', panel: 'stroke' },
  blur: { label: 'Blur', desc: 'Drag over emails, names, or IDs to hide sensitive content on this frame.', panel: 'blur' }
};

function hasNewAnnotations() {
  return annotations.some(a => !baselineImportedIds.has(a.id));
}

function initAnnotationsSessionState() {
  annotationsBaseline = JSON.parse(JSON.stringify(annotations));
  baselineImportedIds = new Set(annotations.map(a => a.id));
  importedAnnotationIds = new Set(baselineImportedIds);
  updateAnnotateSaveButton();
}

function commitAnnotationsSession() {
  annotationsBaseline = JSON.parse(JSON.stringify(annotations));
  const ids = new Set(annotations.map(a => a.id));
  baselineImportedIds = ids;
  importedAnnotationIds = new Set(ids);
  updateAnnotateSaveButton();
}

function updateAnnotateSaveButton() {
  const hasNew = hasNewAnnotations();
  if (annotateSaveBtn) annotateSaveBtn.disabled = !loadedPackage || !hasNew;
  if (annotateCancelBtn) annotateCancelBtn.disabled = !hasNew;
}

function updateToolGlider() {
  if (!annToolsTrack || !annToolsGlider) return;
  const active = annToolsTrack.querySelector('.ann-labeled-tool.active');
  if (!active) return;
  const trackRect = annToolsTrack.getBoundingClientRect();
  const btnRect = active.getBoundingClientRect();
  annToolsGlider.style.width = `${btnRect.width}px`;
  annToolsGlider.style.transform = `translateX(${btnRect.left - trackRect.left}px)`;
}

function syncBlurControlsFromValue(px) {
  const v = String(Math.max(4, Math.min(48, parseInt(px, 10) || 14)));
  if (annotateBlurSelect) annotateBlurSelect.value = v;
  if (annotateBlurRange) annotateBlurRange.value = v;
  if (annotateBlurValue) annotateBlurValue.textContent = `${v}px`;
}

function syncStrokeControlsFromValue(w) {
  const v = String(Math.max(1, Math.min(16, parseInt(w, 10) || 3)));
  if (annotateStrokeSelect) annotateStrokeSelect.value = v;
  if (annotateStrokeRange) annotateStrokeRange.value = v;
  annotateStroke = parseInt(v, 10) || 3;
}

function syncToolbarFromSelection() {
  const ann = getSelectedAnnotation();
  if (ann) {
    if (ann.color) {
      annotateColorInput.value = ann.color;
      if (annotateNoteColorInput) annotateNoteColorInput.value = ann.color;
    }
    if (ann.strokeWidth) syncStrokeControlsFromValue(ann.strokeWidth);
    if (ann.blurRadius) syncBlurControlsFromValue(ann.blurRadius);
  }
  updateStyleBar();
}

function applyStyleFromControls() {
  const ann = getSelectedAnnotation();
  const editingSelection = annotateTool === 'select' && ann && !isImportedAnnotation(ann);
  if (editingSelection) {
    if (ann.type === 'blur') {
      ann.blurRadius = parseInt(annotateBlurRange?.value || annotateBlurSelect?.value, 10) || 14;
      syncBlurControlsFromValue(ann.blurRadius);
    } else if (ann.type === 'note') {
      const c = annotateNoteColorInput?.value || annotateColorInput.value;
      ann.color = c;
      annotateColor = c;
    } else {
      ann.color = annotateColorInput.value;
      annotateColor = ann.color;
      ann.strokeWidth = parseInt(annotateStrokeRange?.value || annotateStrokeSelect?.value, 10) || 3;
      syncStrokeControlsFromValue(ann.strokeWidth);
    }
    redrawAnnotationOverlay();
    updateAnnotateSaveButton();
    return;
  }
  annotateColor = annotateColorInput.value;
  annotateStroke = parseInt(annotateStrokeRange?.value || annotateStrokeSelect?.value, 10) || 3;
}

function updateStyleBar() {
  const bar = document.getElementById('ann-style-bar');
  if (!bar) return;
  let panel = TOOL_META[annotateTool]?.panel || 'hint';
  let hintText = '';
  const sel = getSelectedAnnotation();
  if (annotateTool === 'pan') {
    panel = 'hint';
    hintText = TOOL_META.pan.desc;
  } else if (annotateTool === 'select') {
    if (sel && isImportedAnnotation(sel)) {
      panel = 'hint';
      hintText = 'Imported annotation — read-only.';
    } else if (sel) {
      panel = sel.type === 'blur' ? 'blur' : sel.type === 'note' ? 'note' : 'stroke';
    } else {
      panel = 'hint';
      hintText = TOOL_META.select.desc;
    }
  } else {
    panel = TOOL_META[annotateTool]?.panel || 'hint';
    if (panel === 'hint') hintText = TOOL_META[annotateTool]?.desc || '';
  }

  const showControls = panel === 'stroke' || panel === 'blur' || panel === 'note';
  const showHint = panel === 'hint' && !!hintText;
  bar.hidden = !showControls && !showHint;
  bar.classList.toggle('is-hint-only', showHint && !showControls);
  if (annStyleHint) {
    if (showHint) {
      annStyleHint.textContent = hintText;
      annStyleHint.title = hintText;
      annStyleHint.hidden = false;
    } else {
      annStyleHint.hidden = true;
      annStyleHint.removeAttribute('title');
    }
  }
  bar.querySelectorAll('.ann-style-panel').forEach((p) => {
    p.hidden = p.dataset.panel !== panel;
  });
}

function setAnnotateCursorClass(cursorClass) {
  [
    'ann-cursor-move', 'ann-cursor-grab', 'ann-cursor-grabbing',
    'ann-cursor-nwse', 'ann-cursor-nesw', 'ann-cursor-ew', 'ann-cursor-ns', 'ann-cursor-cross'
  ].forEach((c) => videoWrap.classList.remove(c));
  if (cursorClass) videoWrap.classList.add(cursorClass);
}

function cursorClassForHitMode(mode) {
  const map = {
    move: 'ann-cursor-move',
    'resize-tl': 'ann-cursor-nwse',
    'resize-br': 'ann-cursor-nwse',
    'resize-tr': 'ann-cursor-nesw',
    'resize-bl': 'ann-cursor-nesw',
    'resize-e': 'ann-cursor-ew',
    'resize-w': 'ann-cursor-ew',
    'resize-n': 'ann-cursor-ns',
    'resize-s': 'ann-cursor-ns',
    'resize-start': 'ann-cursor-cross',
    'resize-end': 'ann-cursor-cross'
  };
  return map[mode] || '';
}

function updateAnnotateHoverCursor(clientX, clientY) {
  if (editDrag) return;
  if (annotateTool === 'pan') return;
  if (annotateTool !== 'select') {
    setAnnotateCursorClass('');
    return;
  }
  const p = clientToNorm(clientX, clientY);
  if (!p) {
    setAnnotateCursorClass('');
    return;
  }
  const hit = hitTestAnnotation(p.x, p.y);
  if (hit && !isImportedAnnotation(hit.ann) && hit.mode !== 'select') {
    setAnnotateCursorClass(cursorClassForHitMode(hit.mode));
  } else {
    setAnnotateCursorClass('');
  }
}

function setAnnotateTool(tool) {
  if (!TOOL_META[tool]) return;
  annotateTool = tool;
  annotateToolbar.querySelectorAll('.ann-labeled-tool[data-tool]').forEach(btn => {
    const on = btn.dataset.tool === tool;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  annotateToolbar.dataset.tool = tool;
  videoWrap.classList.remove('ann-dragging', 'ann-resize');
  setAnnotateCursorClass('');
  ['pan', 'select', 'note', 'draw', 'rect', 'arrow', 'blur'].forEach(t => {
    videoWrap.classList.remove(`ann-tool-${t}`);
  });
  videoWrap.classList.add(`ann-tool-${annotateTool}`);
  annotateOverlay.style.pointerEvents = annotateTool === 'pan' ? 'none' : '';
  updateToolGlider();
  updateStyleBar();
}

function shouldStartViewPan(e) {
  if (annotateTool === 'pan') return e.button === 0;
  return videoZoom > 1.01 && (e.button === 1 || (e.button === 0 && e.shiftKey));
}

function startViewPan(e) {
  if (!shouldStartViewPan(e)) return false;
  e.preventDefault();
  isVideoPanning = true;
  videoPanStart = { x: e.clientX - videoPanX, y: e.clientY - videoPanY };
  videoWrap.classList.add('is-panning');
  return true;
}

function cancelAnnotationEdits() {
  annotations = JSON.parse(JSON.stringify(annotationsBaseline));
  importedAnnotationIds = new Set(baselineImportedIds);
  selectedAnnotationId = null;
  drawInProgress = null;
  editDrag = null;
  closeNoteModal();
  setAnnotateTool('select');
  renderAnnotationsList();
  redrawAnnotationOverlay();
  updateAnnotateSaveButton();
}

function saveBugpackFile() {
  if (!loadedPackage || annotateSaveBtn?.disabled) return;
  const payload = {
    ...sessionData,
    annotations: annotations.map(a => ({ ...a }))
  };
  loadedPackage.entries[loadedPackage.jsonKey] = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  sessionData = payload;
  const zipped = fflate.zipSync(loadedPackage.entries, { level: 6 });
  const blob = new Blob([zipped], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = loadedPackage.fileName || 'report.bugpack';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  commitAnnotationsSession();
}

function addAnnotation(ann) {
  annotations.push(ann);
  selectedAnnotationId = ann.id;
  renderAnnotationsList();
  redrawAnnotationOverlay();
  syncToolbarFromSelection();
  updateAnnotateSaveButton();
}

function updateAnnotation(ann) {
  const i = annotations.findIndex(a => a.id === ann.id);
  if (i >= 0) annotations[i] = ann;
  renderAnnotationsList();
  redrawAnnotationOverlay();
  syncToolbarFromSelection();
  updateAnnotateSaveButton();
}

function deleteAnnotation(id) {
  if (importedAnnotationIds.has(id)) return;
  annotations = annotations.filter(a => a.id !== id);
  if (selectedAnnotationId === id) selectedAnnotationId = null;
  renderAnnotationsList();
  redrawAnnotationOverlay();
  updateAnnotateSaveButton();
}

function goToAnnotation(ann) {
  videoPlayer.pause();
  stopSpeedLoop();
  updatePlayPauseUi();
  selectedAnnotationId = ann.id;
  videoPlayer.currentTime = ann.videoTimeSec;
  seekBar.value = String(Math.round(ann.videoTimeSec * 100));
  updatePlayerTimeUi();
  renderAnnotationsList();
  redrawAnnotationOverlay();
  syncToolbarFromSelection();
  syncLogsToVideo(ann.videoTimeSec, { forceFull: true });
}

function renderAnnotationsList() {
  const list = document.getElementById('list-annotations');
  const countEl = document.getElementById('count-annotations');
  list.innerHTML = '';
  countEl.textContent = String(annotations.length);

  if (!annotations.length) {
    list.innerHTML = '<div class="empty-state">No annotations yet.<br>Use the toolbar above the video to add notes, drawings, and shapes.</div>';
    return;
  }

  const sorted = [...annotations].sort((a, b) => a.videoTimeSec - b.videoTimeSec);
  sorted.forEach(ann => {
    const item = document.createElement('div');
    const locked = isImportedAnnotation(ann);
    item.className = 'ann-item' + (ann.id === selectedAnnotationId ? ' selected' : '') + (locked ? ' imported-locked' : '');
    const typeLabel = { note: 'Note', draw: 'Draw', rect: 'Rect', arrow: 'Arrow', blur: 'Blur' }[ann.type] || ann.type;
    let body = '';
    if (ann.type === 'note') {
      body = esc(ann.text || '(empty note)');
      if (locked) body += '<span class="ann-locked-tag">Imported</span>';
    }
    else if (ann.type === 'draw') body = `${ann.points?.length || 0} points`;
    else if (ann.type === 'blur') body = 'Blurred region';
    else body = 'Shape on frame';
    if (locked && ann.type !== 'note') body += '<span class="ann-locked-tag">Imported</span>';

    item.innerHTML = `
      <span class="ann-time">${formatTimePrecise(ann.videoTimeSec)}</span>
      <span class="ann-type-badge">${typeLabel}</span>
      <div class="ann-body">${body}</div>
      <button type="button" class="ann-delete" title="Delete" ${locked ? 'disabled style="opacity:.35;cursor:not-allowed"' : ''}>×</button>`;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.ann-delete')) return;
      goToAnnotation(ann);
    });
    if (ann.type === 'note') {
      item.addEventListener('dblclick', (e) => {
        if (e.target.closest('.ann-delete')) return;
        e.preventDefault();
        goToAnnotation(ann);
        openNoteModal(null, ann);
      });
    }
    const delBtn = item.querySelector('.ann-delete');
    if (!locked) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteAnnotation(ann.id);
      });
    }
    list.appendChild(item);
  });
}

function commitAnnotationFromDraw() {
  if (!drawInProgress) return;
  const ann = { ...drawInProgress, id: newAnnotationId(), createdAt: new Date().toISOString() };
  if (ann.type === 'draw' && (!ann.points || ann.points.length < 2)) {
    drawInProgress = null;
    redrawAnnotationOverlay();
    return;
  }
  if (ann.type === 'arrow' && ann.box) {
    const dx = ann.box[2] - ann.box[0];
    const dy = ann.box[3] - ann.box[1];
    if (Math.hypot(dx, dy) < 0.02) {
      drawInProgress = null;
      redrawAnnotationOverlay();
      return;
    }
  } else if ((ann.type === 'rect' || ann.type === 'blur') && ann.box) {
    const box = normalizeBox(ann.box);
    if (Math.abs(box[2] - box[0]) < 0.02 || Math.abs(box[3] - box[1]) < 0.02) {
      drawInProgress = null;
      redrawAnnotationOverlay();
      return;
    }
    ann.box = box;
  } else if (ann.type === 'rect' || ann.type === 'arrow' || ann.type === 'blur') {
    drawInProgress = null;
    redrawAnnotationOverlay();
    return;
  }
  if (ann.type === 'blur') ann.blurRadius = parseInt(annotateBlurRange?.value || annotateBlurSelect?.value, 10) || 14;
  drawInProgress = null;
  addAnnotation(ann);
}

function setNoteModalMode(viewOnly) {
  noteModalViewOnly = viewOnly;
  noteModalEl.classList.toggle('is-view-only', viewOnly);
  noteModalText.readOnly = viewOnly;
  noteModalColor.disabled = viewOnly;
  noteModalOk.style.display = viewOnly ? 'none' : '';
  noteModalCancel.textContent = viewOnly ? 'Close' : 'Cancel';
  noteModalHint.textContent = viewOnly
    ? 'Read-only · Esc or Close to exit'
    : 'Ctrl+Enter to save · Esc to cancel';
}

function updateNoteModalCount() {
  const n = noteModalText.value.length;
  noteModalCount.textContent = String(n);
  if (!noteModalViewOnly) noteModalOk.disabled = n === 0;
}

function openNoteModal(normPoint, viewAnn = null) {
  const viewOnly = !!viewAnn;
  setNoteModalMode(viewOnly);
  noteModalBackdrop.classList.add('open');
  noteModalBackdrop.setAttribute('aria-hidden', 'false');
  videoPlayer.pause();
  stopSpeedLoop();
  updatePlayPauseUi();

  if (viewOnly) {
    pendingNotePoint = null;
    selectedAnnotationId = viewAnn.id;
    const t = viewAnn.videoTimeSec ?? 0;
    videoPlayer.currentTime = t;
    seekBar.value = String(Math.round(t * 100));
    updatePlayerTimeUi();
    redrawAnnotationOverlay();
    renderAnnotationsList();
    noteModalTitle.textContent = 'View note';
    noteModalSubtitle.textContent = 'Created at this moment in the recording';
    noteModalMeta.textContent = formatTimePrecise(t);
    noteModalText.value = viewAnn.text || '';
    noteModalColor.value = viewAnn.color || '#ff6b6b';
    updateNoteModalCount();
    requestAnimationFrame(() => noteModalClose.focus());
    return;
  }

  pendingNotePoint = normPoint;
  const t = videoPlayer.currentTime ?? 0;
  noteModalTitle.textContent = 'Add note';
  noteModalSubtitle.textContent = 'Pinned to the current video frame — cannot be edited later';
  noteModalOk.textContent = 'Add note';
  noteModalMeta.textContent = formatTimePrecise(t);
  noteModalText.value = '';
  noteModalColor.value = annotateColor;
  updateNoteModalCount();
  requestAnimationFrame(() => noteModalText.focus());
}

function closeNoteModal() {
  noteModalBackdrop.classList.remove('open');
  noteModalBackdrop.setAttribute('aria-hidden', 'true');
  pendingNotePoint = null;
  setNoteModalMode(false);
}

function submitNoteModal() {
  if (noteModalViewOnly) {
    closeNoteModal();
    return;
  }
  const text = noteModalText.value.trim();
  if (!text) { noteModalText.focus(); return; }
  const pinColor = noteModalColor.value;
  annotateColor = pinColor;
  annotateColorInput.value = pinColor;
  if (annotateNoteColorInput) annotateNoteColorInput.value = pinColor;
  const t = videoPlayer.currentTime ?? 0;
  addAnnotation({
    id: newAnnotationId(),
    type: 'note',
    videoTimeSec: t,
    createdAt: new Date().toISOString(),
    color: pinColor,
    strokeWidth: annotateStroke,
    point: pendingNotePoint ? [pendingNotePoint.x, pendingNotePoint.y] : [0.5, 0.5],
    text
  });
  closeNoteModal();
}

function setupAnnotationUi() {
  annotateToolbar.querySelectorAll('.ann-labeled-tool[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setAnnotateTool(btn.dataset.tool));
  });
  new ResizeObserver(() => updateToolGlider()).observe(annToolsTrack);
  annotateColorInput.addEventListener('input', () => applyStyleFromControls());
  if (annotateNoteColorInput) {
    annotateNoteColorInput.addEventListener('input', () => {
      annotateColor = annotateNoteColorInput.value;
      applyStyleFromControls();
    });
  }
  const onStrokeControlChange = () => {
    syncStrokeControlsFromValue(annotateStrokeRange?.value || annotateStrokeSelect?.value);
    if (drawInProgress && drawInProgress.type !== 'blur') {
      drawInProgress.strokeWidth = annotateStroke;
      drawInProgress.color = annotateColorInput.value;
      redrawAnnotationOverlay();
    }
    applyStyleFromControls();
  };
  annotateStrokeSelect?.addEventListener('change', onStrokeControlChange);
  annotateStrokeRange?.addEventListener('input', onStrokeControlChange);
  const onBlurControlChange = () => {
    const px = parseInt(annotateBlurRange?.value || annotateBlurSelect?.value, 10) || 14;
    syncBlurControlsFromValue(px);
    if (drawInProgress?.type === 'blur') {
      drawInProgress.blurRadius = px;
      redrawAnnotationOverlay();
    }
    applyStyleFromControls();
  };
  annotateBlurRange?.addEventListener('input', onBlurControlChange);
  annotateBlurSelect?.addEventListener('change', () => {
    syncBlurControlsFromValue(annotateBlurSelect.value);
    applyStyleFromControls();
  });
  syncStrokeControlsFromValue(annotateStroke);
  syncBlurControlsFromValue(14);
  document.getElementById('annotate-cancel').addEventListener('click', cancelAnnotationEdits);
  annotateSaveBtn.addEventListener('click', saveBugpackFile);
  document.getElementById('note-modal-cancel').addEventListener('click', closeNoteModal);
  document.getElementById('note-modal-close').addEventListener('click', closeNoteModal);
  noteModalOk.addEventListener('click', submitNoteModal);
  noteModalText.addEventListener('input', updateNoteModalCount);
  noteModalText.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeNoteModal(); }
    if (!noteModalViewOnly && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submitNoteModal();
    }
  });
  noteModalBackdrop.addEventListener('click', (e) => {
    if (e.target === noteModalBackdrop) closeNoteModal();
  });

  annotateOverlay.addEventListener('mousedown', (e) => {
    if (annotateTool === 'pan') return;
    e.preventDefault();
    e.stopPropagation();
    const p = clientToNorm(e.clientX, e.clientY);
    if (!p) return;

    if (annotateTool === 'select') {
      const hit = hitTestAnnotation(p.x, p.y);
      if (hit) {
        selectedAnnotationId = hit.ann.id;
        const canEdit = !isImportedAnnotation(hit.ann) && hit.mode !== 'select';
        if (canEdit) {
          editDrag = { ann: hit.ann, mode: hit.mode, start: p, snapshot: cloneAnnotation(hit.ann) };
          setAnnotateCursorClass(hit.mode === 'move' ? 'ann-cursor-grabbing' : cursorClassForHitMode(hit.mode));
        }
      } else {
        selectedAnnotationId = null;
        editDrag = null;
        setAnnotateCursorClass('');
      }
      syncToolbarFromSelection();
      renderAnnotationsList();
      redrawAnnotationOverlay();
      return;
    }

    const t = videoPlayer.currentTime ?? 0;
    if (annotateTool === 'note') {
      openNoteModal(p);
      return;
    }

    videoPlayer.pause();
    stopSpeedLoop();
    updatePlayPauseUi();
    if (annotateTool === 'draw') {
      drawInProgress = {
        type: 'draw',
        videoTimeSec: t,
        color: annotateColor,
        strokeWidth: annotateStroke,
        points: [[p.x, p.y]]
      };
      return;
    }
    if (annotateTool === 'rect' || annotateTool === 'arrow' || annotateTool === 'blur') {
      drawInProgress = {
        type: annotateTool,
        videoTimeSec: t,
        color: annotateColor,
        strokeWidth: annotateStroke,
        blurRadius: parseInt(annotateBlurRange?.value || annotateBlurSelect?.value, 10) || 14,
        box: [p.x, p.y, p.x, p.y]
      };
    }
  });

  annotateOverlay.addEventListener('mousemove', (e) => {
    updateAnnotateHoverCursor(e.clientX, e.clientY);
  });
  annotateOverlay.addEventListener('mouseleave', () => {
    if (!editDrag) setAnnotateCursorClass('');
  });

  annotateOverlay.addEventListener('dblclick', (e) => {
    if (annotateTool !== 'select') return;
    e.preventDefault();
    const p = clientToNorm(e.clientX, e.clientY);
    if (!p) return;
    const hit = hitTestAnnotation(p.x, p.y);
    if (hit?.ann.type === 'note') openNoteModal(null, hit.ann);
  });

  window.addEventListener('mousemove', (e) => {
    if (editDrag) {
      const p = clientToNorm(e.clientX, e.clientY);
      if (!p) return;
      const ann = annotations.find(a => a.id === editDrag.ann.id);
      if (ann) {
        applyEditDrag(ann, editDrag, p);
        redrawAnnotationOverlay();
      }
      return;
    }
    if (!drawInProgress) return;
    const p = clientToNorm(e.clientX, e.clientY);
    if (!p) return;
    if (drawInProgress.type === 'draw') {
      const pts = drawInProgress.points;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(last[0] - p.x, last[1] - p.y) > 0.004) pts.push([p.x, p.y]);
    } else if (drawInProgress.box) {
      drawInProgress.box[2] = p.x;
      drawInProgress.box[3] = p.y;
    }
    redrawAnnotationOverlay();
  });

  window.addEventListener('mouseup', () => {
    if (editDrag) {
      editDrag = null;
      setAnnotateCursorClass('');
      renderAnnotationsList();
      updateAnnotateSaveButton();
      return;
    }
    if (!drawInProgress) return;
    if (['draw', 'rect', 'arrow', 'blur'].includes(drawInProgress.type)) {
      commitAnnotationFromDraw();
    }
  });

  window.addEventListener('resize', () => {
    if (document.getElementById('viewer').classList.contains('visible')) resizeAnnotateCanvas();
  });
  new ResizeObserver(() => {
    if (document.getElementById('viewer').classList.contains('visible')) resizeAnnotateCanvas();
  }).observe(videoWrap);

  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('viewer').classList.contains('visible')) return;
    if (noteModalBackdrop.classList.contains('open')) return;
    if (document.activeElement.matches('textarea, input, select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFullscreen();
      return;
    }
    if (e.key === '0') {
      e.preventDefault();
      resetVideoZoom();
      return;
    }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      stepVideoZoom(VIDEO_ZOOM_STEP);
      return;
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      stepVideoZoom(-VIDEO_ZOOM_STEP);
      return;
    }

    const shortcuts = { h: 'pan', v: 'select', n: 'note', p: 'draw', r: 'rect', a: 'arrow', b: 'blur' };
    const key = e.key.length === 1 ? e.key.toLowerCase() : '';
    if (shortcuts[key]) {
      e.preventDefault();
      setAnnotateTool(shortcuts[key]);
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedAnnotationId && !importedAnnotationIds.has(selectedAnnotationId)) {
        e.preventDefault();
        deleteAnnotation(selectedAnnotationId);
        syncToolbarFromSelection();
      }
    }
  });

  annotateOverlay.style.pointerEvents = '';
  setAnnotateTool('select');
  requestAnimationFrame(updateToolGlider);
}
setupAnnotationUi();

function updatePlayPauseUi() {
  btnPlayPause.textContent = videoPlayer.paused ? '▶' : '⏸';
}

function togglePlayPause() {
  if (!videoPlayer) return;
  if (videoPlayer.paused) {
    videoPlayer.play().catch(e => console.error("Error al reproducir:", e));
  } else {
    videoPlayer.pause();
  }
  updatePlayPauseUi();
}
function stopVideo() {
  videoPlayer.pause();
  stopSpeedLoop();
  videoPlayer.currentTime = 0;
  seekBar.value = '0';
  updatePlayerTimeUi();
  updatePlayPauseUi();
  syncLogsToVideo(0);
}

function setupPlayerControls() {
  // Usamos delegación de eventos en el documento para asegurar que el clic siempre se detecte
  document.addEventListener('click', (e) => {
    const target = e.target;
    
    // Si el clic fue en el botón de Play o en su ícono interior
    if (target.closest('#btn-play-pause')) {
      e.preventDefault();
      e.stopPropagation();
      togglePlayPause();
      return;
    }
    
    // Si el clic fue en el botón de Stop
    if (target.closest('#btn-stop')) {
      e.preventDefault();
      e.stopPropagation();
      stopVideo();
      return;
    }
  });

  // El resto de los controles (zoom, velocidad, etc.)
  btnZoomIn?.addEventListener('click', () => stepVideoZoom(VIDEO_ZOOM_STEP));
  btnZoomOut?.addEventListener('click', () => stepVideoZoom(-VIDEO_ZOOM_STEP));
  btnZoomReset?.addEventListener('click', resetVideoZoom);
  btnFullscreen?.addEventListener('click', toggleFullscreen);

  videoWrap.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    stepVideoZoom(e.deltaY > 0 ? -VIDEO_ZOOM_STEP : VIDEO_ZOOM_STEP);
  }, { passive: false });

  playbackSpeed.addEventListener('change', () => {
    applyPlaybackSpeed(parseFloat(playbackSpeed.value) || 1);
  });

  videoPlayer.addEventListener('play', updatePlayPauseUi);
  videoPlayer.addEventListener('pause', () => {
    updatePlayPauseUi();
    stopSpeedLoop();
    syncLogsToVideo(videoPlayer.currentTime, { lightNetwork: true });
  });
  videoPlayer.addEventListener('ended', () => {
    updatePlayPauseUi();
    stopSpeedLoop();
    updatePlayerTimeUi();
  });

  videoPlayer.addEventListener('timeupdate', () => {
    if (videoPlayer.currentTime > sessionDurationHint) {
      sessionDurationHint = videoPlayer.currentTime + 0.5;
    }
    updatePlayerTimeUi();
    syncLogsToVideo();
    redrawAnnotationOverlay();
  });

  seekBar.addEventListener('input', () => {
    isSeeking = true;
    const t = seekBar.value / 100;
    timeCurrentEl.textContent = formatTime(t);
    syncLogsToVideo(t, { lightNetwork: true });
  });

  seekBar.addEventListener('change', () => {
    videoPlayer.currentTime = seekBar.value / 100;
    isSeeking = false;
    syncLogsToVideo(videoPlayer.currentTime, { lightNetwork: true });
    redrawAnnotationOverlay();
  });
}

setupPlayerControls();
setupCopyDelegation();
setupSessionInsights();
applyVideoTransform();
window.addEventListener('resize', resizeAnnotateCanvas);

function resolveTimelineStart(recordingStart, consoleEvents, networkEvents) {
  const recStartMs = coerceTimestampMs(recordingStart, 0);
  const stamps = [...consoleEvents, ...networkEvents]
    .map(e => coerceTimestampMs(e?.timestamp, NaN))
    .filter(Number.isFinite);
  if (!stamps.length) return recStartMs || 0;
  const earliest = Math.min(...stamps);
  if (!recStartMs) return earliest;
  return Math.min(recStartMs, earliest);
}

function eventOffsetSec(ev, timelineStart) {
  const ts = coerceTimestampMs(ev?.timestamp, 0);
  const base = coerceTimestampMs(timelineStart, 0);
  return Math.max(0, (ts - base) / 1000);
}

function coerceTimestampMs(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeEventTimestamp(ev) {
  if (!ev || typeof ev !== 'object') return ev;
  return { ...ev, timestamp: coerceTimestampMs(ev.timestamp, 0) };
}

function syncLogsToVideo(overrideTime, { forceFull = false, lightNetwork = false } = {}) {
  const dur = resolveVideoDuration();
  let t = overrideTime ?? videoPlayer.currentTime ?? 0;
  if (!Number.isFinite(t) || t < 0) t = 0;
  if (dur > 0 && t > dur) t = dur;
  renderConsole(sessionEvents.console, sessionEvents.timelineStart, t);
  const incremental = !forceFull && !videoPlayer.paused && !isSeeking && overrideTime === undefined;
  const useLightNetwork = lightNetwork && !videoPlayer.paused && !isSeeking && !forceFull;
  if (useLightNetwork || incremental) updateNetworkPlayback(t);
  else renderNetwork(sessionEvents.network, sessionEvents.timelineStart, t);
}

videoPlayer.addEventListener('seeked', () => syncLogsToVideo());
videoPlayer.addEventListener('loadedmetadata', () => syncLogsToVideo());

videoPlayer.addEventListener('error', () => {
  const mediaError = videoPlayer.error;
  const code = mediaError ? mediaError.code : 'desconocido';
  console.error('Error de reproducción de video. Código:', code);
  if (code === 4) {
    console.error('Formato/códec de video no compatible con este navegador.');
  }
});

function guessMimeType(bytes, filenameLower) {
  const isAt = (offset, sig) => sig.every((v, i) => bytes[offset + i] === v);
  const has = (sig) => {
    for (let i = 0; i <= bytes.length - sig.length; i += 1) {
      if (isAt(i, sig)) return true;
    }
    return false;
  };

  if (bytes.length >= 12 && isAt(4, [0x66, 0x74, 0x79, 0x70])) return 'video/mp4';
  if (bytes.length >= 4 && isAt(0, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  if (bytes.length >= 4 && isAt(0, [0x4f, 0x67, 0x67, 0x53])) return 'video/ogg';

  const mimeByExt = {
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.ogg': 'video/ogg'
  };
  const matchedExt = Object.keys(mimeByExt).find(ext => filenameLower.endsWith(ext));
  if (matchedExt) return mimeByExt[matchedExt];

  if (has([0x6d, 0x6f, 0x6f, 0x76]) || has([0x6d, 0x64, 0x61, 0x74])) return 'video/mp4';

  return 'application/octet-stream';
}

function normalizeVideoBytes(rawBytes) {
  const startsWith = (sig) => sig.every((v, i) => rawBytes[i] === v);

  if (rawBytes.length >= 2 && startsWith([0x1f, 0x8b])) {
    try {
      const gunzipped = fflate.gunzipSync(rawBytes);
      return { bytes: gunzipped, note: 'Gzip detected and decompressed automatically.' };
    } catch (_) {}
  }

  if (rawBytes.length >= 4 && startsWith([0x50, 0x4b, 0x03, 0x04])) {
    try {
      const nested = fflate.unzipSync(rawBytes);
      const keys = Object.keys(nested);
      const candidate = keys.find(k => {
        const n = k.toLowerCase();
        return n.endsWith('.webm') || n.endsWith('.mp4') || n.endsWith('.m4v') || n.endsWith('.mov') || n.endsWith('.ogg');
      });
      if (candidate && nested[candidate]?.length) {
        return { bytes: nested[candidate], note: `Nested zip detected; used "${candidate}".` };
      }
    } catch (_) {}
  }

  return { bytes: rawBytes, note: null };
}

document.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) dropZone.classList.remove('drag-over'); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

async function loadFile(file) {
  try {
    logQuickFilter = 'all';
    sessionDurationHint = 0;
    expandedNetworkId = null;
    selectedAnnotationId = null;
    drawInProgress = null;
    editDrag = null;
    annotations = [];
    importedAnnotationIds = new Set();
    annotationsBaseline = [];
    baselineImportedIds = new Set();
    loadedPackage = null;
    sessionData = null;
    resetCopyStore();
    resetVideoZoom();
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const unzipped = fflate.unzipSync(bytes);
    console.log('Archivos en el paquete:', Object.keys(unzipped));

    const zipKeys = Object.keys(unzipped);

    const videoCandidates = zipKeys
      .map(key => ({ key, lower: key.toLowerCase(), size: unzipped[key]?.length || 0 }))
      .filter(f => ['.webm', '.mp4', '.m4v', '.mov', '.ogg'].some(ext => f.lower.endsWith(ext)))
      .sort((a, b) => b.size - a.size);

    const videoFile = videoCandidates[0];
    if (!videoFile || videoFile.size === 0) throw new Error('No valid video found in file');

    const jsonKey = zipKeys.find(k => k.toLowerCase().endsWith('.json'));
    if (!jsonKey) throw new Error('data.json not found in file');

    const rawVideoBytes = unzipped[videoFile.key];
    const normalized = normalizeVideoBytes(rawVideoBytes);
    if (normalized.note) console.warn(normalized.note);
    const videoBytes = normalized.bytes;
    const mimeType = guessMimeType(videoBytes, videoFile.lower);
    const videoBlob = new Blob([videoBytes], { type: mimeType });
    if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
    currentVideoUrl = URL.createObjectURL(videoBlob);
    videoPlayer.src = currentVideoUrl;
    videoPlayer.preload = 'metadata';
    videoPlayer.load();
    playbackSpeed.value = '1';
    applyPlaybackSpeed(1);

    const canPlay = videoPlayer.canPlayType(mimeType);
    console.log('Video detectado:', videoFile.key, '| bytes:', videoBytes.length, '| MIME:', mimeType, '| canPlayType:', canPlay || 'no');
    if (!canPlay || canPlay === '') {
      alert('This .bugpack video uses a format/codec not supported by this browser (' + mimeType + ').');
    }

    videoPlayer.play().catch(() => {});

    const data = JSON.parse(new TextDecoder().decode(unzipped[jsonKey]));
    console.log('Data:', data);
    sessionData = data;
    annotations = Array.isArray(data.annotations)
      ? data.annotations.map(a => {
          const ann = { ...a };
          if (!ann.id) ann.id = newAnnotationId();
          return ann;
        })
      : [];
    initAnnotationsSessionState();
    const zipEntries = {};
    zipKeys.forEach(k => { zipEntries[k] = unzipped[k]; });
    loadedPackage = { fileName: file.name, entries: zipEntries, jsonKey, videoKey: videoFile.key };

    document.getElementById('nav-filename').textContent = file.name;
    setMetaUrlDisplay(data.metadata?.url || '—');
    document.getElementById('meta-ts').textContent = data.metadata?.timestamp
      ? new Date(data.metadata.timestamp).toLocaleString() : '—';
      if (data.metadata?.environment) {
    const envText = document.getElementById('meta-env');
    if (envText) envText.textContent = data.metadata.environment.toUpperCase();

    const envContainerFlex = document.getElementById('meta-env-container') as HTMLElement | null;
    if (envContainerFlex) envContainerFlex.style.display = 'flex';
} else {
    const envContainerNone = document.getElementById('meta-env-container') as HTMLElement | null;
    if (envContainerNone) envContainerNone.style.display = 'none';
}
    document.getElementById('meta-ua').textContent =
      (data.metadata?.userAgent || '—').replace(/\(.*?\)/g, '').trim().slice(0, 60);

    if (data.videoMeta?.bytes === 0) {
      alert('This .bugpack contains an empty video (0 bytes). The issue is in file generation, not the viewer.');
    } else if (data.videoMeta?.mimeType) {
      console.log('Metadata de video desde BugPack:', data.videoMeta);
    }

    const recordingStart = data.metadata?.videoRecordingStartedAt
      || data.metadata?.recordingStartedAt
      || null;
    sessionEvents.console = (data.consoleEvents || []).map(normalizeEventTimestamp);
    sessionEvents.network = (data.networkEvents || []).map(normalizeEventTimestamp);
    sessionEvents.timelineStart = resolveTimelineStart(
      recordingStart,
      sessionEvents.console,
      sessionEvents.network
    );
    if (data.metadata?.recordingDurationMs > 0) {
      sessionDurationHint = data.metadata.recordingDurationMs / 1000;
    }
    updateSessionDurationHintFromEvents();
    updatePlayerTimeUi();
    syncLogsToVideo();
    renderAnnotationsList();
    updateSessionHealth();
    document.getElementById('btn-copy-report')?.removeAttribute('hidden');
    document.getElementById('btn-redact-pii')?.removeAttribute('hidden');
    document.getElementById('log-quick-filters')?.removeAttribute('hidden');
    document.querySelectorAll('.log-quick-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.qf === 'all');
    });
    annotateToolbar.classList.add('visible');
    document.getElementById('meta-annotate-actions')?.removeAttribute('hidden');
    videoPlayer.addEventListener('loadeddata', () => {
      resizeAnnotateCanvas();
      updateSessionHealth();
    }, { once: true });
    requestAnimationFrame(() => {
      resizeAnnotateCanvas();
      updateToolGlider();
    });

    document.getElementById('drop-zone').style.display = 'none';
    document.getElementById('viewer').classList.add('visible');

  } catch (err) {
    alert('Error opening file: ' + err.message);
    console.error(err);
  }
}

function getRequestPayload(ev) {
  return ev.postData || ev.requestBody || null;
}

function hasCapturedPayload(ev) {
  return Boolean(getRequestPayload(ev) || ev.responseBody || ev.hasPostData);
}

function getCaptureDisplayStatus(stats) {
  const networkCount = (sessionEvents.network || []).length;
  const consoleCount = (sessionEvents.console || []).length;
  const captureMode = sessionData?.metadata?.captureMode;
  const hasUsefulNetwork = networkCount > 0 || stats.payloadCount > 0;

  if (stats.debuggerAttached || captureMode === 'debugger') {
    return { show: false };
  }
  if (captureMode === 'page-hook' || (hasUsefulNetwork && captureMode !== 'video-only')) {
    return {
      show: true,
      label: 'Page hook',
      className: 'ok',
      title: stats.captureNote || 'Network and payloads captured via page hook. DevTools console was not recorded.'
    };
  }
  if (hasUsefulNetwork && stats.captureNote?.includes('Solo video')) {
    return {
      show: true,
      label: 'Page hook',
      className: 'ok',
      title: 'Network and payloads captured via page hook (legacy metadata). DevTools console may be missing.'
    };
  }
  if (stats.captureNote || captureMode === 'video-only' || (!hasUsefulNetwork && !consoleCount)) {
    return {
      show: true,
      label: 'Limited capture',
      className: 'warn',
      title: stats.captureNote || 'Only video was captured on this recording.'
    };
  }
  return { show: false };
}

function getSessionStats() {
  const consoleEvents = sessionEvents.console || [];
  const networkEvents = sessionEvents.network || [];
  const errorCount = consoleEvents.filter(e => e.type === 'error').length;
  const warnCount = consoleEvents.filter(e => e.type === 'warn' || e.type === 'warning').length;
  const failedHttp = networkEvents.filter(e => !e.isWebSocket && e.status >= 400).length;
  const payloadCount = networkEvents.filter(e => hasCapturedPayload(e)).length;
  const dur = resolveVideoDuration() || sessionDurationHint || 0;
  const captureNote = sessionData?.metadata?.captureNote || null;
  const captureMode = sessionData?.metadata?.captureMode || null;
  const debuggerAttached = sessionData?.metadata?.debuggerAttached === true;
  return { errorCount, warnCount, failedHttp, payloadCount, dur, captureNote, captureMode, debuggerAttached };
}

function formatDurationShort(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

function applyLogQuickFilter(filter) {
  logQuickFilter = filter;
  document.querySelectorAll('.log-quick-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.qf === filter);
  });
  document.querySelectorAll('.health-chip[data-qf]').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.qf === filter);
  });
  if (filter.startsWith('console-')) switchTab('console');
  else if (filter.startsWith('net-')) switchTab('network');
  syncLogsToVideo(undefined, { forceFull: true });
}

function updateSessionHealth() {
  const el = document.getElementById('meta-health');
  if (!el) return;
  const stats = getSessionStats();

  // --- CÁLCULO DEL HEALTH SCORE ---
  let healthScore = 100;
  healthScore -= stats.errorCount * 10; // -10 por error
  healthScore -= stats.warnCount * 5;   // -5 por warning
  healthScore -= stats.failedHttp * 15; // -15 por HTTP fallido
  healthScore = Math.max(0, healthScore); // Evitar negativos

  // Determinar color y texto según el puntaje
  let scoreColor = 'var(--green)';
  let scoreLabel = 'Saludable';
  if (healthScore < 80) { scoreColor = 'var(--yellow)'; scoreLabel = 'Advertencia'; }
  if (healthScore < 50) { scoreColor = 'var(--red)'; scoreLabel = 'Crítico'; }

  // --- RENDERIZADO DE LOS CHIPS ---
  const chips = [];
  
  // 1. El nuevo chip del Health Score
  chips.push(`
    <span class="health-chip" style="border-color: ${scoreColor}; color: ${scoreColor}; font-weight: bold;" title="Health Score: ${healthScore}/100 (${scoreLabel})">
      <span class="health-dot" style="background: ${scoreColor}"></span>
      Score: ${healthScore}/100
    </span>
  `);

  // 2. El chip de duración
  chips.push(`<button type="button" class="health-chip ok" data-qf="all"><span class="health-dot ok"></span>${formatDurationShort(stats.dur)}</button>`);
  
  // 3. Chips de errores y warnings
  if (stats.errorCount) {
    chips.push(`<button type="button" class="health-chip error${logQuickFilter === 'console-errors' ? ' active' : ''}" data-qf="console-errors"><span class="health-dot error"></span>${stats.errorCount} error${stats.errorCount === 1 ? '' : 's'}</button>`);
  }
  if (stats.warnCount) {
    chips.push(`<button type="button" class="health-chip warn${logQuickFilter === 'console-warns' ? ' active' : ''}" data-qf="console-warns"><span class="health-dot warn"></span>${stats.warnCount} warn</button>`);
  }
  if (stats.failedHttp) {
    chips.push(`<button type="button" class="health-chip error${logQuickFilter === 'net-failed' ? ' active' : ''}" data-qf="net-failed">${stats.failedHttp} failed HTTP</button>`);
  }
  if (stats.payloadCount) {
    chips.push(`<button type="button" class="health-chip${logQuickFilter === 'net-payload' ? ' active' : ''}" data-qf="net-payload">${stats.payloadCount} with payload</button>`);
  }
  
  // 4. Chip de captura (si aplica)
  const captureStatus = getCaptureDisplayStatus(stats);
  if (captureStatus.show) {
    chips.push(`<span class="health-chip ${captureStatus.className}" title="${esc(captureStatus.title)}">${captureStatus.label}</span>`);
  }

  el.innerHTML = chips.join('');
  el.hidden = false;
}

function seekVideoFromNetworkTimeline(targetEl, clientX, scaleMs) {
  const dur = resolveVideoDuration() || sessionDurationHint || 0;
  if (dur <= 0 || !scaleMs || scaleMs <= 0 || !targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  const style = getComputedStyle(targetEl);
  const padL = parseFloat(style.paddingLeft) || 0;
  const padR = parseFloat(style.paddingRight) || 0;
  const innerW = rect.width - padL - padR;
  if (innerW <= 0) return;
  const x = clientX - rect.left - padL;
  const ratio = Math.min(1, Math.max(0, x / innerW));
  const targetSec = (ratio * scaleMs) / 1000;
  const clamped = Math.min(dur, Math.max(0, targetSec));
  videoPlayer.currentTime = clamped;
  updatePlayerTimeUi();
  syncLogsToVideo(clamped, { forceFull: true });
  redrawAnnotationOverlay();
}

function buildMarkdownReport({ redact = false } = {}) {
  const scrub = (s) => (redact ? redactText(String(s ?? '')) : String(s ?? ''));
  const meta = sessionData?.metadata || {};
  const stats = getSessionStats();
  const fullUrl = scrub(meta.url || '—');
  const generalUrl = toGeneralSiteUrl(fullUrl);
  const lines = [];
  lines.push('# BugPack Report');
  lines.push('');
  lines.push(`- **File:** ${loadedPackage?.fileName || '—'}`);
  lines.push(`- **Site URL:** ${generalUrl}`);
  if (fullUrl !== generalUrl) lines.push(`- **Recorded page:** ${fullUrl}`);
  lines.push(`- **Recorded at:** ${meta.timestamp ? new Date(meta.timestamp).toLocaleString() : '—'}`);
  lines.push(`- **Duration:** ${formatDurationShort(stats.dur)}`);
  lines.push(`- **User agent:** ${scrub((meta.userAgent || '—').replace(/\s+/g, ' ').trim())}`);
  if (stats.captureNote) {
    const captureStatus = getCaptureDisplayStatus(stats);
    lines.push(`- **Capture:** ${captureStatus.label || (stats.debuggerAttached ? 'Full (debugger)' : 'Partial')}`);
    lines.push(`- **Capture note:** ${stats.captureNote}`);
  }
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Console errors: **${stats.errorCount}**`);
  lines.push(`- Console warnings: **${stats.warnCount}**`);
  lines.push(`- Failed HTTP: **${stats.failedHttp}**`);
  lines.push(`- Requests with payload: **${stats.payloadCount}**`);
  lines.push(`- Annotations: **${annotations.length}**`);
  lines.push('');

  const errors = (sessionEvents.console || []).filter(e => e.type === 'error');
  if (errors.length) {
    lines.push('## Console errors');
    errors.slice(0, 20).forEach(ev => {
      const t = eventOffsetSec(ev, sessionEvents.timelineStart).toFixed(1);
      lines.push(`### +${t}s`);
      lines.push('```');
      lines.push(scrub(String(ev.text || '')).slice(0, 2000));
      lines.push('```');
      if (ev.url) lines.push(`Source: ${scrub(ev.url)}${ev.line ? `:${ev.line}` : ''}`);
      lines.push('');
    });
    if (errors.length > 20) lines.push(`_… and ${errors.length - 20} more errors_`);
    lines.push('');
  }

  const failed = (sessionEvents.network || []).filter(e => !e.isWebSocket && e.status >= 400);
  if (failed.length) {
    lines.push('## Failed HTTP requests');
    failed.slice(0, 25).forEach(ev => {
      const t = eventOffsetSec(ev, sessionEvents.timelineStart).toFixed(1);
      lines.push(`- **+${t}s** \`${ev.method || 'GET'}\` ${ev.status || '—'} ${scrub(ev.url || '—')}`);
      const req = getRequestPayload(ev);
      if (req) lines.push(`  - Request: \`${scrub(String(req)).slice(0, 240).replace(/\n/g, ' ')}\`${ev.postDataTruncated ? ' (truncated)' : ''}`);
      if (ev.responseBody && !ev.responseBodyError) {
        const preview = ev.responseBodyEncoding === 'base64'
          ? '(binary/base64 body)'
          : scrub(String(ev.responseBody)).slice(0, 240).replace(/\n/g, ' ');
        lines.push(`  - Response: \`${preview}\`${ev.responseBodyTruncated ? ' (truncated)' : ''}`);
      }
    });
    if (failed.length > 25) lines.push(`_… and ${failed.length - 25} more failed requests_`);
    lines.push('');
  }

  const notes = annotations.filter(a => a.text || a.type === 'note');
  if (notes.length) {
    lines.push('## Annotations');
    notes.forEach(ann => {
      lines.push(`- **${formatTime(ann.videoTimeSec || 0)}** ${scrub(ann.text || ann.type)}`);
    });
    lines.push('');
  }

  lines.push('---');
  lines.push('_Generated by BugPack Viewer (local)_');
  return lines.join('\n');
}

async function doCopyReport(redact) {
  const md = buildMarkdownReport({ redact });
  await navigator.clipboard.writeText(md);
  const btn = document.getElementById('btn-copy-report');
  if (btn) {
    const prev = btn.textContent;
    btn.textContent = redact ? 'Copied (redacted)!' : 'Copied!';
    setTimeout(() => { btn.textContent = prev; }, 1400);
  }
}

async function copyBugReport() {
  const scan = scanCurrentSessionPii();
  if (scan.totalMatches > 0) {
    openPiiExportModal(scan);
    return;
  }
  try {
    await doCopyReport(false);
  } catch {
    alert('Could not copy report to clipboard.');
  }
}

async function confirmPiiExportCopy() {
  const redact = document.getElementById('pii-export-redact')?.checked !== false;
  closePiiExportModal();
  try {
    await doCopyReport(redact);
  } catch {
    alert('Could not copy report to clipboard.');
  }
}

async function confirmPiiExportCopyRaw() {
  closePiiExportModal();
  try {
    await doCopyReport(false);
  } catch {
    alert('Could not copy report to clipboard.');
  }
}

function setupSessionInsights() {
  document.getElementById('btn-copy-report')?.addEventListener('click', copyBugReport);
  document.getElementById('btn-redact-pii')?.addEventListener('click', () => {
    setPiiRedactLive(!piiRedactLive);
  });
  document.getElementById('pii-export-redact')?.addEventListener('change', () => {
    syncPiiExportConfirmState();
  });
  document.getElementById('pii-export-close')?.addEventListener('click', closePiiExportModal);
  document.getElementById('pii-export-cancel')?.addEventListener('click', closePiiExportModal);
  document.getElementById('pii-export-confirm')?.addEventListener('click', confirmPiiExportCopy);
  document.getElementById('pii-export-raw')?.addEventListener('click', confirmPiiExportCopyRaw);
  document.getElementById('pii-export-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'pii-export-backdrop') closePiiExportModal();
  });
  document.getElementById('log-quick-filters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.log-quick-btn[data-qf]');
    if (!btn) return;
    applyLogQuickFilter(btn.dataset.qf);
  });
  document.getElementById('meta-health')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.health-chip[data-qf]');
    if (!chip) return;
    applyLogQuickFilter(chip.dataset.qf);
  });
  document.getElementById('list-network')?.addEventListener('click', (e) => {
    if (e.target.closest('.net-bar')) return;
    const ruler = e.target.closest('.net-ruler-track');
    const lane = e.target.closest('.net-waterfall-lane');
    const lanes = e.target.closest('.net-waterfall-lanes');
    if (!ruler && !lane && !lanes) return;
    const area = e.target.closest('.net-timeline-area');
    if (!area) return;
    const scaleMs = Number(area.dataset.scaleMs);
    if (!scaleMs) return;
    const seekTarget = ruler || lane || lanes;
    seekVideoFromNetworkTimeline(seekTarget, e.clientX, scaleMs);
  });
}

function passesLogQuickFilterConsole(ev) {
  if (logQuickFilter === 'console-errors') return ev.type === 'error';
  if (logQuickFilter === 'console-warns') return ev.type === 'warn' || ev.type === 'warning';
  if (logQuickFilter === 'net-failed' || logQuickFilter === 'net-xhr' || logQuickFilter === 'net-payload') return false;
  return true;
}

function passesLogQuickFilterNetwork(ev) {
  if (logQuickFilter === 'console-errors' || logQuickFilter === 'console-warns') return false;
  if (logQuickFilter === 'net-failed') return !ev.isWebSocket && ev.status >= 400;
  if (logQuickFilter === 'net-xhr') return getRequestCategory(ev) === 'xhr';
  if (logQuickFilter === 'net-payload') return hasCapturedPayload(ev);
  return true;
}

function renderConsole(events, timelineStart, maxVideoSec = Infinity) {
  const list = document.getElementById('list-console');
  const countEl = document.getElementById('count-console');
  list.innerHTML = '';

  if (!events.length) {
    list.innerHTML = '<div class="empty-state">No console events recorded</div>';
    countEl.textContent = '0';
    return;
  }

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const quickFiltered = sorted.filter(passesLogQuickFilterConsole);
  const visible = quickFiltered.filter(ev => eventOffsetSec(ev, timelineStart) <= maxVideoSec + 0.05);
  const errorCount = sorted.filter(e => e.type === 'error').length;
  
  countEl.textContent = visible.length === quickFiltered.length
    ? String(quickFiltered.length)
    : `${visible.length}/${quickFiltered.length}`;
  if (errorCount > 0) countEl.classList.add('has-errors');
  else countEl.classList.remove('has-errors');

  if (!visible.length) {
    list.innerHTML = quickFiltered.length
      ? '<div class="empty-state">Events will appear as the video plays</div>'
      : '<div class="empty-state">No console events match the current filter</div>';
    return;
  }

  visible.forEach(ev => {
    const elapsed = eventOffsetSec(ev, timelineStart);
    const elapsedStr = elapsed.toFixed(1);
    const type = ev.type || 'log';
    const badgeClass = { error:'badge-error', warn:'badge-warn', warning:'badge-warn', info:'badge-info', log:'badge-log' }[type] || 'badge-log';
    const item = document.createElement('div');
    item.className = `log-item ${type === 'error' ? 'error' : type === 'warn' ? 'warn' : ''}`;
    
    // AGREGAMOS EL TÍTULO Y EL CURSOR PARA INDICAR QUE SE PUEDE HACER CLIC
    item.style.cursor = 'pointer';
    item.title = `Haz clic para saltar al segundo ${elapsedStr}s del video`;
    
    item.innerHTML = `
      <span class="log-time">+${elapsedStr}s</span>
      <span class="log-badge ${badgeClass}">${type}</span>
      <div>
        <div class="log-text">${formatLogText(ev.text || '')}</div>
        ${ev.url ? `<div class="log-url">${esc(ev.url)}${ev.line ? ':' + ev.line : ''}</div>` : ''}
      </div>`;
      
    // EL EVENTO MÁGICO: AL HACER CLIC, SALTA AL VIDEO
    item.addEventListener('click', (e) => {
      // Evitamos que el clic se propague si se hace clic en un botón de copiar
      if (e.target.closest('.copy-btn')) return;
      
      // Saltamos al segundo exacto
      videoPlayer.currentTime = elapsed;
      videoPlayer.pause(); // Pausamos para que el QA pueda analizar el frame
      updatePlayerTimeUi();
      syncLogsToVideo(elapsed, { forceFull: true });
      redrawAnnotationOverlay();
      
      // Hacemos un pequeño efecto visual para saber qué log se clickeó
      document.querySelectorAll('.log-item').forEach(el => el.classList.remove('selected-log'));
      item.classList.add('selected-log');
    });

    list.appendChild(item);
  });
}
function getNetworkDurationMs(ev) {
  if (ev.wsClosedTimestamp && ev.timestamp) return ev.wsClosedTimestamp - ev.timestamp;
  if (ev.lastFrameTimestamp && ev.timestamp) return ev.lastFrameTimestamp - ev.timestamp;
  if (ev.durationMs) return ev.durationMs;
  if (ev.responseTimestamp && ev.timestamp) return ev.responseTimestamp - ev.timestamp;
  return ev.isWebSocket ? 0 : 120;
}
function isWebSocketEvent(ev) {
  return ev.isWebSocket || (ev.resourceType || '').toLowerCase() === 'websocket';
}

function getNetworkDetailTabs(ev) {
  if (isWebSocketEvent(ev)) {
    return ['headers', 'messages', 'initiator', 'timing', 'cookies'];
  }
  const tabs = ['headers', 'payload', 'preview', 'response', 'initiator', 'timing', 'cookies'];
  if (!hasCapturedPayload(ev)) {
    return tabs.filter(t => t !== 'payload');
  }
  return tabs;
}
function getTimelineScaleMs(events, timelineStart, playheadSec) {
  const ends = events.map(ev => eventOffsetSec(ev, timelineStart) * 1000 + getNetworkDurationMs(ev));
  const maxEvent = ends.length ? Math.max(...ends) : 0;
  const videoDurMs = resolveVideoDuration() * 1000;
  return Math.max(playheadSec * 1000, maxEvent, videoDurMs, 200);
}

function pickRulerStepMs(scaleMs) {
  const steps = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000];
  const targetTicks = 8;
  return steps.find(s => scaleMs / s <= targetTicks) || steps[steps.length - 1];
}

function buildRulerTicks(scaleMs) {
  const step = pickRulerStepMs(scaleMs);
  const ticks = [];
  for (let ms = 0; ms <= scaleMs; ms += step) ticks.push(ms);
  if (ticks[ticks.length - 1] < scaleMs) ticks.push(scaleMs);
  return { step, ticks };
}

function formatRulerLabel(ms) {
  if (ms >= 1000) return (ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1) + ' s';
  return ms + ' ms';
}

function barClassForType(ev, status) {
  if (!status) return 'pending';
  if (status >= 400) return 'err';
  const kind = getRequestBadgeKind(ev);
  if (kind === 'doc') return 'doc';
  if (kind === 'css') return 'css';
  if (kind === 'js') return 'js';
  if (kind === 'xhr') return 'fetch';
  if (kind === 'ws') return 'ws';
  if (kind === 'media') return 'media';
  return '';
}

function formatBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function highlightJsonStringCore(core, hasComma, trailWs) {
  let inner = null;
  try { inner = JSON.parse(core); } catch { inner = null; }
  const comma = hasComma ? '<span class="json-punc">,</span>' : '';
  if (typeof inner === 'string' && isOpenableUrl(inner)) {
    const url = inner.trim();
    const copyId = registerCopyText(url);
    return `<span class="json-str">"</span><a class="json-url" href="${esc(url)}" target="_blank" rel="noopener noreferrer" data-copy-id="${copyId}" title="Open · Shift+click to copy URL">${esc(url)}</a><span class="json-str">"</span>${comma}${esc(trailWs)}`;
  }
  return `<span class="json-str">${esc(core)}</span>${comma}${esc(trailWs)}`;
}

function highlightJsonTail(s) {
  const trimmed = s.trimEnd();
  const trailWs = s.slice(trimmed.length);
  const hasComma = trimmed.endsWith(',');
  const core = hasComma ? trimmed.slice(0, -1).trim() : trimmed.trim();
  if (/^"(?:\\.|[^"\\])*"$/.test(core)) {
    return highlightJsonStringCore(core, hasComma, trailWs);
  }
  if (core === 'true' || core === 'false') {
    return `<span class="json-bool">${core}</span>${hasComma ? '<span class="json-punc">,</span>' : ''}${esc(trailWs)}`;
  }
  if (core === 'null') {
    return `<span class="json-null">null</span>${hasComma ? '<span class="json-punc">,</span>' : ''}${esc(trailWs)}`;
  }
  if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(core)) {
    return `<span class="json-num">${esc(core)}</span>${hasComma ? '<span class="json-punc">,</span>' : ''}${esc(trailWs)}`;
  }
  if (/^[\[\]{}]$/.test(core.trim())) {
    return `<span class="json-punc">${esc(core)}</span>${esc(trailWs)}`;
  }
  return esc(s);
}

function highlightJsonLine(line) {
  const keyLine = line.match(/^(\s*)("(?:\\.|[^"\\])*")(\s*:\s*)(.*)$/);
  if (keyLine) {
    const [, ind, key, colon, tail] = keyLine;
    return `${esc(ind)}<span class="json-key">${esc(key)}</span><span class="json-punc">${esc(colon)}</span>${highlightJsonTail(tail)}`;
  }
  return highlightJsonTail(line);
}

function highlightJson(raw) {
  let formatted;
  try {
    formatted = typeof raw === 'string'
      ? JSON.stringify(JSON.parse(raw.trim()), null, 2)
      : JSON.stringify(raw, null, 2);
  } catch {
    return esc(String(raw ?? ''));
  }
  return formatted.split('\n').map(highlightJsonLine).join('\n');
}

function renderCodeBlock(content, { json = false, maxHeight = 280 } = {}) {
  const raw = maybeRedact(String(content ?? ''));
  const inner = json ? highlightJson(raw) : esc(raw);
  return `<div class="code-block">
    <div class="code-block-bar">${renderCopyBtn(raw, 'Copy')}</div>
    <pre class="code-pre" style="max-height:${maxHeight}px">${inner}</pre>
  </div>`;
}

function renderHeadersTable(headers) {
  if (!headers || !Object.keys(headers).length) return '';
  const displayHeaders = maybeRedactHeaders(headers);
  const rows = Object.entries(displayHeaders).map(([k, v]) =>
    `<div class="header-row"><div class="header-name">${esc(k)}</div><div class="header-value"><span class="header-value-text">${esc(v)}</span>${renderCopyBtn(v, 'Copy')}</div></div>`
  ).join('');
  return `<div class="headers-table">${rows}</div>`;
}

function renderDetailSection(title, content) {
  return `<div class="detail-section"><div class="detail-section-title">${esc(title)}</div>${content}</div>`;
}

function renderKvGrid(pairs) {
  const rows = pairs.map(([label, value]) =>
    `<div class="detail-kv-label">${esc(label)}</div><div class="detail-kv-value">${value}</div>`
  ).join('');
  return `<div class="detail-kv-grid">${rows}</div>`;
}

function formatLogText(text) {
  if (!text) return '';
  const display = maybeRedact(text);
  const trimmed = display.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    if (tryParseJson(trimmed) !== null) {
      return renderCodeBlock(trimmed, { json: true, maxHeight: 200 });
    }
  }
  return esc(display);
}

function renderHeaderRow(headers) {
  return renderHeadersTable(headers);
}

function decodeResponseBody(ev) {
  if (ev.responseBodyError) return { error: ev.responseBodyError };
  if (!ev.responseBody) return { error: 'No response body captured' };
  if (ev.responseBodyEncoding === 'base64') {
    try {
      const bin = atob(ev.responseBody);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const mime = ev.mimeType || 'application/octet-stream';
      if (mime.startsWith('image/')) {
        return { kind: 'image', dataUrl: `data:${mime};base64,${ev.responseBody}` };
      }
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      return { kind: 'text', text };
    } catch (e) {
      return { error: 'Failed to decode base64 body' };
    }
  }
  return { kind: 'text', text: ev.responseBody };
}

function tryParseJson(text) {
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text.trim()); } catch (_) { return null; }
}

function renderJsonFormatToolbar() {
  return `<div class="net-response-toolbar">
    <button type="button" class="net-response-format-btn btn${responseBodyFormatted ? ' active' : ''}" data-format="pretty">Formatted JSON</button>
    <button type="button" class="net-response-format-btn btn${!responseBodyFormatted ? ' active' : ''}" data-format="raw">Raw</button>
  </div>`;
}

function renderJsonToggleContent(text, parseText = text) {
  const json = tryParseJson(parseText);
  if (json === null) return null;
  const displayText = responseBodyFormatted ? JSON.stringify(json, null, 2) : text;
  let html = renderJsonFormatToolbar();
  html += responseBodyFormatted
    ? renderCodeBlock(displayText, { json: true })
    : renderCodeBlock(displayText);
  return html;
}

function formatPreviewContent(ev) {
  const decoded = decodeResponseBody(ev);
  if (decoded.error) return `<div class="net-detail-empty">${esc(decoded.error)}</div>`;
  const mime = (ev.mimeType || '').toLowerCase();
  const text = decoded.text || '';
  if (decoded.kind === 'image') {
    return `<img class="net-preview-img" src="${decoded.dataUrl}" alt="preview">`;
  }
  const jsonView = renderJsonToggleContent(text);
  if (jsonView) return jsonView;
  if (mime.includes('html')) {
    return `<iframe class="net-preview-frame" sandbox="" srcdoc="${esc(text)}"></iframe>`;
  }
  if (mime.startsWith('image/')) {
    return `<div class="net-detail-empty">Image preview not available for this capture</div>`;
  }
  const preview = text.slice(0, 8000);
  const suffix = text.length > 8000 ? '\n\n… truncated' : '';
  return renderCodeBlock(preview + suffix);
}

function renderTimingPanel(ev) {
  const phases = ev.timingPhases || {};
  const tableRows = [
    ['Queued / Blocked', phases.blocked],
    ['DNS lookup', phases.dns],
    ['Initial connection', phases.connect],
    ['SSL', phases.ssl],
    ['Request sent', phases.send],
    ['Waiting (TTFB)', phases.wait],
    ['Content download', phases.receive],
    ['Total', phases.total ?? ev.durationMs]
  ];

  let inner = '<table class="net-timing-table">';
  tableRows.forEach(([label, ms]) => {
    const val = ms != null && ms !== 0 ? `${ms} ms` : (label === 'Total' && ev.durationMs ? `${ev.durationMs} ms` : '—');
    inner += `<tr><td>${esc(label)}</td><td>${esc(String(val))}</td></tr>`;
  });
  inner += '</table>';

  const total = phases.total || ev.durationMs || 0;
  const segs = [
    { key: 'blocked', cls: 'blocked', ms: phases.blocked || 0 },
    { key: 'dns', cls: 'dns', ms: phases.dns || 0 },
    { key: 'connect', cls: 'connect', ms: phases.connect || 0 },
    { key: 'ssl', cls: 'ssl', ms: phases.ssl || 0 },
    { key: 'send', cls: 'send', ms: phases.send || 0 },
    { key: 'wait', cls: 'wait', ms: phases.wait || 0 },
    { key: 'receive', cls: 'receive', ms: phases.receive || 0 }
  ].filter(s => s.ms > 0);

  if (segs.length && total > 0) {
    inner += '<div class="net-timing-bar-wrap">';
    let left = 0;
    segs.forEach(seg => {
      const w = (seg.ms / total) * 100;
      inner += `<div class="net-timing-seg ${seg.cls}" style="left:${left}%;width:${w}%" title="${esc(seg.key)}: ${seg.ms}ms"></div>`;
      left += w;
    });
    inner += '</div>';
  }
  return renderDetailSection('Timing breakdown', inner);
}

function renderInitiatorPanel(ev) {
  const d = ev.initiatorDetail;
  if (!d) {
    return `<div class="net-detail-empty">Initiator: ${esc(ev.initiator || 'unknown')}</div>`;
  }
  const pairs = [['Type', esc(d.type)]];
  if (d.url) pairs.push(['Source URL', renderUrlActions(d.url)]);
  if (d.lineNumber != null) {
    pairs.push(['Position', `line ${d.lineNumber}, col ${d.columnNumber ?? 0}`]);
  }
  let html = renderDetailSection('Initiator', renderKvGrid(pairs));
  if (d.stack?.length) {
    const stackHtml = d.stack.map(frame => {
      const url = frame.url || '';
      const loc = `${url || '—'}:${frame.lineNumber ?? 0}:${frame.columnNumber ?? 0}`;
      const locHtml = isOpenableUrl(url)
        ? `<a class="url-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(loc)}</a>`
        : esc(loc);
      return `<div class="net-stack-item">
        <div class="net-stack-fn">${esc(frame.functionName)}</div>
        <div class="net-stack-loc">${locHtml} ${renderCopyBtn(loc, 'Copy')}</div>
      </div>`;
    }).join('');
    html += renderDetailSection('Call stack', stackHtml);
  }
  return html;
}

function renderCookiesPanel(ev) {
  const cookies = ev.cookies || {};
  let html = '';
  if (cookies.request) {
    const items = cookies.request.split(';').map(part => {
      const trimmed = part.trim();
      return trimmed ? `<div class="net-cookie-item">${esc(trimmed)}</div>` : '';
    }).join('');
    html += renderDetailSection('Request cookies', items || '<div class="net-detail-empty">No request cookies</div>');
  } else {
    html += renderDetailSection('Request cookies', '<div class="net-detail-empty">No request cookies</div>');
  }
  const responseHtml = cookies.response?.length
    ? cookies.response.map(c => `<div class="net-cookie-item">${esc(c)}</div>`).join('')
    : '<div class="net-detail-empty">No Set-Cookie headers</div>';
  html += renderDetailSection('Set-Cookie (response)', responseHtml);
  return html;
}

function renderPayloadBodySection(title, text, { truncated = false, error = null } = {}) {
  if (error) {
    return renderDetailSection(title, `<div class="net-detail-empty">${esc(error)}</div>`);
  }
  if (!text) {
    return renderDetailSection(title, '<div class="net-detail-empty">No body captured</div>');
  }
  const isJson = tryParseJson(text) !== null;
  let body = isJson ? renderCodeBlock(text, { json: true }) : renderCodeBlock(text);
  if (truncated) body += '<div class="net-detail-empty">Body truncated in recording</div>';
  return renderDetailSection(title, body);
}

function renderPayloadPanel(ev) {
  const req = getRequestPayload(ev);
  let html = '';
  if (req || ev.hasPostData) {
    html += renderPayloadBodySection('Request payload', req, {
      truncated: ev.postDataTruncated || ev.requestBodyTruncated,
      error: !req && ev.hasPostData ? (ev.postDataError || 'Request body indicated but not captured') : null
    });
  }
  const decoded = decodeResponseBody(ev);
  if (decoded.error) {
    html += renderDetailSection('Response payload', `<div class="net-detail-empty">${esc(decoded.error)}</div>`);
  } else if (decoded.kind === 'image') {
    html += renderDetailSection('Response payload', `<img class="net-preview-img" src="${decoded.dataUrl}" alt="response">`);
  } else {
    const text = decoded.text || '';
    const jsonView = renderJsonToggleContent(text);
    html += renderDetailSection('Response payload', jsonView || renderCodeBlock(text));
    if (ev.responseBodyTruncated) {
      html += '<div class="net-detail-empty">Response body truncated in recording</div>';
    }
  }
  if (!html) {
    html = '<div class="net-detail-empty">No request or response payload captured for this entry</div>';
  }
  return html;
}

function renderHeadersPanel(ev, method, url) {
  const statusBadge = ev.status >= 400
    ? `<span style="color:var(--red)">${esc(String(ev.status))}</span>`
    : `<span style="color:var(--green)">${esc(String(ev.status || '—'))}</span>`;
  const general = renderKvGrid([
    ['Request URL', renderUrlActions(url)],
    ['Method', `<span style="color:var(--blue)">${esc(getRequestBadgeLabel(getRequestBadgeKind(ev)))}</span>`],
    ['Status', `${statusBadge} ${esc(ev.statusText || '')}`],
    ['Protocol', esc(ev.protocol || '—')],
    ['Remote IP', esc(ev.remoteIPAddress || '—')],
    ['MIME type', esc(ev.mimeType || '—')],
    ...(isWebSocketEvent(ev) ? [['Messages', String((ev.wsFrames || []).length) + (ev.wsClosed ? ' (closed)' : ' (open)')]] : [])
  ]);
  let html = renderDetailSection('General', general);
  if (ev.postData || ev.requestBody) {
    const reqText = getRequestPayload(ev);
    const isJson = tryParseJson(reqText) !== null;
    html += renderDetailSection('Request payload (summary)',
      isJson ? renderCodeBlock(reqText, { json: true, maxHeight: 120 }) : renderCodeBlock(reqText, { maxHeight: 120 }));
  }
  html += renderDetailSection('Request headers',
    Object.keys(ev.requestHeaders || {}).length
      ? renderHeadersTable(ev.requestHeaders)
      : '<div class="net-detail-empty">No request headers</div>');
  html += renderDetailSection('Response headers',
    Object.keys(ev.responseHeaders || {}).length
      ? renderHeadersTable(ev.responseHeaders)
      : '<div class="net-detail-empty">No response headers</div>');
  return html;
}

function renderResponsePanel(ev) {
  const decoded = decodeResponseBody(ev);
  if (decoded.error) return `<div class="net-detail-empty">${esc(decoded.error)}</div>`;
  if (decoded.kind === 'image') {
    return `<div class="net-detail-empty">Binary image body (${formatBytes(ev.size)}) — see Preview tab</div>`;
  }
  let text = decoded.text || '';
  if (ev.responseBodyTruncated) text += '\n\n… body truncated in recording';
  const parseText = text.replace(/\n\n… body truncated in recording$/, '');
  const jsonView = renderJsonToggleContent(text, parseText);
  if (jsonView) return jsonView;
  return renderCodeBlock(text);
}

function renderWsMessagesPanel(ev) {
  const frames = ev.wsFrames || [];
  if (!frames.length) {
    return '<div class="net-detail-empty">No WebSocket messages captured during this recording</div>';
  }
  let html = '';
  if (ev.wsFramesTruncated) {
    html += '<div class="net-detail-empty">Message list truncated (frame limit reached)</div>';
  }
  if (ev.wsFrameErrors?.length) {
    html += renderDetailSection('Frame errors',
      ev.wsFrameErrors.map(err => `<div class="net-cookie-item">${esc(err.message)}</div>`).join(''));
  }
  frames.forEach(frame => {
    const dirClass = frame.direction === 'sent' ? 'ws-sent' : 'ws-recv';
    const dirLabel = frame.direction === 'sent' ? 'Sent' : 'Received';
    const payload = frame.payload || '';
    const isJson = tryParseJson(payload) !== null;
    html += `<div class="ws-frame ${dirClass}">
      <div class="ws-frame-meta">
        <span class="ws-frame-dir">${dirLabel}</span>
        <span class="ws-frame-opcode">${esc(frame.opcodeLabel || '')}</span>
        ${frame.payloadTruncated ? '<span class="ws-frame-trunc">truncated</span>' : ''}
        ${payload ? renderCopyBtn(payload, 'Copy') : ''}
      </div>
      ${payload
        ? (isJson ? renderCodeBlock(payload, { json: true, maxHeight: 140 }) : renderCodeBlock(payload, { maxHeight: 140 }))
        : '<div class="net-detail-empty" style="padding:8px 10px">Empty frame</div>'}
    </div>`;
  });
  return html;
}

const ALL_NET_DETAIL_TABS = ['headers', 'preview', 'response', 'messages', 'initiator', 'timing', 'cookies'];

function renderNetworkDetailPanel(ev, method, url, activeTab) {
  const tabsList = getNetworkDetailTabs(ev);
  const tab = tabsList.includes(activeTab) ? activeTab : tabsList[0];
  const tabs = tabsList.map(t =>
    `<button type="button" class="net-detail-tab${tab === t ? ' active' : ''}" data-tab="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>`
  ).join('');

  let body = '';
  if (tab === 'headers') body = renderHeadersPanel(ev, method, url);
  else if (tab === 'payload') body = renderPayloadPanel(ev);
  else if (tab === 'messages') body = renderWsMessagesPanel(ev);
  else if (tab === 'preview') body = formatPreviewContent(ev);
  else if (tab === 'response') body = renderResponsePanel(ev);
  else if (tab === 'initiator') body = renderInitiatorPanel(ev);
  else if (tab === 'timing') body = renderTimingPanel(ev);
  else if (tab === 'cookies') body = renderCookiesPanel(ev);
  else body = renderHeadersPanel(ev, method, url);

  return `<div class="net-detail-tabs">${tabs}</div><div class="net-detail-body">${body}</div>`;
}

function getNetworkRowId(ev) {
  return ev.requestId || `net-${ev.timestamp}-${(ev.url || '').slice(0, 48)}`;
}

function extractShortPath(url) {
  if (!url) return '—';
  try {
    const u = new URL(url);
    let path = u.pathname + u.search;
    if (path.length > 52) path = path.slice(0, 49) + '…';
    return path || '/';
  } catch {
    const raw = String(url).split('?')[0];
    if (raw.length > 52) return raw.slice(0, 49) + '…';
    return raw || '—';
  }
}

function getRequestCategory(ev) {
  if (isWebSocketEvent(ev)) return 'websocket';
  const t = (ev.resourceType || '').toLowerCase();
  const url = (ev.url || '').toLowerCase();
  const mime = (ev.mimeType || '').toLowerCase();
  if (t === 'image' || mime.startsWith('image/') || url.startsWith('data:image')
    || /\.(png|jpe?g|gif|webp|svg|ico|avif|bmp)(\?|$)/i.test(url.split('?')[0])) return 'image';
  if (t === 'media' || mime.startsWith('video/') || mime.startsWith('audio/')) return 'media';
  if (t === 'script' || mime.includes('javascript')) return 'script';
  if (t === 'stylesheet' || mime.includes('text/css') || /\.css(\?|$)/i.test(url.split('?')[0])) return 'stylesheet';
  if (t === 'font' || mime.includes('font')) return 'font';
  if (t === 'xhr' || t === 'fetch') return 'xhr';
  if (t === 'document' || mime.includes('text/html')) return 'document';
  return 'other';
}

function getRequestBadgeKind(ev) {
  const cat = getRequestCategory(ev);
  const kindByCategory = {
    websocket: 'ws',
    image: 'media',
    media: 'media',
    script: 'js',
    stylesheet: 'css',
    font: 'font',
    xhr: 'xhr',
    document: 'doc',
    other: 'other'
  };
  return kindByCategory[cat] || 'other';
}

function getRequestBadgeLabel(kind) {
  const labels = {
    ws: 'WS',
    media: 'MEDIA',
    css: 'CSS',
    js: 'JS',
    font: 'FONT',
    xhr: 'XHR',
    doc: 'DOC',
    http: 'HTTP',
    other: 'OTHER'
  };
  return labels[kind] || 'OTHER';
}

function passesNetworkFilter(ev) {
  const cat = getRequestCategory(ev);
  const map = {
    image: 'showImages',
    script: 'showScripts',
    stylesheet: 'showStyles',
    font: 'showFonts',
    media: 'showMedia',
    xhr: 'showXHR',
    websocket: 'showWebSocket',
    document: 'showOther',
    other: 'showOther'
  };
  const key = map[cat] || 'showOther';
  if (!passesLogQuickFilterNetwork(ev)) return false;
  return networkFilterState[key] !== false;
}

function buildNetworkLabels(events) {
  const labels = new Map();
  events.forEach(ev => {
    const key = getNetworkRowId(ev);
    const kind = getRequestBadgeKind(ev);
    labels.set(key, {
      id: getRequestBadgeLabel(kind),
      path: extractShortPath(ev.url),
      kind
    });
  });
  return labels;
}

function buildNetworkFilterBar() {
  const bar = document.createElement('div');
  bar.className = 'net-filter-bar';
  const items = [
    ['showImages', 'Images'],
    ['showScripts', 'Scripts'],
    ['showStyles', 'CSS'],
    ['showFonts', 'Fonts'],
    ['showMedia', 'Media'],
    ['showXHR', 'XHR/Fetch'],
    ['showWebSocket', 'WebSocket'],
    ['showOther', 'Other']
  ];
  items.forEach(([key, label]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `net-filter-btn${networkFilterState[key] ? ' active' : ''}`;
    btn.textContent = label;
    btn.title = networkFilterState[key] ? `Hide ${label}` : `Show ${label}`;
    btn.addEventListener('click', () => {
      networkFilterState[key] = !networkFilterState[key];
      syncLogsToVideo(undefined, { forceFull: true });
    });
    bar.appendChild(btn);
  });
  return bar;
}

function renderNetworkNameCell(ev, label) {
  const fullUrl = ev.url || '—';
  const kind = label?.kind || getRequestBadgeKind(ev);
  const id = label?.id || getRequestBadgeLabel(kind);
  const path = label?.path || extractShortPath(fullUrl);
  return `<div class="net-name-cell" title="${esc(fullUrl)}">
    <span class="net-req-id ${kind}">${esc(id)}</span>
    <span class="net-name-path">${esc(path)}</span>
    ${hasCapturedPayload(ev) ? '<span class="net-payload-badge">payload</span>' : ''}
    ${fullUrl && fullUrl !== '—' ? renderCopyBtn(fullUrl, '⎘') : ''}
  </div>`;
}

function saveNetworkScrollState(listEl) {
  const list = listEl || document.getElementById('list-network');
  if (!list) return null;
  return {
    listScroll: list.scrollTop,
    viewScroll: list.querySelector('.net-view')?.scrollTop ?? 0,
    lanesScroll: list.querySelector('.net-waterfall-lanes')?.scrollTop ?? 0,
    detailScroll: list.querySelector('.net-row.open .net-detail-body')?.scrollTop ?? 0
  };
}

function restoreNetworkScrollState(listEl, state) {
  if (!state) return;
  const list = listEl || document.getElementById('list-network');
  if (!list) return;
  requestAnimationFrame(() => {
    list.scrollTop = state.listScroll;
    const view = list.querySelector('.net-view');
    if (view) view.scrollTop = state.viewScroll;
    const lanes = list.querySelector('.net-waterfall-lanes');
    if (lanes) lanes.scrollTop = state.lanesScroll;
    const detail = list.querySelector('.net-row.open .net-detail-body');
    if (detail) detail.scrollTop = state.detailScroll;
  });
}

function findNetworkEventByRowId(rowId) {
  return sessionEvents.network.find(ev => getNetworkRowId(ev) === rowId);
}

function attachDetailPanelHandlers(row, rowId) {
  row.querySelectorAll('.net-detail-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      expandedNetworkTab = btn.dataset.tab;
      refreshOpenNetworkDetail();
    });
  });
  row.querySelectorAll('.net-response-format-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      responseBodyFormatted = btn.dataset.format === 'pretty';
      refreshOpenNetworkDetail();
    });
  });
}

function refreshOpenNetworkDetail() {
  if (!expandedNetworkId) return;
  const list = document.getElementById('list-network');
  const scrollState = saveNetworkScrollState(list);
  const row = list?.querySelector('.net-row.open');
  const ev = findNetworkEventByRowId(expandedNetworkId);
  if (!row || !ev) {
    syncLogsToVideo();
    return;
  }
  const detail = row.querySelector('.net-detail');
  if (!detail) return;
  const method = (ev.method || 'GET').toUpperCase();
  const url = ev.url || '—';
  detail.innerHTML = renderNetworkDetailPanel(ev, method, url, expandedNetworkTab);
  attachDetailPanelHandlers(row, expandedNetworkId);
  restoreNetworkScrollState(list, scrollState);
}

function scrollToNetworkRow(rowId) {
  if (!rowId) return;
  requestAnimationFrame(() => {
    const item = document.querySelector(`.net-item[data-id="${CSS.escape(rowId)}"]`);
    item?.closest('.net-row')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    document.querySelector(`.net-waterfall-lane[data-id="${CSS.escape(rowId)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function toggleNetworkRequest(rowId, forceOpen) {
  if (forceOpen) {
    expandedNetworkId = rowId;
  } else {
    expandedNetworkId = expandedNetworkId === rowId ? null : rowId;
  }
  if (expandedNetworkId === rowId && !ALL_NET_DETAIL_TABS.includes(expandedNetworkTab)) {
    expandedNetworkTab = 'headers';
  }
  syncLogsToVideo(undefined, { forceFull: true });
  if (expandedNetworkId === rowId) scrollToNetworkRow(rowId);
}

function attachNetworkRowHandlers(row, rowId) {
  row.querySelector('.net-item')?.addEventListener('click', () => toggleNetworkRequest(rowId));
  attachDetailPanelHandlers(row, rowId);
}

function buildNetworkTimeline(scaleMs, playheadPct, ticks, visible, timelineStart, labels) {
  const area = document.createElement('div');
  area.className = 'net-timeline-area';
  area.dataset.scaleMs = String(scaleMs);

  const track = document.createElement('div');
  track.className = 'net-ruler-track';
  track.title = 'Click to seek to a time';
  ticks.forEach(ms => {
    const tick = document.createElement('span');
    tick.className = 'net-ruler-tick';
    tick.style.left = `${(ms / scaleMs) * 100}%`;
    tick.textContent = formatRulerLabel(ms);
    track.appendChild(tick);
  });
  const rulerPlayhead = document.createElement('div');
  rulerPlayhead.className = 'net-ruler-playhead';
  rulerPlayhead.style.left = `${playheadPct}%`;
  track.appendChild(rulerPlayhead);
  area.appendChild(track);

  const lanes = document.createElement('div');
  lanes.className = 'net-waterfall-lanes';
  visible.forEach((ev) => {
    lanes.appendChild(createWaterfallLaneElement(ev, labels, timelineStart, scaleMs, playheadPct));
  });
  area.appendChild(lanes);
  return area;
}

function getNetworkVisibleData(timelineStart, maxVideoSec) {
  const sorted = [...sessionEvents.network].sort((a, b) => a.timestamp - b.timestamp);
  const labels = buildNetworkLabels(sorted);
  const filtered = sorted.filter(passesNetworkFilter);
  const visible = filtered.filter(ev => eventOffsetSec(ev, timelineStart) <= maxVideoSec + 0.05);
  const scaleMs = getTimelineScaleMs(filtered, timelineStart, maxVideoSec);
  const playheadPct = Math.min((maxVideoSec * 1000 / scaleMs) * 100, 100);
  return { sorted, labels, filtered, visible, scaleMs, playheadPct };
}

function updateNetworkCountDisplay(sorted, filtered, visible) {
  const countEl = document.getElementById('count-network');
  if (!countEl) return;
  const errorCount = filtered.filter(e => e.status >= 400).length;
  const hiddenCount = sorted.length - filtered.length;
  if (hiddenCount > 0) {
    countEl.textContent = visible.length === filtered.length
      ? `${filtered.length}/${sorted.length}`
      : `${visible.length}/${filtered.length} (${sorted.length})`;
  } else {
    countEl.textContent = visible.length === sorted.length
      ? String(sorted.length)
      : `${visible.length}/${sorted.length}`;
  }
  countEl.classList.toggle('has-errors', errorCount > 0);
}

function createWaterfallLaneElement(ev, labels, timelineStart, scaleMs, playheadPct) {
  const rowId = getNetworkRowId(ev);
  const label = labels.get(rowId);
  const offsetMs = eventOffsetSec(ev, timelineStart) * 1000;
  const durMs = getNetworkDurationMs(ev);
  const leftPct = (offsetMs / scaleMs) * 100;
  const widthPct = Math.max((durMs / scaleMs) * 100, 0.3);
  const barClass = barClassForType(ev, ev.status || 0);
  const lane = document.createElement('div');
  lane.className = `net-waterfall-lane${expandedNetworkId === rowId ? ' active' : ''}`;
  lane.dataset.id = rowId;
  lane.title = label ? `${label.id} ${label.path}` : (ev.url || '');
  lane.innerHTML = `
    <div class="net-playhead" style="left:${playheadPct}%"></div>
    <div class="net-bar ${barClass}" style="left:${leftPct}%;width:${widthPct}%"></div>`;
  lane.querySelector('.net-bar')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNetworkRequest(rowId, true);
  });
  return lane;
}

function createNetworkRowElement(ev, labels) {
  const durMs = getNetworkDurationMs(ev);
  const status = ev.status || 0;
  const method = (ev.method || 'GET').toUpperCase();
  const statusClass = status >= 500 ? 'status-5xx' : status >= 400 ? 'status-4xx' : status >= 300 ? 'status-3xx' : status >= 200 ? 'status-2xx' : 'status-other';
  const url = ev.url || '—';
  const rowId = getNetworkRowId(ev);
  const label = labels.get(rowId);
  const isOpen = expandedNetworkId === rowId;
  const typeLabel = isWebSocketEvent(ev) ? 'WebSocket' : (ev.resourceType || 'other').replace(/^./, c => c.toUpperCase());
  const durLabel = durMs >= 1 ? durMs.toFixed(0) + ' ms' : '—';
  const row = document.createElement('div');
  row.className = `net-row${isOpen ? ' open' : ''}`;
  row.innerHTML = `
    <div class="net-item" data-id="${esc(rowId)}">
      ${renderNetworkNameCell(ev, label)}
      <span class="net-status ${statusClass}">${status || '…'}</span>
      <span class="net-type">${esc(typeLabel)}</span>
      <span class="net-initiator" title="${esc(ev.initiator || '')}">${esc(ev.initiator || '—')}</span>
      <span class="net-size">${formatBytes(ev.size)}</span>
      <span class="net-dur">${durLabel}</span>
    </div>
    <div class="net-detail">${isOpen ? renderNetworkDetailPanel(ev, method, url, expandedNetworkTab) : ''}</div>`;
  attachNetworkRowHandlers(row, rowId);
    // AGREGAMOS EL EVENTO PARA SALTAR AL VIDEO EN LA RED
  row.querySelector('.net-item')?.addEventListener('click', (e) => {
    // Evitamos que salte si se hace clic en un botón de copiar
    if (e.target.closest('.copy-btn')) return;
    
    const offset = eventOffsetSec(ev, sessionEvents.timelineStart);
    videoPlayer.currentTime = offset;
    videoPlayer.pause();
    updatePlayerTimeUi();
    syncLogsToVideo(offset, { forceFull: true });
    redrawAnnotationOverlay();
  });
  return row;
}

function refreshNetworkTimelineRuler(area, scaleMs, playheadPct) {
  const track = area.querySelector('.net-ruler-track');
  if (!track) return;
  track.querySelectorAll('.net-ruler-tick').forEach(el => el.remove());
  const playhead = track.querySelector('.net-ruler-playhead');
  const { ticks } = buildRulerTicks(scaleMs);
  ticks.forEach(ms => {
    const tick = document.createElement('span');
    tick.className = 'net-ruler-tick';
    tick.style.left = `${(ms / scaleMs) * 100}%`;
    tick.textContent = formatRulerLabel(ms);
    track.insertBefore(tick, playhead);
  });
  if (playhead) playhead.style.left = `${playheadPct}%`;
  area.dataset.scaleMs = String(scaleMs);
}

function syncWaterfallLaneGeometry(lane, ev, timelineStart, scaleMs, playheadPct) {
  const offsetMs = eventOffsetSec(ev, timelineStart) * 1000;
  const durMs = getNetworkDurationMs(ev);
  const bar = lane.querySelector('.net-bar');
  const playhead = lane.querySelector('.net-playhead');
  if (bar) {
    bar.style.left = `${(offsetMs / scaleMs) * 100}%`;
    bar.style.width = `${Math.max((durMs / scaleMs) * 100, 0.3)}%`;
  }
  if (playhead) playhead.style.left = `${playheadPct}%`;
}

function updateNetworkPlayback(maxVideoSec) {
  const list = document.getElementById('list-network');
  if (!list || !sessionEvents.network.length) return;
  const view = list.querySelector('.net-view');
  if (!view) {
    renderNetwork(sessionEvents.network, sessionEvents.timelineStart, maxVideoSec);
    return;
  }
  const timelineStart = sessionEvents.timelineStart;
  const { sorted, labels, filtered, visible, scaleMs, playheadPct } = getNetworkVisibleData(timelineStart, maxVideoSec);
  updateNetworkCountDisplay(sorted, filtered, visible);

  const visibleIds = new Set(visible.map(ev => getNetworkRowId(ev)));

  const area = list.querySelector('.net-timeline-area');
  if (area) {
    const prevScale = Number(area.dataset.scaleMs) || 0;
    if (prevScale !== scaleMs) {
      refreshNetworkTimelineRuler(area, scaleMs, playheadPct);
    } else {
      area.querySelectorAll('.net-ruler-playhead').forEach(el => {
        el.style.left = `${playheadPct}%`;
      });
    }
  }

  const lanes = list.querySelector('.net-waterfall-lanes');
  if (lanes) {
    lanes.querySelectorAll('.net-waterfall-lane').forEach(lane => {
      if (!visibleIds.has(lane.dataset.id || '')) {
        lane.remove();
      }
    });
    visible.forEach(ev => {
      const rowId = getNetworkRowId(ev);
      let lane = lanes.querySelector(`.net-waterfall-lane[data-id="${CSS.escape(rowId)}"]`);
      if (!lane) {
        lane = createWaterfallLaneElement(ev, labels, timelineStart, scaleMs, playheadPct);
        lanes.appendChild(lane);
      } else {
        lane.classList.toggle('active', expandedNetworkId === rowId);
        syncWaterfallLaneGeometry(lane, ev, timelineStart, scaleMs, playheadPct);
      }
    });
  }

  view.querySelectorAll('.net-row').forEach(row => {
    const id = row.querySelector('.net-item')?.dataset.id;
    if (id && !visibleIds.has(id)) row.remove();
  });

  const existingRowIds = new Set([...view.querySelectorAll('.net-item')].map(el => el.dataset.id));
  visible.forEach(ev => {
    const rowId = getNetworkRowId(ev);
    if (existingRowIds.has(rowId)) {
      const row = view.querySelector(`.net-item[data-id="${CSS.escape(rowId)}"]`)?.closest('.net-row');
      if (row) row.classList.toggle('open', expandedNetworkId === rowId);
      return;
    }
    view.appendChild(createNetworkRowElement(ev, labels));
  });
}

function renderNetwork(events, timelineStart, maxVideoSec = Infinity) {
  const list = document.getElementById('list-network');
  const countEl = document.getElementById('count-network');
  const scrollState = expandedNetworkId ? saveNetworkScrollState(list) : null;
  resetCopyStore();
  list.innerHTML = '';

  if (!events.length) {
    list.innerHTML = '<div class="empty-state">No network events recorded</div>';
    countEl.textContent = '0';
    return;
  }

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const { labels, filtered, visible, scaleMs, playheadPct } = getNetworkVisibleData(timelineStart, maxVideoSec);
  const errorCount = filtered.filter(e => e.status >= 400).length;
  const hiddenCount = sorted.length - filtered.length;

  if (hiddenCount > 0) {
    countEl.textContent = visible.length === filtered.length
      ? `${filtered.length}/${sorted.length}`
      : `${visible.length}/${filtered.length} (${sorted.length})`;
  } else {
    countEl.textContent = visible.length === sorted.length
      ? String(sorted.length)
      : `${visible.length}/${sorted.length}`;
  }
  countEl.classList.toggle('has-errors', errorCount > 0);

  list.appendChild(buildNetworkFilterBar());

  if (!filtered.length) {
    const msg = document.createElement('div');
    msg.className = 'empty-state';
    msg.textContent = 'All requests are hidden by filters. Enable a category above.';
    list.appendChild(msg);
    return;
  }

  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const hasFutureRequests = filtered.length > 0;
    if (!hasFutureRequests) {
      empty.textContent = 'No requests match the current filters';
    } else if (videoPlayer.paused || maxVideoSec < Infinity) {
      empty.textContent = 'No requests up to the selected time';
    } else {
      empty.textContent = 'Requests will appear as the video plays';
    }
    list.appendChild(empty);
    return;
  }

  const { ticks } = buildRulerTicks(scaleMs);

  list.appendChild(buildNetworkTimeline(scaleMs, playheadPct, ticks, visible, timelineStart, labels));

  const view = document.createElement('div');
  view.className = 'net-view';

  const head = document.createElement('div');
  head.className = 'net-table-head';
  head.innerHTML = `
    <span>Name</span>
    <span>Status</span>
    <span>Type</span>
    <span>Initiator</span>
    <span>Size</span>
    <span>Time</span>`;
  view.appendChild(head);

  visible.forEach((ev) => {
    view.appendChild(createNetworkRowElement(ev, labels));
  });

  list.appendChild(view);
  restoreNetworkScrollState(list, scrollState);
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
  window.switchTab = switchTab;
}
