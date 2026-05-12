import { logger } from '../core/logger.js';
import { getAuthState } from '../core/session.js';
import { apiService } from '../services/api.js';

// Cấu hình logger
logger.setLevel('info');

restoreSessionContext();

logger.info('Background service worker initialized');

// Handle extension unload
chrome.runtime.onSuspend.addListener(() => {
  logger.info('Background service worker suspended');
});

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
  } catch (error) {
    logger.warn('Failed to restore session context', error.message);
  }
}
