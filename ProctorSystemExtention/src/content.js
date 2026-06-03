(function () {

const logger = {
  debug: (message, data) => console.debug(formatLog('debug', message, data)),
  info: (message, data) => console.info(formatLog('info', message, data)),
  warn: (message, data) => console.warn(formatLog('warn', message, data)),
  error: (message, data) => console.error(formatLog('error', message, data)),
};

function formatLog(level, message, data) {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] ${message}${data ? ` ${JSON.stringify(data)}` : ''}`;
}

const ROOT_ID = 'proctor-overlay-root';
const DEFAULT_TIMEOUT = 5000;
const STATE_KEY = '__proctorContentState__';

let rootEl = null;
let panelEl = null;
let timerHandle = null;
let sessionInfo = null;
let isCleaningUp = false;
let messageListener = null;

function getContentState() {
  const existing = window[STATE_KEY];
  if (existing && !existing.disposed) return existing;

  const state = {
    listenerAttached: false,
    disposed: false,
    offMessage: null,
  };

  window[STATE_KEY] = state;
  return state;
}

/**
 * MESSAGE PROTOCOL (Content ↔ Background):
 * 
 * SENT BY CONTENT:
 * - GET_SESSION_INFO: Request current session from background
 *   Request: { type: 'GET_SESSION_INFO', data: null }
 *   Response: { ok: true, status, session } | { ok: false, error }
 * 
 * - END_PROCTORING: Signal user clicked end button
 *   Request: { type: 'END_PROCTORING', data: { reason } }
 *   Response: { ok: true, status: 'ending' } | { ok: false, error }
 * 
 * SENT BY BACKGROUND:
 * - SESSION_UPDATED: Push session state changes
 *   Message: { type: 'SESSION_UPDATED', data: { session } }
 *   Response: { ok: true }
 * 
 * - SESSION_CLEANUP: Signal content to dispose its state (backend ended session)
 *   Message: { type: 'SESSION_CLEANUP', data: { reason } }
 *   Response: { ok: true }
 * 
 * - ENTER_FULLSCREEN: Signal content to enter fullscreen mode
 *   Message: { type: 'ENTER_FULLSCREEN', data: null }
 *   Response: { ok: true }
 */

// monitoring features initialization is now handled securely in background.js

bootstrap();
attachMainWorldBridge();

async function bootstrap() {
  const state = getContentState();

  if (state.disposed) {
    logger.warn('Content script bootstrap aborted because state is disposed');
    return;
  }

  ensureOverlay();
  attachMessageListener();

  try {
    const response = await sendToBackground('GET_SESSION_INFO', null, 10000);
    if (response?.ok && response.session) {
      sessionInfo = response.session;
      renderSession(response.session);
      startTimer(response.session.startedAt);

      logger.debug('Bootstrap complete with session', response.session.sessionId);
      return;
    }

    // Background báo không có session — tự dọn overlay tránh treo giao diện.
    logger.warn('Bootstrap: no active session from background, removing overlay', {
      responseOk: response?.ok,
      error: response?.error,
    });
    removeOverlay();
  } catch (error) {
    logger.error('Bootstrap failed', error.message);
    removeOverlay();
  }
}

/**
 * Send message to background with envelope format and automatic retry on port closure.
 * Uses same envelope structure as messaging.js for consistency.
 * @param {string} type - Message type string
 * @param {object} data - Message data payload
 * @param {number} timeout - Response timeout in ms (default 5000)
 * @returns {Promise<object>} Response from background
 */
function sendToBackground(type, data = null, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const envelope = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      source: getContentScriptSource(),
      ts: Date.now(),
      data,
    };

    let finished = false;
    let retried = false;

    const dispatch = () => {
      chrome.runtime.sendMessage(envelope, (response) => {
        if (finished) return;

        const lastErrorMessage = chrome.runtime.lastError?.message;
        if (!retried && lastErrorMessage?.includes('message port closed before a response was received')) {
          retried = true;
          logger.debug('Port closed, retrying message type:', type);
          setTimeout(dispatch, 100);
          return;
        }

        clearTimeout(timer);
        finished = true;

        if (chrome.runtime.lastError) {
          logger.error('sendToBackground failed for', type, chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          logger.debug('sendToBackground response for', type, response?.ok);
          resolve(response);
        }
      });
    };

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      logger.error('sendToBackground timeout for', type);
      reject(new Error(`sendToBackground timeout after ${timeout}ms`));
    }, timeout);

    dispatch();
  });
}

function getContentScriptSource() {
  try {
    return window.location.origin;
  } catch (error) {
    return 'content-script';
  }
}

function ensureOverlay() {
  if (document.getElementById(ROOT_ID)) {
    rootEl = document.getElementById(ROOT_ID);
    panelEl = rootEl.querySelector('[data-role="panel"]');
    return;
  }

  rootEl = document.createElement('div');
  rootEl.id = ROOT_ID;

  const panel = document.createElement('div');
  panel.className = 'proctor-panel';
  panel.dataset.role = 'panel';

  const header = document.createElement('div');
  header.className = 'proctor-header';
  header.dataset.role = 'drag-handle';

  const title = document.createElement('div');
  title.className = 'proctor-title';
  title.textContent = 'Giám sát thi';

  const badge = document.createElement('div');
  badge.className = 'proctor-badge';
  badge.textContent = 'LIVE';

  header.appendChild(title);
  header.appendChild(badge);

  const body = document.createElement('div');
  body.className = 'proctor-body';

  const createLine = (label, fieldId, defaultVal) => {
    const line = document.createElement('div');
    line.className = 'proctor-line';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'proctor-label';
    labelSpan.textContent = label;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'proctor-value';
    valueSpan.dataset.field = fieldId;
    valueSpan.textContent = defaultVal;

    line.appendChild(labelSpan);
    line.appendChild(valueSpan);
    return line;
  };

  body.appendChild(createLine('Họ và tên', 'studentName', '--'));
  body.appendChild(createLine('MSV', 'studentId', '--'));
  body.appendChild(createLine('Phòng thi', 'roomCode', '--'));

  const timer = document.createElement('div');
  timer.className = 'proctor-timer';
  timer.dataset.field = 'timer';
  timer.textContent = '00:00:00';

  const status = document.createElement('div');
  status.className = 'proctor-status';
  status.dataset.field = 'status';
  status.textContent = 'Đang khởi tạo phiên...';

  body.appendChild(timer);
  body.appendChild(status);

  const footer = document.createElement('div');
  footer.className = 'proctor-footer';

  const endBtn = document.createElement('button');
  endBtn.className = 'proctor-end-btn';
  endBtn.type = 'button';
  endBtn.dataset.role = 'end-button';
  endBtn.textContent = 'Kết thúc';

  footer.appendChild(endBtn);

  const errorDiv = document.createElement('div');
  errorDiv.className = 'proctor-error';
  errorDiv.dataset.field = 'error';
  errorDiv.hidden = true;

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);
  panel.appendChild(errorDiv);

  rootEl.appendChild(panel);
  document.documentElement.appendChild(rootEl);
  
  panelEl = panel;

  endBtn.addEventListener('click', handleEndClick);
  wireDrag(header, panelEl);
}

function attachMessageListener() {
  const state = getContentState();
  if (state.listenerAttached) return;

  messageListener = (envelope, sender, sendResponse) => {
    const { type, data } = envelope || {};

    logger.debug('Content received message type:', type);

    if (!type) {
      logger.warn('Content received malformed message', { envelope, sender });
      return false;
    }

    // Verify sender is the extension itself
    if (sender && sender.id !== chrome.runtime.id) {
      logger.warn('Content blocked message from non-extension', { sender });
      return false;
    }

    // Handle SESSION_UPDATED: Background pushes state changes
    if (type === 'SESSION_UPDATED' && data?.session) {
      logger.debug('Content received SESSION_UPDATED');
      sessionInfo = data.session;
      renderSession(data.session);
      // Respond immediately (sync)
      sendResponse({ ok: true });
      return true;
    }

    // Handle SESSION_CLEANUP: Background signals content to clean up its state
    if (type === 'SESSION_CLEANUP') {
      logger.info('Content received SESSION_CLEANUP signal, disposing state');
      // Nếu đang trong quá trình handleEndClick (isCleaningUp = true), bỏ qua —
      // handleEndClick sẽ tự dispose sau khi END_PROCTORING response về.
      if (isCleaningUp) {
        logger.debug('SESSION_CLEANUP ignored — handleEndClick in progress');
        sendResponse({ ok: true });
        return true;
      }
      removeOverlay();
      sendResponse({ ok: true });
      return true;
    }

    // Handler ENTER_FULLSCREEN đã bị loại bỏ vì background dùng chrome.windows.update để fullscreen

    logger.debug('Content no handler for message type:', type);
    return false;
  };

  chrome.runtime.onMessage.addListener(messageListener);
  state.listenerAttached = true;
  state.offMessage = () => {
    if (!messageListener) return;

    try {
      chrome.runtime.onMessage.removeListener(messageListener);
    } catch (error) {
      logger.warn('Failed to remove content message listener', error.message);
    }

    messageListener = null;
    state.listenerAttached = false;
    state.offMessage = null;
  };
}

function renderSession(session) {
  setField('studentName', session.studentName || '--');
  setField('studentId', session.studentId || '--');
  setField('roomCode', session.roomCode || '--');
  setField('status', 'Phiên giám sát đang hoạt động');
}

function startTimer(startedAt) {
  stopTimer();

  const tick = () => {
    const elapsed = Math.max(0, Date.now() - startedAt);
    const totalSeconds = Math.floor(elapsed / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    setField('timer', `${hours}:${minutes}:${seconds}`);
  };

  tick();
  timerHandle = window.setInterval(tick, 1000);
}

async function handleEndClick() {
  if (isCleaningUp) return;

  const button = rootEl?.querySelector('[data-role="end-button"]');
  if (!button) return;

  button.disabled = true;
  isCleaningUp = true;
  setField('status', 'Đang kết thúc phiên...');

  // ── PHASE 1: Xóa overlay DOM ngay để user thấy trang bình thường ──
  // Chỉ xóa DOM, KHÔNG dispose content script (listener vẫn sống để nhận response).
  removeOverlayDOM();

  // ── PHASE 2: Gửi END_PROCTORING sang background, đợi confirm rồi mới dispose ──
  // Giữ listener sống trong lúc chờ để Chrome có thể route response về.
  // Background làm fullscreen exit + blockchain — content không block vào đó.
  try {
    const response = await sendToBackground('END_PROCTORING', { reason: 'user_clicked_end' }, 35000);
    if (response?.ok !== true) {
      logger.warn('END_PROCTORING response not ok', response?.error);
    } else {
      logger.info('Background confirmed END_PROCTORING completed');
    }
  } catch (error) {
    logger.error('handleEndClick END_PROCTORING failed', error.message);
  } finally {
    // ── PHASE 3: Dispose sau khi message roundtrip xong (hoặc timeout/fail) ──
    disposeContentScript();
  }
}

function isPortClosureError(error) {
  const msg = String(error?.message || '');
  return msg.includes('message port closed') || msg.includes('sendToBackground timeout');
}

function wireDrag(handle, target) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  handle.addEventListener('pointerdown', (event) => {
    dragging = true;
    handle.setPointerCapture(event.pointerId);
    const rect = target.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
    startX = event.clientX;
    startY = event.clientY;
  });

  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return;

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const nextLeft = Math.max(0, Math.min(window.innerWidth - target.offsetWidth, originLeft + deltaX));
    const nextTop = Math.max(0, Math.min(window.innerHeight - target.offsetHeight, originTop + deltaY));

    target.style.left = `${nextLeft}px`;
    target.style.top = `${nextTop}px`;
  });

  handle.addEventListener('pointerup', () => {
    dragging = false;
  });

  handle.addEventListener('pointercancel', () => {
    dragging = false;
  });
}

function setField(name, value) {
  const node = rootEl?.querySelector(`[data-field="${name}"]`);
  if (node) node.textContent = value;
}

function showStatus(message) {
  setField('status', message);
}

function showError(message) {
  const errorNode = rootEl?.querySelector('[data-field="error"]');
  if (!errorNode) return;

  errorNode.hidden = false;
  errorNode.textContent = message;
}

function stopTimer() {
  if (timerHandle) {
    window.clearInterval(timerHandle);
    timerHandle = null;
  }
}

/**
 * Chỉ xóa DOM overlay — KHÔNG dispose listener hay state.
 * Dùng khi cần UI biến mất ngay nhưng message channel vẫn cần sống
 * (ví dụ: đang chờ response END_PROCTORING từ background).
 */
function removeOverlayDOM() {
  stopTimer();
  if (rootEl) {
    try { rootEl.remove(); } catch (_) {}
    rootEl = null;
    panelEl = null;
  }
  logger.info('Overlay DOM removed (listener still active)');
}

function removeOverlay() {
  if (rootEl !== null) {
    logger.info('Removing overlay UI');
    removeOverlayDOM();
  } else {
    logger.debug('Overlay DOM already gone, proceeding to dispose');
  }

  // Signal background to cleanup injected CSS and features
  try {
    chrome.runtime.sendMessage({ type: 'REMOVE_OVERLAY_CSS', data: null });
  } catch (_) {}

  isCleaningUp = false;
  disposeContentScript();
  logger.info('Overlay cleanup complete');
}

/**
 * Bridge: MAIN world → ISOLATED world → background.
 *
 * MAIN world (feature modules) không có chrome.runtime API nên dùng
 * window.postMessage để gửi message qua ISOLATED world (content.js).
 * Content.js nhận, forward qua chrome.runtime.sendMessage, rồi gửi
 * response ngược về MAIN world qua postMessage.
 *
 * Bảo mật: chỉ xử lý message có __proctorBridge === true và direction === 'request'.
 * Trang web không thể giả mạo vì không biết field này.
 */
function attachMainWorldBridge() {
  window.addEventListener('message', (event) => {
    // Chỉ nhận message từ cùng window (không phải iframe hay external)
    if (event.source !== window) return;
    if (event.data?.__proctorBridge !== true) return;
    if (event.data?.direction !== 'request') return;

    const { messageId, payload } = event.data;
    if (!messageId || !payload) return;

    try {
      chrome.runtime.sendMessage(payload, (response) => {
        // Tiêu thụ lastError để tránh Chrome throw unchecked error
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          logger.debug('Bridge sendMessage error', lastErr.message);
        }

        // Gửi response về MAIN world
        window.postMessage({
          __proctorBridge: true,
          direction: 'response',
          messageId,
          response: response || null,
        }, '*');
      });
    } catch (err) {
      logger.warn('Bridge sendMessage threw', err.message);
      window.postMessage({
        __proctorBridge: true,
        direction: 'response',
        messageId,
        response: null,
      }, '*');
    }
  });

  logger.debug('Main-world bridge attached');
}

function disposeContentScript() {
  const state = getContentState();
  if (state.disposed) return;

  state.disposed = true;

  if (typeof state.offMessage === 'function') {
    state.offMessage();
  }

  stopTimer();
  sessionInfo = null;
  isCleaningUp = false;
  rootEl = null;
  panelEl = null;

  try {
    delete window[STATE_KEY];
  } catch (error) {
    window[STATE_KEY] = null;
  }
}

})();