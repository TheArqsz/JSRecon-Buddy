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

  chrome.storage.sync.set({
    showTitleNotification: showTitleNotification,
    excludedDomains: excludedDomains
  }, () => {
    const status = document.getElementById('status-message');
    status.textContent = 'Settings saved!';
    setTimeout(() => {
      status.textContent = '';
    }, 1500);
  });
}

/**
 * Restores the settings from chrome.storage.sync and populates the UI.
 */
export function restoreOptions() {
  chrome.storage.sync.get({
    showTitleNotification: true,
    excludedDomains: ''
  }, (items) => {
    document.getElementById('disable-title-notification').checked = !items.showTitleNotification;
    document.getElementById('excluded-domains').value = items.excludedDomains;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  document.getElementById('save-button').addEventListener('click', saveOptions);
});
