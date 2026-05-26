import { logger } from './logger.js';

const DEFAULT_TIMEOUT = 5000;

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getSource() {
  try {
    if (typeof location !== 'undefined' && location && location.origin) return location.origin;
  } catch (error) {}
  return 'extension';
}

function createEnvelope(type, data) {
  return { id: genId(), type, source: getSource(), ts: Date.now(), data };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWithRetry(fn, maxRetries = 2, delay = 100) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const message = String(error?.message || '');
      const isPortClosed = message.includes('message port closed before a response was received');

      if (attempt === maxRetries || !isPortClosed) {
        throw error;
      }

      await wait(delay * (attempt + 1));
    }
  }
}

function sendRuntimeMessage(envelope) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(envelope, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      resolve(response);
    });
  });
}

function sendTabMessage(tabId, envelope) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, envelope, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      resolve(response);
    });
  });
}

export async function sendToBackground(type, data = null, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const envelope = createEnvelope(type, data);
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      logger.error('sendToBackground timeout', envelope);
      reject(new Error('sendToBackground timeout'));
    }, timeout);

    sendWithRetry(() => sendRuntimeMessage(envelope)).then((response) => {
      if (finished) return;

      clearTimeout(timer);
      finished = true;
      resolve(response);
    }).catch((error) => {
      if (finished) return;

      clearTimeout(timer);
      finished = true;
      logger.error('sendToBackground error', error.message);
      reject(error);
    });
  });
}

export async function sendToTab(tabId, type, data = null, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const envelope = createEnvelope(type, data);
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      logger.error('sendToTab timeout', { tabId, envelope });
      reject(new Error('sendToTab timeout'));
    }, timeout);

    sendWithRetry(() => sendTabMessage(tabId, envelope)).then((response) => {
      if (finished) return;

      clearTimeout(timer);
      finished = true;
      resolve(response);
    }).catch((error) => {
      if (finished) return;

      clearTimeout(timer);
      finished = true;
      logger.error('sendToTab error', error.message);
      reject(error);
    });
  });
}

export function onMessage(handlersOrFn, options = {}) {
  const allowedHosts = options.allowedHosts || null;

  function listener(message, sender, sendResponse) {
    const { type, data } = message || {};
    logger.debug('onMessage listener called with type:', type);

    if (!type) {
      logger.warn('onMessage received malformed message', { message, sender });
      return false;
    }

    if (sender?.id && sender.id !== chrome.runtime.id) {
      logger.warn('Message from different extension, ignored', sender.id);
      return false;
    }

    if (allowedHosts && sender && sender.url) {
      try {
        const origin = new URL(sender.url).origin;
        if (!allowedHosts.includes(origin)) {
          logger.warn('onMessage blocked message from disallowed origin', { origin, type, sender });
          return false;
        }
      } catch (error) {
        logger.warn('onMessage unable to parse sender.url', sender.url);
      }
    }

    const isFn = typeof handlersOrFn === 'function';
    if (isFn) {
      try {
        const result = handlersOrFn(data, sender, message);
        if (result && typeof result.then === 'function') {
          result
            .then((resolved) => sendResponse(resolved))
            .catch((error) => {
              logger.error(`onMessage handler error for ${type}:`, error);
              sendResponse({ error: error.message });
            });
        } else {
          sendResponse(result);
        }
      } catch (error) {
        logger.error(`onMessage handler error for ${type}:`, error);
        sendResponse({ error: error.message });
      }
      return true;
    }

    const handler = handlersOrFn[type];
    if (handler) {
      logger.debug('Found handler for type:', type);
      try {
        const result = handler(data, sender);
        if (result && typeof result.then === 'function') {
          result
            .then((resolved) => {
              logger.debug('Handler resolved for type:', type);
              sendResponse(resolved);
            })
            .catch((error) => {
              logger.error(`Handler ${type} error:`, error);
              sendResponse({ error: error.message });
            });
        } else {
          logger.debug('Handler resolved synchronously for type:', type);
          sendResponse(result);
        }
      } catch (error) {
        logger.error(`Handler ${type} error:`, error);
        sendResponse({ error: error.message });
      }
      return true;
    }

    logger.debug('onMessage no handler for type', type);
    return false;
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(listener);
  } else {
    logger.warn('chrome.runtime.onMessage is not available');
  }

  return function offMessage() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.removeListener(listener);
      }
    } catch (error) {
      logger.warn('offMessage removeListener failed', error);
    }
  };
}
