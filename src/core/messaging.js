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

    chrome.runtime.sendMessage(envelope, (response) => {
      if (finished) return;
      clearTimeout(timer);
      finished = true;
      if (chrome.runtime.lastError) {
        logger.error('sendToBackground error', chrome.runtime.lastError.message);
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
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

    chrome.tabs.sendMessage(tabId, envelope, (response) => {
      if (finished) return;
      clearTimeout(timer);
      finished = true;
      if (chrome.runtime.lastError) {
        logger.error('sendToTab error', chrome.runtime.lastError.message);
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

export function onMessage(handlersOrFn, options = {}) {
  const allowedHosts = options.allowedHosts || null;

  function listener(message, sender, sendResponse) {
    const { type, data } = message || {};

    if (!type) {
      logger.warn('onMessage received malformed message', { message, sender });
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
      Promise.resolve(handlersOrFn(data, sender, message))
        .then((result) => sendResponse(result))
        .catch((error) => {
          logger.error(`onMessage handler error for ${type}:`, error);
          sendResponse({ error: error.message });
        });
      return true;
    }

    const handler = handlersOrFn[type];
    if (handler) {
      Promise.resolve(handler(data, sender))
        .then((result) => sendResponse(result))
        .catch((error) => {
          logger.error(`Handler ${type} error:`, error);
          sendResponse({ error: error.message });
        });
      return true;
    }

    logger.debug('onMessage no handler for type', type);
    return false;
  }

  chrome.runtime.onMessage.addListener(listener);
  return function offMessage() {
    try {
      chrome.runtime.onMessage.removeListener(listener);
    } catch (error) {
      logger.warn('offMessage removeListener failed', error);
    }
  };
}
