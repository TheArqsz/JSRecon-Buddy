import { isScannable as isScannableFunc } from '../utils/coreUtils.js';

/**
 * @description The full active tab object, stored globally for access by various functions and listeners.
 * @type {chrome.tabs.Tab}
 */
let activeTab;

/**
 * @description The active tab id object, stored globally for access by various functions and listeners.
 * @type {number}
 */
let activeTabId;

/**
 * @description The active tab url object, stored globally for access by various functions and listeners.
 * @type {string}
 */
let activeTabUrl;

/**
 * Main logic that runs when the popup's DOM is fully loaded.
 */
export async function initializePopup() {
  const scanButton = document.getElementById('scan-button');
  const rescanPassiveButton = document.getElementById('rescan-passive-btn');
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || !activeTab.id) {
    console.error("[JS Recon Buddy] Could not get active tab.");
    return;
  }

  const isScannable = await isScannableFunc(activeTab.url);

  activeTabId = activeTab.id;
  activeTabUrl = activeTab.url;

  if (!isScannable) {
    scanButton.disabled = true;
    scanButton.title = "This page cannot be scanned.";
  }

  loadAndRenderSecrets(activeTab, isScannable);

  const manifest = chrome.runtime.getManifest();
  const versionDisplay = document.getElementById('version-display');
  if (versionDisplay) {
    versionDisplay.textContent = `v${manifest.version}`;
  }

  scanButton.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({
      type: 'SCAN_PAGE',
      tabId: activeTabId
    });
    window.close();
  });

  rescanPassiveButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'FORCE_PASSIVE_RESCAN',
      tabId: activeTabId
    });

    const findingsList = document.getElementById('findings-list');
    if (findingsList) {
      findingsList.innerHTML = '<div class="no-findings"><span>Rescanning...</span></div>';
    }
  });

  const settingsButton = document.getElementById('settings-btn');

  if (settingsButton) {
    settingsButton.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }
}

/**
 * @description Listens for changes in local storage. If the data for the
 * active tab is updated (e.g., a scan finishes), it re-renders the popup
 * content dynamically without needing to reopen it.
 */
export function storageChangeListener(changes, areaName) {
  const findingsList = document.getElementById('findings-list');
  if (!activeTab) return;
  const pageKey = `${activeTabId}|${activeTabUrl}`;

  if (areaName === 'local' && changes[pageKey] && findingsList) {
    const updatedData = changes[pageKey].newValue;
    renderContent(updatedData, findingsList, true);
  }
}

/**
 * Asynchronously fetches passive scan data from `chrome.storage.local` and
 * triggers the rendering of the findings list or status messages.
 * @param {chrome.tabs.Tab} tab - The active tab object to load data for.
 * @param {boolean} [isScannable=true] - A flag indicating if the page can be scanned.
 * @returns {Promise<void>}
 */
export async function loadAndRenderSecrets(tab, isScannable = true) {
  const findingsList = document.getElementById('findings-list');
  if (!findingsList) return;

  const pageKey = `${tab.id}|${tab.url}`;

  findingsList.innerHTML = '<div class="no-findings"><span>Loading findings...</span></div>';

  chrome.storage.local.get(pageKey).then(data => {
    renderContent(data[pageKey], findingsList, isScannable);
  }).catch(error => {
    console.warn("[JS Recon Buddy] Error fetching local data:", error);
    findingsList.innerHTML = '<div class="no-findings"><span>Error loading findings.</span></div>';
  });
}

/**
 * Renders the content of the passive secrets list based on the current state.
 * It handles various states including "not scannable", "needs reload", "scanning",
 * "no findings", or the list of discovered secrets.
 * @param {object | undefined} storedData - The data object from local storage, which
 * may contain `{status: string, results: Array<object>}`.
 * @param {HTMLElement} findingsList - The DOM element to render the content into.
 * @param {boolean} [isScannable=true] - A flag indicating if the page can be scanned.
 */
export function renderContent(storedData, findingsList, isScannable = true) {
  findingsList.innerHTML = '';
  const rescanButton = document.getElementById('rescan-passive-btn');
  const findingsCountSpan = document.getElementById('findings-count');

  if (!isScannable) {
    findingsList.innerHTML = '<div class="no-findings"><span>This page type (e.g., chrome://, edge:// or excluded URL) cannot be scanned for secrets.</span></div>';
    return;
  }

  if (!storedData || !storedData.status) {
    findingsList.innerHTML = `
		<div class="no-findings">
			This page needs to be reloaded.
			<button id="reload-btn" class="btn-icon">
			<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3">
				<path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/>
			</svg>
			</button>
		</div>`;
    const reloadBtn = document.getElementById('reload-btn');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', () => {
        chrome.tabs.reload(activeTabId);
      });
    }
    return;
  }

  if (storedData.status === 'scanning') {
    findingsCountSpan.innerText = '';
    findingsList.innerHTML = '<div class="no-findings"><span>Secret scanning in progress...</span></div>';
    return;
  }

  const findings = storedData.results;

  const contentMap = storedData.contentMap || {};

  if (rescanButton) {
    rescanButton.style.display = 'inline-flex';
  }

  if (!findings || findings.length === 0) {
    findingsList.innerHTML = '<div class="no-findings"><span>No secrets found.</span></div>';
    return;
  }

  findingsCountSpan.innerText = `(${findings.length})`

  for (const finding of findings) {
    const card = document.createElement('div');
    card.className = 'finding-card';
    const truncatedSecret = finding.secret.length > 100 ? `${finding.secret.substring(0, 97)}...` : finding.secret;
    let description = finding.description
      ? `<p class="description">About: <span>${finding.description}</span></p>`
      : '';

    let locationHTML = '';
    if (finding.line && finding.column) {
      locationHTML = `<span class="finding-location">:${finding.line}:${finding.column}</span>`;
    }

    let sourceFormatted = '';
    if (finding.source.startsWith('http')) {
      sourceFormatted = `<a target="_blank" href="${finding.source}">${finding.source}</a>${locationHTML}`;
    } else {
      sourceFormatted = `${finding.source}${locationHTML}`;
    }

    card.innerHTML = `
      <h2>${finding.id}</h2>
      ${description}
      <p class="source">Source: <span>${sourceFormatted}</span></p>
      <p class="secret-found"><code>${truncatedSecret}</code></p>
    `;

    const button = document.createElement('button');
    button.className = 'btn btn-primary';
    button.textContent = 'View Source';
    if (finding.isSourceTooLarge || !contentMap[finding.source]) {
      button.disabled = true;
      button.title = 'Source file is too large to be displayed.';
    } else {
      button.onclick = async () => {
        const viewerUrl = chrome.runtime.getURL('src/source-viewer/source-viewer.html');
        const fullContent = contentMap[finding.source];
        if (!fullContent) {
          console.warn("[JS Recon Buddy] Could not find content for source:", finding.source);
          return;
        }

        const storageKey = `source-viewer-${Date.now()}`;
        const dataToStore = { content: fullContent, secret: finding.secret, source: finding.source };
        await chrome.storage.local.set({ [storageKey]: dataToStore });

        chrome.tabs.create({ url: `${viewerUrl}#${storageKey}` });

        window.close();
      };
    }

    card.appendChild(button);
    findingsList.appendChild(card);
  }
}

document.addEventListener('DOMContentLoaded', initializePopup);

chrome.storage.onChanged.addListener(storageChangeListener);
