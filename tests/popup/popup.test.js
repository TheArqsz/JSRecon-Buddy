import { describe, test, expect, beforeEach, jest } from '@jest/globals';


Object.assign(global, {
  window: {
    close: jest.fn(),
  },
});

import {
  renderContent,
  initializePopup,
  storageChangeListener
} from '../../src/popup/popup.js';

const flushPromises = () => new Promise(process.nextTick);

describe('Popup UI and Logic', () => {
  beforeEach(() => {
    document.body.innerHTML = `
            <button id="scan-button"></button>
            <button id="rescan-passive-btn"></button>
            <div id="findings-list"></div>
            <span id="findings-count"></span>
            <span id="version-display"></span>
        `;
    jest.clearAllMocks();
    chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://localhost' }]);
    chrome.storage.local.get.mockResolvedValue({});
    chrome.runtime.getManifest.mockReturnValue({ version: '1.2.3' });
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

    test('should show "scanning in progress" message', () => {
      const findingsList = document.getElementById('findings-list');
      renderContent({ status: 'scanning' }, findingsList, true);
      expect(findingsList.textContent).toContain('Secret scanning in progress...');
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
      renderContent(storedData, findingsList, true);

      expect(findingsList.querySelector('.finding-card')).not.toBeNull();
      expect(findingsList.textContent).toContain('test-rule-id');
      expect(findingsList.textContent).toContain('app.js:42:10');
      expect(findingsList.querySelector('.btn-primary').disabled).toBe(false);
    });
  });

  describe('initializePopup', () => {
    test('should correctly initialize and render with data from storage', async () => {
      chrome.storage.local.get.mockResolvedValue({
        '1|https://localhost': { status: 'complete', results: [] }
      });

      await initializePopup();

      await flushPromises();

      const findingsList = document.getElementById('findings-list');
      expect(chrome.tabs.query).toHaveBeenCalledTimes(1);
      expect(chrome.storage.local.get).toHaveBeenCalledWith('1|https://localhost');
      expect(findingsList.textContent).toContain('No secrets found');
    });

    test('should disable scan button for un-scannable URLs', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'about:debugging' }]);
      await initializePopup();
      const scanButton = document.getElementById('scan-button');
      expect(scanButton.disabled).toBe(true);
    });

    test('should display the extension version correctly', async () => {
      await initializePopup();
      const versionDisplay = document.getElementById('version-display');
      expect(versionDisplay.textContent).toBe('v1.2.3');
    });

    test('rescan button should send a message and update UI', async () => {
      await initializePopup();
      const rescanButton = document.getElementById('rescan-passive-btn');
      const findingsList = document.getElementById('findings-list');

      rescanButton.click();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'FORCE_PASSIVE_RESCAN',
        tabId: 1
      });
      expect(findingsList.textContent).toContain('Rescanning...');
    });
  });

  describe('storageChangeListener', () => {
    test('should re-render content when the active tab data changes in storage', async () => {
      await initializePopup();

      const findingsList = document.getElementById('findings-list');
      const pageKey = '1|https://localhost';
      const newData = {
        newValue: { status: 'complete', results: [{ id: 'new-finding', secret: '123', source: 'new.js' }] }
      };

      storageChangeListener({ [pageKey]: newData }, 'local');

      expect(findingsList.textContent).toContain('new-finding');
    });
  });
});
