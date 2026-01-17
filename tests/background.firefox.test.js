
import { jest, describe, beforeEach, test, expect } from '@jest/globals';

let webNavigationListener;

describe('Firefox Worker Code Path', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    webNavigationListener = undefined;

    delete global.browser;

    global.fetch = jest.fn();
  });

  test('Firefox: Worker must be created (not offscreen)', async () => {
    global.browser = {
      runtime: {
        getBrowserInfo: jest.fn().mockResolvedValue({ name: 'Firefox' }),
        getURL: jest.fn(path => `moz-extension://fake-id/${path}`)
      }
    };

    let workerOnMessage;
    const workerMock = {
      postMessage: jest.fn(),
      terminate: jest.fn(),
    };

    Object.defineProperty(workerMock, 'onmessage', {
      set(fn) { workerOnMessage = fn; },
      get() { return workerOnMessage; }
    });

    Object.defineProperty(workerMock, 'onerror', {
      set(fn) { },
      get() { return null; }
    });

    global.Worker = jest.fn(() => workerMock);

    global.chrome = {
      runtime: {
        sendMessage: jest.fn(),
        getContexts: jest.fn().mockResolvedValue([]),
        getURL: jest.fn(path => `chrome-extension://test-id/${path}`),
        onMessage: { addListener: jest.fn(), hasListeners: jest.fn().mockReturnValue(true) },
        onStartup: { addListener: jest.fn() },
        onInstalled: { addListener: jest.fn() }
      },
      tabs: {
        get: jest.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
        query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
        create: jest.fn(),
        onUpdated: { addListener: jest.fn() },
        onActivated: { addListener: jest.fn() },
        onRemoved: { addListener: jest.fn() }
      },
      storage: {
        local: { get: jest.fn().mockResolvedValue({}), set: jest.fn(), remove: jest.fn() },
        sync: { get: jest.fn().mockResolvedValue({}), set: jest.fn() },
        session: { get: jest.fn().mockResolvedValue({}) }
      },
      action: { setIcon: jest.fn(), setBadgeText: jest.fn(), setBadgeBackgroundColor: jest.fn(), setTitle: jest.fn() },
      scripting: { executeScript: jest.fn(), insertCSS: jest.fn() },
      webNavigation: {
        onCompleted: { addListener: jest.fn(fn => { webNavigationListener = fn; }) },
        onHistoryStateUpdated: { addListener: jest.fn() }
      },
      offscreen: {
        createDocument: jest.fn().mockResolvedValue(),
        closeDocument: jest.fn().mockResolvedValue(),
        hasDocument: jest.fn().mockResolvedValue(false)
      }
    };

    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('code') });

    jest.unstable_mockModule('../src/utils/coreUtils.js', () => ({
      isScannable: jest.fn().mockResolvedValue(true),
      isScanningGloballyEnabled: jest.fn().mockResolvedValue(true),
      isPassiveScanningEnabled: jest.fn().mockResolvedValue(true),
      createLRUCache: jest.fn(() => new Map()),
    }));

    jest.unstable_mockModule('../src/utils/rules.js', () => ({ secretRules: [] }));

    await import('../src/background.js');

    chrome.scripting.executeScript.mockResolvedValue([{
      result: {
        html: '<html></html>',
        inlineScripts: ['console.log("test");'],
        externalScripts: ['https://example.com/app.js']
      }
    }]);

    const scanPromise = webNavigationListener({ tabId: 1, frameId: 0, url: 'https://example.com' });

    await new Promise(r => setTimeout(r, 500));

    expect(global.Worker).toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'scanContent', target: 'offscreen' })
    );

    await scanPromise;

    delete global.browser;
  }, 10000);
  test('Firefox: contentMap MUST be built when Worker returns findings', async () => {
    global.browser = {
      runtime: {
        getBrowserInfo: jest.fn().mockResolvedValue({ name: 'Firefox' }),
        getURL: jest.fn(path => `moz-extension://fake-id/${path}`)
      }
    };

    let workerOnMessage;
    let workerOnError;
    const workerMock = {
      postMessage: jest.fn(),
      terminate: jest.fn(),
    };

    Object.defineProperty(workerMock, 'onmessage', {
      set(fn) { workerOnMessage = fn; },
      get() { return workerOnMessage; }
    });

    Object.defineProperty(workerMock, 'onerror', {
      set(fn) { workerOnError = fn; },
      get() { return workerOnError; }
    });

    global.Worker = jest.fn(() => workerMock);

    global.chrome = {
      runtime: {
        sendMessage: jest.fn(),
        getContexts: jest.fn().mockResolvedValue([]),
        getURL: jest.fn(path => `chrome-extension://test-id/${path}`),
        onMessage: { addListener: jest.fn(), hasListeners: jest.fn().mockReturnValue(true) },
        onStartup: { addListener: jest.fn() },
        onInstalled: { addListener: jest.fn() }
      },
      tabs: {
        get: jest.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
        query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
        create: jest.fn(),
        onUpdated: { addListener: jest.fn() },
        onActivated: { addListener: jest.fn() },
        onRemoved: { addListener: jest.fn() }
      },
      storage: {
        local: { get: jest.fn().mockResolvedValue({}), set: jest.fn(), remove: jest.fn() },
        sync: { get: jest.fn().mockResolvedValue({}), set: jest.fn() },
        session: { get: jest.fn().mockResolvedValue({}) }
      },
      action: { setIcon: jest.fn(), setBadgeText: jest.fn(), setBadgeBackgroundColor: jest.fn(), setTitle: jest.fn() },
      scripting: { executeScript: jest.fn(), insertCSS: jest.fn() },
      webNavigation: {
        onCompleted: { addListener: jest.fn(fn => { webNavigationListener = fn; }) },
        onHistoryStateUpdated: { addListener: jest.fn() }
      },
      offscreen: {
        createDocument: jest.fn().mockResolvedValue(),
        closeDocument: jest.fn().mockResolvedValue(),
        hasDocument: jest.fn().mockResolvedValue(false)
      }
    };

    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('const key = "SECRET";') });

    jest.unstable_mockModule('../src/utils/coreUtils.js', () => ({
      isScannable: jest.fn().mockResolvedValue(true),
      isScanningGloballyEnabled: jest.fn().mockResolvedValue(true),
      isPassiveScanningEnabled: jest.fn().mockResolvedValue(true),
      createLRUCache: jest.fn(() => new Map()),
    }));

    jest.unstable_mockModule('../src/utils/rules.js', () => ({ secretRules: [] }));
    await import('../src/background.js');

    chrome.scripting.executeScript.mockResolvedValue([{
      result: {
        html: '<html></html>',
        inlineScripts: [],
        externalScripts: ['https://example.com/app.js']
      }
    }]);

    const scanPromise = webNavigationListener({ tabId: 1, frameId: 0, url: 'https://example.com' });

    await new Promise(r => setTimeout(r, 500));

    expect(workerOnMessage).toBeDefined();

    workerOnMessage({
      data: {
        status: 'success',
        data: [
          { id: 'test-rule', secret: 'SECRET', source: 'https://example.com/app.js', line: 1, column: 1 }
        ]
      }
    });

    await scanPromise;
    await new Promise(r => setTimeout(r, 50));

    const storageWrites = chrome.storage.local.set.mock.calls;
    const completedWrite = storageWrites.find(call => {
      const data = Object.values(call[0])[0];
      return data?.status === 'complete';
    });

    expect(completedWrite).toBeDefined();

    const savedData = Object.values(completedWrite[0])[0];

    expect(savedData).toHaveProperty('contentMap');
    expect(savedData.contentMap).not.toBeUndefined();
    expect(typeof savedData.contentMap).toBe('object');
    expect(savedData.contentMap).toHaveProperty(['https://example.com/app.js']);
    expect(savedData.contentMap['https://example.com/app.js']).toContain('SECRET');

    delete global.browser;
  }, 10000);

  test('Firefox: contentMap must be empty object (not undefined) when no findings', async () => {
    global.browser = {
      runtime: {
        getBrowserInfo: jest.fn().mockResolvedValue({ name: 'Firefox' }),
        getURL: jest.fn(path => `moz-extension://fake-id/${path}`)
      }
    };

    let workerOnMessage;
    let workerOnError;
    const workerMock = {
      postMessage: jest.fn(),
      terminate: jest.fn(),
    };

    Object.defineProperty(workerMock, 'onmessage', {
      set(fn) { workerOnMessage = fn; },
      get() { return workerOnMessage; }
    });

    Object.defineProperty(workerMock, 'onerror', {
      set(fn) { workerOnError = fn; },
      get() { return workerOnError; }
    });

    global.Worker = jest.fn(() => workerMock);

    global.chrome = {
      runtime: {
        sendMessage: jest.fn(),
        getContexts: jest.fn().mockResolvedValue([]),
        getURL: jest.fn(path => `chrome-extension://test-id/${path}`),
        onMessage: { addListener: jest.fn(), hasListeners: jest.fn().mockReturnValue(true) },
        onStartup: { addListener: jest.fn() },
        onInstalled: { addListener: jest.fn() }
      },
      tabs: {
        get: jest.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
        query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
        create: jest.fn(),
        onUpdated: { addListener: jest.fn() },
        onActivated: { addListener: jest.fn() },
        onRemoved: { addListener: jest.fn() }
      },
      storage: {
        local: { get: jest.fn().mockResolvedValue({}), set: jest.fn(), remove: jest.fn() },
        sync: { get: jest.fn().mockResolvedValue({}), set: jest.fn() },
        session: { get: jest.fn().mockResolvedValue({}) }
      },
      action: { setIcon: jest.fn(), setBadgeText: jest.fn(), setBadgeBackgroundColor: jest.fn(), setTitle: jest.fn() },
      scripting: { executeScript: jest.fn(), insertCSS: jest.fn() },
      webNavigation: {
        onCompleted: { addListener: jest.fn(fn => { webNavigationListener = fn; }) },
        onHistoryStateUpdated: { addListener: jest.fn() }
      },
      offscreen: {
        createDocument: jest.fn().mockResolvedValue(),
        closeDocument: jest.fn().mockResolvedValue(),
        hasDocument: jest.fn().mockResolvedValue(false)
      }
    };

    jest.unstable_mockModule('../src/utils/coreUtils.js', () => ({
      isScannable: jest.fn().mockResolvedValue(true),
      isScanningGloballyEnabled: jest.fn().mockResolvedValue(true),
      isPassiveScanningEnabled: jest.fn().mockResolvedValue(true),
      createLRUCache: jest.fn(() => new Map()),
    }));

    jest.unstable_mockModule('../src/utils/rules.js', () => ({ secretRules: [] }));
    await import('../src/background.js');

    chrome.scripting.executeScript.mockResolvedValue([{
      result: { html: '<html></html>', inlineScripts: [], externalScripts: [] }
    }]);

    const scanPromise = webNavigationListener({ tabId: 1, frameId: 0, url: 'https://example.com' });

    await new Promise(r => setTimeout(r, 500));

    workerOnMessage({
      data: {
        status: 'success',
        data: []
      }
    });

    await scanPromise;
    await new Promise(r => setTimeout(r, 50));

    const storageWrites = chrome.storage.local.set.mock.calls;
    const completedWrite = storageWrites.find(call => {
      const data = Object.values(call[0])[0];
      return data?.status === 'complete';
    });

    expect(completedWrite).toBeDefined();
    const savedData = Object.values(completedWrite[0])[0];

    expect(savedData.results).toEqual([]);
    expect(savedData.contentMap).toEqual({});
    expect(savedData.contentMap).not.toBeUndefined();

    delete global.browser;
  }, 10000);
});
