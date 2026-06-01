const MODEL_URL = chrome.runtime.getURL('src/services/AI/model.json');
const INPUT_SIZE = 416;
const CONF_THRESH = 0.5;
const IOU_THRESH = 0.45;
const MAX_DET = 10;
const CLASS_NAMES = ['person', 'phone', 'student cheating'];

// Vi phạm gửi ảnh snapshot lên backend
const REPORT_SET = new Set(['phone', 'student cheating', 'person']);
// Chỉ log ra console
const LOG_ONLY_SET = new Set();

let model = null;
let modelReady = false;
let modelStatus = 'unloaded';

// ─── Backend ─────────────────────────────────────────────────────────────────

async function initBackend() {
  // CPU backend: không Worker, không blob URL, không eval → CSP safe
  await tf.setBackend('cpu');
  await tf.ready();
  console.log('[AI-Offscreen] ✅ Backend:', tf.getBackend());
}

// ─── Model Loading ────────────────────────────────────────────────────────────

async function loadModel() {
  if (model) return;
  modelStatus = 'loading';
  const t0 = Date.now();
  console.log('[AI-Offscreen] 🚀 Loading model:', MODEL_URL);

  try {
    await initBackend();
    model = await tf.loadGraphModel(MODEL_URL);
    modelReady = true;
    modelStatus = 'ready';
    console.log('[AI-Offscreen] ✅ Model loaded in', Date.now() - t0, 'ms');

    // Warm-up — chạy 1 lần để JIT compiler khởi động
    await runInference(new Array(INPUT_SIZE * INPUT_SIZE * 4).fill(128), INPUT_SIZE, INPUT_SIZE);
    console.log('[AI-Offscreen] ✅ Warm-up complete');
  } catch (err) {
    modelStatus = 'error';
    model = null;
    console.error('[AI-Offscreen] ❌ Model load failed:', err.message);
    // Retry sau 5 giây
    setTimeout(loadModel, 5000);
  }
}

// ─── Inference ────────────────────────────────────────────────────────────────

async function runInference(pixelArray, width, height) {
  if (!modelReady || !model) throw new Error('Model not ready');

  const t0 = performance.now();

  // Tạo ImageData từ flat pixel array
  const imgData = new ImageData(
    new Uint8ClampedArray(pixelArray),
    width,
    height
  );

  // ── Tiền xử lý ──────────────────────────────────────────────────────────
  const input = tf.tidy(() => {
    let t = tf.browser.fromPixels(imgData);
    t = tf.image.resizeBilinear(t, [INPUT_SIZE, INPUT_SIZE]);
    t = tf.cast(t, 'float32');
    t = tf.div(t, tf.scalar(255.0));
    return tf.expandDims(t, 0);
  });

  // ── Inference ───────────────────────────────────────────────────────────
  let rawOutput;
  try {
    rawOutput = model.execute(input);
  } finally {
    input.dispose();
  }

  // ── Extract tensor từ bất kỳ dạng output nào ────────────────────────────
  let outTensor;
  if (rawOutput instanceof tf.Tensor) {
    outTensor = rawOutput;
  } else if (Array.isArray(rawOutput)) {
    outTensor = rawOutput[0];
    rawOutput.slice(1).forEach(t => { if (t instanceof tf.Tensor) t.dispose(); });
  } else if (rawOutput && typeof rawOutput === 'object') {
    const vals = Object.values(rawOutput);
    outTensor = vals[0];
    vals.slice(1).forEach(t => { if (t instanceof tf.Tensor) t.dispose(); });
  } else {
    throw new Error('Unexpected model output type: ' + typeof rawOutput);
  }

  // ── Reshape output ──────────────────────────────────────────────────────
  const shape = outTensor.shape;
  console.log('[AI-Offscreen] Raw output shape:', shape);

  let data2D;
  if (shape.length === 3 && shape[1] < shape[2]) {
    data2D = tf.tidy(() => tf.squeeze(tf.transpose(outTensor, [0, 2, 1]), [0]));
  } else if (shape.length === 3) {
    data2D = tf.tidy(() => tf.squeeze(outTensor, [0]));
  } else if (shape.length === 2) {
    data2D = outTensor;
    outTensor = null;
  } else {
    outTensor.dispose();
    throw new Error('Unexpected output shape: ' + JSON.stringify(shape));
  }
  if (outTensor) outTensor.dispose();

  // ── Tách boxes & scores ─────────────────────────────────────────────────
  const numBoxes = data2D.shape[0];
  const numClasses = CLASS_NAMES.length;

  const boxes = tf.tidy(() => tf.slice(data2D, [0, 0], [numBoxes, 4]));
  const scores = tf.tidy(() => tf.slice(data2D, [0, 4], [numBoxes, numClasses]));
  data2D.dispose();

  const maxScores = tf.tidy(() => tf.max(scores, 1));
  const classIds = tf.tidy(() => tf.argMax(scores, 1));
  scores.dispose();

  // ── Lọc theo confidence threshold ───────────────────────────────────────
  const mask = tf.tidy(() => tf.greater(maxScores, tf.scalar(CONF_THRESH)));
  const indices = await tf.whereAsync(mask);
  mask.dispose();

  const idx1D = tf.tidy(() => tf.reshape(indices, [-1]));
  indices.dispose();

  // Nếu không có box nào vượt ngưỡng → trả kết quả rỗng
  const numFiltered = idx1D.shape[0];
  if (numFiltered === 0) {
    boxes.dispose(); maxScores.dispose(); classIds.dispose(); idx1D.dispose();
    const ms = (performance.now() - t0).toFixed(0);
    console.log(`[AI-Offscreen] ⚡ ${ms}ms | total=0 violations=0`);
    return [];
  }

  const filtBoxes = tf.tidy(() => tf.gather(boxes, idx1D));
  const filtScores = tf.tidy(() => tf.gather(maxScores, idx1D));
  const filtClasses = tf.tidy(() => tf.gather(classIds, idx1D));
  boxes.dispose(); maxScores.dispose(); classIds.dispose(); idx1D.dispose();

  // ── NMS ─────────────────────────────────────────────────────────────────
  const xyxyBoxes = tf.tidy(() => {
    const cx = tf.slice(filtBoxes, [0, 0], [-1, 1]);
    const cy = tf.slice(filtBoxes, [0, 1], [-1, 1]);
    const w = tf.slice(filtBoxes, [0, 2], [-1, 1]);
    const h = tf.slice(filtBoxes, [0, 3], [-1, 1]);
    const half_w = tf.div(w, 2), half_h = tf.div(h, 2);
    const y1 = tf.sub(cy, half_h), x1 = tf.sub(cx, half_w);
    const y2 = tf.add(cy, half_h), x2 = tf.add(cx, half_w);
    return tf.concat([y1, x1, y2, x2], 1);
  });

  const nmsIdx = await tf.image.nonMaxSuppressionAsync(
    xyxyBoxes, filtScores, MAX_DET, IOU_THRESH, CONF_THRESH
  );
  xyxyBoxes.dispose();

  const finalBoxTensor = tf.gather(filtBoxes, nmsIdx);
  const finalScoreTensor = tf.gather(filtScores, nmsIdx);
  const finalClassTensor = tf.gather(filtClasses, nmsIdx);

  const finalBoxArr = finalBoxTensor.arraySync();
  const finalScoreArr = finalScoreTensor.arraySync();
  const finalClassArr = finalClassTensor.arraySync();

  finalBoxTensor.dispose(); finalScoreTensor.dispose(); finalClassTensor.dispose();
  filtBoxes.dispose(); filtScores.dispose(); filtClasses.dispose(); nmsIdx.dispose();

  const ms = (performance.now() - t0).toFixed(0);

  // ── Format kết quả ──────────────────────────────────────────────────────
  const detections = finalClassArr.map((classId, i) => {
    const className = CLASS_NAMES[classId] ?? `class_${classId}`;
    const confidence = finalScoreArr[i];

    const [cx_raw, cy_raw, w_raw, h_raw] = finalBoxArr[i];

    const normCx = cx_raw / INPUT_SIZE;
    const normCy = cy_raw / INPUT_SIZE;
    const normW = w_raw / INPUT_SIZE;
    const normH = h_raw / INPUT_SIZE;

    const x1 = Math.max(0, (normCx - normW / 2) * width);
    const y1 = Math.max(0, (normCy - normH / 2) * height);
    const x2 = Math.min(width, (normCx + normW / 2) * width);
    const y2 = Math.min(height, (normCy + normH / 2) * height);

    return {
      className,
      confidence,
      bbox: { x1, y1, x2, y2 },
      isViolation: REPORT_SET.has(className),
      isLogOnly: LOG_ONLY_SET.has(className),
    };
  });

  // ── Log ─────────────────────────────────────────────────────────────────
  const violations = detections.filter(d => d.isViolation);
  console.log(`[AI-Offscreen] ⚡ ${ms}ms | total=${detections.length} violations=${violations.length}`);
  detections.forEach(d => {
    const tag = d.isViolation ? '🚨 VIOLATION' : '📋 log-only';
    console.log(`  ${tag} "${d.className}" ${(d.confidence * 100).toFixed(1)}%`);
  });

  return detections;
}

// ─── Message Handler ──────────────────────────────────────────────────────────
//
// FIX "message port closed before a response was received":
//
// Vấn đề: background dùng chrome.runtime.sendMessage() + callback để relay AI_INFERENCE.
// Chrome tự đóng one-shot message port sau ~5 giây nếu không có sendResponse,
// nhưng CPU inference có thể mất 200-800ms và kết hợp với SW latency dễ vượt ngưỡng.
//
// Giải pháp: background chuyển sang chrome.runtime.connect() (long-lived Port).
// Offscreen lắng nghe chrome.runtime.onConnect để nhận port 'ai-inference',
// chạy inference, rồi port.postMessage(result) về background.
// Port sống đến khi một bên disconnect() — không có timeout tự động của Chrome.
//
// onMessage vẫn giữ để xử lý AI_INIT_MODEL và AI_STATUS (one-shot, không async nặng).

// ── Long-lived Port listener cho AI_INFERENCE ──────────────────────────────
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ai-inference') return;

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'AI_INFERENCE') return;

    const { imageData, width, height, frameId } = msg;
    if (!imageData || !width || !height) {
      try { port.postMessage({ ok: false, error: 'Missing payload', detections: [], frameId }); } catch (_) {}
      port.disconnect();
      return;
    }

    try {
      const detections = await runInference(imageData, width, height);
      try { port.postMessage({ ok: true, detections, frameId }); } catch (_) {}
    } catch (err) {
      console.error('[AI-Offscreen] runInference error:', err.message);
      try { port.postMessage({ ok: false, error: err.message, detections: [], frameId }); } catch (_) {}
    } finally {
      // Đóng port sau mỗi inference — background tạo port mới cho frame tiếp theo.
      // Điều này giúp tránh port zombie nếu background bị suspend giữa chừng.
      try { port.disconnect(); } catch (_) {}
    }
  });

  // Nếu background disconnect trước khi gửi message (timeout phía background)
  port.onDisconnect.addListener(() => {
    // Không cần làm gì — inference sẽ tự hoàn thành hoặc bị bỏ qua
  });
});

// ── One-shot message listener cho AI_INIT_MODEL và AI_STATUS ──────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'AI_INIT_MODEL') {
    loadModel()
      .then(() => sendResponse({ ok: true, status: modelStatus }))
      .catch(err => sendResponse({ ok: false, error: err.message, status: modelStatus }));
    return true; // async sendResponse
  }

  if (msg.type === 'AI_STATUS') {
    // Đồng bộ — không cần return true
    sendResponse({ ok: true, status: modelStatus, backend: tf.getBackend() });
    return false;
  }
});

// ─── Auto-init ────────────────────────────────────────────────────────────────

console.log('[AI-Offscreen] Document loaded — initializing...');
loadModel();