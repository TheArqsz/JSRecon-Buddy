import { describe, test, expect, beforeEach, jest } from '@jest/globals';
let saveOptions, restoreOptions;

describe('Options Page Logic', () => {
  beforeEach(async () => {
    jest.resetModules();

    jest.unstable_mockModule('../../src/utils/rules.js', () => ({
      secretRules: [
        { id: 'aws-key', description: 'Amazon Web Services Key' },
        { id: 'google-api', description: 'Google Cloud API Key' },
        { id: 'slack-token', description: 'Slack API Token' },
      ],
    }));

    const optionsModule = await import('../../src/options/options.js');
    saveOptions = optionsModule.saveOptions;
    restoreOptions = optionsModule.restoreOptions;

    document.body.innerHTML = `
      <input type="checkbox" id="disable-title-notification">
      <input type="checkbox" id="disable-passive-scanning">
      <input type="checkbox" id="enable-dependency-scan">
      <input type="checkbox" id="enable-sourcemap-guessing">
      <textarea id="excluded-domains"></textarea>
      <div id="validation-error"></div>
      <input id="rule-search">
      <div id="rules-list-container">
        <div id="no-rules-found" class="empty-state-message" style="display: none;">
            No rules found.
        </div>
      </div>
      <button id="save-button">Save</button>
      <span id="status-message"></span>
    `;

    chrome.storage.sync.get.mockClear();
    chrome.storage.sync.set.mockClear();
    chrome.storage.sync.get.mockImplementation((defaults, callback) => {
      callback({
        showTitleNotification: true,
        isPassiveScanningEnabled: true,
        isNPMDependencyScanEnabled: false,
        isSourceMapGuessingEnabled: false,
        excludedDomains: '',
        excludedRuleIds: []
      });
    });
  });

  describe('restoreOptions', () => {
    test('should fetch settings from storage and populate the UI', () => {
      const mockSettings = {
        showTitleNotification: false,
        isPassiveScanningEnabled: false,
        isNPMDependencyScanEnabled: true,
        isSourceMapGuessingEnabled: true,
        excludedDomains: 'google.com\n/github\\.com/',
        excludedRuleIds: ['aws-key']
      };
      chrome.storage.sync.get.mockImplementation((defaults, callback) => {
        callback(mockSettings);
      });

      restoreOptions();

      expect(chrome.storage.sync.get).toHaveBeenCalled();
      expect(document.getElementById('disable-title-notification').checked).toBe(true);
      expect(document.getElementById('disable-passive-scanning').checked).toBe(true);
      expect(document.getElementById('enable-dependency-scan').checked).toBe(true);
      expect(document.getElementById('enable-sourcemap-guessing').checked).toBe(true);

      expect(document.getElementById('excluded-domains').value).toBe(mockSettings.excludedDomains);

      const awsCheckbox = document.getElementById('rule-aws-key');
      const googleCheckbox = document.getElementById('rule-google-api');
      expect(awsCheckbox.checked).toBe(true);
      expect(googleCheckbox.checked).toBe(false);
    });
  });

  describe('saveOptions', () => {
    test('should save valid settings to storage', () => {
      restoreOptions();
      document.getElementById('rule-google-api').checked = true;
      document.getElementById('rule-slack-token').checked = true;
      document.getElementById('disable-title-notification').checked = false;
      document.getElementById('disable-passive-scanning').checked = false;
      document.getElementById('enable-dependency-scan').checked = true;
      document.getElementById('enable-sourcemap-guessing').checked = true;

      document.getElementById('excluded-domains').value = 'youtube.com\n/valid-regex/';

      saveOptions();

      expect(chrome.storage.sync.set).toHaveBeenCalledWith(
        {
          showTitleNotification: true,
          isPassiveScanningEnabled: true,
          isNPMDependencyScanEnabled: true,
          isSourceMapGuessingEnabled: true,
          excludedDomains: 'youtube.com\n/valid-regex/',
          excludedRuleIds: ['google-api', 'slack-token']
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

    test('should correctly save the state of the passive scanning checkbox', () => {
      document.getElementById('disable-passive-scanning').checked = true;

      saveOptions();

      expect(chrome.storage.sync.set).toHaveBeenCalledWith(
        expect.objectContaining({ isPassiveScanningEnabled: false }),
        expect.any(Function)
      );
    });

    test('should correctly save the state of the dependency scanning checkbox', () => {
      document.getElementById('enable-dependency-scan').checked = true;

      saveOptions();

      expect(chrome.storage.sync.set).toHaveBeenCalledWith(
        expect.objectContaining({ isNPMDependencyScanEnabled: true }),
        expect.any(Function)
      );
    });

    test('should display a status message and then clear it after a delay', () => {
      jest.useFakeTimers();
      const statusMessage = document.getElementById('status-message');

      chrome.storage.sync.set.mockImplementation((items, callback) => {
        callback();
      });

      saveOptions();

      expect(statusMessage.textContent).toBe('Settings saved!');
      expect(statusMessage.classList.contains('visible')).toBe(true);

      jest.advanceTimersByTime(1500);

      expect(statusMessage.textContent).toBe('');
      expect(statusMessage.classList.contains('visible')).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('DOM Initialization', () => {
    jest.unstable_mockModule('../../src/utils/rules.js', () => ({
      secretRules: [
        { id: 'aws-key', description: 'Amazon Web Services Key' },
        { id: 'google-api', description: 'Google Cloud API Key' },
        { id: 'slack-token', description: 'Slack API Token' },
      ],
    }));

    beforeEach(async () => {
      document.body.innerHTML = `
            <input type="checkbox" id="disable-title-notification">
            <input type="checkbox" id="disable-passive-scanning">
            <input type="checkbox" id="enable-dependency-scan">
            <input type="checkbox" id="enable-sourcemap-guessing">
            <textarea id="excluded-domains"></textarea>
            <div id="validation-error"></div>
            <input id="rule-search">
            <div id="rules-list-container">
                <div id="no-rules-found" style="display: none;"></div>
            </div>
            <button id="save-button">Save</button>
            <span id="status-message"></span>
        `;

      await import('../../src/options/options.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    test('should call restoreOptions and attach event listeners', () => {
      expect(chrome.storage.sync.get).toHaveBeenCalled();
      document.getElementById('save-button').click();
      expect(chrome.storage.sync.set).toHaveBeenCalled();
    });

    test('should show matching rules when user types in search box', () => {
      const searchInput = document.getElementById('rule-search');
      const awsRule = document.getElementById('rule-aws-key').parentElement;
      const googleRule = document.getElementById('rule-google-api').parentElement;
      const noResultsMessage = document.getElementById('no-rules-found');

      searchInput.value = 'aws';
      searchInput.dispatchEvent(new Event('input'));

      expect(awsRule.style.display).toBe('flex');
      expect(googleRule.style.display).toBe('none');
      expect(noResultsMessage.style.display).toBe('none');
    });

    test('should hide matching rules and show no-results message on a failed search', () => {
      const searchInput = document.getElementById('rule-search');
      const awsRule = document.getElementById('rule-aws-key').parentElement;
      const noResultsMessage = document.getElementById('no-rules-found');

      searchInput.value = 'nonexistent';
      searchInput.dispatchEvent(new Event('input'));

      expect(awsRule.style.display).toBe('none');
      expect(noResultsMessage.style.display).toBe('block');
    });
  });

  describe('populateRulesList', () => {
    let populateRulesList;

    beforeEach(async () => {
      jest.resetModules();
      jest.unstable_mockModule('../../src/utils/rules.js', () => ({
        secretRules: [
          { id: 'aws-key', description: 'Amazon Key' },
          { id: 'google-api', description: 'Google API Key' },
        ],
      }));

      const optionsModule = await import('../../src/options/options.js');
      populateRulesList = optionsModule.populateRulesList;

      document.body.innerHTML = `<div id="rules-list-container"></div>`;
    });

    test('should create checkboxes for each secret rule', () => {
      populateRulesList();

      const ruleWrappers = document.querySelectorAll('.checkbox-wrapper');
      expect(ruleWrappers.length).toBe(2);

      const firstLabel = ruleWrappers[0].querySelector('label');
      expect(firstLabel.textContent).toBe('aws-key');
      expect(firstLabel.title).toBe('Amazon Key');
    });

    test('should correctly check the boxes for excluded rule IDs', () => {
      populateRulesList(['google-api']);

      const awsCheckbox = document.getElementById('rule-aws-key');
      const googleCheckbox = document.getElementById('rule-google-api');

      expect(awsCheckbox.checked).toBe(false);
      expect(googleCheckbox.checked).toBe(true);
    });

    test('should clear any existing rules before populating new ones', () => {
      const container = document.getElementById('rules-list-container');
      container.innerHTML = '<div class="checkbox-wrapper">Old Content</div>';

      populateRulesList();

      expect(container.textContent).not.toContain('Old Content');
      expect(container.textContent).toContain('aws-key');
    });
  });
});
