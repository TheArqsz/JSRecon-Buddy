(
  /**
   * @fileoverview Main content script for JS Recon Buddy.
   * This script is injected on-demand into the active page to perform a comprehensive
   * analysis. It creates a UI overlay, gathers all page content, applies various
   * regex-based patterns, and renders the findings in the overlay.
   */
  async function () {
    "use strict";
    const { reconstructSource } = await import(
      chrome.runtime.getURL("src/utils/sourceMapParser.js")
    );
    const { getPatterns } = await import(
      chrome.runtime.getURL("src/utils/patterns.js")
    );
    const { shannonEntropy, getLineAndColumn, getDOMAsText, escapeHTML } = await import(
      chrome.runtime.getURL("src/utils/coreUtils.js")
    );
    const {
      copyTextToClipboard,
      getCacheKey,
      getCachedResults,
      setCachedResults,
      updateOverlayHeader,
      gatherScripts,
      processScriptsAsync,
      generateFileTreeHTML,
      generateReconFilename
    } = await import(
      chrome.runtime.getURL("src/utils/overlayUtils.js")
    );
    const OVERLAY_ID = "bug-bounty-scanner-overlay";
    const CACHE_KEY_PREFIX = "scan_cache_";
    const CACHE_DURATION_MS = 2 * 60 * 60 * 1000;
    const MAX_CACHE_SIZE_BYTES = 30 * 1024 * 1024;

    let shadowRoot = null;
    const DEFAULT_PARAMETERS = [
      "redirect",
      "url",
      "ret",
      "next",
      "goto",
      "target",
      "dest",
      "r",
      "debug",
      "test",
      "admin",
      "edit",
      "enable",
      "id",
      "user",
      "account",
      "profile",
      "key",
      "token",
      "api_key",
      "secret",
      "password",
      "email",
      "callback",
      "return",
      "returnTo",
      "return_to",
      "redirect",
      "redirect_to",
      "redirectTo",
      "continue",
    ];

    /**
     * Main entry point to start or toggle the scanner overlay.
     * Manages the overlay's existence and decides whether to perform a fresh scan
     * or display cached results.
     * @param {boolean} [forceRescan=false] - If true, bypasses the cache and runs a new scan.
     * @returns {Promise<void>}
     */
    async function runScanner(forceRescan = false) {
      const existingOverlay = document.getElementById(OVERLAY_ID);

      if (existingOverlay) {
        existingOverlay.remove();
        if (!forceRescan) {
          return;
        }
      }

      createOverlay(forceRescan);
    }

    /**
     * Orchestrates the core scanning process. It first gathers all page
     * content to determine the total number of items to scan, then displays a
     * progress bar and processes the content, updating the UI in real-time.
     * @returns {Promise<void>}
     */
    async function performScan() {
      updateOverlayContent(
        '<h2><span class="spinner"></span> Gathering scripts and website content...</h2>'
      );

      const mainHTML = getDOMAsText();
      const allScripts = await gatherScripts(mainHTML);

      const progressBarHTML = `
        <div class="progress-container">
            <h2>Analyzing ${allScripts.length} sources...</h2>
            <div class="progress-bar-outline">
                <div id="progress-bar-inner" class="progress-bar-inner"></div>
            </div>
            <span id="progress-text" class="progress-text">0 / ${allScripts.length}</span>
        </div>
    `;
      updateOverlayContent(progressBarHTML);

      const progressBarInner = shadowRoot.getElementById('progress-bar-inner');
      const progressText = shadowRoot.getElementById('progress-text');

      /**
       * @callback ProgressCallback
       * @description A callback function to report the progress of an operation.
       * @param {number} completed - The number of items that have been processed.
       * @param {number} total - The total number of items to process.
       * @returns {void}
       */
      const onProgressCallback = (completed, total) => {
        const percentage = total > 0 ? (completed / total) * 100 : 0;
        if (progressBarInner) {
          progressBarInner.style.width = `${percentage}%`;
        }
        if (progressText) {
          progressText.textContent = `${completed} / ${total}`;
        }
      };

      setTimeout(async () => {
        const { parameters, isNPMDependencyScanEnabled } = await chrome.storage.sync.get({
          parameters: DEFAULT_PARAMETERS,
          isNPMDependencyScanEnabled: false
        });

        const PATTERNS = getPatterns(parameters);

        const { results, contentMap } = await processScriptsAsync(
          allScripts,
          PATTERNS,
          { shannonEntropy, getLineAndColumn },
          onProgressCallback
        );

        const potentialPackagesMap = results['Potential NPM Packages'];
        if (isNPMDependencyScanEnabled && potentialPackagesMap?.size > 0) {
          progressText.textContent = `Verifying ${potentialPackagesMap.size} NPM packages...`;
          const unverifiedPackages = Array.from(potentialPackagesMap.keys());
          const vulnerablePackageNames = await chrome.runtime.sendMessage({
            type: 'VERIFY_NPM_PACKAGES',
            packages: unverifiedPackages
          });
          if (vulnerablePackageNames && vulnerablePackageNames.length > 0) {
            const vulnerableSet = new Set(vulnerablePackageNames);
            const dependencyMap = new Map();
            for (const [pkg, occurrences] of potentialPackagesMap.entries()) {
              if (vulnerableSet.has(pkg)) {
                dependencyMap.set(pkg, occurrences);
              }
            }
            results['Dependency Confusion'] = dependencyMap;
          }
        }
        delete results['Potential NPM Packages'];

        const key = getCacheKey(CACHE_KEY_PREFIX, window.location.href);
        await setCachedResults(
          key,
          results,
          contentMap,
          MAX_CACHE_SIZE_BYTES,
          CACHE_KEY_PREFIX,
          CACHE_DURATION_MS
        );

        renderResults(results, contentMap);
      }, 100);
    }

    /**
     * Creates and injects the main analysis UI overlay into the page.
     * The overlay is contained within a shadow DOM to avoid style conflicts.
     * @param {boolean} [forceRescan=false] - Determines if the overlay should show cached data.
     * @returns {Promise<void>}
     */
    async function createOverlay(forceRescan = false) {
      const shadowHost = document.createElement("div");
      shadowHost.id = OVERLAY_ID;
      // Fix for some websites that use styles that interfere with the overlay
      // Styles copied from :host in overlay.css
      Object.assign(shadowHost.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '2147483647',
        border: 'none',
        margin: '0',
        padding: '20px',
        opacity: '0',
        fontSize: '16px',
        fontWeight: '400',
        fontFamily: 'monospace',
        lineHeight: '1.5',
        transform: 'translateY(20px)',
        backgroundColor: 'rgba(0, 0, 0, 0.92)'
      });
      document.body.appendChild(shadowHost);
      shadowRoot = shadowHost.attachShadow({ mode: "open" });

      const overlayURL = chrome.runtime.getURL("src/overlay/overlay.html");
      const cssURL = chrome.runtime.getURL("src/overlay/overlay.css");

      fetch(overlayURL)
        .then((response) => response.text())
        .then(async (html) => {
          shadowRoot.innerHTML = `<style>@import "${cssURL}";</style>${html}`;

          const closeOverlay = () => {
            shadowHost.remove();
            document.removeEventListener("keydown", handleEsc);
          };
          const handleEsc = (event) => {
            if (event.key === "Escape") closeOverlay();
          };
          shadowRoot.querySelector("#close-button").onclick = closeOverlay;
          document.addEventListener("keydown", handleEsc);

          const rescanButton = shadowRoot.querySelector("#rescan-button");
          if (rescanButton) {
            rescanButton.onclick = () => runScanner(true);
          }

          const statusSpan = shadowRoot.querySelector("#scan-status");
          if (!forceRescan) {
            const key = getCacheKey(CACHE_KEY_PREFIX, window.location.href);
            const cachedData = await getCachedResults(key, CACHE_DURATION_MS);
            if (cachedData && cachedData.results) {
              const timestamp = new Date(cachedData.timestamp).toLocaleString();
              updateOverlayHeader(statusSpan, `Cached Scan (${timestamp})`);
              renderResults(cachedData.results, cachedData.contentMap);
              return;
            }
          }

          updateOverlayHeader(statusSpan, "Live Scan", "live");
          await performScan();
        });
    }

    /**
     * A utility function to safely update the main content area of the overlay.
     * @param {string} html - The HTML string to inject into the results container.
     */
    function updateOverlayContent(html) {
      const resultsContainer = shadowRoot.querySelector(
        `.scanner-overlay__results`,
      );
      if (resultsContainer) resultsContainer.innerHTML = html;
    }

    /**
     * Renders the final, formatted results object into the overlay UI.
     * @param {object} results - The results object containing Maps of findings.
     * @param {object} contentMap - The map of source content, needed for context modals.
     */
    function renderResults(results, contentMap) {
      let expButton = shadowRoot.getElementById("export-button");
      if (expButton) {
        expButton.disabled = false;
      }

      const externalScriptUrls = Object.keys(contentMap).filter(key =>
        key !== 'Main HTML Document' && !key.startsWith('Inline Script')
      );
      if (externalScriptUrls.length > 0) {
        const externalScriptsMap = new Map(externalScriptUrls.map(url => [url, []]));
        results['External Scripts'] = externalScriptsMap;
      }

      const inlineScriptKeys = Object.keys(contentMap).filter(key => key.startsWith('Inline Script'));
      if (inlineScriptKeys.length > 0) {
        const inlineScriptsMap = new Map(inlineScriptKeys.map(key => [key, []]));
        results['Inline Scripts'] = inlineScriptsMap;
      }

      const sectionConfig = [
        {
          key: "Subdomains",
          title: "[+] Subdomains",
          formatter: (safe) =>
            `<a href="https://${safe}" target="_blank">${safe}</a>`,
          copySelector: ".finding-details > summary",
        },
        {
          key: "Endpoints",
          title: "[/] Endpoints & Paths",
          formatter: (safe) => {
            if (safe.startsWith("//")) {
              return `<a href="https:${safe}" target="_blank">${safe}</a>`;
            }
            if (safe.startsWith("http")) {
              return `<a href="${safe}" target="_blank">${safe}</a>`;
            }
            return `<a href="${new URL(safe, location.origin).href}" target="_blank">${safe}</a>`;
          },
          copySelector: ".finding-details > summary",
        },
        {
          key: "Potential DOM XSS Sinks",
          title: "[!] Potential DOM XSS Sinks",
          formatter: (t) => `<span style="color:#ff8a80;">${t}</span>`,
          copySelector: ".finding-details > div div",
          copyModifier: "deduplicate-and-clean",
        },
        {
          key: "Potential Secrets",
          title: "[!] Potential Secrets",
          formatter: (t) => {
            return `
          <code style="background:#333; color:#ffeb3b; padding:4px; border-radius:4px;">
            ${t}
          </code>
          `;
          },
          copySelector: ".finding-details > summary code",
        },
        {
          key: "Dependency Confusion",
          title: "[!] Potential Dependency Confusion",
          formatter: (packageName) => `This private package is not on npmjs.com: <code>${escapeHTML(packageName)}</code>`,
          copySelector: ".finding-details > summary code",
        },
        {
          key: "Interesting Parameters",
          title: "[?] Interesting Parameters",
          formatter: (safe) => `<span style="color:#ffd180;">${safe}</span>`,
          copySelector: ".finding-details > summary",
        },
        {
          key: "JS Libraries",
          title: "[L] JS Libraries",
          formatter: (t) => `<span>${t}</span>`,
          copySelector: ".finding-details > summary",
        },
        {
          key: "Source Maps",
          title: "[M] Source Maps",
          formatter: (safe, occurrences, rawFinding) => {
            const sourceUrl = occurrences[0]?.source;
            let fullUrl = rawFinding;
            try {
              if (sourceUrl && sourceUrl.startsWith("http")) {
                fullUrl = new URL(rawFinding, sourceUrl).href;
              }
            } catch (e) {
              console.warn(
                "Could not create a valid URL for source map:",
                finding,
                "from source:",
                sourceUrl,
              );
            }

            return `<a href="${fullUrl}" target="_blank" class="source-map-link" data-url="${fullUrl}">${safe}</a>`;
          },
          copySelector: ".finding-details > summary > a",
        },
        {
          key: "External Scripts",
          title: "[S] External Scripts",
          formatter: (safeKey) => {
            const absoluteUrl = new URL(safeKey, window.location.origin).href;
            return `<a href="${absoluteUrl}" class="script-link" data-source-key="${safeKey}">${safeKey}</a>`
          },
          copySelector: "details > ul > li > a",
        },
        {
          key: "Inline Scripts",
          title: "[IS] Inline Scripts",
          formatter: (safeKey) => `<a href="#" class="script-link" data-source-key="${safeKey}">${safeKey}</a>`,
        }
      ];
      const sectionsHTML = sectionConfig
        .map(({ key, title, formatter, copySelector, copyModifier }) =>
          renderSection(
            results[key],
            title,
            formatter,
            copySelector,
            copyModifier,
            contentMap
          ),
        )
        .join("");
      const totalFindings = Object.values(results).reduce(
        (sum, map) => sum + map.size,
        0,
      );

      updateOverlayContent(
        totalFindings > 0 ? sectionsHTML : "<h2>No findings. All clear!</h2>",
      );

      attachEventListeners(results, contentMap);
    }

    /**
     * Attaches all necessary event listeners to the interactive elements of the results UI.
     * This includes copy buttons, context viewers, and source map links.
     * @param {object} results - The results object, needed for some listener contexts.
     */
    function attachEventListeners(results, contentMap) {
      const resultsContainer = shadowRoot.querySelector(
        `.scanner-overlay__results`,
      );
      resultsContainer.addEventListener("click", async (event) => {
        const target = event.target;

        if (target.classList.contains("script-link")) {
          event.preventDefault();

          const sourceKey = target.dataset.sourceKey;
          const scriptContent = contentMap[sourceKey];
          if (!scriptContent) return;

          const storageKey = `source-viewer-inline-${Date.now()}`;
          const dataToStore = { content: scriptContent, source: sourceKey };
          await chrome.storage.local.set({ [storageKey]: dataToStore });

          chrome.runtime.sendMessage({
            type: 'OPEN_VIEWER_TAB',
            storageKey: storageKey
          });
          return;
        } else if (target.classList.contains("clickable-source")) {
          const source = target.dataset.source;
          const index = parseInt(target.dataset.index, 10);
          const length = parseInt(target.dataset.length, 10);
          const fullCode = contentMap[source];
          if (fullCode) {
            const start = Math.max(0, index - 250);
            const end = Math.min(fullCode.length, index + length + 250);
            const context = `... ${fullCode.substring(start, end).replace(/\n/g, " ")} ...`;
            showContextModal(context);
          }
          return;
        }

        if (target.classList.contains("btn--copy-section")) {
          const section = target.closest("details");
          const selector = target.dataset.copySelector;
          const modifier = target.dataset.copyModifier;

          if (!selector) return;

          const records = Array.from(section.querySelectorAll(selector));

          let itemsToCopy = records.map((r) =>
            selector.endsWith("a")
              ? (r.href || "").trim()
              : (r.textContent || "").trim(),
          );

          if (modifier === "deduplicate-and-clean") {
            const cleanedItems = itemsToCopy.map((item) =>
              item.replace("↳ ", ""),
            );
            itemsToCopy = [...new Set(cleanedItems)];
          }

          const textToCopy = itemsToCopy.join("\n").replaceAll('(click to view)', '');

          copyTextToClipboard(textToCopy).then(() => {
            target.textContent = "Copied!";
            setTimeout(() => {
              target.textContent = "Copy";
            }, 2000);
          }).catch(err => {
            console.warn("[JS Recon Buddy] Could not copy text: ", err);
          });
        }

        if (target.classList.contains('source-map-link')) {
          event.preventDefault();
          const url = target.dataset.url;

          target.textContent = "Reconstructing...";

          (async () => {
            const reconstructedSources = await reconstructSource(url);

            showSourceMapModal(reconstructedSources, url);

            target.textContent = url.split('/').pop() || url;
          })();
        }
      });

      attachExportListener(results, contentMap);
      attachCollapseListener();
    }

    /**
     * Attaches event listeners to the "Expand/Collapse" buttons in the overlay.
     */
    function attachCollapseListener() {
      const toggleCatButton = shadowRoot.getElementById("toggle-cat-button");
      let areCatOpen = false;

      toggleCatButton.addEventListener("click", () => {
        areCatOpen = !areCatOpen;
        toggleCatButton.textContent = areCatOpen
          ? "Collapse Categories"
          : "Expand Categories";
        const allCategories = shadowRoot.querySelectorAll(
          `.scanner-overlay__results > details`,
        );
        allCategories.forEach((details) => {
          details.open = areCatOpen;
        });
      });

      const toggleAllButton = shadowRoot.getElementById("toggle-all-button");
      let areAllOpen = false;
      toggleAllButton.addEventListener("click", () => {
        areAllOpen = !areAllOpen;
        toggleAllButton.textContent = areAllOpen ? "Collapse All" : "Expand All";
        const allCategories = shadowRoot.querySelectorAll(
          `.scanner-overlay__results > details`,
        );
        allCategories.forEach((details) => {
          details.open = areAllOpen;
        });
        const allDetails = shadowRoot.querySelectorAll(
          `.finding-details`,
        );
        allDetails.forEach((details) => {
          details.open = areAllOpen;
        });
      });
    }

    /**
     * Displays a simple modal showing a context snippet for a finding.
     * @param {string} context - The text snippet to display.
     */
    function showContextModal(context) {
      const existingModal = document.getElementById("context-modal");
      if (existingModal) existingModal.remove();

      const modal = document.createElement("div");
      modal.id = "context-modal";
      modal.innerHTML = `
    <div class="modal-content">
      <span class="modal-close">&times;</span>
      <p>Context Snippet:</p>
      <pre><code></code></pre>
    </div>
    `;
      modal.querySelector("code").textContent = context;

      shadowRoot.appendChild(modal);

      modal.querySelector(".modal-close").onclick = () => modal.remove();
      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };
    }

    /**
     * Displays a complex modal with a file browser for viewing reconstructed source map content.
     * @param {Object<string, string>} sources - An object where keys are file paths and values are file contents.
     * @param {string} sourceMapUrl - The URL of the source map for context.
     */
    function showSourceMapModal(sources, sourceMapUrl) {
      const existingModal = shadowRoot.getElementById('context-modal');
      if (existingModal) existingModal.remove();

      const modal = document.createElement("div");
      modal.id = "context-modal";

      const copyButtonSVG = `<svg width='12' height='12' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'><rect width='24' height='24' stroke='none' fill='#000000' opacity='0'/><g transform="matrix(1.43 0 0 1.43 12 12)" ><path style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill: rgb(255,255,255); fill-rule: nonzero; opacity: 1;" transform=" translate(-8, -7.5)" d="M 2.5 1 C 1.675781 1 1 1.675781 1 2.5 L 1 10.5 C 1 11.324219 1.675781 12 2.5 12 L 4 12 L 4 12.5 C 4 13.324219 4.675781 14 5.5 14 L 13.5 14 C 14.324219 14 15 13.324219 15 12.5 L 15 4.5 C 15 3.675781 14.324219 3 13.5 3 L 12 3 L 12 2.5 C 12 1.675781 11.324219 1 10.5 1 Z M 2.5 2 L 10.5 2 C 10.78125 2 11 2.21875 11 2.5 L 11 10.5 C 11 10.78125 10.78125 11 10.5 11 L 2.5 11 C 2.21875 11 2 10.78125 2 10.5 L 2 2.5 C 2 2.21875 2.21875 2 2.5 2 Z M 12 4 L 13.5 4 C 13.78125 4 14 4.21875 14 4.5 L 14 12.5 C 14 12.78125 13.78125 13 13.5 13 L 5.5 13 C 5.21875 13 5 12.78125 5 12.5 L 5 12 L 10.5 12 C 11.324219 12 12 11.324219 12 10.5 Z" stroke-linecap="round" /></g></svg>`;

      const filePaths = Object.keys(sources);
      const fileTreeHTML = generateFileTreeHTML(filePaths);
      modal.innerHTML = `
    <div class="modal-content-source-viewer">
      <span class="modal-close">&times;</span>
      <p>Reconstructed ${filePaths.length} sources from <a target="_blank" href="${sourceMapUrl}">${sourceMapUrl.split('/').pop()}</a>:</p>
      <div class="source-viewer">
        <div class="file-browser">${fileTreeHTML}</div>
        <div class="code-viewer">
          <div class="code-header">
            <span id="code-filename">Select a file</span>
            <div class="button-group">
              <button id="copy-code-button" class="btn btn--copy" title="Copy code" disabled>${copyButtonSVG}</button>
              <button id="download-file-button" class="btn btn--primary" disabled>Download</button>
            </div>
          </div>
          <pre><code id="code-content"></code></pre>
        </div>
      </div>
    </div>
  `;

      shadowRoot.appendChild(modal);

      const modalContent = modal.querySelector(".modal-content-source-viewer");
      const codeContentEl = modalContent.querySelector('#code-content');
      const codeFilenameEl = modalContent.querySelector('#code-filename');
      const copyButton = modalContent.querySelector('#copy-code-button');
      const downloadButton = modalContent.querySelector('#download-file-button');

      modalContent.querySelectorAll('.file-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const fileName = e.target.closest('a').dataset.filename;
          const fileContent = sources[fileName] || '';

          codeFilenameEl.textContent = fileName;
          codeContentEl.textContent = fileContent;

          const hasContent = fileContent.length > 0;
          copyButton.disabled = !hasContent;
          downloadButton.disabled = !hasContent;
        });
      });

      copyButton.addEventListener('click', () => {
        const contentToCopy = codeContentEl.textContent;
        if (!contentToCopy) return;

        copyTextToClipboard(contentToCopy).then(() => {
          copyButton.innerHTML = "Copied!";
          setTimeout(() => {
            copyButton.innerHTML = copyButtonSVG;
          }, 2000);
        }).catch(err => {
          console.warn("[JS Recon Buddy] Could not copy text: ", err);
        });
      });

      downloadButton.addEventListener('click', () => {
        const fileName = codeFilenameEl.textContent;
        const content = codeContentEl.textContent;
        if (!fileName || fileName === 'Select a file' || !content) return;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.split('/').pop();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });

      modalContent.querySelector('.modal-close').onclick = () => shadowRoot.getElementById('context-modal').remove();
      modal.onclick = (e) => {
        if (e.target === modal) shadowRoot.getElementById('context-modal').remove();;
      };
    }

    let exportController = new AbortController();

    /**
     * Attaches an event listener to the "Export" button for downloading scan results and their source content as a single JSON file.
     *
     * @param {object} results - The results object, where categories contain Maps of findings.
     * @param {Record<string, string>} contentMap - The map of source identifiers to their full text content.
     */
    function attachExportListener(results, contentMap) {
      const exportButton = shadowRoot.getElementById("export-button");
      if (!exportButton) {
        console.warn("[JS Recon Buddy] Could not find the export button to attach a listener.");
        return;
      }

      exportController.abort();
      exportController = new AbortController();

      exportButton.addEventListener(
        "click",
        () => {
          if (!results) return;

          const exportableResults = {};
          for (const key in results) {
            if (results[key] instanceof Map) {
              exportableResults[key] = Object.fromEntries(results[key]);
            }
          }

          const exportData = {
            findings: exportableResults,
            sources: contentMap || {}
          };

          const dataStr =
            "data:text/json;charset=utf-8," +
            encodeURIComponent(JSON.stringify(exportData, null, 2));

          const downloadAnchorNode = document.createElement("a");
          downloadAnchorNode.setAttribute("href", dataStr);
          downloadAnchorNode.setAttribute(
            "download",
            generateReconFilename(window.location.href),
          );

          document.body.appendChild(downloadAnchorNode);
          downloadAnchorNode.click();
          downloadAnchorNode.remove();
        },
        { signal: exportController.signal },
      );
    }

    /**
     * Renders a single collapsible section for a category of findings.
     * @param {Map<string, Array<object>>} findingsMap - The map of findings for this section.
     * @param {string} title - The title of the section.
     * @param {function} formatter - A function to format the display of each finding.
     * @param {string} selector - The CSS selector for the "Copy Section" button.
     * @param {string} [copyModifier] - An optional modifier for the copy behavior.
     * @returns {string} The HTML string for the entire section.
     */
    function renderSection(
      findingsMap,
      title,
      formatter,
      selector,
      copyModifier,
      contentMap
    ) {
      if (!findingsMap || findingsMap.size === 0) return "";
      let itemsHTML = "";

      if (title.includes("[!] Potential Secrets")) {
        const findingsByRule = {};
        findingsMap.forEach((occurrences, item) => {
          const ruleId = occurrences[0]?.ruleId || "generic-secret";
          if (!findingsByRule[ruleId]) {
            findingsByRule[ruleId] = [];
          }
          findingsByRule[ruleId].push({ item, occurrences });
        });

        for (const ruleId in findingsByRule) {
          const subfindings = findingsByRule[ruleId];
          itemsHTML += `<div class="sub-section"><details><summary>${ruleId} (${subfindings.length})</summary><ul>`;
          subfindings.forEach(({ item, occurrences }) => {
            itemsHTML += renderListItem(item, occurrences, formatter, contentMap);
          });
          itemsHTML += `</ul></details></div>`;
        }
      } else if (title.includes("External Scripts") || title.includes("Inline Scripts")) {
        findingsMap.forEach((_, item) => {
          const safeItem = escapeHTML(item);
          const renderedItem = formatter ? formatter(safeItem) : safeItem;
          itemsHTML += `<li>${renderedItem}</li>`;
        });
      } else {
        findingsMap.forEach((occurrences, item) => {
          itemsHTML += renderListItem(item, occurrences, formatter, contentMap);
        });
      }

      const copySelector = selector || ".finding-details > summary";
      const modifierAttribute = copyModifier
        ? `data-copy-modifier="${copyModifier}"`
        : "";

      const copyButtonHTML = (!title.includes("Inline Scripts"))
        ? `<button class="btn btn--copy-section" data-copy-selector="${copySelector}" ${modifierAttribute}>Copy</button>`
        : '';
      const summaryHTML = `
      <span>${title} (${findingsMap.size})</span>
      ${copyButtonHTML}
    `;
      return `<details><summary>${summaryHTML}</summary><ul>${itemsHTML}</ul></details>`;
    }

    /**
     * Renders a single list item for a specific finding, including its occurrences.
     * @param {string} item - The found item (e.g., the secret, the subdomain).
     * @param {Array<object>} occurrences - An array of objects detailing where the item was found.
     * @param {function} formatter - The formatting function for the item.
     * @param {object} contentMap - The map of source content.
     * @returns {string} The HTML string for the list item.
     */
    function renderListItem(item, occurrences, formatter, contentMap) {
      const safeItem = escapeHTML(item);
      const renderedItem = formatter
        ? formatter(safeItem, occurrences, item)
        : safeItem;
      let occurrencesHTML = "";
      const uniqueOccurrences = new Map(
        occurrences.map((occ) => [occ.source + '@' + occ.index, occ]),
      );

      uniqueOccurrences.forEach(({ source, index, secretLength, line, column }) => {
        const isLocal =
          source.startsWith("Inline Script") || source === "Main HTML Document";
        const isURL = source.startsWith("http");
        let sourceHTML = `↳ ${escapeHTML(source)}`;
        if (isURL) {
          sourceHTML = `↳ <a href="${source}" target="_blank">${escapeHTML(source)}</a><span class="finding-location">:${line}:${column}</span>`;
        } else if (isLocal) {
          sourceHTML = `↳ <span class="clickable-source"
            data-source="${escapeHTML(source)}"
            data-index="${index}"
            data-length="${secretLength}">${escapeHTML(source)} (click to view)</span><span class="finding-location"> [Line: ${line} & Col: ${column}]</span>`;
        }
        occurrencesHTML += `<div>${sourceHTML}</div>`;
        if (!isLocal) {
          const fullCode = contentMap[source];
          if (fullCode) {
            const start = Math.max(0, index - 40);
            const end = Math.min(fullCode.length, index + secretLength + 40);
            const context = `... ${fullCode.substring(start, end).replace(/\n/g, " ")} ...`;
            occurrencesHTML += `<code class="context-snippet">${escapeHTML(context)}</code>`;
          }
        }
      });

      return `
    <li>
      <details class="finding-details">
        <summary>${renderedItem}</summary>
        <div style="font-size:.85em;color:#999;padding-left:15px;margin-top:5px">
          ${occurrencesHTML}
        </div>
      </details>
    </li>
  `;
    }

    runScanner();
  })();
