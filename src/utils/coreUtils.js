/**
 * Calculates the Shannon entropy of a string.
 * @param {string} str The string to analyze.
 * @returns {number} The entropy value.
 */
export function shannonEntropy(str) {
  if (!str) {
    return 0;
  }
  const len = str.length;
  const frequencies = {};

  for (const char of str) {
    frequencies[char] = (frequencies[char] || 0) + 1;
  }

  let entropy = 0;
  for (const freq of Object.values(frequencies)) {
    const p = freq / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}


/**
 * Calculates the line and column number for a given character index in a string.
 * @param {string} content The full text content.
 * @param {number} index The character index of the finding.
 * @returns {{line: number, column: number}}
 */
export function getLineAndColumn(content, index) {
  const textUpToIndex = content.substring(0, index);
  const lines = textUpToIndex.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

/**
 * Captures the current state of the live DOM and serializes it into a
 * full HTML text string.
 *
 * This is an approximation of the "View Source" content but reflects
 * any modifications made by JavaScript after the page has loaded. It
 * gracefully handles pages without a DOCTYPE by providing a standard
 * HTML5 doctype as a fallback.
 *
 * @returns {string} A string representing the complete, current HTML
 * of the document, including the DOCTYPE declaration.
 * @example
 * const currentPageHTML = getDOMAsText();
 * console.log(currentPageHTML);
 */
export function getDOMAsText() {
  const doctypeString = document.doctype
    ? new XMLSerializer().serializeToString(document.doctype)
    : '<!DOCTYPE html>';

  const html = document.documentElement.outerHTML;
  return doctypeString + '\n' + html;
}

/**
 * Determines if a given URL is scannable by the extension, including user-defined exclusions.
 * This is an async function as it checks browser storage for the exclusion list.
 *
 * By default, URL is considered scannable if it is a standard webpage (starts with 'http')
 * and is not a protected or restricted domain, such as the Chrome Web Store.
 *
 * @param {string | undefined | null} url The URL to validate.
 * @returns {Promise<boolean>} A promise that resolves to true if the URL is scannable.
 */
export async function isScannable(url) {
  if (!url || !url.startsWith('http') ||
    url.startsWith('https://chrome.google.com/webstore') ||
    url.startsWith('https://chromewebstore.google.com/') ||
    url.startsWith('https://addons.mozilla.org')) {
    return false;
  }

  const { excludedDomains } = await chrome.storage.sync.get({ excludedDomains: '' });
  if (isUrlExcluded(url, excludedDomains)) {
    return false;
  }

  return true;
};

/**
 * Checks if a given URL matches any of the patterns in the exclusion list.
 * @param {string} url The URL of the tab to check.
 * @param {string} excludedList A newline-separated string of domains/patterns.
 * @returns {boolean} True if the URL should be excluded, false otherwise.
 */
export function isUrlExcluded(url, excludedList) {
  if (!excludedList) return false;
  const patterns = excludedList.split('\n').filter(p => p.trim() !== '');

  for (const pattern of patterns) {
    try {
      if (pattern.startsWith('/') && pattern.endsWith('/')) {
        const regex = new RegExp(pattern.slice(1, -1));
        if (regex.test(url)) return true;
      } else {
        if (url.includes(pattern)) return true;
      }
    } catch (e) {
      console.warn(`[JS Recon Buddy] Invalid Regex in exclusion list: ${pattern}`);
    }
  }
  return false;
}

/**
 * Checks if scanning is globally enabled by the user.
 * The setting is retrieved from `chrome.storage.sync` and defaults to true.
 * @async
 * @returns {Promise<boolean>} A promise that resolves to `true` if scanning is enabled, otherwise `false`.
 */
export async function isScanningGloballyEnabled() {
  const { isScanningEnabled } = await chrome.storage.sync.get({ isScanningEnabled: true });
  return isScanningEnabled;
}
