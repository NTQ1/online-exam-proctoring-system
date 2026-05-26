function ensureChromeStorage() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    throw new Error('chrome.storage.local is not available');
  }
}

function wrapCallbackStorage(method, ...args) {
  ensureChromeStorage();

  return new Promise((resolve, reject) => {
    chrome.storage.local[method](...args, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (method === 'get') {
        resolve(args[0]);
        return;
      }

      resolve();
    });
  });
}

export const storage = {
  get(keys) {
    ensureChromeStorage();

    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(result);
      });
    });
  },

  set(items) {
    return wrapCallbackStorage('set', items);
  },

  remove(keys) {
    return wrapCallbackStorage('remove', keys);
  },

  clear() {
    return wrapCallbackStorage('clear');
  },
};

export default storage;