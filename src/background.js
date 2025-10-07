import { secretRules } from './utils/rules.js';
import { isScannable, isScanningGloballyEnabled, isPassiveScanningEnabled } from './utils/coreUtils.js';

const MAX_CONTENT_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * @description A map to keep track of which URLs have already been scanned.
 * @type {Map<string, {findingsCount: number}>}
 */
const scannedPages = new Map();

/**
 * @description A map to track scan promises currently in progress for each tab.
 * This prevents starting a new scan on a tab that is already being scanned.
 * @type {Map<number, Promise<void>>}
 */
const scansInProgress = new Map();

/**
 * @description A set of tab IDs that have been closed while a scan was in
 * progress. This acts as a cancellation flag to prevent completed scans
 * from saving data for tabs that no longer exist.
 * @type {Set<number>}
 */
const removedTabs = new Set();

/**
 * @description A queue to hold pending network requests. Each item is an object
 * containing the `url` to fetch and the `resolve` function of the promise
 * returned by `throttledFetch`.
 * @type {Array<{url: string, resolve: Function}>}
 */
const fetchQueue = [];

/**
 * @description A counter for the number of currently active fetch requests.
 * This is used to ensure the number of concurrent requests does not exceed
 * `MAX_CONCURRENT_FETCHES`.
 * @type {number}
 */
let activeFetches = 0;

/**
 * @description The maximum number of network requests allowed to run concurrently.
 * This constant is the core of the throttling mechanism, preventing the service
 * worker from being saturated with too many simultaneous fetches.
 * @type {number}
 */
const MAX_CONCURRENT_FETCHES = 3;

/**
 * @description The maximum number of full-page scans allowed to run concurrently.
 * @type {number}
 */
const MAX_CONCURRENT_SCANS = 7

/**
 * @description A counter for currently active full-page scans.
 * @type {number}
 */
let activeScans = 0;

/**
 * @description A queue to hold pending scan requests. Each item is the tabId
 * that needs to be scanned.
 * @type {Array<{tabId: number, force: boolean}>}
 */
const scanQueue = [];

/**
 * Checks which browser the extension is running in.
 * @returns {Promise<'firefox'|'chrome'>}
 */
async function checkBrowser() {
  if (typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function') {
    const info = await browser.runtime.getBrowserInfo();
    if (info.name === "Firefox") {
      return 'firefox';
    }
  }

  return 'chrome';
}

/**
 * Sets the extension icon to a neutral/disabled state for a specific tab.
 * @param {number} tabId The ID of the tab to update.
 */
async function setDisabledIconForTab(tabId) {
  if (!(await isValidTab(tabId))) return;

  const browserName = await checkBrowser();
  let iconsPath = 'icons';
  if (browserName === 'firefox') {
    iconsPath = 'src/icons';
  }

  try {
    chrome.action.setIcon({ tabId, path: `${iconsPath}/icon-scanning-128.png` });
    chrome.action.setBadgeText({ tabId, text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#949494ff' });
    chrome.action.setTitle({ tabId, title: 'Scanning is turned off' });
  } catch (error) {
    if (!error.message.includes('No tab with id')) {
      console.warn(`[JS Recon Buddy] Could not set disabled icon for tab ${tabId}:`, error.message);
    }
  }
}

/**
 * A throttled fetch function that uses a queue to limit concurrent network requests.
 * @param {string} url The URL to fetch.
 * @returns {Promise<string|null>} A promise that resolves with the content text or null on error.
 */
async function throttledFetch(url) {
  return new Promise((resolve) => {
    fetchQueue.push({ url, resolve });
    processFetchQueue();
  });
}

/**
 * Processes the fetch queue, ensuring the number of active fetches
 * does not exceed MAX_CONCURRENT_FETCHES.
 */
function processFetchQueue() {
  if (activeFetches >= MAX_CONCURRENT_FETCHES || fetchQueue.length === 0) {
    return;
  }

  activeFetches++;
  const { url, resolve } = fetchQueue.shift();

  fetch(url)
    .then(res => {
      if (!res.ok) {
        return resolve(null);
      }
      return res.text();
    })
    .then(text => resolve(text))
    .catch(err => {
      console.warn(`[JS Recon Buddy] Fetch error for ${url}:`, err.message);
      resolve(null);
    })
    .finally(() => {
      activeFetches--;
      processFetchQueue();
    });
}

/**
 * Listens for tab updates to trigger the initial scanning process status.
 * It sets a "scanning" visual state when a page starts loading and
 * initiates the actual scan once the page is fully loaded.
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab && !(await isScanningGloballyEnabled() && await isPassiveScanningEnabled())) {
    return setDisabledIconForTab(tabId);
  }
  if (!tab || !(await isScannable(tab.url))) {
    return;
  }
  if (changeInfo.status === 'loading') {
    setInitialLoadingState(tabId);
  }
});

/**
 * Listens for the successful completion of a page's main document navigation.
 *
 * This serves as the primary and most reliable trigger to start the actual
 * passive scan by calling `triggerPassiveScan`. It specifically checks that
 * the event is for the main frame (`frameId === 0`) to avoid incorrectly
 * triggering new scans for every iframe that finishes loading on the page.
 */
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (!(await isScanningGloballyEnabled() && await isPassiveScanningEnabled())) return;

  if (!details || !(await isScannable(details.url))) {
    return;
  }
  if (details.frameId === 0) {
    triggerPassiveScan(details.tabId);
  }
});

/**
 * Listens for when the active tab changes.
 * This ensures the icon is updated instantly when switching to a tab that has already been scanned.
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!(await isScanningGloballyEnabled() && await isPassiveScanningEnabled())) return;

  triggerPassiveScan(activeInfo.tabId);
});

/**
 * Listens for client-side navigations in Single Page Applications (e.g., React, Angular).
 */
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (!(await isScanningGloballyEnabled() && await isPassiveScanningEnabled())) return;

  if (!details || !(await isScannable(details.url))) {
    return;
  }
  if (details.frameId === 0) {
    triggerPassiveScan(details.tabId);
  }
});

/**
 * Cleans up the scanned pages set when a tab is closed to prevent memory leaks.
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [key, value] of scannedPages) {
    if (key.startsWith(`${tabId}|`)) {
      scannedPages.delete(key);
      chrome.storage.local.remove(key).catch(e => console.warn(e));
    }
  }
  scansInProgress.delete(tabId);
  removedTabs.add(tabId);
});

/**
 * Handles incoming messages from other parts of the extension.
 * This acts as a router for different actions, like starting the full
 * on-demand scan or fetching external scripts for a content script.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.type === "SCAN_PAGE" || request.type === 'FORCE_PASSIVE_RESCAN') {
        if (!(await isScanningGloballyEnabled())) {
          if (sendResponse) sendResponse({ status: "disabled" });
          return True;
        }
      }

      if (request.type === "SCAN_PAGE") {
        const targetTabId = request.tabId;
        chrome.scripting.insertCSS({
          target: { tabId: targetTabId },
          files: ["src/overlay/overlay.css"],
        });
        chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          files: ["src/overlay/overlay.js"],
        });
        sendResponse({ status: "ok" });
        return True;
      }

      if (request.type === "FETCH_SCRIPTS") {
        const fetchPromises = request.urls.map((url) =>
          fetch(url)
            .then((res) => (res.ok ? res.text() : Promise.reject()))
            .then((code) => ({ source: url, code }))
            .catch(() => null),
        );
        Promise.all(fetchPromises).then((results) => sendResponse(results));
        return true;
      }

      if (request.type === 'FORCE_PASSIVE_RESCAN') {
        const { tabId } = request;
        for (const key of scannedPages.keys()) {
          if (key.startsWith(`${tabId}|`)) {
            scannedPages.delete(key);
          }
        }
        triggerPassiveScan(tabId, true);
        return;
      }

      if (request.type === 'FETCH_FROM_CONTENT_SCRIPT') {
        fetch(request.url)
          .then(response => {
            if (response && response.status === 404) {
              return { status: 'not_found' };
            }
            if (!response.ok) {
              throw new Error(`Fetch error - HTTP status ${response.status}`);
            }
            return response.json();
          })
          .then(json => sendResponse(json))
          .catch(error => {
            console.warn(`[JS Recon Buddy] Error fetching the content for URL ${request.url}:`, error);
            sendResponse({ status: 'error', message: error.message });
          });

        return true;
      }

      if (request.type === 'CLEAR_STALE_CACHE') {
        if (typeof request.cacheKeyPrefix === 'string' && typeof request.maxCacheAge === 'number') {
          clearStaleLocalCache(request.cacheKeyPrefix, request.maxCacheAge);
        } else {
          console.warn('[JS Recon Buddy] CLEAR_STALE_CACHE message received without a valid maxCacheAge.');
        }
      }

      if (request.type === 'GET_HEADER_DATA') {
        const tabUrl = request.url;
        chrome.storage.session.get(`header_analysis_${tabUrl}`).then(data => {
          sendResponse(data[`header_analysis_${tabUrl}`].results || []);
        });
        return true;
      }

      if (request.type === 'SCANNING_STATE_CHANGED') {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (request.isEnabled) {
            triggerPassiveScan(tab.id);
          } else {
            await setDisabledIconForTab(tab.id);
          }
        }
      }
    } catch (error) {
      if (error.message.includes('No tab with id')) return;
      console.warn(`[JS Recon Buddy] Error in onMessage listener:`, error);
    }
  })();
  return (
    request.type === "FETCH_SCRIPTS" ||
    request.type === "FETCH_FROM_CONTENT_SCRIPT" ||
    request.type === "GET_HEADER_DATA"
  );
});

/**
 * Iterates over local storage to find and remove stale cache entries.
 *
 * This function retrieves all items from `chrome.storage.local`, filters for keys
 * that start with provided `cacheKeyPrefix`, and checks if their `timestamp` property is older
 * than the provided maximum age. Stale entries are then removed.
 *
 * @param {string} cacheKeyPrefix The prefix for storage keys to be checked (e.g., 'scan_cache_').
 * @param {number} maxCacheAge The maximum age of a cache entry in milliseconds.
 * @returns {Promise<void>} A promise that resolves when the cleanup is complete.
 */
async function clearStaleLocalCache(cacheKeyPrefix, maxCacheAge) {
  const now = Date.now();

  try {
    const allItems = await chrome.storage.local.get(null);
    const keysToRemove = [];

    for (const key in allItems) {
      if (key.startsWith(cacheKeyPrefix)) {
        const item = allItems[key];
        if (item && typeof item.timestamp === 'number' && (now - item.timestamp > maxCacheAge)) {
          keysToRemove.push(key);
        } else if (item && maxCacheAge === -1) {
          keysToRemove.push(key);
        }
      }
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  } catch (error) {
    console.warn('[JS Recon Buddy] Error while clearing stale local cache:', error);
  }
}

/**
 * Checks if a tab with the given ID is still open and accessible.
 * @param {number} tabId The ID of the tab to check.
 * @returns {Promise<boolean>} True if the tab exists, false otherwise.
 */
async function isValidTab(tabId) {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Manages the initial UI and state of a tab as it begins to load.
 *
 * This function is the first to act when a tab navigation starts. It checks
 * if complete scan results for the given URL are already stored in local
 * storage.
 *
 * - If cached results are found, it immediately restores the UI (icon, badge)
 * to reflect those findings and exits, preventing an unnecessary re-scan.
 * A brief delay is introduced to prevent potential UI flickering during
 * rapid page loads.
 *
 * - If no results are found, it sets the UI to a "scanning in progress" state
 * and updates the local storage, so the popup displays the correct status
 * while waiting for the scan to complete.
 *
 * @param {number} tabId The ID of the tab that has started loading.
 * @returns {Promise<void>} A promise that resolves once the initial state has been set.
 */
async function setInitialLoadingState(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !(await isScannable(tab.url))) {
      return;
    }

    const pageKey = `${tabId}|${tab.url}`;

    const dataWrapper = await chrome.storage.local.get(pageKey);
    const storedData = dataWrapper[pageKey];

    if (storedData && storedData.status === 'complete') {
      const findingsCount = storedData.results ? storedData.results.length : 0;
      await new Promise(r => setTimeout(r, 400));
      await updateActionUI(tabId, findingsCount);
      scannedPages.set(pageKey, { findingsCount });
      if (findingsCount == 0) {

        storedData.contentMap = {};
        try {
          await chrome.storage.local.set({ [pageKey]: storedData });
        } catch (error) { }
      }
      return;
    }

    const browserName = await checkBrowser();
    let iconsPath = 'icons'
    if (browserName === 'firefox') {
      iconsPath = 'src/icons'
    }

    chrome.action.setIcon({ tabId, path: `${iconsPath}/icon-scanning-128.png` });
    chrome.action.setBadgeText({ tabId, text: '...' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#FDB813' });
    chrome.action.setTitle({ tabId, title: 'Page loading, preparing to scan...' });
    await chrome.storage.local.set({ [pageKey]: { status: 'scanning' } });

  } catch (error) {
    if (error.message.includes('No tab with id')) return;
    console.warn(`[JS Recon Buddy] Error setting initial loading state for tab ${tabId}:`, error);
  }
}

/**
 * Main function to trigger a passive scan on a tab if necessary.
 * @param {number} tabId - The ID of the tab to potentially scan.
 * @param {boolean} [force=false] - If true, bypasses the duplicate scan check.
 */
async function triggerPassiveScan(tabId, force = false) {
  try {
    if (scansInProgress.has(tabId) && !force) {
      return;
    }
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !(await isScannable(tab.url))) {
      return;
    }

    if (!scanQueue.some(item => item.tabId === tabId)) {
      scanQueue.push({ tabId, force });
    }

    processScanQueue();


    const pageKey = `${tab.id}|${tab.url}`;
    if (scannedPages.has(pageKey) && !force) {
      const cachedScan = scannedPages.get(pageKey);
      await updateActionUI(tab.id, cachedScan.findingsCount);
      return;
    }

    const dataWrapper = await chrome.storage.local.get(pageKey);
    const storedData = dataWrapper[pageKey];

    if (storedData && storedData.status === 'complete' && !force) {
      const findingsCount = storedData.results ? storedData.results.length : 0;
      if (findingsCount == 0) {

        storedData.contentMap = {};
        try {
          await chrome.storage.local.set({ [pageKey]: storedData });
        } catch (error) { }
      }
      await updateActionUI(tab.id, findingsCount);
      scannedPages.set(pageKey, { findingsCount });
      return;
    }

    const scanPromise = (async () => {
      await setIconAndState(tabId, 'scanning');

      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapePageContent,
      });

      if (injectionResults && injectionResults[0] && injectionResults[0].result) {
        await runPassiveScan(injectionResults[0].result, tab.id, pageKey);
      } else {
        await setIconAndState(tabId, 'idle');
      }
    })();

    scansInProgress.set(tabId, scanPromise);

    scanPromise.catch(error => {
      if (error && error.message && error.message.includes('Missing host permission for the tab')) {
        console.warn(`[JS Recon Buddy] Firefox's error for tab ${tabId} was thrown`, error);
        return
      } else if (error && error.message && !error.message.includes('No tab with id')) {
        console.warn(`[JS Recon Buddy] An unexpected error occurred during the scan for tab ${tabId}:`, error);
      }
    }).finally(() => {
      scansInProgress.delete(tabId);
    });

  } catch (error) {
    scansInProgress.delete(tabId);
    if (error.message.includes('No tab with id')) {
      return;
    }
    console.error(`[JS Recon Buddy] Error triggering scan on tab ${tabId}:`, error);
  }
}

/**
 * Processes the scan queue, ensuring the number of active scans
 * does not exceed MAX_CONCURRENT_SCANS.
 */
async function processScanQueue() {
  if (activeScans >= MAX_CONCURRENT_SCANS || scanQueue.length === 0) {
    return;
  }

  activeScans++;
  const { tabId, force } = scanQueue.shift();

  try {
    if (scansInProgress.has(tabId) && !force) {
      activeScans--;
      processScanQueue();
      return;
    }

    const tab = await chrome.tabs.get(tabId);
    if (!tab || !(await isScannable(tab.url))) {
      activeScans--;
      processScanQueue();
      return;
    }

    const pageKey = `${tab.id}|${tab.url}`;
    if (scannedPages.has(pageKey) && !force) {
      const cachedScan = scannedPages.get(pageKey);
      await updateActionUI(tab.id, cachedScan.findingsCount);
      activeScans--;
      processScanQueue();
      return;
    }

    const dataWrapper = await chrome.storage.local.get(pageKey);
    const storedData = dataWrapper[pageKey];

    if (storedData && storedData.status === 'complete' && !force) {
      const findingsCount = storedData.results ? storedData.results.length : 0;
      if (findingsCount == 0) {
        storedData.contentMap = {};
        try {
          await chrome.storage.local.set({ [pageKey]: storedData });
        } catch (error) { }
      }
      await updateActionUI(tab.id, findingsCount);
      scannedPages.set(pageKey, { findingsCount });
      activeScans--;
      processScanQueue();
      return;
    }

    const scanPromise = (async () => {
      await setIconAndState(tabId, 'scanning');

      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapePageContent,
      });

      if (injectionResults && injectionResults[0] && injectionResults[0].result) {
        await runPassiveScan(injectionResults[0].result, tab.id, pageKey);
      } else {
        await setIconAndState(tabId, 'idle');
      }
    })();

    scansInProgress.set(tabId, scanPromise);

    scanPromise.catch(error => {
      if (error?.message?.includes('Missing host permission for the tab')) {
        console.warn(`[JS Recon Buddy] Firefox's error for tab ${tabId} was thrown`, error);
      } else if (error?.message && !error.message.includes('No tab with id')) {
        console.warn(`[JS Recon Buddy] An unexpected error occurred during the scan for tab ${tabId}:`, error);
      }
    }).finally(() => {
      scansInProgress.delete(tabId);
      activeScans--;
      processScanQueue();
    });
  } catch (error) {
    scansInProgress.delete(tabId);
    activeScans--;
    processScanQueue();
    if (error.message.includes('No tab with id')) {
      return;
    }
    console.error(`[JS Recon Buddy] Error processing scan for tab ${tabId}:`, error);
  }
}

/**
 * A global promise that acts as a mutex to prevent race conditions during the
 * creation of the offscreen document. If this variable is not null, it means
 * a creation process is already in progress, and any subsequent calls to
 * `getOrCreateOffscreenDocument` will wait for this promise to resolve instead
 * of initiating a new creation process.
 *
 * @type {Promise<void> | null}
 */
let creating;

/**
 * Ensures a single offscreen document exists, creating it only if necessary.
 *
 * This function is designed to be idempotent; it can be called multiple times,
 * but it will only initiate the creation of an offscreen document if one does
 * not already exist. It uses a global `creating` promise as a mutex to prevent
 * race conditions where multiple asynchronous operations might try to create the
 * document simultaneously. If creation is already in progress, subsequent calls
 * will wait for the existing creation promise to resolve.
 *
 * @returns {Promise<void>} A promise that resolves once the offscreen
 * document is confirmed to exist or has been successfully created.
 */
async function getOrCreateOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  if (existingContexts.length > 0) {
    return;
  }

  if (creating) {
    await creating;
  } else {
    try {
      creating = chrome.offscreen.createDocument({
        url: 'src/offscreen/offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Perform CPU-intensive secret scanning via regex.',
      });
      await creating;
    } catch (error) {
      console.warn('[JS Recon Buddy] An error has occurred creating an offscreen document within the extension', error);
    } finally {
      creating = null;
    }
  }
}

/**
 * Coordinates the passive scan for a given page.
 *
 * This function acts as the main orchestrator for a scan. It performs the
 * I/O-bound tasks of gathering all page content (HTML, inline and external
 * scripts). It then delegates the CPU-intensive work of running regular
 * expressions to a separate process using the Offscreen API to avoid blocking
 * the service worker. Finally, it receives the results, saves them to storage,
 * and updates the extension's UI.
 *
 * @param {object} pageData The initial content scraped from the page.
 * @param {string} pageData.html The full outer HTML of the document.
 * @param {string[]} pageData.inlineScripts An array of inline script contents.
 * @param {string[]} pageData.externalScripts An array of external script URLs.
 * @param {number} tabId The ID of the tab being scanned.
 * @param {string} pageKey The unique key ('${tabId}|${tab.url}') for this page, used for caching and storage.
 * @returns {Promise<void>} A promise that resolves when the scan coordination is complete and the UI is updated.
 */
async function runPassiveScan(pageData, tabId, pageKey) {
  if (!tabId) {
    return;
  }
  const allContentSources = [
    { source: 'HTML Document', content: pageData.html, isTooLarge: false },
    ...pageData.inlineScripts.map((script, i) => ({
      source: `Inline Script #${i + 1}`,
      content: script,
      isTooLarge: false
    })),
  ];

  const externalScriptPromises = pageData.externalScripts.map(url =>
    throttledFetch(url).then(content => {
      if (content) {
        return { source: url, content, isTooLarge: false };
      }
      return null;
    })
  );

  const fetchedScripts = await Promise.all(externalScriptPromises);

  fetchedScripts.forEach(script => {
    if (script) {
      allContentSources.push(script);
    }
  });

  const contentMap = {};
  const sourcesForOffscreen = allContentSources
    .filter(s => s.content)
    .map(s => {
      const contentSize = new Blob([s.content]).size;
      const isTooLarge = contentSize > MAX_CONTENT_SIZE_BYTES;
      if (!isTooLarge) {
        contentMap[s.source] = s.content;
      }
      return { source: s.source, content: s.content, isTooLarge: isTooLarge };
    });

  const { excludedRuleIds } = await chrome.storage.sync.get({ excludedRuleIds: [] });
  const activeRules = secretRules.filter(rule => !excludedRuleIds.includes(rule.id));

  const serializableRules = activeRules.map(rule => ({
    ...rule,
    regex: {
      source: rule.regex.source,
      flags: rule.regex.flags
    }
  }));

  const browserName = await checkBrowser();

  if (browserName === 'chrome') {
    await getOrCreateOffscreenDocument();

    try {
      await chrome.runtime.sendMessage({ type: 'ping', target: 'offscreen' });
    } catch (e) {
      console.warn(`[JS Recon Buddy] Offscreen document not responsive for tab ${tabId}.`, e);
    }

    const response = await chrome.runtime.sendMessage({
      type: 'scanContent',
      target: 'offscreen',
      allContentSources: sourcesForOffscreen,
      serializableRules: serializableRules
    });

    if (response && response.status === 'success') {
      if (removedTabs.has(tabId)) {
        console.log(`[JS Recon Buddy] Scan for closed tab ${tabId} was canceled. Discarding results.`);
        removedTabs.delete(tabId);
        clearStaleLocalCache(`source-viewer-${tabId}`, -1);
        chrome.storage.local.get(null, (allItems) => {
          const keysToRemove = Object.keys(allItems).filter(key => key.startsWith(`${tabId}|`));
          if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove);
          }
        });
        return;
      }
      const findings = response.data;
      const findingsCount = findings.length;
      scannedPages.set(pageKey, { findingsCount: findingsCount });

      try {
        if (findingsCount == 0) {
          await chrome.storage.local.set({
            [pageKey]: {
              status: 'complete',
              results: findings,
              contentMap: {},
            }
          });
        } else {
          await chrome.storage.local.set({
            [pageKey]: {
              status: 'complete',
              results: findings,
              contentMap: contentMap,
            }
          });
        }
      } catch (error) {
        if (error.message.toLowerCase().includes('quota')) {
          await chrome.storage.local.set({
            [pageKey]: { status: 'complete', results: findings, contentMap: {} }
          });
        }
      }

      await updateActionUI(tabId, findings.length);

    } else {
      console.warn(`[JS Recon Buddy] Offscreen scan failed for tab ${tabId}:`, response ? response.message : "No response received");

      await updateActionUI(tabId, 0);
      scannedPages.delete(pageKey);
      await chrome.storage.local.remove(pageKey);
    }

  } else {
    const scanWorker = new Worker(
      browser.runtime.getURL("src/offscreen/firefox-scan-worker.js"),
      { type: 'module' }
    );

    scanWorker.onmessage = async (event) => {
      const response = event.data;
      if (response && response.status === 'success') {
        if (removedTabs.has(tabId)) {
          console.log(`[JS Recon Buddy] Scan for closed tab ${tabId} was canceled. Discarding results.`);
          removedTabs.delete(tabId);
          clearStaleLocalCache(`source-viewer-${tabId}`, -1);
          browser.storage.local.get(null, (allItems) => {
            const keysToRemove = Object.keys(allItems).filter(key => key.startsWith(`${tabId}|`));
            if (keysToRemove.length > 0) {
              browser.storage.local.remove(keysToRemove);
            }
          });
          return;
        }
        const findings = response.data;
        const findingsCount = findings.length;
        scannedPages.set(pageKey, { findingsCount: findingsCount });

        try {
          if (findingsCount == 0) {
            await chrome.storage.local.set({
              [pageKey]: { status: 'complete', results: findings, contentMap: {} }
            });
          } else {
            await chrome.storage.local.set({
              [pageKey]: { status: 'complete', results: findings, contentMap: contentMap }
            });
          }
        } catch (error) {
          if (error.message.toLowerCase().includes('quota')) {
            await chrome.storage.local.set({
              [pageKey]: { status: 'complete', results: findings, contentMap: {} }
            });
          }
        }
        await updateActionUI(tabId, findings.length);
      } else {
        console.warn(`[JS Recon Buddy] Worker scan failed for tab ${tabId}:`, response ? response.message : "No response received");
        await updateActionUI(tabId, 0);
        scannedPages.delete(pageKey);
        await browser.storage.local.remove(pageKey);
      }
      scanWorker.terminate();
    };

    scanWorker.onerror = async (error) => {
      console.warn(`[JS Recon Buddy] Worker scan failed for tab ${tabId}:`, error);
      await updateActionUI(tabId, 0);
      scannedPages.delete(pageKey);
      await browser.storage.local.remove(pageKey);
      scanWorker.terminate();
    };

    scanWorker.postMessage({ allContentSources: sourcesForOffscreen, serializableRules: serializableRules });
  }
}

/**
 * Centralized function to set the action icon and the storage state.
 * This ensures the icon and popup UI are always synchronized.
 * @param {number} tabId
 * @param {'scanning' | 'idle'} state
 */
async function setIconAndState(tabId, state) {
  if (!(await isValidTab(tabId))) {
    return;
  }
  const browserName = await checkBrowser();
  let iconsPath = 'icons'
  if (browserName === 'firefox') {
    iconsPath = 'src/icons'
  }
  try {
    if (state === 'scanning') {
      chrome.action.setIcon({ tabId, path: `${iconsPath}/icon-scanning-128.png` });
      chrome.action.setTitle({ tabId, title: 'Passive scanning in progress...' });
      chrome.action.setBadgeText({ tabId, text: '...' });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#FDB813' });

      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.url) {
        const pageKey = `${tabId}|${tab.url}`;
        await chrome.storage.local.set({ [pageKey]: { status: 'scanning' } });
      }
    } else {
      chrome.action.setIcon({ tabId, path: `${iconsPath}/icon-notfound-128.png` });
      chrome.action.setTitle({ tabId, title: '' });
      chrome.action.setBadgeText({ tabId, text: '' });
    }
  } catch (error) {
    if (error.message.includes('No tab with id')) return;
    console.warn(`[JS Recon Buddy] Error in setIconAndState for tab ${tabId}:`, error);
  }
}

/**
 * Updates the title of a specific tab to reflect the number of findings.
 * It injects a script to safely modify the page's document.title.
 * @param {number} tabId - The ID of the tab to update.
 * @param {number} findingsCount - The number of secrets found.
 * @returns {Promise<void>}
 */
async function updateTabTitle(tabId, findingsCount) {
  if (!(await isValidTab(tabId))) {
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (count) => {
        const oldPrefixRegex = /^\[JSRB \(\d+\)\] /;
        const originalTitle = document.title.replace(oldPrefixRegex, '');

        if (count > 0) {
          document.title = `[JSRB (${count})] ${originalTitle}`;
        } else {
          document.title = originalTitle;
        }
      },
      args: [findingsCount],
    });
  } catch (error) {
    if (error.message.includes("Cannot access a chrome:// URL")) return;
    console.warn(`[JS Recon Buddy] Could not update title for tab ${tabId}:`, error.message);
  }
}

/**
 * Updates the extension's action icon and badge based on the number of findings.
 * @param {number} tabId - The ID of the tab whose action icon should be updated.
 * @param {number} findingsCount - The number of secrets found.
 */
async function updateActionUI(tabId, findingsCount) {
  if (!(await isValidTab(tabId))) {
    return;
  }

  const browserName = await checkBrowser();
  let iconsPath = 'icons'
  if (browserName === 'firefox') {
    iconsPath = 'src/icons'
  }

  try {
    if (findingsCount > 0) {
      chrome.action.setIcon({ tabId, path: `${iconsPath}/icon-found-128.png` });
      chrome.action.setBadgeText({ tabId, text: findingsCount.toString() });
      chrome.action.setTitle({ tabId, title: `Found ${findingsCount} potential secrets` })
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#D92A2A' });
    } else {
      chrome.action.setIcon({ tabId, path: `${iconsPath}/icon-notfound-128.png` });
      chrome.action.setBadgeText({ tabId, text: '' });
      chrome.action.setTitle({ tabId, title: '' });
    }

    const { showTitleNotification } = await chrome.storage.sync.get({ showTitleNotification: true });
    if (showTitleNotification) {
      await updateTabTitle(tabId, findingsCount);
    } else {
      await updateTabTitle(tabId, 0);
    }
  } catch (error) {
    if (error.message.includes('No tab with id')) {
      console.warn("[JS Recon Buddy] The tab that we were working on was prematurely closed")
      return;
    } else {
      console.warn("[JS Recon Buddy] There was an uncaught error when updating the tab icon: ", error)
    }
  }
}

/**
 * Scrapes the initial content from the active web page.
 * This function is executed in the context of the web page itself,
 * not in the service worker's context.
 * @returns {{html: string, inlineScripts: string[], externalScripts: string[]}} An object containing the page's content.
 */
function scrapePageContent() {
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
}
