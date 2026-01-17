global.chrome.tabs.onActivated = { addListener: jest.fn() };

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const PASSIVE_SCAN_RESULT_PREFIX = 'jsrb_passive_scan';

jest.unstable_mockModule('../../src/utils/coreUtils.js', () => ({
  isScannable: jest.fn().mockResolvedValue(true),
}));

const {
  updateUIVisibility,
  renderContent,
  initializePopup,
  storageChangeListener,
  loadAndRenderSecrets
} = await import('../../src/popup/popup.js');
const { isScannable: isScannableFunc } = await import('../../src/utils/coreUtils.js');

const flushPromises = () => new Promise(process.nextTick);

describe('Popup UI and Logic', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input type="checkbox" id="scan-toggle">
      <button id="scan-button"></button>
      <button id="rescan-passive-btn"></button>
      <button id="settings-btn"></button>
      <main id="main-content"></main>
      <div id="disabled-content"></div>
      <div id="findings-list"></div>
      <span id="findings-count"></span>
      <span id="version-display"></span>
    `;
    jest.clearAllMocks();

    window.location.hash = '';
    window.close = jest.fn();

    isScannableFunc.mockResolvedValue(true);

    chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://localhost' }]);
    chrome.tabs.reload = jest.fn();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.sync.get.mockResolvedValue({ isScanningEnabled: true, isPassiveScanningEnabled: true });
    chrome.runtime.getManifest.mockReturnValue({ version: '1.2.3' });
  });

  describe('updateUIVisibility', () => {
    beforeEach(async () => {
      await initializePopup();
    });

    test('should show main content and enable scan button when enabled and scannable', async () => {
      chrome.storage.local.get.mockClear();
      chrome.storage.sync.get.mockClear();

      await updateUIVisibility(true, true, null, true);

      await new Promise(process.nextTick);

      expect(document.getElementById('main-content').style.display).toBe('block');
      expect(document.getElementById('disabled-content').style.display).toBe('none');
      expect(document.getElementById('scan-button').disabled).toBe(false);
    });

    test('should show main content but disable scan button when enabled and not scannable', async () => {
      isScannableFunc.mockResolvedValue(false);
      await updateUIVisibility(true);
      const scanButton = document.getElementById('scan-button');
      expect(scanButton.disabled).toBe(true);
      expect(scanButton.title).toBe('This page cannot be scanned.');
      expect(chrome.storage.local.get).toHaveBeenCalled();
    });

    test('should hide main content and disable scan button when scanning is disabled', async () => {
      await updateUIVisibility(false);
      const scanButton = document.getElementById('scan-button');
      expect(document.getElementById('main-content').style.display).toBe('none');
      expect(document.getElementById('disabled-content').style.display).toBe('block');
      expect(scanButton.disabled).toBe(true);
      expect(scanButton.title).toBe('Scanning is turned off.');
    });

    test('should not throw an error if the scan button is missing from the DOM', async () => {
      document.getElementById('scan-button').remove();

      await expect(updateUIVisibility(true)).resolves.not.toThrow();
      await expect(updateUIVisibility(false)).resolves.not.toThrow();
    });
  });

  describe('renderContent', () => {
    test('should show "not scannable" message when isScannable is false', () => {
      const findingsList = document.getElementById('findings-list');
      renderContent(null, findingsList, false);
      expect(findingsList.textContent).toContain('cannot be scanned for secrets');
    });

    test('should show "reload" message when no stored data is found', () => {
      const findingsList = document.getElementById('findings-list');
      renderContent(null, findingsList, true);
      expect(findingsList.textContent).toContain('This page needs to be reloaded');
    });

    test('should show "passive scanning disabled" message', () => {
      const findingsList = document.getElementById('findings-list');
      renderContent(null, findingsList, true, false);
      expect(findingsList.textContent).toContain('Passive secret scanning is disabled');
    });

    test('should handle the reload button click', async () => {
      await initializePopup();
      const findingsList = document.getElementById('findings-list');

      renderContent(null, findingsList, true, true);
      const reloadBtn = document.getElementById('reload-btn');
      reloadBtn.click();

      expect(chrome.tabs.reload).toHaveBeenCalledWith(1);
    });

    test('should show "scanning in progress" message when status is scanning', () => {
      const findingsList = document.getElementById('findings-list');
      const findingsCountSpan = document.getElementById('findings-count');
      findingsCountSpan.innerText = '(5)';

      const storedData = { status: 'scanning' };

      renderContent(storedData, findingsList, true, true);

      expect(findingsList.textContent).toContain('Secret scanning in progress...');
      expect(findingsCountSpan.innerText).toBe('');
    });

    test('should render a finding card without location details if either line or column is missing', () => {
      const findingsList = document.getElementById('findings-list');
      const storedData = {
        status: 'complete',
        results: [
          { id: 'no-col', secret: 'SECRET_1', source: 'app.js', line: 10 },
          { id: 'no-line', secret: 'SECRET_2', source: 'app.js', column: 20 },
          { id: 'both-null', secret: 'SECRET_3', source: 'app.js', line: null, column: null }
        ],
        contentMap: { 'app.js': '...' }
      };

      renderContent(storedData, findingsList, true, true);

      const findingCards = findingsList.querySelectorAll('.finding-card');

      expect(findingCards.length).toBe(3);
      findingCards.forEach(card => {
        const locationSpan = card.querySelector('.finding-location');
        expect(locationSpan).toBeNull();
      });
    });

    test('should render a finding card with location details', () => {
      const findingsList = document.getElementById('findings-list');
      const storedData = {
        status: 'complete',
        results: [{
          id: 'test-rule-id',
          description: 'A test finding',
          secret: 'API_SECRET_XYZ',
          source: 'app.js',
          line: 42,
          column: 10
        }],
        contentMap: { 'app.js': 'const secret = "API_SECRET_XYZ";' }
      };

      renderContent(storedData, findingsList, true, true);

      expect(findingsList.textContent).toContain('app.js:42:10');
    });

    test('should render a finding source as a clickable link if it is a URL', () => {
      const findingsList = document.getElementById('findings-list');
      const storedData = {
        status: 'complete',
        results: [{
          id: 'test-rule-external',
          secret: 'SECRET_IN_EXTERNAL_FILE',
          source: 'https://cdn.example.com/script.js',
          line: 1,
          column: 1
        }],
        contentMap: { 'https://cdn.example.com/script.js': '...' }
      };

      renderContent(storedData, findingsList, true, true);

      const findingCard = findingsList.querySelector('.finding-card');
      const sourceLink = findingCard.querySelector('.source a');

      expect(sourceLink).not.toBeNull();
      expect(sourceLink.getAttribute('href')).toBe('https://cdn.example.com/script.js');
      expect(sourceLink.textContent).toBe('https://cdn.example.com/script.js');
    });

    test('should disable the "View Source" button for large files or missing content', () => {
      const findingsList = document.getElementById('findings-list');
      const storedData = {
        status: 'complete',
        results: [
          {
            id: 'large-file-finding',
            secret: 'SECRET_1',
            source: 'large.js',
            isSourceTooLarge: true
          },
          {
            id: 'missing-content-finding',
            secret: 'SECRET_2',
            source: 'missing.js'
          }
        ],
        contentMap: { 'large.js': 'some content' }
      };

      renderContent(storedData, findingsList, true, true);

      const buttons = findingsList.querySelectorAll('.btn-primary');
      expect(buttons.length).toBe(2);

      const expectedTitle = 'Source file is too large to be displayed.';

      expect(buttons[0].disabled).toBe(true);
      expect(buttons[0].title).toBe(expectedTitle);

      expect(buttons[1].disabled).toBe(true);
      expect(buttons[1].title).toBe(expectedTitle);
    });

    test('should attach a working "View Source" button when content is available', async () => {
      const findingsList = document.getElementById('findings-list');
      const storedData = {
        status: 'complete',
        results: [{
          id: 'test-rule-clickable',
          secret: 'VALID_SECRET',
          source: 'app.js',
          isSourceTooLarge: false
        }],
        contentMap: { 'app.js': 'const secret = "VALID_SECRET";' }
      };

      renderContent(storedData, findingsList, true, true);
      const viewSourceButton = findingsList.querySelector('.btn-primary');

      viewSourceButton.click();
      await flushPromises();

      expect(viewSourceButton.disabled).toBe(false);

      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: expect.stringContaining('source-viewer.html#source-viewer-')
      });

      expect(window.close).toHaveBeenCalledTimes(1);
    });

    test('should not throw an error if the reload button is missing after render', () => {
      const findingsList = document.getElementById('findings-list');

      const getElementByIdSpy = jest.spyOn(document, 'getElementById');
      getElementByIdSpy.mockImplementation((id) => {
        if (id === 'reload-btn') {
          return null;
        }
        return document.querySelector(`#${id}`);
      });

      expect(() => {
        renderContent(null, findingsList, true, true);
      }).not.toThrow();

      getElementByIdSpy.mockRestore();
    });

    test('should not throw an error if the rescan button is missing from the DOM', () => {
      document.getElementById('rescan-passive-btn').remove();
      const findingsList = document.getElementById('findings-list');
      const storedData = { status: 'complete', results: [] };

      expect(() => {
        renderContent(storedData, findingsList, true, true);
      }).not.toThrow();
    });

    test('should show "No secrets found" when the results array is null or undefined', () => {
      const findingsList = document.getElementById('findings-list');
      const storedData = {
        status: 'complete',
        results: null
      };

      renderContent(storedData, findingsList, true, true);

      expect(findingsList.textContent).toContain('No secrets found');
    });

    test('should truncate secrets that are longer than 100 characters', () => {
      const findingsList = document.getElementById('findings-list');
      const longSecret = 'a'.repeat(120);
      const storedData = {
        status: 'complete',
        results: [{
          id: 'long-secret-rule',
          secret: longSecret,
          source: 'app.js',
        }],
        contentMap: { 'app.js': '...' }
      };

      renderContent(storedData, findingsList, true, true);

      const secretElement = findingsList.querySelector('.secret-found code');
      const expectedTruncatedSecret = longSecret.substring(0, 97) + '...';

      expect(secretElement.textContent).toBe(expectedTruncatedSecret);

      expect(secretElement.textContent).not.toBe(longSecret);
    });

    test('should validate element before rendering', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

      renderContent({}, null, true, true);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[JS Recon Buddy] Invalid findingsList element');
      consoleErrorSpy.mockRestore();
    });

    test('should sanitize finding data before rendering', () => {
      const findingsList = document.getElementById('findings-list');
      const maliciousData = {
        status: 'complete',
        results: [{
          id: '<script>alert("xss")</script>',
          secret: 'TEST_SECRET',
          source: 'javascript:alert(1)',
          description: '<img src=x onerror=alert(1)>'
        }],
        contentMap: {}
      };

      renderContent(maliciousData, findingsList, true, true);

      expect(findingsList.querySelector('script')).toBeNull();
      expect(findingsList.querySelector('img')).toBeNull();

      expect(findingsList.querySelector('a')).toBeNull();
      expect(findingsList.textContent).toContain('<script>alert("xss")</script>');
      expect(findingsList.textContent).toContain('<img src=x onerror=alert(1)>');
    });

    test('should add rel="noopener noreferrer" to external links', () => {
      const findingsList = document.getElementById('findings-list');
      const storedData = {
        status: 'complete',
        results: [{
          id: 'test',
          secret: 'SECRET',
          source: 'https://example.com/script.js'
        }],
        contentMap: { 'https://example.com/script.js': 'code' }
      };

      renderContent(storedData, findingsList, true, true);

      const link = findingsList.querySelector('a');
      expect(link.rel).toBe('noopener noreferrer');
    });

    test('should use clearElement instead of innerHTML', () => {
      const findingsList = document.getElementById('findings-list');
      findingsList.innerHTML = '<div>old content</div>';

      renderContent(null, findingsList, false, true);

      expect(findingsList.querySelector('div')).toBeTruthy();
    });

    test('should handle malformed finding objects gracefully', () => {
      const findingsList = document.getElementById('findings-list');
      const storedData = {
        status: 'complete',
        results: [
          null,
          undefined,
          { id: 123 },
          { secret: 'test' }
        ],
        contentMap: {}
      };

      expect(() => {
        renderContent(storedData, findingsList, true, true);
      }).not.toThrow();
    });

    test('should use generateStorageKey for View Source button', async () => {
      const findingsList = document.getElementById('findings-list');
      const storedData = {
        status: 'complete',
        results: [{
          id: 'test',
          secret: 'SECRET',
          source: 'app.js'
        }],
        contentMap: { 'app.js': 'code' }
      };

      renderContent(storedData, findingsList, true, true);
      const button = findingsList.querySelector('.btn-primary');

      button.click();
      await flushPromises();

      const storageCall = chrome.storage.local.set.mock.calls[0][0];
      const storageKey = Object.keys(storageCall)[0];

      const uuidPattern = /^source-viewer-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      const fallbackPattern = /^source-viewer-\d+-[a-z0-9]+$/;

      const isValidKey = uuidPattern.test(storageKey) || fallbackPattern.test(storageKey);
      expect(isValidKey).toBe(true);
    });

    test('should display source text if http-like source is invalid', () => {
      const findingsList = document.getElementById('findings-list');
      const storedData = {
        status: 'complete',
        results: [{
          id: 'invalid-http-source',
          secret: 'SECRET',
          source: 'http//invalid-url-format'
        }],
        contentMap: {}
      };

      renderContent(storedData, findingsList, true, true);

      const sourceSpan = findingsList.querySelector('.source span');

      expect(sourceSpan.textContent).toBe('http//invalid-url-format');
      expect(sourceSpan.querySelector('a')).toBeNull();
    });

    test('should not throw an error if findingsCountSpan is missing', () => {
      document.body.innerHTML = `<div id="findings-list"></div>`;
      const findingsList = document.getElementById('findings-list');

      const storedData = {
        status: 'complete',
        results: [{ id: 'test', secret: 'secret', source: 'app.js' }],
        contentMap: { 'app.js': 'code' }
      };

      expect(() => {
        renderContent(storedData, findingsList, true, true);
      }).not.toThrow();

      expect(findingsList.querySelector('.finding-card')).not.toBeNull();
    });
  });

  describe('initializePopup', () => {
    test('should correctly initialize and render with data from storage', async () => {
      chrome.storage.local.get.mockResolvedValue({
        'jsrb_passive_scan|https://localhost': { status: 'complete', results: [] }
      });

      await initializePopup();

      await flushPromises();

      const findingsList = document.getElementById('findings-list');
      expect(chrome.tabs.query).toHaveBeenCalledTimes(1);
      expect(chrome.storage.local.get).toHaveBeenCalledWith('jsrb_passive_scan|https://localhost');
      expect(findingsList.textContent).toContain('No secrets found');
    });

    test('should disable scan button if the page is not scannable', async () => {
      isScannableFunc.mockResolvedValue(false);

      await initializePopup();
      await flushPromises();

      const scanButton = document.getElementById('scan-button');
      expect(scanButton.disabled).toBe(true);
      expect(scanButton.title).toBe('This page cannot be scanned.');
    });

    test('should handle the scan toggle change event', async () => {
      await initializePopup();
      await flushPromises();
      const scanToggle = document.getElementById('scan-toggle');

      scanToggle.checked = false;
      scanToggle.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({ isScanningEnabled: false });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SCANNING_STATE_CHANGED',
        isEnabled: false
      });

      expect(document.getElementById('main-content').style.display).toBe('none');
    });

    test('should log an error and return early if no active tab is found', async () => {
      chrome.tabs.query.mockResolvedValue([]);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

      await initializePopup();
      await flushPromises();

      expect(consoleErrorSpy).toHaveBeenCalledWith("[JS Recon Buddy] Could not get active tab.");
      expect(chrome.storage.local.get).toHaveBeenCalledTimes(1);
      expect(chrome.storage.local.get).toHaveBeenCalledWith('extensionState');

      consoleErrorSpy.mockRestore();
    });

    test('should send a SCAN_PAGE message and close the popup when scan button is clicked', async () => {
      await initializePopup();
      await flushPromises();
      const scanButton = document.getElementById('scan-button');

      scanButton.click();
      await flushPromises();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SCAN_PAGE',
        tabId: 1
      });

      expect(window.close).toHaveBeenCalledTimes(1);
    });

    test('should handle the rescan button click event', async () => {
      await initializePopup();
      await flushPromises();
      const rescanButton = document.getElementById('rescan-passive-btn');
      const findingsList = document.getElementById('findings-list');

      rescanButton.click();

      await flushPromises();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'FORCE_PASSIVE_RESCAN',
        tabId: 1
      });

      expect(findingsList.textContent).toContain('Rescanning...');
    });

    test('should handle the settings button click event', async () => {
      await initializePopup();
      await flushPromises();
      const settingsButton = document.getElementById('settings-btn');

      settingsButton.click();

      expect(chrome.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
    });

    test('should not throw an error if the version display is missing from the DOM', async () => {
      document.getElementById('version-display').remove();

      await expect(initializePopup()).resolves.not.toThrow();
    });

    test('should not throw an error if the findings list is missing from the DOM', async () => {
      document.getElementById('findings-list').remove();

      await expect(initializePopup()).resolves.not.toThrow();
    });

    test('should not throw an error if findings list is missing on rescan click', async () => {
      await initializePopup();
      await flushPromises();

      document.getElementById('findings-list').remove();

      const rescanButton = document.getElementById('rescan-passive-btn');

      expect(() => {
        rescanButton.click();
      }).not.toThrow();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'FORCE_PASSIVE_RESCAN',
        tabId: 1
      });
    });

    test('should not throw an error if the settings button is missing from the DOM', async () => {
      document.getElementById('settings-btn').remove();

      await expect(initializePopup()).resolves.not.toThrow();
    });

    test('should log an error if triggering a rescan fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
      const mockError = new Error('Extension context invalidated.');
      chrome.runtime.sendMessage.mockRejectedValue(mockError);

      await initializePopup();
      await flushPromises();
      const rescanButton = document.getElementById('rescan-passive-btn');

      rescanButton.click();
      await flushPromises();

      expect(consoleErrorSpy).toHaveBeenCalledWith('[JS Recon Buddy] Failed to trigger rescan:', mockError);

      consoleErrorSpy.mockRestore();
    });

    test('should not have duplicate isScannable checks', async () => {
      isScannableFunc.mockClear();

      await initializePopup();
      await flushPromises();

      expect(isScannableFunc).toHaveBeenCalledTimes(1);
    });

    test('should not call loadAndRenderSecrets twice', async () => {
      chrome.storage.local.get.mockClear();

      await initializePopup();
      await flushPromises();

      // 1. call is for 'extensionState' at the start of initializePopup.
      // 2. call is for the page scan results inside loadAndRenderSecrets.
      expect(chrome.storage.local.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('storageChangeListener', () => {
    test('should re-render content when the active tab data changes in storage', async () => {
      await initializePopup();

      const findingsList = document.getElementById('findings-list');
      const pageKey = 'jsrb_passive_scan|https://localhost';
      const newData = {
        newValue: { status: 'complete', results: [{ id: 'new-finding', secret: '123', source: 'new.js' }] }
      };

      chrome.storage.local.get.mockResolvedValue({ [pageKey]: newData.newValue });

      storageChangeListener({ [pageKey]: newData }, 'local');
      await flushPromises();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(findingsList.textContent).toContain('new-finding');
    });

    test('should do nothing if the activeTab is not yet set', async () => {
      jest.resetModules();

      document.body.innerHTML = `<div id="findings-list"></div>`;
      const findingsList = document.getElementById('findings-list');
      const originalContent = findingsList.innerHTML;

      const { storageChangeListener: isolatedListener } = await import('../../src/popup/popup.js');

      const pageKey = 'jsrb_passive_scan|https://localhost';
      const newData = { newValue: {} };

      isolatedListener({ [pageKey]: newData }, 'local');
      await flushPromises();

      expect(findingsList.innerHTML).toBe(originalContent);
    });

    test('should do nothing if the change is not relevant', async () => {
      await initializePopup();
      jest.clearAllMocks();

      const pageKey = 'jsrb_passive_scan|https://localhost';
      const newData = { newValue: { status: 'complete' } };

      storageChangeListener({ [pageKey]: newData }, 'sync');
      await flushPromises();
      expect(chrome.storage.local.get).not.toHaveBeenCalled();

      storageChangeListener({ 'jsrb_passive_scan|https://other.com': newData }, 'local');
      await flushPromises();
      expect(chrome.storage.local.get).not.toHaveBeenCalled();
    });

    test('should clear existing timeout if a new relevant change arrives quickly', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      await initializePopup();
      await flushPromises();

      const pageKey = 'jsrb_passive_scan|https://localhost';
      const changeData = { newValue: { status: 'scanning' } };

      storageChangeListener({ [pageKey]: changeData }, 'local');

      storageChangeListener({ [pageKey]: changeData }, 'local');

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

      await flushPromises();

      clearTimeoutSpy.mockRestore();
    });
  });

  describe('loadAndRenderSecrets', () => {
    test('should return early and not throw an error if findings-list element is missing', async () => {
      document.body.innerHTML = `<div>Some other content</div>`;
      const tab = { id: 1, url: 'https://example.com' };

      await expect(loadAndRenderSecrets(tab, true)).resolves.not.toThrow();

      expect(chrome.storage.local.get).not.toHaveBeenCalled();
    });

    test('should display an error message if fetching data fails', async () => {
      const mockError = new Error('Storage is unavailable');
      chrome.storage.local.get.mockRejectedValue(mockError);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
      const tab = { id: 1, url: 'https://example.com' };
      const findingsList = document.getElementById('findings-list');

      await loadAndRenderSecrets(tab, true);
      await flushPromises();

      expect(consoleWarnSpy).toHaveBeenCalledWith("[JS Recon Buddy] Error fetching data:", mockError);
      expect(findingsList.textContent).toContain('Error loading findings.');

      consoleWarnSpy.mockRestore();
    });
  });

  describe('chrome.tabs.onActivated listener', () => {
    let onActivatedListener;

    beforeEach(async () => {
      chrome.tabs.onActivated.addListener = jest.fn(listener => {
        onActivatedListener = listener;
      });

      jest.resetModules();
      jest.unstable_mockModule('../../src/utils/coreUtils.js', () => ({
        isScannable: jest.fn().mockResolvedValue(true),
      }));
      await import('../../src/popup/popup.js');
    });

    test('should update UI when a new tab is activated successfully', async () => {
      const newTab = { id: 2, url: 'https://new-active-tab.com' };
      chrome.tabs.get.mockResolvedValue(newTab);
      chrome.storage.sync.get.mockResolvedValue({
        isScanningEnabled: true,
        isPassiveScanningEnabled: true
      });
      chrome.storage.local.get.mockResolvedValue({
        'jsrb_passive_scan|https://new-active-tab.com': { status: 'complete', results: [] }
      });

      await onActivatedListener({ tabId: 2 });
      await flushPromises();

      expect(chrome.tabs.get).toHaveBeenCalledWith(2);
      expect(chrome.storage.sync.get).toHaveBeenCalledWith(['isScanningEnabled', 'isPassiveScanningEnabled']);
      expect(chrome.storage.local.get).toHaveBeenCalledWith('jsrb_passive_scan|https://new-active-tab.com');
    });

    test('should log a warning if getting the new tab info fails', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
      const mockError = new Error('Invalid tab ID.');
      chrome.tabs.get.mockRejectedValue(mockError);

      await onActivatedListener({ tabId: 999 });
      await flushPromises();

      expect(consoleWarnSpy).toHaveBeenCalledWith('[JS Recon Buddy] Error updating popup for new tab:', mockError);
      expect(chrome.storage.sync.get).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    test('should handle rapid tab switches correctly', async () => {
      const tab1 = { id: 1, url: 'https://tab1.com' };
      const tab2 = { id: 2, url: 'https://tab2.com' };

      chrome.tabs.get
        .mockResolvedValueOnce(tab1)
        .mockResolvedValueOnce(tab2);

      const promise1 = onActivatedListener({ tabId: 1 });
      const promise2 = onActivatedListener({ tabId: 2 });

      await Promise.all([promise1, promise2]);
      await flushPromises();

      expect(chrome.storage.local.get).toHaveBeenLastCalledWith('jsrb_passive_scan|https://tab2.com');
    });
  });

  describe('Installation/Update State', () => {
    test('should display installation message and disable UI when state is "installing"', async () => {
      chrome.storage.local.get.mockResolvedValue({ extensionState: 'installing' });

      await initializePopup();
      await flushPromises();

      const disabledContent = document.getElementById('disabled-content');
      expect(disabledContent.textContent).toContain('Wait for installation/update to finish.');
      expect(disabledContent.style.display).toBe('block');
      expect(document.getElementById('main-content').style.display).toBe('none');

      expect(chrome.tabs.query).not.toHaveBeenCalled();

      expect(document.getElementById('scan-button').disabled).toBe(true);
      expect(document.getElementById('rescan-passive-btn').disabled).toBe(true);
      expect(document.getElementById('settings-btn').disabled).toBe(true);
      expect(document.getElementById('scan-toggle').disabled).toBe(true);
    });

    test('should continue normally if checking extensionState throws an error', async () => {
      const mockError = new Error('Storage failed');
      chrome.storage.local.get.mockRejectedValueOnce(mockError);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      await initializePopup();
      await flushPromises();

      expect(consoleWarnSpy).toHaveBeenCalledWith("[JS Recon Buddy] Could not get extension state:", mockError);
      expect(chrome.tabs.query).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });
});
