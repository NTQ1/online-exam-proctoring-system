/**
 * Camera Monitor — ISOLATED world content script
 * Dùng chrome.runtime.sendMessage trực tiếp (không cần Extension ID).
 */

const CAMERA_INTERVAL_MS = 1000;
const CAPTURE_WIDTH = 640;
const CAPTURE_HEIGHT = 480;
const FRAME_SEND_WIDTH = 416;
const FRAME_SEND_HEIGHT = 416;

const CLASS_COLORS = {
  calculator: '#f59e0b', paper: '#6366f1', person: '#22d3ee',
  phone: '#ef4444', 'student cheating': '#f97316',
};

let stream = null, videoEl = null, canvasEl = null, overlayCanvas = null;
let intervalId = null, isRunning = false, frameCounter = 0, violationCount = 0, lastDetections = [];

// ─── Messaging ──────────────────────────────────────────────────────────────

function sendMsg(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError?.message || '';
        if (err) {
          // 'Receiving end does not exist' = offscreen đã đóng, không phải bug
          if (!err.includes('Receiving end does not exist') &&
              !err.includes('message channel closed')) {
            console.warn('[CameraMonitor] sendMsg error:', err);
          }
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (err) {
      resolve(null);
    }
  });
}

// ─── DOM ─────────────────────────────────────────────────────────────────────

function createCameraSection() {
  const section = document.createElement('div');
  section.className = 'proctor-camera-section';
  section.id = '__proctor-camera-section';

  const container = document.createElement('div');
  container.className = 'proctor-camera-container';

  const video = document.createElement('video');
  video.id = '__proctor-cam-video';
  video.className = 'proctor-camera-video';
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;

  const overlay = document.createElement('canvas');
  overlay.id = '__proctor-cam-overlay';
  overlay.className = 'proctor-camera-overlay-canvas';
  overlay.width = CAPTURE_WIDTH;
  overlay.height = CAPTURE_HEIGHT;

  container.appendChild(video);
  container.appendChild(overlay);

  const badge = document.createElement('div');
  badge.id = '__proctor-ai-badge';
  badge.className = 'proctor-ai-badge';
  badge.textContent = '🤖 AI: loading model...';

  section.appendChild(container);
  section.appendChild(badge);
  return { section, video, overlay, badge };
}

// ─── Drawing ─────────────────────────────────────────────────────────────────

function drawDetections(detections) {
  if (!overlayCanvas) return;
  const ctx = overlayCanvas.getContext('2d');
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  const sx = CAPTURE_WIDTH / FRAME_SEND_WIDTH;
  const sy = CAPTURE_HEIGHT / FRAME_SEND_HEIGHT;

  for (const det of detections) {
    const color = CLASS_COLORS[det.className] || '#fff';
    const { x1, y1, x2, y2 } = det.bbox;
    const rx = x1 * sx, ry = y1 * sy, rw = (x2 - x1) * sx, rh = (y2 - y1) * sy;

    ctx.strokeStyle = color;
    ctx.lineWidth = det.isViolation ? 2.5 : 1.5;
    ctx.strokeRect(rx, ry, rw, rh);

    const label = `${det.className} ${(det.confidence * 100).toFixed(0)}%`;
    ctx.font = '10px monospace';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = color + 'cc';
    ctx.fillRect(rx, ry - 14, tw + 6, 14);
    ctx.fillStyle = '#000';
    ctx.fillText(label, rx + 3, ry - 3);
  }
}

function updateBadge(detections) {
  const badge = document.getElementById('__proctor-ai-badge');
  if (!badge) return;
  const v = detections.filter(d => d.isViolation);
  if (v.length > 0) {
    badge.style.borderColor = '#ef4444';
    badge.style.color = '#fca5a5';
    badge.textContent = `🚨 VI PHẠM: ${v.map(x => x.className).join(', ')} | tổng: ${violationCount}`;
  } else if (detections.length > 0) {
    badge.style.borderColor = '#f59e0b';
    badge.style.color = '#fde68a';
    badge.textContent = `⚠️ Phát hiện: ${detections.map(d => d.className).join(', ')}`;
  } else {
    badge.style.borderColor = 'rgba(255,255,255,0.15)';
    badge.style.color = 'rgba(255,255,255,0.7)';
    badge.textContent = `🤖 AI: đang giám sát | vi phạm=${violationCount}`;
  }
}

// ─── Frame Capture ───────────────────────────────────────────────────────────

function captureFrame() {
  if (!videoEl || videoEl.readyState < 2) return null;
  const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(videoEl, 0, 0, FRAME_SEND_WIDTH, FRAME_SEND_HEIGHT);
  return ctx.getImageData(0, 0, FRAME_SEND_WIDTH, FRAME_SEND_HEIGHT);
}

function captureSnapshot() {
  if (!videoEl || videoEl.readyState < 2) return null;
  const c = document.createElement('canvas');
  c.width = CAPTURE_WIDTH; c.height = CAPTURE_HEIGHT;
  const ctx = c.getContext('2d');
  ctx.drawImage(videoEl, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, c.height - 22, 280, 22);
  ctx.fillStyle = '#fff';
  ctx.font = '11px monospace';
  ctx.fillText(new Date().toLocaleString('vi-VN'), 4, c.height - 7);
  return c.toDataURL('image/jpeg', 0.82);
}

// ─── Inference Loop ──────────────────────────────────────────────────────────

async function processFrame() {
  // Guard: nếu monitor đã bị dừng trong khi frame đang xử lý → thoát ngay
  if (!isRunning) return;

  frameCounter++;
  const frameId = frameCounter;
  const imgData = captureFrame();
  if (!imgData || !isRunning) return;

  const response = await sendMsg({
    type: 'AI_FRAME',
    imageData: Array.from(imgData.data),
    width: FRAME_SEND_WIDTH,
    height: FRAME_SEND_HEIGHT,
    frameId,
  });

  // null response = connection đã đóng (lỗi đã được silence trong sendMsg)
  // → tự dừng vòng lặp thay vì tiếp tục gửi frame vô ích
  if (response === null) {
    console.log('[CameraMonitor] Connection lost — stopping monitor automatically');
    stopCameraMonitor();
    return;
  }
  if (!response?.ok) {
    if (frameId <= 3 || frameId % 10 === 0) {
      console.warn(`[CameraMonitor] Frame #${frameId} failed:`, response?.error || 'unknown error');
    }
    // Nếu lỗi là session đã kết thúc → dừng hẳn
    if (response?.error === 'Session ended') {
      console.log('[CameraMonitor] Session ended signal received — stopping');
      stopCameraMonitor();
    }
    return;
  }

  const detections = response.detections || [];
  lastDetections = detections;
  drawDetections(detections);
  updateBadge(detections);

  if (detections.length > 0) {
    console.groupCollapsed(`[CameraMonitor] Frame #${frameId} | ${detections.length} det`);
    detections.forEach(d => console.log(`  ${d.isViolation ? '🚨' : '📋'} ${d.className} ${(d.confidence * 100).toFixed(1)}%`));
    console.groupEnd();
  }

  const violations = detections.filter(d => d.isViolation);
  if (violations.length > 0) {
    violationCount += violations.length;
    console.warn('[CameraMonitor] 🚨 VIOLATION!', violations.map(d => d.className));
    const snapshot = captureSnapshot();
    sendMsg({
      type: 'AI_VIOLATION',
      detections: violations,
      imageDataUrl: snapshot,
      frameId,
      timestamp: Date.now(),
    });
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

async function startCameraMonitor() {
  if (isRunning) return;
  console.log('[CameraMonitor] 🎥 Starting...');

  const panel = document.querySelector('#proctor-overlay-root .proctor-panel');
  if (!panel) {
    console.warn('[CameraMonitor] Overlay panel not found, retrying in 1s...');
    setTimeout(() => startCameraMonitor(), 1000);
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: CAPTURE_WIDTH }, height: { ideal: CAPTURE_HEIGHT }, facingMode: 'user' },
      audio: false,
    });
  } catch (err) {
    console.error('[CameraMonitor] ❌ getUserMedia failed:', err.name, err.message);
    return;
  }

  const { section, video, overlay } = createCameraSection();
  videoEl = video;
  overlayCanvas = overlay;
  canvasEl = document.createElement('canvas');
  canvasEl.width = FRAME_SEND_WIDTH;
  canvasEl.height = FRAME_SEND_HEIGHT;
  canvasEl.style.display = 'none';

  videoEl.srcObject = stream;
  panel.appendChild(section);
  document.body.appendChild(canvasEl);

  await new Promise(r => { videoEl.onloadedmetadata = r; });
  await videoEl.play().catch(() => {});

  isRunning = true;
  frameCounter = 0;
  violationCount = 0;

  sendMsg({ type: 'AI_ENSURE_OFFSCREEN' }).then(res => {
    console.log('[CameraMonitor] Offscreen status:', res);
    const b = document.getElementById('__proctor-ai-badge');
    if (b && res?.ok) b.textContent = '🤖 AI: sẵn sàng';
  });

  console.log('[CameraMonitor] ✅ Started');
  intervalId = setInterval(() => processFrame().catch(console.error), CAMERA_INTERVAL_MS);
}

function stopCameraMonitor() {
  if (!isRunning) return;
  console.log('[CameraMonitor] 🛑 Stopping...');
  clearInterval(intervalId);
  intervalId = null;
  isRunning = false;
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  document.getElementById('__proctor-camera-section')?.remove();
  canvasEl?.remove();
  videoEl = canvasEl = overlayCanvas = null;
  console.log(`[CameraMonitor] Stopped. Violations=${violationCount}, Frames=${frameCounter}`);
}

// ─── Listen for cleanup signal from background ──────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'STOP_CAMERA' || message?.type === 'SESSION_CLEANUP') {
    stopCameraMonitor();
    // QUAN TRỌNG: phải gọi sendResponse để Chrome không báo 'port closed'
    // Nếu không gọi, sendToTab() ở background sẽ throw và SESSION_CLEANUP bị bỏ qua
    try { sendResponse({ ok: true }); } catch (_) {}
    return true; // giữ channel mở cho sendResponse async
  }
  return false;
});

// ─── Export & Autostart ──────────────────────────────────────────────────────

window.__cameraMonitor = { start: startCameraMonitor, stop: stopCameraMonitor, status: () => ({ isRunning, frameCounter, violationCount }) };

startCameraMonitor();
