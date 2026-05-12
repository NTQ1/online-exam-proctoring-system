import { onMessage } from './messaging.js';
import { logger } from './logger.js';

const registry = new Map();
let off = null;

export function register(type, handler) {
  if (typeof handler !== 'function') throw new Error('handler must be function');
  registry.set(type, handler);
}

export function unregister(type) {
  registry.delete(type);
}

export function clearHandlers() {
  registry.clear();
}

export function start(options) {
  if (off) return;
  off = onMessage(async (data, sender, message) => {
    const type = message && message.type;
    if (!type) return { error: 'invalid_message' };
    const handler = registry.get(type);
    if (!handler) {
      logger.warn('Dispatcher no handler for type', type);
      return { error: 'no_handler' };
    }
    try {
      return await handler(data, sender, message);
    } catch (error) {
      logger.error('Dispatcher handler error', error);
      return { error: error.message };
    }
  }, options);
}

export function stop() {
  if (!off) return;
  try {
    off();
  } catch (error) {
    logger.warn('dispatcher stop failed', error);
  }
  off = null;
}

export function listHandlers() {
  return Array.from(registry.keys());
}
