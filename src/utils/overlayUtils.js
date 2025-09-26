/**
 * Copies text to the clipboard, using a fallback for insecure (HTTP) pages.
 * @param {string} textToCopy The text to be copied.
 * @returns {Promise<void>} A promise that resolves when the copy is complete.
 */
export async function copyTextToClipboard(textToCopy) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(textToCopy);
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = textToCopy;

    textArea.style.position = "absolute";
    textArea.style.left = "-9999px";

    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error("[JS Recon Buddy] Fallback copy failed", err);
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

/**
 * A utility function to decode various text encodings found in scripts.
 * @param {string} str - The string to decode.
 * @returns {string} The decoded, plain text string.
 */
export function decodeText(str) {
  const standardizedStr = str.replace(
    /\\?u00([0-9a-f]{2})/gi,
    (match, hex) => `%${hex}`,
  );

  const decodedStr = standardizedStr.replace(/%[0-9a-f]{2}/gi, (match) => {
    try {
      return decodeURIComponent(match);
    } catch (err) {
      return match;
    }
  });

  const tempEl = document.createElement("textarea");
  tempEl.innerHTML = decodedStr;
  return tempEl.value;
}

/**
 * A utility to extract the current hostname and its base domain from the page URL.
 * @returns {{currentHostname: string, baseDomain: string}} An object containing hostname info.
 */
export function getDomainInfo() {
  const hostname = window.location.hostname;
  const parts = hostname.split(".");
  if (parts.length <= 2)
    return { currentHostname: hostname, baseDomain: hostname };
  const slds = new Set(["co", "com", "gov", "org", "net", "ac", "edu"]);
  const baseDomain = slds.has(parts[parts.length - 2])
    ? parts.slice(-3).join(".")
    : parts.slice(-2).join(".");
  return { currentHostname: hostname, baseDomain };
}

/**
 * Generates a unique cache key from a prefix and a URL.
 * @param {string} prefix The static prefix for the cache key (e.g., 'scan_cache_').
 * @param {string} url The full URL to be used in the key.
 * @returns {string} The complete and unique cache key.
 */
export function getCacheKey(prefix, url) {
  return `${prefix}${url}`;
}

/**
 * Retrieves and validates scan results from local storage for a given key.
 * It checks for cache expiration and deserializes Map objects from the stored plain objects.
 * @param {string} key The cache key to retrieve from storage.
 * @param {number} maxAgeMs The maximum age of the cache in milliseconds before it's considered stale.
 * @returns {Promise<object|null>} A promise that resolves to the cached data object,
 * or null if no cache is found.
 */
export async function getCachedResults(key, maxAgeMs) {
  const dataWrapper = await chrome.storage.local.get(key);
  const cachedData = dataWrapper[key];

  if (!cachedData || !cachedData.timestamp) {
    return null;
  }

  const now = new Date().getTime();
  const cacheAge = now - cachedData.timestamp;

  if (cacheAge > maxAgeMs) {
    console.log(`[JS Recon Buddy] Cache for key "${key}" is expired.`);
    chrome.runtime.sendMessage({
      type: 'CLEAR_STALE_CACHE',
      cacheKeyPrefix: key,
      maxCacheAge: maxAgeMs
    });
    return null;
  }

  if (!cachedData.contentMap) {
    cachedData.contentMap = {};
  }

  const results = {};
  for (const category in cachedData.results) {
    results[category] = new Map(Object.entries(cachedData.results[category]));
  }

  return { ...cachedData, results };
}

/**
 * Serializes and saves scan results to local storage under a specific key, and
 * triggers a global stale cache cleanup.
 *
 * It converts Map objects into plain objects and checks if the total size
 * exceeds a given limit, removing the content map if necessary to save space.
 * @param {string} key The cache key under which to store the data.
 * @param {object} results The scan results object, where values are Maps of findings.
 * @param {object} contentMap The map of source content.
 * @param {number} maxCacheSizeBytes The maximum allowed size in bytes for the cached data.
 * @param {string} cacheKeyPrefix The prefix for all cache keys, used to trigger a global cleanup.
 * @param {number} maxCacheAgeMs The max age for items, used to trigger a global cleanup.
 * @returns {Promise<void>} A promise that resolves when the data has been set.
 */
export async function setCachedResults(key, results, contentMap, maxCacheSizeBytes, cacheKeyPrefix, maxCacheAgeMs) {
  chrome.runtime.sendMessage({
    type: 'CLEAR_STALE_CACHE',
    cacheKeyPrefix: cacheKeyPrefix,
    maxCacheAge: maxCacheAgeMs
  });

  const serializableResults = {};
  for (const category in results) {
    if (results[category] instanceof Map) {
      serializableResults[category] = Object.fromEntries(results[category]);
    }
  }

  let dataToCache = {
    results: serializableResults,
    contentMap: contentMap,
    timestamp: new Date().getTime()
  };

  const estimatedSize = new Blob([JSON.stringify(dataToCache)]).size;

  if (estimatedSize > maxCacheSizeBytes) {
    console.warn(`[JS Recon Buddy] Total cache size (${Math.round(estimatedSize / 1024)} KB) exceeds limit. Caching results without source content.`);
    dataToCache.contentMap = {};
  }

  try {
    await chrome.storage.local.set({ [key]: dataToCache });
  } catch (error) {
    console.warn(`[JS Recon Buddy] Failed to set cache for ${key}, even after size reduction:`, error);
  }
}

/**
 * Updates the header text and style in the overlay UI to reflect scan status.
 * @param {HTMLElement} statusElement - The DOM element to update (e.g., the span for the status).
 * @param {string} titleText - The text to display in the header.
 * @param {string} [scanType='else'] - The type of scan ('live' or other) for conditional styling.
 */
export function updateOverlayHeader(statusElement, titleText, scanType = 'else') {
  if (!statusElement) {
    console.warn("[JS Recon Buddy] Cannot update overlay header: status element not provided.");
    return;
  }

  statusElement.textContent = titleText;
  if (scanType === 'live') {
    statusElement.classList.add('live-scan');
  } else {
    statusElement.classList.remove('live-scan');
  }
}

/**
 * @typedef {object} ScriptContent
 * @property {string} source - The source of the content (e.g., URL, 'Inline Script #1').
 * @property {string} code - The actual script or HTML code as a string.
 */

/**
 * Gathers script content from the page for analysis and combines it with the provided HTML.
 * This includes inline scripts and external scripts (fetched via the background service worker).
 * @param {string} mainHtml The full current DOM as an HTML string, passed from the caller.
 * @returns {Promise<ScriptContent[]>} A promise that resolves to an array of content objects.
 */
export async function gatherScripts(mainHtml) {
  const inlineScripts = Array.from(
    document.querySelectorAll("script:not([src])"),
  ).map((el, idx) => ({
    source: `Inline Script #${idx + 1}`,
    code: el.innerHTML,
  }));

  const externalScriptUrls = Array.from(
    document.querySelectorAll("script[src]"),
  ).map((tag) => tag.src);

  let externalScripts = [];
  if (chrome.runtime && chrome.runtime.sendMessage) {
    externalScripts = await chrome.runtime.sendMessage({
      type: "FETCH_SCRIPTS",
      urls: externalScriptUrls,
    });
  } else {
    console.warn("[JS Recon Buddy] Cannot fetch external scripts: chrome.runtime.sendMessage is not available.");
  }

  return [
    ...inlineScripts,
    ...externalScripts.filter(Boolean),
    { source: "Main HTML Document", code: mainHtml },
  ];
}

/**
 * @callback ProgressCallback
 * @param {number} processedCount - The number of scripts processed so far.
 * @param {number} totalCount - The total number of scripts to process.
 * @returns {void}
 */

/**
 * @typedef {object} DomainInfo
 * @property {string} currentHostname - The hostname of the current page.
 * @property {string} baseDomain - The calculated base domain of the current page.
 */

/**
 * @typedef {object} FindingOccurrence
 * @property {string} source - The source identifier (e.g., URL or "Inline Script").
 * @property {string} ruleId - The ID of the rule that produced the match.
 * @property {number} index - The character index of the match in the source code.
 * @property {number} secretLength - The length of the matched finding.
 * @property {number} line - The 1-based line number of the match.
 * @property {number} column - The 1-based column number of the match.
 */

/**
 * @typedef {object} ScanDependencies
 * @property {function(string): number} shannonEntropy - Function to calculate entropy.
 * @property {function(string, number): {line: number, column: number}} getLineAndColumn - Function to calculate line/column.
 */

/**
 * The core scanning engine. It processes all collected code against a set of patterns.
 * This function runs asynchronously in chunks, yielding to the event loop after each
 * script to avoid freezing the UI.
 * @param {Array<{source: string, code: string}>} scripts - The array of content to scan.
 * @param {object} patterns - The compiled regex patterns to apply.
 * @param {ScanDependencies} dependencies - An object containing all utility functions.
 * @param {ProgressCallback} [onProgress] - Optional callback to report progress.
 * @returns {Promise<{results: Record<string, Map<string, FindingOccurrence[]>>, contentMap: Record<string, string>}>} A promise that resolves to an object containing the final results and the content map.
 */
export async function processScriptsAsync(scripts, patterns, dependencies, onProgress) {
  const { shannonEntropy, getLineAndColumn } = dependencies;
  const { currentHostname, baseDomain } = getDomainInfo();

  const isValidSubdomain = (domain) =>
    domain === currentHostname ||
    domain.endsWith(`.${currentHostname}`) ||
    domain === baseDomain ||
    domain.endsWith(`.${baseDomain}`);
  const isValidEntropy = (secret, ruleEntropy) => shannonEntropy(secret) >= ruleEntropy;
  const isValidEndpoint = (endpoint) => !/^\/+$/.test(endpoint);

  const results = Object.keys(patterns).reduce(
    (acc, key) => ({ ...acc, [key]: new Map() }),
    {},
  );
  const contentMap = {};

  /**
   * Processes a single regex match, validates it, extracts context, and adds it to the results.
   * @param {RegExpMatchArray} match - The match object from `matchAll`.
   * @param {object} rule - The rule object that produced the match.
   * @param {string} name - The category name of the finding.
   * @param {string} code - The full source code being scanned.
   * @param {string} source - The source identifier (e.g., URL or "Inline Script").
   */
  const processMatch = (match, rule, category, code, source) => {
    const finding = match[rule.group || 0]?.trim();
    if (!finding) return;

    const validationMap = {
      Subdomains: () => isValidSubdomain(finding),
      "Potential Secrets": () => isValidEntropy(finding, rule.ruleEntropy),
      Endpoints: () => isValidEndpoint(finding),
    };

    if (validationMap[category] && !validationMap[category]()) {
      return;
    }

    if (!results[category].has(finding)) {
      results[category].set(finding, []);
    }

    const { line, column } = getLineAndColumn(code, match.index);
    const occurrence = {
      source,
      ruleId: rule.ruleId,
      index: match.index,
      secretLength: finding.length,
      line,
      column
    };

    results[category].get(finding).push(occurrence);
  };

  let processedCount = 0;
  const totalScripts = scripts.length;

  for (const script of scripts) {
    if (!script.code) continue;

    const decodedCode = decodeText(script.code);
    contentMap[script.source] = decodedCode;

    for (const category in patterns) {
      const rules = Array.isArray(patterns[category]) ? patterns[category] : [patterns[category]];
      for (const rule of rules) {
        if (!rule.regex) continue;
        for (const match of decodedCode.matchAll(rule.regex)) {
          processMatch(match, rule, category, decodedCode, script.source);
        }
      }
    }

    processedCount++;
    if (onProgress) {
      onProgress(processedCount, totalScripts);
    }

    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return { results, contentMap };
}

/**
 * @typedef {object} FileTreeNode
 * A node in the file tree, where keys are file/folder names and values are child nodes.
 * An empty object signifies a file.
 * @property {Record<string, FileTreeNode>} [children]
 */

/**
 * A utility to generate a sorted, nested HTML file tree from a flat array of file paths.
 *
 * @param {string[]} filePaths - A flat array of source file paths (e.g., ['src/api.js', 'src/components/Button.js']).
 * @returns {string} The generated HTML string for the file tree, wrapped in a `<ul>`.
 * @example
 * const paths = ['assets/img/logo.png', 'assets/css/style.css', 'index.js'];
 * const treeHTML = generateFileTreeHTML(paths);
 * // Returns a nested <ul> list representing the file structure, sorted alphabetically.
 */
export function generateFileTreeHTML(filePaths) {
  const root = {};

  filePaths.forEach(path => {
    let currentLevel = root;
    path.split('/').forEach(part => {
      if (!currentLevel[part]) {
        currentLevel[part] = {};
      }
      currentLevel = currentLevel[part];
    });
  });

  /**
   * Recursively traverses the nested node object to build the HTML string.
   * @param {FileTreeNode} node - The current node in the tree to process.
   * @param {string} path - The accumulated path to the current node.
   * @returns {string} An HTML string for the current node and its children.
   */
  const createHTML = (node, path = '') => {
    const entries = Object.entries(node);

    entries.sort(([aName, aChildren], [bName, bChildren]) => {
      const aIsFolder = Object.keys(aChildren).length > 0;
      const bIsFolder = Object.keys(bChildren).length > 0;

      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;

      return aName.localeCompare(bName);
    });

    if (entries.length === 0) return '';

    const listItemsHtml = entries.map(([name, children]) => {
      const currentPath = path ? `${path}/${name}` : name;
      const hasChildren = Object.keys(children).length > 0;
      let itemHtml;

      if (hasChildren) {
        itemHtml = `<details open><summary><span class="folder-icon">🗀</span> ${name}</summary>${createHTML(children, currentPath)}</details>`;
      } else {
        itemHtml = `<a href="#" class="file-link" data-filename="${currentPath}"><span class="file-icon">🖹</span> ${name}</a>`;
      }
      return `<li>${itemHtml}</li>`;
    }).join('');

    return `<ul>${listItemsHtml}</ul>`;
  };

  return createHTML(root);
}

/**
 * Generates a sanitized, unique filename for a given URL, combining hostname and path.
 *
 * @param {string} urlString The full URL of the page.
 * @returns {string} A sanitized filename string (e.g., "recon_example.com_user_profile.json").
 */
export function generateReconFilename(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname;
    const sanitizedPath = url.pathname
      .replace(/^\/|\/$/g, '')
      .replace(/\//g, '_');

    if (sanitizedPath) {
      return `recon_${hostname}_${sanitizedPath}.json`;
    }
    return `recon_${hostname}.json`;
  } catch (error) {
    console.warn("[JS Recon Buddy] Could not parse URL for filename, falling back to a generic name.", error);
    return `recon_scan_results.json`;
  }
}