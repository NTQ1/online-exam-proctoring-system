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
const STYLE_ID = 'proctor-overlay-style';
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
 */

bootstrap();

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

    showStatus(response?.error || 'Không tìm thấy phiên giám sát');
  } catch (error) {
    logger.error('Bootstrap failed', error.message);
    showStatus(error.message);
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

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
      font-family: Inter, "Segoe UI", Roboto, Arial, sans-serif;
    }
    #${ROOT_ID} .proctor-panel {
      position: fixed;
      top: 24px;
      left: 24px;
      width: 320px;
      pointer-events: auto;
      border-radius: 20px;
      background: rgba(16, 22, 34, 0.94);
      color: #fff;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(14px);
      user-select: none;
    }
    #${ROOT_ID} .proctor-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      background: linear-gradient(135deg, #ff8a3d, #ff5f6d);
      cursor: grab;
    }
    #${ROOT_ID} .proctor-header:active {
      cursor: grabbing;
    }
    #${ROOT_ID} .proctor-title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    #${ROOT_ID} .proctor-badge {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(255,255,255,0.18);
    }
    #${ROOT_ID} .proctor-body {
      padding: 14px;
      display: grid;
      gap: 10px;
    }
    #${ROOT_ID} .proctor-line {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 13px;
      line-height: 1.4;
    }
    #${ROOT_ID} .proctor-label {
      color: rgba(255,255,255,0.7);
      flex: 0 0 auto;
    }
    #${ROOT_ID} .proctor-value {
      text-align: right;
      font-weight: 600;
      word-break: break-word;
    }
    #${ROOT_ID} .proctor-timer {
      margin-top: 2px;
      padding: 12px;
      border-radius: 16px;
      background: rgba(255,255,255,0.08);
      text-align: center;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
    #${ROOT_ID} .proctor-status {
      font-size: 12px;
      color: rgba(255,255,255,0.7);
      text-align: center;
    }
    #${ROOT_ID} .proctor-footer {
      padding: 0 14px 14px;
    }
    #${ROOT_ID} .proctor-end-btn {
      width: 100%;
      border: none;
      border-radius: 14px;
      padding: 12px 14px;
      background: linear-gradient(135deg, #ff6b4a, #ff8a3d);
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    }
    #${ROOT_ID} .proctor-error {
      padding: 12px 14px 0;
      color: #ffb7b7;
      font-size: 12px;
      line-height: 1.5;
    }
  `;

  rootEl = document.createElement('div');
  rootEl.id = ROOT_ID;
  rootEl.innerHTML = `
    <div class="proctor-panel" data-role="panel">
      <div class="proctor-header" data-role="drag-handle">
        <div class="proctor-title">Giám sát thi</div>
        <div class="proctor-badge">LIVE</div>
      </div>
      <div class="proctor-body">
        <div class="proctor-line"><span class="proctor-label">Họ và tên</span><span class="proctor-value" data-field="studentName">--</span></div>
        <div class="proctor-line"><span class="proctor-label">MSV</span><span class="proctor-value" data-field="studentId">--</span></div>
        <div class="proctor-line"><span class="proctor-label">Phòng thi</span><span class="proctor-value" data-field="roomCode">--</span></div>
        <div class="proctor-timer" data-field="timer">00:00:00</div>
        <div class="proctor-status" data-field="status">Đang khởi tạo phiên...</div>
      </div>
      <div class="proctor-footer">
        <button class="proctor-end-btn" type="button" data-role="end-button">Kết thúc</button>
      </div>
      <div class="proctor-error" data-field="error" hidden></div>
    </div>
  `;

  document.documentElement.appendChild(style);
  document.documentElement.appendChild(rootEl);
  panelEl = rootEl.querySelector('[data-role="panel"]');

  const endButton = rootEl.querySelector('[data-role="end-button"]');
  const dragHandle = rootEl.querySelector('[data-role="drag-handle"]');

  endButton.addEventListener('click', handleEndClick);
  wireDrag(dragHandle, panelEl);
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
      removeOverlay();
      sendResponse({ ok: true });
      return true;
    }

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

  try {
    logger.info('Content sending END_PROCTORING');
    const response = await sendToBackground('END_PROCTORING', {
      reason: 'user_clicked_end',
    }, 20000);

    if (response?.ok !== true) {
      throw new Error(response?.error || 'Không thể kết thúc phiên');
    }

    logger.info('Background confirmed END_PROCTORING, removing overlay');
    removeOverlay();
  } catch (error) {
    logger.error('handleEndClick failed', error.message);

    // If port closed, retry once with fresh connection
    if (isPortClosureError(error)) {
      logger.info('Port closed, attempting retry');
      try {
        const retryResponse = await sendToBackground('END_PROCTORING', {
          reason: 'user_clicked_end_retry',
        }, 20000);

        if (retryResponse?.ok === true) {
          logger.info('Retry succeeded, removing overlay');
          removeOverlay();
          return;
        }
      } catch (retryError) {
        logger.error('Retry failed', retryError.message);
        error = retryError;
      }
    }

    // If we get here, END_PROCTORING failed
    isCleaningUp = false;
    button.disabled = false;
    showError(error.message);
    setField('status', 'Kết thúc phiên thất bại');
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

function removeOverlay() {
  if (rootEl === null) {
    logger.debug('Overlay already removed');
    disposeContentScript();
    return;
  }

  logger.info('Removing overlay UI');
  stopTimer();

  if (rootEl) {
    try {
      rootEl.remove();
    } catch (error) {
      logger.warn('Failed to remove rootEl', error.message);
    }
    rootEl = null;
    panelEl = null;
  }

  const style = document.getElementById(STYLE_ID);
  if (style) {
    try {
      style.remove();
    } catch (error) {
      logger.warn('Failed to remove style', error.message);
    }
  }

  isCleaningUp = false;
  disposeContentScript();
  logger.info('Overlay cleanup complete');
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
