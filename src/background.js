import { logger } from './core/logger.js';
import { clearAuthSession, getAuthState, saveAuthSession, saveProctorSession } from './core/session.js';
import { onMessage, sendToTab } from './core/messaging.js';
import { apiService } from './services/api.js';

/**
 * BACKGROUND ↔ CONTENT MESSAGE PROTOCOL (Standardized)
 * 
 * All messages use envelope format: { id, type, source, ts, data }
 * All responses follow contract: { ok: boolean, error?: string, ...payload }
 * 
 * HANDLERS (sync response contract):
 * - START_PROCTORING: { ok: true/false, status, error? }
 * - END_PROCTORING: { ok: true/false, status, error? }
 * - GET_SESSION_INFO: { ok: true/false, status, session?, error? }
 * 
 * MESSAGES TO CONTENT (fire-and-forget):
 * - SESSION_UPDATED: background → content (state push)
 */

const runtimeState = {
  status: 'idle',
  session: null,
  activeTabId: null,
  activeWindowId: null,
};

const OVERLAY_ROOT_ID = 'proctor-overlay-root';
const OVERLAY_STYLE_ID = 'proctor-overlay-style';

async function restoreSessionContext() {
  try {
    const session = await getAuthState();

    if (session?.authToken && session?.sessionId) {
      apiService.setContext({
        serverUrl: session.serverUrl,
        token: session.authToken,
        sessionId: session.sessionId,
      });
      logger.info('Session context restored');
    }

    if (session?.proctorSession) {
      const storedSession = session.proctorSession;
      const storedTabId = storedSession.activeTabId;
      const isStale = await isStoredSessionStale(storedSession).catch((error) => {
        logger.warn('Failed to evaluate stored session staleness', error.message);
        return true;
      });

      if (isStale) {
        logger.warn('Stored proctor session is stale, clearing it');
        await clearAuthSession().catch((error) => {
          logger.warn('Failed to clear stale session', error.message);
        });
        runtimeState.status = 'idle';
        runtimeState.session = null;
        runtimeState.activeTabId = null;
        runtimeState.activeWindowId = null;
        return;
      }

      runtimeState.session = session.proctorSession;
      runtimeState.status = session.proctorSession.status || 'active';
      runtimeState.activeTabId = session.proctorSession.activeTabId || null;
      runtimeState.activeWindowId = session.proctorSession.activeWindowId || null;
    }
  } catch (error) {
    logger.warn('Failed to restore session context', error.message);
  }
}


async function handleStartProctoring(data) {
  logger.info('handleStartProctoring called with data:', data);
  const { roomCode, studentName, studentId } = data || {};

  if (!roomCode || !studentName || !studentId) {
    logger.error('Missing required fields for START_PROCTORING', { roomCode, studentName, studentId });
    return {
      ok: false,
      status: 'error',
      error: 'Thiếu thông tin phòng thi hoặc sinh viên',
    };
  }

  if (runtimeState.status === 'authenticating') {
    return {
      ok: false,
      status: 'error',
      error: 'Phiên giám sát đang được khởi tạo',
    };
  }

  if (runtimeState.status === 'active') {
    logger.warn('Existing active session will be superseded by new START_PROCTORING request');
    void forceResetSession('superseded_by_new_session').catch((error) => {
      logger.warn('forceResetSession failed', error.message);
    });
  }

  runtimeState.status = 'authenticating';

  try {
    const authResponse = await authenticateRoomCode(roomCode, studentName, studentId);
    await processStartProctoring({ roomCode, studentName, studentId, authResponse });

    logger.info('handleStartProctoring completed successfully');
    return { ok: true, status: 'starting' };
  } catch (error) {
    logger.error('handleStartProctoring failed', error);
    runtimeState.status = 'idle';
    runtimeState.session = null;
    runtimeState.activeTabId = null;
    runtimeState.activeWindowId = null;
    await clearAuthSession().catch(() => {});

    return {
      ok: false,
      status: 'error',
      error: error.message || 'Không thể bắt đầu giám sát',
    };
  }
}

async function processStartProctoring({ roomCode, studentName, studentId, authResponse }) {
  try {
    apiService.setContext({
      serverUrl: authResponse.serverUrl,
      token: authResponse.token,
      sessionId: authResponse.sessionId,
    });

    const tab = await getCurrentExamTab();
    const tabs = await collectOpenTabs();
    const startedAt = Date.now();

    const session = {
      roomCode,
      studentName,
      studentId,
      authToken: authResponse.token,
      sessionId: authResponse.sessionId,
      serverUrl: authResponse.serverUrl,
      startedAt,
      status: 'active',
      activeTabId: tab.id,
      activeWindowId: tab.windowId,
      tabs,
      client: getClientMetadata(),
    };

    logger.info('processStartProctoring: Starting API session');
    await apiService.startSession({
      roomCode,
      studentName,
      studentId,
      tabs,
      timestamp: startedAt,
      client: session.client,
    });

    runtimeState.status = 'active';
    runtimeState.session = session;
    runtimeState.activeTabId = tab.id;
    runtimeState.activeWindowId = tab.windowId;

    await saveAuthSession({
      roomCode,
      studentName,
      studentId,
      authToken: authResponse.token,
      sessionId: authResponse.sessionId,
      serverUrl: authResponse.serverUrl,
    });
    await saveProctorSession(session);

    logger.info('processStartProctoring: Injecting overlay into tab', tab.id);
    await injectOverlay(tab.id);
    logger.info('processStartProctoring: Overlay injected successfully');

    return session;
  } catch (error) {
    logger.error('Start proctoring failed', error);

    if (runtimeState.session?.sessionId) {
      await apiService.endSession({
        endedAt: Date.now(),
        status: 'ended',
        reason: 'start_flow_failed',
        summary: {
          roomCode: runtimeState.session.roomCode,
          studentName: runtimeState.session.studentName,
          studentId: runtimeState.session.studentId,
          failureStage: 'start_or_inject',
        },
      }).catch((cleanupError) => {
        logger.warn('Rollback endSession failed', cleanupError.message);
      });
    }

    runtimeState.status = 'error';
    runtimeState.session = null;
    runtimeState.activeTabId = null;
    runtimeState.activeWindowId = null;
    await clearAuthSession().catch(() => {});
    throw error;
  }
}

async function handleEndProctoring(data, sender) {
  const session = runtimeState.session;
  if (!session?.sessionId) {
    logger.warn('handleEndProctoring called without active session');
    return {
      ok: false,
      status: 'error',
      error: 'Không có phiên giám sát đang hoạt động',
    };
  }

  logger.info('handleEndProctoring called, returning immediate ack');
  runtimeState.status = 'ending';

  try {
    await processEndProctoring({
      data,
      sender,
      session,
    });

    return { ok: true, status: 'ending' };
  } catch (error) {
    runtimeState.status = 'active';
    logger.error('processEndProctoring failed', error);
    return {
      ok: false,
      status: 'error',
      error: error.message || 'Không thể kết thúc phiên vì chưa lưu được dữ liệu lên backend',
    };
  }
}

async function processEndProctoring({ data, sender, session }) {
  const endedAt = Date.now();
  const windowId = session.activeWindowId || sender?.tab?.windowId || runtimeState.activeWindowId;

  logger.info('processEndProctoring: Starting cleanup');

  const screenshotDataUrl = await captureFinalScreenshot(windowId).catch((error) => {
    logger.warn('captureFinalScreenshot failed', error.message);
    return null;
  });

  const endPayload = {
    endedAt,
    status: 'ended',
    reason: data?.reason || 'user_clicked_end',
    screenshotDataUrl,
    summary: {
      roomCode: session.roomCode,
      studentName: session.studentName,
      studentId: session.studentId,
      totalTabs: session.tabs?.length || 0,
    },
  };

  logger.info('processEndProctoring: Syncing with backend');
  await apiService.endSession(endPayload);
  logger.info('processEndProctoring: Backend sync complete');

  if (typeof runtimeState.activeTabId === 'number') {
    await removeOverlayDirectly(runtimeState.activeTabId).catch((error) => {
      logger.warn('Failed to remove overlay directly', error.message);
    });
  }

  await cleanupRuntime();

  logger.info('END_PROCTORING completed successfully');
}

async function isActiveSessionReusable() {
  const session = runtimeState.session;
  if (!session?.sessionId || typeof session.activeTabId !== 'number') {
    return false;
  }

  try {
    await chrome.tabs.get(session.activeTabId);
    return true;
  } catch (error) {
    logger.warn('Active session tab is no longer available', error.message);
    return false;
  }
}

async function isStoredSessionStale(session) {
  if (!session?.sessionId) return true;

  if (typeof session.startedAt === 'number') {
    const maxAgeMs = 1000 * 60 * 60 * 4;
    if (Date.now() - session.startedAt > maxAgeMs) {
      return true;
    }
  }

  if (typeof session.activeTabId !== 'number') {
    return true;
  }

  try {
    await chrome.tabs.get(session.activeTabId);
    return false;
  } catch (error) {
    return true;
  }
}

async function forceResetSession(reason = 'force_reset') {
  const session = runtimeState.session;

  if (session?.sessionId) {
    await apiService.endSession({
      endedAt: Date.now(),
      status: 'ended',
      reason,
      summary: {
        roomCode: session.roomCode,
        studentName: session.studentName,
        studentId: session.studentId,
        totalTabs: session.tabs?.length || 0,
      },
    }).catch((error) => {
      logger.warn('forceResetSession endSession failed', error.message);
    });
  }

  if (typeof runtimeState.activeTabId === 'number') {
    await removeOverlayDirectly(runtimeState.activeTabId).catch((error) => {
      logger.warn('forceResetSession direct overlay cleanup failed', error.message);
    });
  }

  await cleanupRuntime();
}

async function removeOverlayDirectly(tabId) {
  if (typeof tabId !== 'number') return;

  await chrome.scripting.executeScript({
    target: { tabId },
    func: (rootId, styleId) => {
      const root = document.getElementById(rootId);
      if (root) root.remove();

      const style = document.getElementById(styleId);
      if (style) style.remove();
    },
    args: [OVERLAY_ROOT_ID, OVERLAY_STYLE_ID],
  });
}

function handleGetSessionInfo() {
  if (!runtimeState.session) {
    logger.debug('handleGetSessionInfo called with no active session');
    return {
      ok: false,
      status: 'idle',
      error: 'No active session',
    };
  }

  logger.debug('handleGetSessionInfo returning session for', runtimeState.session.studentId);
  return {
    ok: true,
    status: runtimeState.status,
    session: runtimeState.session,
  };
}

async function authenticateRoomCode(roomCode, studentName, studentId) {
  try {
    const data = await apiService.authenticateRoomCode(roomCode, studentName, studentId);

    if (!data || !data.token || !data.sessionId) {
      throw new Error('Backend trả về không hợp lệ');
    }

    return {
      token: data.token,
      sessionId: data.sessionId,
      serverUrl: data.serverUrl || apiService.getServerUrl(),
    };
  } catch (error) {
    if (String(error.message || '').includes('Failed to fetch') || String(error.message || '').includes('NetworkError')) {
      throw new Error('Backend chưa chạy, vui lòng khởi động backend trước khi bắt đầu giám sát');
    }

    throw error;
  }
}

async function getCurrentExamTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || !tabs.length || typeof tabs[0].id !== 'number') {
    throw new Error('Không tìm thấy tab thi hiện tại');
  }

  const tab = tabs[0];
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    throw new Error('Không thể giám sát trên trang hệ thống của trình duyệt');
  }

  return tab;
}

async function collectOpenTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab) => !tab.discarded)
    .map((tab) => ({
      id: tab.id,
      title: tab.title || 'Tab không tên',
      url: sanitizeUrl(tab.url),
      active: Boolean(tab.active),
      windowId: tab.windowId,
    }));
}

function sanitizeUrl(url) {
  if (!url) return '';

  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (error) {
    return url;
  }
}

function getClientMetadata() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
  };
}

async function injectOverlay(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/content.js'],
  });
}

async function captureFinalScreenshot(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(
      windowId || undefined,
      { format: 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(dataUrl || null);
      }
    );
  });
}

async function cleanupRuntime() {
  runtimeState.status = 'ended';
  
  // Notify content script of cleanup so it can dispose its state
  if (typeof runtimeState.activeTabId === 'number') {
    try {
      await sendToTab(runtimeState.activeTabId, 'SESSION_CLEANUP', { reason: 'backend_ended_or_timeout' });
      logger.debug('Sent SESSION_CLEANUP signal to content script');
    } catch (error) {
      logger.warn('Failed to send cleanup signal to content', error.message);
    }
  }
  
  runtimeState.session = null;
  runtimeState.activeTabId = null;
  runtimeState.activeWindowId = null;
  await clearAuthSession().catch((error) => {
    logger.warn('cleanupRuntime clearAuthSession failed', error.message);
  });
}

function initializeBackground() {
  restoreSessionContext().then(() => {
    logger.info('Background service worker initialized and session restored');
  }).catch((error) => {
    logger.warn('Background init error:', error.message);
  });

  // Handle extension unload
  if (chrome.runtime && chrome.runtime.onSuspend) {
    chrome.runtime.onSuspend.addListener(() => {
      logger.info('Background service worker suspended');
    });
  }
}

// REGISTER MESSAGE LISTENER IMMEDIATELY
onMessage({
  START_PROCTORING: handleStartProctoring,
  END_PROCTORING: handleEndProctoring,
  GET_SESSION_INFO: handleGetSessionInfo,
});

// Initialize service worker
try {
  logger.setLevel('debug');
  initializeBackground();
} catch (error) {
  console.error('Background init failed:', error.message);
}
