import { jest, describe, beforeEach, test, expect } from '@jest/globals';

let messageListener;
let tabUpdateListener;
let tabActivatedListener;
let webNavigationCompleteListener;
let tabRemovedListener;

const PASSIVE_SCAN_RESULT_PREFIX = 'jsrb_passive_scan';

const poll = (assertion, { interval = 50, timeout = 1000 } = {}) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const tryAssert = () => {
      try {
        assertion();
        resolve();
      } catch (error) {
        if (Date.now() - startTime > timeout) {
          reject(error);
        } else {
          setTimeout(tryAssert, interval);
        }
      }
    };
    tryAssert();
  });
};

global.chrome = {
  runtime: {
    getURL: jest.fn(path => `chrome-extension://test-id/${path}`),
    getBrowserInfo: jest.fn().mockResolvedValue({ name: 'Chrome' }),
    onMessage: {
      addListener: jest.fn(listener => {
        messageListener = listener;
      }),
      hasListeners: jest.fn().mockReturnValue(true),
    },
    sendMessage: jest.fn(),
    getContexts: jest.fn().mockResolvedValue([]),
    onStartup: {
      addListener: jest.fn(),
    },
    onInstalled: {
      addListener: jest.fn(),
    },
  },
  tabs: {
    get: jest.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
    query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
    create: jest.fn(),
    onUpdated: {
      addListener: jest.fn(listener => {
        tabUpdateListener = listener;
      }),
    },
    onActivated: {
      addListener: jest.fn(listener => {
        tabActivatedListener = listener;
      }),
    },
    onRemoved: {
      addListener: jest.fn(listener => {
        tabRemovedListener = listener;
      }),
    },
  },
  webNavigation: {
    onCompleted: {
      addListener: jest.fn(listener => {
        webNavigationCompleteListener = listener;
      }),
    },
    onHistoryStateUpdated: { addListener: jest.fn() },
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
      remove: jest.fn().mockResolvedValue(),
    },
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
    },
    session: {
      get: jest.fn().mockResolvedValue({}),
    }
  },
  action: {
    setIcon: jest.fn(),
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
    setTitle: jest.fn(),
  },
  scripting: {
    insertCSS: jest.fn().mockResolvedValue(),
    executeScript: jest.fn().mockResolvedValue(),
  },
  offscreen: {
    createDocument: jest.fn().mockResolvedValue(),
    closeDocument: jest.fn().mockResolvedValue(),
    hasDocument: jest.fn().mockResolvedValue(false),
  }
};

global.fetch = jest.fn();
global.Worker = jest.fn(() => ({
  postMessage: jest.fn(),
  terminate: jest.fn(),
}));


describe('Background Script Logic', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    messageListener = undefined;
    tabUpdateListener = undefined;
    tabActivatedListener = undefined;
    webNavigationCompleteListener = undefined;
    jest.resetModules();
  });

  const loadBackgroundScript = async (mocks) => {
    jest.unstable_mockModule('../src/utils/coreUtils.js', () => ({
      isScannable: jest.fn().mockResolvedValue(true),
      isScanningGloballyEnabled: jest.fn().mockResolvedValue(true),
      isPassiveScanningEnabled: jest.fn().mockResolvedValue(true),
      createLRUCache: jest.fn((size) => {
        const map = new Map();
        return {
          has: (key) => map.has(key),
          get: (key) => map.get(key),
          set: (key, value) => {
            if (map.size >= size) {
              const firstKey = map.keys().next().value;
              map.delete(firstKey);
            }
            map.set(key, value);
          },
          delete: (key) => map.delete(key),
          keys: () => map.keys(),
        };
      }),
      ...mocks?.coreUtils
    }));
    jest.unstable_mockModule('../src/utils/rules.js', () => ({
      secretRules: [],
      ...mocks?.rules,
    }));
    await import('../src/background.js');
  };

  describe('Event Listeners', () => {
    test('onUpdated listener should trigger initial loading state for a scannable page', async () => {
      jest.unstable_mockModule('../src/utils/coreUtils.js', () => ({
        isScannable: jest.fn().mockResolvedValue(true),
        isScanningGloballyEnabled: jest.fn().mockResolvedValue(true),
        isPassiveScanningEnabled: jest.fn().mockResolvedValue(true),
        createLRUCache: jest.fn((size) => {
          const map = new Map();
          return {
            has: (key) => map.has(key),
            get: (key) => map.get(key),
            set: (key, value) => {
              if (map.size >= size) {
                const firstKey = map.keys().next().value;
                map.delete(firstKey);
              }
              map.set(key, value);
            },
            delete: (key) => map.delete(key),
            keys: () => map.keys(),
          };
        }),
      }));
      jest.unstable_mockModule('../src/utils/rules.js', () => ({ secretRules: [] }));

      await import('../src/background.js');

      const tab = { id: 1, url: 'https://example.com' };

      await tabUpdateListener(1, { status: 'loading' }, tab);

      await new Promise(process.nextTick);

      expect(chrome.action.setIcon).toHaveBeenCalledWith(
        expect.objectContaining({ tabId: 1, path: expect.stringContaining('icon-scanning') })
      );
    });

    test('onUpdated listener should set disabled icon if passive scanning is off', async () => {
      jest.unstable_mockModule('../src/utils/coreUtils.js', () => ({
        isScannable: jest.fn().mockResolvedValue(true),
        isScanningGloballyEnabled: jest.fn().mockResolvedValue(true),
        isPassiveScanningEnabled: jest.fn().mockResolvedValue(false),
        createLRUCache: jest.fn((size) => {
          const map = new Map();
          return {
            has: (key) => map.has(key),
            get: (key) => map.get(key),
            set: (key, value) => {
              if (map.size >= size) {
                const firstKey = map.keys().next().value;
                map.delete(firstKey);
              }
              map.set(key, value);
            },
            delete: (key) => map.delete(key),
            keys: () => map.keys(),
          };
        }),
      }));
      jest.unstable_mockModule('../src/utils/rules.js', () => ({ secretRules: [] }));

      await import('../src/background.js');

      const tab = { id: 1, url: 'https://example.com' };

      await tabUpdateListener(1, { status: 'complete' }, tab);
      await new Promise(process.nextTick);

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: 'OFF' });
      expect(chrome.action.setTitle).toHaveBeenCalledWith({ tabId: 1, title: 'Scanning is turned off' });
    });

    test('onUpdated listener should do nothing if the URL is not scannable', async () => {
      jest.unstable_mockModule('../src/utils/coreUtils.js', () => ({
        isScannable: jest.fn().mockResolvedValue(false),
        isScanningGloballyEnabled: jest.fn().mockResolvedValue(true),
        isPassiveScanningEnabled: jest.fn().mockResolvedValue(true),
        createLRUCache: jest.fn((size) => {
          const map = new Map();
          return {
            has: (key) => map.has(key),
            get: (key) => map.get(key),
            set: (key, value) => {
              if (map.size >= size) {
                const firstKey = map.keys().next().value;
                map.delete(firstKey);
              }
              map.set(key, value);
            },
            delete: (key) => map.delete(key),
            keys: () => map.keys(),
          };
        }),
      }));
      jest.unstable_mockModule('../src/utils/rules.js', () => ({ secretRules: [] }));

      await import('../src/background.js');
      const tab = { id: 1, url: 'chrome://extensions' };
      await tabUpdateListener(1, { status: 'loading' }, tab);

      expect(chrome.action.setIcon).not.toHaveBeenCalled();
      expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
    });

    test('onRemoved listener should trigger cleanup logic', async () => {
      jest.unstable_mockModule('../src/utils/coreUtils.js', () => ({
        isScannable: jest.fn().mockResolvedValue(true),
        isScanningGloballyEnabled: jest.fn().mockResolvedValue(true),
        isPassiveScanningEnabled: jest.fn().mockResolvedValue(true),
        createLRUCache: jest.fn((size) => {
          const map = new Map();
          const cache = {
            has: (key) => map.has(key),
            get: (key) => map.get(key),
            set: (key, value) => {
              if (map.size >= size) {
                const firstKey = map.keys().next().value;
                map.delete(firstKey);
              }
              map.set(key, value);
            },
            delete: (key) => map.delete(key),
            keys: () => map.keys(),
            [Symbol.iterator]: () => map.entries(),
          };
          cache.set('1|https://example.com', { findingsCount: 1 });
          return cache;
        }),
      }));
      jest.unstable_mockModule('../src/utils/rules.js', () => ({ secretRules: [] }));
      await import('../src/background.js');

      const tab = { id: 1, url: 'https://example.com' };

      tabRemovedListener(tab.id);
      await new Promise(process.nextTick);

      chrome.scripting.executeScript.mockResolvedValue([{
        result: { html: '', inlineScripts: [], externalScripts: [] }
      }]);
      chrome.runtime.sendMessage.mockImplementation((message) => {
        if (message.type === 'scanContent') {
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({ status: 'success', data: [{ id: 'finding' }] });
            }, 100);
          });
        }
      });

      webNavigationCompleteListener({ tabId: tab.id, frameId: 0, url: tab.url });
      tabRemovedListener(tab.id);

      await new Promise(resolve => setTimeout(resolve, 100));

      const storageCalls = chrome.storage.local.set.mock.calls.filter(call => {
        const key = Object.keys(call[0])[0];
        return key.includes('jsrb_passive_scan');
      });

      expect(storageCalls.length).toBe(0);
    });

    test('onRemoved listener should mark tab as removed and cleanup cache', async () => {
      const cacheMap = new Map();
      cacheMap.set('1|https://example.com', { findingsCount: 1 });
      cacheMap.set('2|https://other.com', { findingsCount: 2 });

      jest.unstable_mockModule('../src/utils/coreUtils.js', () => ({
        isScannable: jest.fn().mockResolvedValue(true),
        isScanningGloballyEnabled: jest.fn().mockResolvedValue(true),
        isPassiveScanningEnabled: jest.fn().mockResolvedValue(true),
        createLRUCache: jest.fn(() => ({
          has: (key) => cacheMap.has(key),
          get: (key) => cacheMap.get(key),
          set: (key, value) => cacheMap.set(key, value),
          delete: (key) => cacheMap.delete(key),
          keys: () => cacheMap.keys(),
        })),
      }));
      jest.unstable_mockModule('../src/utils/rules.js', () => ({ secretRules: [] }));
      await import('../src/background.js');

      expect(cacheMap.has('1|https://example.com')).toBe(true);

      tabRemovedListener(1);
      await new Promise(process.nextTick);

      expect(cacheMap.has('1|https://example.com')).toBe(false);
      expect(cacheMap.has('2|https://other.com')).toBe(true);
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      jest.unstable_mockModule('../src/utils/coreUtils.js', () => ({
        isScannable: jest.fn().mockResolvedValue(true),
        isScanningGloballyEnabled: jest.fn().mockResolvedValue(true),
        isPassiveScanningEnabled: jest.fn().mockResolvedValue(true),
        createLRUCache: jest.fn((size) => {
          const map = new Map();
          return {
            has: (key) => map.has(key),
            get: (key) => map.get(key),
            set: (key, value) => {
              if (map.size >= size) {
                const firstKey = map.keys().next().value;
                map.delete(firstKey);
              }
              map.set(key, value);
            },
            delete: (key) => map.delete(key),
            keys: () => map.keys(),
          };
        }),
      }));
      jest.unstable_mockModule('../src/utils/rules.js', () => ({ secretRules: [] }));
      await import('../src/background.js');
    });

    test('should handle SCAN_PAGE message by injecting scripts', async () => {
      const request = { type: 'SCAN_PAGE', tabId: 1 };
      const sendResponse = jest.fn();

      const isAsync = messageListener(request, {}, sendResponse);
      await new Promise(process.nextTick);

      expect(chrome.scripting.insertCSS).toHaveBeenCalledWith(expect.objectContaining({ files: ["src/overlay/overlay.css"] }));
      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ files: ["src/overlay/overlay.js"] }));
      expect(sendResponse).toHaveBeenCalledWith({ status: 'ok' });
      expect(isAsync).toBe(true);
    });

    test('should handle OPEN_VIEWER_TAB message by creating a new tab', () => {
      const request = { type: 'OPEN_VIEWER_TAB', storageKey: 'test-key-123' };

      messageListener(request, {}, jest.fn());

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: expect.stringContaining('source-viewer.html#test-key-123')
      });
    });

    test('should handle SCANNING_STATE_CHANGED message and update icons when disabled', async () => {
      const request = { type: 'SCANNING_STATE_CHANGED', isEnabled: false };

      messageListener(request, {}, jest.fn());
      await new Promise(process.nextTick);

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: 'OFF' });
    });

    test('should handle VERIFY_NPM_PACKAGES and return only vulnerable packages', async () => {
      const request = {
        type: 'VERIFY_NPM_PACKAGES',
        packages: ['@private/package', 'react', '@another/private-one']
      };
      const sendResponse = jest.fn();

      global.fetch
        .mockResolvedValueOnce({ status: 404 })
        .mockResolvedValueOnce({ status: 200 })
        .mockResolvedValueOnce({ status: 404 });

      const isAsync = messageListener(request, {}, sendResponse);
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(sendResponse).toHaveBeenCalledWith(['@private/package', '@another/private-one']);
      expect(isAsync).toBe(true);
    });

    test('should block SCAN_PAGE if scanning is globally disabled', async () => {
      const { isScanningGloballyEnabled } = await import('../src/utils/coreUtils.js');
      isScanningGloballyEnabled.mockResolvedValue(false);
      const request = { type: 'SCAN_PAGE', tabId: 1 };
      const sendResponse = jest.fn();

      messageListener(request, {}, sendResponse);
      await new Promise(process.nextTick);

      expect(chrome.scripting.insertCSS).not.toHaveBeenCalled();
      expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ status: 'disabled' });
    });

    test('should handle VERIFY_NPM_PACKAGES with an empty package list', async () => {
      const request = { type: 'VERIFY_NPM_PACKAGES', packages: [] };
      const sendResponse = jest.fn();

      messageListener(request, {}, sendResponse);
      await new Promise(process.nextTick);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith([]);
    });

    test('should handle PROBE_SOURCE_MAPS message and return valid maps', async () => {
      const request = {
        type: 'PROBE_SOURCE_MAPS',
        urls: ['https://example.com/valid.js.map', 'https://example.com/missing.js.map']
      };
      const sendResponse = jest.fn();

      global.fetch.mockImplementation(async (url, options) => {
        if (url === 'https://example.com/valid.js.map' && options.method === 'HEAD') {
          return { ok: true };
        }
        return { ok: false };
      });

      jest.useFakeTimers();

      const isAsync = messageListener(request, {}, sendResponse);

      await jest.runAllTimersAsync();

      expect(global.fetch).toHaveBeenCalledWith('https://example.com/valid.js.map', { method: 'HEAD' });
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/missing.js.map', { method: 'HEAD' });

      expect(sendResponse).toHaveBeenCalledWith(['https://example.com/valid.js.map']);
      expect(isAsync).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('Caching and State Logic', () => {
    beforeEach(async () => {
      jest.unstable_mockModule('../src/utils/coreUtils.js', () => ({
        isScannable: jest.fn().mockResolvedValue(true),
        isScanningGloballyEnabled: jest.fn().mockResolvedValue(true),
        isPassiveScanningEnabled: jest.fn().mockResolvedValue(true),
        createLRUCache: jest.fn((size) => {
          const map = new Map();
          return {
            has: (key) => map.has(key),
            get: (key) => map.get(key),
            set: (key, value) => {
              if (map.size >= size) {
                const firstKey = map.keys().next().value;
                map.delete(firstKey);
              }
              map.set(key, value);
            },
            delete: (key) => map.delete(key),
            keys: () => map.keys(),
          };
        }),
      }));
      jest.unstable_mockModule('../src/utils/rules.js', () => ({ secretRules: [] }));
    });

    test('should use cached results on page completion and not start a new scan', async () => {
      const storageKey = 'jsrb_passive_scan|https://example.com';
      const cachedResult = {
        [storageKey]: {
          status: 'complete',
          results: [{ id: 'test', secret: '123' }],
        }
      };
      chrome.storage.local.get.mockResolvedValue(cachedResult);
      await import('../src/background.js');

      await webNavigationCompleteListener({ tabId: 1, frameId: 0, url: 'https://example.com' });
      await poll(() => {
        expect(chrome.action.setIcon).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining('icon-found') }));
        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: '1' });
      });

      const scrapeCalls = chrome.scripting.executeScript.mock.calls.filter(call => !call[0].hasOwnProperty('args'));
      expect(scrapeCalls.length).toBe(0);

      const allStorageWrites = chrome.storage.local.set.mock.calls;

      allStorageWrites.forEach((call, index) => {
        const storageData = call[0];
        const key = Object.keys(storageData)[0];
        const value = storageData[key];

        if (value && typeof value === 'object' &&
          value.status === 'complete' &&
          'results' in value) {

          expect(value).toHaveProperty('contentMap');
          expect(value.contentMap).not.toBeUndefined();
          expect(typeof value.contentMap).toBe('object');
        }
      });
    });
  });

  describe('Throttled Fetch Logic', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    test('should fetch and return text content by default', async () => {
      await loadBackgroundScript();
      const mockResponse = { ok: true, text: () => Promise.resolve('test content') };
      global.fetch.mockResolvedValue(mockResponse);

      const throttledFetch = (await import('../src/background.js')).throttledFetch;
      const promise = throttledFetch('https://example.com/script.js');
      jest.runAllTimers();
      const result = await promise;

      expect(global.fetch).toHaveBeenCalledWith('https://example.com/script.js', { "method": "GET" });
      expect(result).toBe('test content');
    });

    test('should return the full response object when specified', async () => {
      await loadBackgroundScript();
      const mockResponse = { status: 404 };
      global.fetch.mockResolvedValue(mockResponse);

      const throttledFetch = (await import('../src/background.js')).throttledFetch;
      const promise = throttledFetch('https://registry.npmjs.org/@private/pkg', { responseType: 'response' });
      jest.runAllTimers();
      const result = await promise;

      expect(result.status).toBe(404);
    });

    test('should respect concurrency and rate limits when fetching scripts', async () => {
      await loadBackgroundScript();
      const request = {
        type: 'FETCH_SCRIPTS',
        urls: ['url1', 'url2', 'url3', 'url4', 'url5']
      };
      global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('content') });

      messageListener(request, {}, jest.fn());

      expect(global.fetch).toHaveBeenCalledTimes(3);

      await jest.advanceTimersByTimeAsync(1);

      expect(global.fetch).toHaveBeenCalledTimes(3);

      await jest.advanceTimersByTimeAsync(200);

      expect(global.fetch).toHaveBeenCalledTimes(5);
    });

    test('should support HEAD method in throttledFetch and return boolean', async () => {
      await loadBackgroundScript();

      const mockResponse = { ok: true };
      global.fetch.mockResolvedValue(mockResponse);

      const throttledFetch = (await import('../src/background.js')).throttledFetch;

      const promise = throttledFetch('https://example.com/check.map', { method: 'HEAD' });

      jest.runAllTimers();

      const result = await promise;

      expect(global.fetch).toHaveBeenCalledWith('https://example.com/check.map', { method: 'HEAD' });

      expect(result).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await loadBackgroundScript();
    });

    test('should log a specific warning if updating UI for a closed tab', async () => {
      jest.useFakeTimers();
      const mockError = new Error('No tab with id: 1');
      chrome.tabs.get.mockRejectedValue(mockError);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      const storageKey = 'jsrb_passive_scan|https://example.com';
      chrome.storage.local.get.mockResolvedValue({
        [storageKey]: {
          status: 'complete',
          results: [{ id: 'finding' }],
          timestamp: Date.now()
        }
      });

      await tabUpdateListener(1, { status: 'loading' }, { id: 1, url: 'https://example.com' });

      await jest.runAllTimersAsync();

      expect(chrome.action.setIcon).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    test('should log a generic error for other UI update failures', async () => {
      jest.useFakeTimers();
      const mockError = new Error('Permission denied');
      chrome.action.setIcon.mockRejectedValue(mockError);
      chrome.tabs.get.mockResolvedValue({ id: 1, url: 'https://example.com' });
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      await loadBackgroundScript();

      chrome.scripting.executeScript.mockResolvedValue([{
        result: { html: '', inlineScripts: [], externalScripts: [] }
      }]);
      chrome.runtime.sendMessage.mockResolvedValue({
        status: 'success',
        data: [{ id: 'finding' }]
      });

      await webNavigationCompleteListener({ tabId: 1, frameId: 0, url: 'https://example.com' });
      await jest.runAllTimersAsync();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[JS Recon Buddy] There was an uncaught error when updating the tab icon: ",
        mockError
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Injected Function: scrapePageContent', () => {
    const scrapePageContent = () => {
      const scripts = Array.from(document.scripts);
      const inlineScripts = scripts
        .filter(script => !script.src)
        .map(script => script.textContent);
      const externalScripts = scripts
        .filter(script => script.src)
        .map(script => script.src);
      return {
        html: document.documentElement.outerHTML,
        inlineScripts,
        externalScripts,
      };
    };

    test('should correctly separate inline and external scripts from the DOM', () => {
      document.documentElement.innerHTML = `
        <head></head>
        <body>
            <script>console.log("inline 1");</script>
            <script src="https://example.com/script1.js"></script>
            <script>console.log("inline 2");</script>
            <script src="/local/script2.js"></script>
        </body>
      `;

      const result = scrapePageContent();

      expect(result.inlineScripts).toEqual(['console.log("inline 1");', 'console.log("inline 2");']);
      expect(result.externalScripts).toEqual(['https://example.com/script1.js', 'http://localhost/local/script2.js']);
      expect(result.html).toContain('<script src="https://example.com/script1.js"');
    });

    test('should handle a document with no scripts gracefully', () => {
      document.documentElement.innerHTML = `
        <head></head>
        <body>
            <p>No scripts here.</p>
        </body>
      `;

      const result = scrapePageContent();

      expect(result.inlineScripts).toEqual([]);
      expect(result.externalScripts).toEqual([]);
    });
  });
});
