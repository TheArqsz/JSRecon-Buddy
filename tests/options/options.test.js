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
        excludedDomains: '',
        excludedRuleIds: []
      });
    });
  });

  describe('restoreOptions', () => {
    test('should fetch settings from storage and populate the UI', () => {
      const mockSettings = {
        showTitleNotification: false,
        excludedDomains: 'google.com\n/github\\.com/',
        excludedRuleIds: ['aws-key']
      };
      chrome.storage.sync.get.mockImplementation((defaults, callback) => {
        callback(mockSettings);
      });

      restoreOptions();

      expect(chrome.storage.sync.get).toHaveBeenCalled();
      expect(document.getElementById('disable-title-notification').checked).toBe(true);
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
      document.getElementById('excluded-domains').value = 'youtube.com\n/valid-regex/';

      saveOptions();

      expect(chrome.storage.sync.set).toHaveBeenCalledWith(
        {
          showTitleNotification: true,
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
  });

  describe('Rule Search/Filtering', () => {
    let searchInput;
    let ruleAws, ruleGoogle, ruleSlack;
    let noResultsMessage;

    beforeEach(() => {
      restoreOptions();

      const eventListenerCode = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const allRules = document.querySelectorAll('#rules-list-container .checkbox-wrapper');
        let visibleCount = 0;
        allRules.forEach(ruleWrapper => {
          const label = ruleWrapper.querySelector('label');
          const ruleId = label.textContent.toLowerCase();
          const ruleDescription = label.title.toLowerCase();
          if (ruleId.includes(searchTerm) || ruleDescription.includes(searchTerm)) {
            ruleWrapper.style.display = 'flex';
            visibleCount++;
          } else {
            ruleWrapper.style.display = 'none';
          }
        });
        noResultsMessage.style.display = visibleCount === 0 ? 'block' : 'none';
      };

      searchInput = document.getElementById('rule-search');
      searchInput.addEventListener('input', eventListenerCode);

      ruleAws = document.getElementById('rule-aws-key').parentElement;
      ruleGoogle = document.getElementById('rule-google-api').parentElement;
      ruleSlack = document.getElementById('rule-slack-token').parentElement;
      noResultsMessage = document.getElementById('no-rules-found');
    });

    test('should filter rules based on a search term matching an ID', () => {
      searchInput.value = 'aws';
      searchInput.dispatchEvent(new Event('input'));

      expect(ruleAws.style.display).toBe('flex');
      expect(ruleGoogle.style.display).toBe('none');
      expect(ruleSlack.style.display).toBe('none');
      expect(noResultsMessage.style.display).toBe('none');
    });

    test('should filter rules based on a search term matching a description', () => {
      searchInput.value = 'google cloud';
      searchInput.dispatchEvent(new Event('input'));

      expect(ruleAws.style.display).toBe('none');
      expect(ruleGoogle.style.display).toBe('flex');
      expect(ruleSlack.style.display).toBe('none');
    });

    test('should be case-insensitive', () => {
      searchInput.value = 'SLACK';
      searchInput.dispatchEvent(new Event('input'));

      expect(ruleAws.style.display).toBe('none');
      expect(ruleGoogle.style.display).toBe('none');
      expect(ruleSlack.style.display).toBe('flex');
    });

    test('should show a "no results" message when no rules match the search', () => {
      searchInput.value = 'nonexistentrule';
      searchInput.dispatchEvent(new Event('input'));

      expect(ruleAws.style.display).toBe('none');
      expect(ruleGoogle.style.display).toBe('none');
      expect(ruleSlack.style.display).toBe('none');
      expect(noResultsMessage.style.display).toBe('block');
    });
  });
});
