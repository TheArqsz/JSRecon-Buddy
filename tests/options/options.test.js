import { describe, test, expect, beforeEach, jest } from '@jest/globals';

import { saveOptions, restoreOptions } from '../../src/options/options.js';

describe('Options Page Logic', () => {

  beforeEach(() => {
    document.body.innerHTML = `
            <input type="checkbox" id="disable-title-notification">
            <textarea id="excluded-domains"></textarea>
            <div id="validation-error"></div>
            <button id="save-button">Save</button>
            <span id="status-message"></span>
        `;
    chrome.storage.sync.get.mockClear();
    chrome.storage.sync.set.mockClear();
  });

  describe('restoreOptions', () => {
    test('should fetch settings from storage and populate the UI', () => {
      const mockSettings = {
        showTitleNotification: false,
        excludedDomains: 'google.com\n/github\\.com/'
      };
      chrome.storage.sync.get.mockImplementation((defaults, callback) => {
        callback(mockSettings);
      });

      restoreOptions();

      expect(chrome.storage.sync.get).toHaveBeenCalled();
      expect(document.getElementById('disable-title-notification').checked).toBe(true);
      expect(document.getElementById('excluded-domains').value).toBe(mockSettings.excludedDomains);
    });
  });

  describe('saveOptions', () => {
    test('should save valid settings to storage', () => {
      document.getElementById('disable-title-notification').checked = false;
      document.getElementById('excluded-domains').value = 'youtube.com\n/valid-regex/';

      saveOptions();

      expect(chrome.storage.sync.set).toHaveBeenCalledWith(
        {
          showTitleNotification: true,
          excludedDomains: 'youtube.com\n/valid-regex/'
        },
        expect.any(Function)
      );
    });

    test('should NOT save settings and should show an error for invalid regex', () => {
      const excludedTextarea = document.getElementById('excluded-domains');
      const validationError = document.getElementById('validation-error');
      excludedTextarea.value = '/[invalid-regex/';

      saveOptions();

      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
      expect(validationError.textContent).toContain('Invalid regular expression');
      expect(excludedTextarea.classList.contains('invalid')).toBe(true);
    });

    test('should correctly save the state of the checkbox', () => {
      document.getElementById('disable-title-notification').checked = true;

      saveOptions();

      expect(chrome.storage.sync.set).toHaveBeenCalledWith(
        expect.objectContaining({ showTitleNotification: false }),
        expect.any(Function)
      );
    });
  });
});
