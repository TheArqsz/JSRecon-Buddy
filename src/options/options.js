import { secretRules } from '../utils/rules.js';

/**
 * Dynamically populates the rules list container with checkboxes for each rule.
 * @param {string[]} excludedIds - An array of rule IDs that should be checked (excluded).
 */
function populateRulesList(excludedIds = []) {
  const container = document.getElementById('rules-list-container');
  const existingRules = container.querySelectorAll('.checkbox-wrapper');
  existingRules.forEach(rule => rule.remove());

  secretRules.forEach(rule => {
    const ruleWrapper = document.createElement('div');
    ruleWrapper.className = 'checkbox-wrapper';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `rule-${rule.id}`;
    checkbox.value = rule.id;
    checkbox.checked = excludedIds.includes(rule.id);

    const label = document.createElement('label');
    label.htmlFor = `rule-${rule.id}`;
    label.textContent = rule.id;
    label.title = rule.description;

    ruleWrapper.appendChild(checkbox);
    ruleWrapper.appendChild(label);
    container.appendChild(ruleWrapper);
  });
}

/**
 * Saves the current settings from the UI to chrome.storage.sync.
 */
export function saveOptions() {
  const excludedTextarea = document.getElementById('excluded-domains');
  const validationError = document.getElementById('validation-error');
  const excludedDomains = excludedTextarea.value;
  const lines = excludedDomains.split('\n');
  let hasError = false;

  validationError.textContent = '';
  excludedTextarea.classList.remove('invalid');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('/') && trimmedLine.endsWith('/')) {
      try {
        new RegExp(trimmedLine.slice(1, -1));
      } catch (e) {
        validationError.textContent = `Invalid regular expression!`;
        excludedTextarea.classList.add('invalid');
        hasError = true;
        break;
      }
    }
  }

  if (hasError) {
    return;
  }

  const showTitleNotification = !document.getElementById('disable-title-notification').checked;

  const excludedRuleCheckboxes = document.querySelectorAll('#rules-list-container input[type="checkbox"]:checked');
  const excludedRuleIds = Array.from(excludedRuleCheckboxes).map(cb => cb.value);

  chrome.storage.sync.set({
    showTitleNotification: showTitleNotification,
    excludedDomains: excludedDomains,
    excludedRuleIds: excludedRuleIds
  }, () => {
    const status = document.getElementById('status-message');
    status.textContent = 'Settings saved!';
    status.classList.add('visible');

    setTimeout(() => {
      status.textContent = '';
      status.classList.remove('visible');
    }, 1500);
  });
}

/**
 * Restores the settings from chrome.storage.sync and populates the UI.
 */
export function restoreOptions() {
  chrome.storage.sync.get({
    showTitleNotification: true,
    excludedDomains: '',
    excludedRuleIds: []
  }, (items) => {
    document.getElementById('disable-title-notification').checked = !items.showTitleNotification;
    document.getElementById('excluded-domains').value = items.excludedDomains;
    populateRulesList(items.excludedRuleIds);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  document.getElementById('save-button').addEventListener('click', saveOptions);
  document.getElementById('rule-search').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const allRules = document.querySelectorAll('#rules-list-container .checkbox-wrapper');
    const noResultsMessage = document.querySelector('#no-rules-found');

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
    if (visibleCount === 0) {
      noResultsMessage.style.display = 'block';
    } else {
      noResultsMessage.style.display = 'none';
    }
  });
});
