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
    const { extractNextJsData, parseManifestWithString } = await import(chrome.runtime.getURL("src/utils/nextjsUtils.js"));
    const {
      copyTextToClipboard,
      getCacheKey,
      getCachedResults,
      setCachedResults,
      updateOverlayHeader,
      gatherScripts,
      processScriptsAsync,
      getDomainInfo,
      generateFileTreeHTML,
      generateReconFilename
    } = await import(
      chrome.runtime.getURL("src/utils/overlayUtils.js")
    );
    const {
      createElement,
      createText,
      createSpan,
      createSecureLink,
      sanitizeUrl,
      generateStorageKey
    } = await import(chrome.runtime.getURL("src/utils/domUtils.js"));
    const OVERLAY_ID = "bug-bounty-scanner-overlay";
    const CACHE_KEY_PREFIX = "scan_cache_";
    const CACHE_DURATION_MS = 2 * 60 * 60 * 1000;
    const MAX_CACHE_SIZE_BYTES = 30 * 1024 * 1024;

    let shadowRoot = null;
    let mainAbortController = new AbortController();

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
      mainAbortController.abort();
      mainAbortController = new AbortController();

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

        const { isSourceMapGuessingEnabled } = await chrome.storage.sync.get({
          isSourceMapGuessingEnabled: false
        });

        const { results, contentMap } = await processScriptsAsync(
          allScripts,
          PATTERNS,
          { shannonEntropy, getLineAndColumn, getDomainInfo },
          onProgressCallback
        );

        if (isSourceMapGuessingEnabled) {
          progressText.textContent = `Guessing source maps...`;

          const seenUrls = new Set();
          const candidates = [];

          Object.keys(contentMap).forEach(key => {
            if (key.startsWith('http') && key.endsWith('.js')) {
              try {
                const url = new URL(key);
                url.hash = '';
                url.protocol = url.protocol.toLowerCase();
                const normalizedJs = url.href;
                const mapUrl = normalizedJs + '.map';

                if (!seenUrls.has(normalizedJs)) {
                  seenUrls.add(normalizedJs);
                  candidates.push(mapUrl);
                }
              } catch (e) {
                if (!seenUrls.has(key)) {
                  seenUrls.add(key);
                  candidates.push(key + '.map');
                }
              }
            }
          });

          const existingMaps = results['Source Maps'] ? Array.from(results['Source Maps'].keys()) : [];
          const existingNormalized = new Set(existingMaps.map(url => {
            try {
              const u = new URL(url);
              u.hash = '';
              return u.href;
            } catch {
              return url;
            }
          }));
          const uniqueCandidates = candidates.filter(url => {
            try {
              const u = new URL(url);
              u.hash = '';
              return !existingNormalized.has(u.href);
            } catch {
              return !existingNormalized.has(url);
            }
          });

          if (uniqueCandidates.length > 0) {
            const foundMaps = await chrome.runtime.sendMessage({
              type: 'PROBE_SOURCE_MAPS',
              urls: uniqueCandidates
            });

            if (foundMaps && foundMaps.length > 0) {
              if (!results['Source Maps']) {
                results['Source Maps'] = new Map();
              }

              foundMaps.forEach(mapUrl => {
                const syntheticOccurrence = {
                  source: 'Heuristic (Guessed)',
                  ruleId: 'guessed-source-map',
                  index: 0,
                  secretLength: 0,
                  line: 0,
                  column: 0
                };

                const normalized = (() => {
                  try {
                    const u = new URL(mapUrl);
                    u.hash = '';
                    return u.href;
                  } catch {
                    return mapUrl;
                  }
                })();

                let alreadyExists = false;
                for (const existing of results['Source Maps'].keys()) {
                  try {
                    const u = new URL(existing);
                    u.hash = '';
                    if (u.href === normalized) {
                      alreadyExists = true;
                      break;
                    }
                  } catch {
                    if (existing === mapUrl) {
                      alreadyExists = true;
                      break;
                    }
                  }
                }

                if (!alreadyExists) {
                  results['Source Maps'].set(mapUrl, [syntheticOccurrence]);
                }
              });
            }
          }
        }

        // Special handling for Next.js applications
        const { manifestUrl } = extractNextJsData(mainHTML, window.location.href);
        if (manifestUrl) {
          progressText.textContent = `Verifying Next.JS manifest...`;
          const response = await chrome.runtime.sendMessage({
            type: 'FETCH_NEXTJS_MANIFEST',
            url: manifestUrl
          });

          if (response && response.status === 'success' && response.data.length > 0) {
            try {
              contentMap[manifestUrl] = response.data;
              const nextJsRoutes = await parseManifestWithString(response.data);

              if (nextJsRoutes.length > 0) {
                if (!results['Endpoints']) {
                  results['Endpoints'] = new Map();
                }
                const endpointMap = results['Endpoints'];
                nextJsRoutes.forEach(route => {
                  const syntheticOccurrences = [{ source: manifestUrl, index: 0, line: 1, column: 1 }];
                  if (!endpointMap.has(route)) {
                    endpointMap.set(route, syntheticOccurrences);
                  }
                });
              }
            } catch (e) {
              console.warn('[JS Recon Buddy] Error parsing manifest in sandbox:', e);
            }
          }
        }

        // Special handling for Dependency Confusion checks
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

          const handleEsc = (event) => {
            if (event.key === "Escape") closeOverlay();
          };
          const closeOverlay = () => {
            mainAbortController.abort();
            shadowHost.remove();
            document.removeEventListener("keydown", handleEsc);
          };

          shadowRoot.querySelector("#close-button").onclick = closeOverlay;
          document.addEventListener("keydown", handleEsc, {
            signal: mainAbortController.signal
          });

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
     * @param {string | Node} content - The HTML string (for simple text) or DOM Node to inject.
     */
    function updateOverlayContent(content) {
      const resultsContainer = shadowRoot.querySelector(
        `.scanner-overlay__results`,
      );
      if (resultsContainer) {
        if (typeof content === 'string') {
          resultsContainer.innerHTML = content;
        } else if (content instanceof Node) {
          resultsContainer.replaceChildren(content);
        }
      }
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
          formatter: (safe, occ, raw) => createSecureLink(`https://${raw}`, safe),
          copySelector: ".finding-details > summary",
        },
        {
          key: "Endpoints",
          title: "[/] Endpoints & Paths",
          formatter: (safe, occ, raw) => {
            const methodMatch = raw.match(/^\[([A-Z]+)\]\s+(.+)$/);
            let httpMethod = null;
            let actualPath = raw;

            if (methodMatch) {
              httpMethod = methodMatch[1];
              actualPath = methodMatch[2];
            }

            let url;
            if (actualPath.startsWith("//")) {
              url = `https:${actualPath}`;
            } else if (actualPath.startsWith("http")) {
              url = actualPath;
            } else {
              try {
                url = new URL(actualPath, location.origin).href;
              } catch (e) { }
            }

            const fragment = document.createDocumentFragment();
            if (httpMethod) {
              const methodColors = {
                'GET': '#4caf50',
                'POST': '#2196f3',
                'PUT': '#ff9800',
                'DELETE': '#f44336',
                'PATCH': '#9c27b0',
                'HEAD': '#607d8b',
                'OPTIONS': '#795548'
              };
              const color = methodColors[httpMethod] || '#757575';
              const badge = createElement('span', '', httpMethod);
              Object.assign(badge.style, {
                display: 'inline-block', background: color, color: 'white',
                padding: '2px 6px', borderRadius: '3px', fontSize: '0.75em',
                fontWeight: 'bold', marginRight: '6px'
              });
              fragment.appendChild(badge);
            }

            const link = createSecureLink(url || '#', actualPath);
            if (link) fragment.appendChild(link);
            else fragment.appendChild(createText(actualPath));

            return fragment;
          },
          copySelector: ".finding-details > summary",
        },
        {
          key: "GraphQL",
          title: "[G] GraphQL Findings",
          formatter: (safe, occ, raw) => {
            if (raw.match(/^https?:\/\/|^\/|\/graphql$/)) {
              let url = raw;
              if (raw.startsWith("//")) {
                url = `https:${raw}`;
              } else if (raw.startsWith("/")) {
                try {
                  url = new URL(raw, location.origin).href;
                } catch (e) { }
              }
              return createSecureLink(url, raw) || createText(raw);
            }

            const preview = safe.length > 80 ? safe.substring(0, 80) + '...' : safe;
            const code = createElement('code', '', preview);
            Object.assign(code.style, {
              color: '#e91e63',
              wordBreak: 'break-all'
            });
            return code;
          },
          copySelector: ".finding-details > summary",
        },
        {
          key: "Potential DOM XSS Sinks",
          title: "[!] Potential DOM XSS Sinks",
          formatter: (safe, occ, raw) => {
            const span = createSpan(raw);
            span.style.color = '#ff8a80';
            return span;
          },
          copySelector: ".finding-details > div div",
          copyModifier: "deduplicate-and-clean",
        },
        {
          key: "Potential Secrets",
          title: "[!] Potential Secrets",
          formatter: (safe, occ, raw) => {
            const code = createElement('code', '', raw);
            Object.assign(code.style, {
              background: '#333',
              color: '#ffeb3b',
              padding: '4px',
              borderRadius: '4px'
            });
            return code;
          },
          copySelector: ".finding-details > summary code",
        },
        {
          key: "Dependency Confusion",
          title: "[!] Potential Dependency Confusion",
          formatter: (safe, occ, raw) => {
            const fragment = document.createDocumentFragment();
            fragment.appendChild(createText("This private package is not on npmjs.com: "));
            fragment.appendChild(createElement('code', '', raw));
            return fragment;
          },
          copySelector: ".finding-details > summary code",
        },
        {
          key: "Interesting Parameters",
          title: "[?] Interesting Parameters",
          formatter: (safe, occ, raw) => {
            const span = createSpan(raw);
            span.style.color = '#ffd180';
            return span;
          },
          copySelector: ".finding-details > summary",
        },
        {
          key: "JS Libraries",
          title: "[L] JS Libraries",
          formatter: (safe, occ, raw) => createSpan(raw),
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
              console.warn("Could not create a valid URL for source map:", rawFinding, "from source:", sourceUrl);
            }
            const link = createSecureLink(fullUrl, rawFinding);
            if (link) {
              link.classList.add("source-map-link");
              link.dataset.url = link.href;
              return link;
            }
            return createText(rawFinding);
          },
          copySelector: ".finding-details > summary > a",
        },
        {
          key: "External Scripts",
          title: "[S] External Scripts",
          formatter: (safe, occ, raw) => createText(raw),
          copySelector: "details > ul > li > a",
        },
        {
          key: "Inline Scripts",
          title: "[IS] Inline Scripts",
          formatter: (safe, occ, raw) => createText(raw),
        }
      ];
      const fragment = document.createDocumentFragment();
      sectionConfig.forEach(({ key, title, formatter, copySelector, copyModifier }) => {
        const sectionNode = renderSection(
          results[key],
          title,
          formatter,
          copySelector,
          copyModifier,
          contentMap
        );
        if (sectionNode) {
          fragment.appendChild(sectionNode);
        }
      }
      );

      const totalFindings = Object.values(results).reduce(
        (sum, map) => sum + (map?.size || 0),
        0,
      );

      updateOverlayContent(
        totalFindings > 0 ? fragment : "<h2>No findings. All clear!</h2>",
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
          if (!scriptContent) {
            console.warn('[JS Recon Buddy] Content not found for:', sourceKey);
            return;
          }

          const storageKey = generateStorageKey('source-viewer-inline');
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

      const modal = createElement("div");
      modal.id = "context-modal";

      const modalContent = createElement("div", "modal-content");

      const closeButton = createElement("span", "modal-close");
      closeButton.innerHTML = "&times;";

      const title = createElement("p", "", "Context Snippet:");

      const pre = createElement("pre");
      const code = createElement("code", "", context);

      pre.appendChild(code);
      modalContent.appendChild(closeButton);
      modalContent.appendChild(title);
      modalContent.appendChild(pre);
      modal.appendChild(modalContent);

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

      const safeUrl = sanitizeUrl(sourceMapUrl) || "#";
      const safeFilename = escapeHTML(sourceMapUrl.split('/').pop() || "source map");

      modal.innerHTML = `
    <div class="modal-content-source-viewer">
      <span class="modal-close">&times;</span>
      <p>Reconstructed ${filePaths.length} sources from <a target="_blank" href="${safeUrl}" rel="noopener noreferrer">${safeFilename}</a>:</p>
      <div class="source-viewer">
        <div class="file-browser">${fileTreeHTML}</div>
        <div class="code-viewer">
          <div class="code-header">
            <span id="code-filename">Select a file</span>
            <div class="button-group">
              <button id="copy-code-button" class="btn btn--copy" title="Copy code" disabled>${copyButtonSVG}</button>
              <button id="download-all-button" class="btn btn--primary" disabled>Download All (JSON)</button>
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
      const downloadAllButton = modalContent.querySelector('#download-all-button');
      const hasValidSources = Object.keys(sources).filter(key => key !== "jsrecon.buddy.error.log").length > 0;
      downloadAllButton.disabled = !hasValidSources;

      modalContent.querySelectorAll('.file-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const fileName = e.target.closest('a').dataset.filename;
          const fileContent = sources[fileName] || '';

          codeFilenameEl.textContent = fileName;
          codeContentEl.textContent = fileContent;

          const hasContent = fileContent.length > 0;
          copyButton.disabled = !hasContent;
          downloadButton.disabled = !(hasContent && hasValidSources);
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

      downloadAllButton.addEventListener('click', () => {
        if (!sources || Object.keys(sources).length === 0) return;

        const filteredSources = {};
        for (const [fileName, content] of Object.entries(sources)) {
          if (fileName !== "jsrecon.buddy.error.log") {
            filteredSources[fileName] = content;
          }
        }

        if (Object.keys(filteredSources).length === 0) {
          downloadAllButton.disabled = true;
          return;
        }

        const exportData = {
          metadata: {
            url: sourceMapUrl,
            extractedAt: new Date().toISOString(),
            fileCount: Object.keys(filteredSources).length
          },
          sources: filteredSources
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const mapName = sourceMapUrl.split('/').pop() || 'source-map';
        a.download = `${mapName}-dump.json`;
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
        { signal: mainAbortController.signal },
      );
    }

    /**
     * Renders a single collapsible section for a category of findings.
     * @param {Map<string, Array<object>>} findingsMap - The map of findings for this section.
     * @param {string} title - The title of the section.
     * @param {function} formatter - A function to format the display of each finding.
     * @param {string} selector - The CSS selector for the "Copy Section" button.
     * @param {string} [copyModifier] - An optional modifier for the copy behavior.
     * @returns {HTMLDetailsElement | null} The HTML details element, or null if no findings.
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

      const details = createElement("details");
      const summary = createElement("summary");

      summary.appendChild(createSpan(`${title} (${findingsMap.size})`));

      const copySelector = selector || ".finding-details > summary";

      if (!title.includes("Inline Scripts")) {
        const copyButton = createElement(
          "button",
          "btn btn--copy-section",
          "Copy"
        );
        copyButton.dataset.copySelector = copySelector;
        if (copyModifier) {
          copyButton.dataset.copyModifier = copyModifier;
        }
        summary.appendChild(copyButton);
      }

      details.appendChild(summary);

      const ul = createElement("ul");

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
          const subDiv = createElement("div", "sub-section");
          const subDetails = createElement("details");
          const subSummary = createElement(
            "summary",
            "",
            `${escapeHTML(ruleId)} (${subfindings.length})`
          );
          const subUl = createElement("ul");

          subfindings.forEach(({ item, occurrences }) => {
            subUl.appendChild(renderListItem(item, occurrences, formatter, contentMap));
          });

          subDetails.appendChild(subSummary);
          subDetails.appendChild(subUl);
          subDiv.appendChild(subDetails);
          ul.appendChild(subDiv);
        }
      } else if (title.includes("External Scripts")) {
        findingsMap.forEach((_, item) => {
          const li = createElement("li");
          const safeItem = escapeHTML(item);
          let absoluteUrl;
          try {
            absoluteUrl = new URL(item, window.location.origin).href;
          } catch (e) {
          }

          const safeUrl = sanitizeUrl(absoluteUrl);
          if (safeUrl) {
            const link = createElement("a", "script-link", safeItem);
            link.href = safeUrl;
            link.dataset.sourceKey = item;
            li.appendChild(link);
          } else {
            li.textContent = safeItem;
          }
          ul.appendChild(li);
        });
      } else if (title.includes("Inline Scripts")) {
        findingsMap.forEach((_, item) => {
          const li = createElement("li");
          const safeItem = escapeHTML(item);
          const link = createElement("a", "script-link", safeItem);
          link.href = "#";
          link.dataset.sourceKey = item;
          li.appendChild(link);
          ul.appendChild(li);
        });
      } else {
        findingsMap.forEach((occurrences, item) => {
          ul.appendChild(renderListItem(item, occurrences, formatter, contentMap));
        });
      }

      details.appendChild(ul);
      return details;
    }

    /**
     * Renders a single list item for a specific finding, including its occurrences.
     * @param {string} item - The found item (e.g., the secret, the subdomain).
     * @param {Array<object>} occurrences - An array of objects detailing where the item was found.
     * @param {function} formatter - The formatting function for the item.
     * @param {object} contentMap - The map of source content.
     * @returns {HTMLLIElement} The HTML list item element.
     */
    function renderListItem(item, occurrences, formatter, contentMap) {
      const safeItem = escapeHTML(item);
      const renderedItem = formatter
        ? formatter(safeItem, occurrences, item)
        : safeItem;

      const li = createElement("li");
      const details = createElement("details", "finding-details");
      const summary = createElement("summary");

      if (renderedItem instanceof Node) {
        summary.appendChild(renderedItem);
      } else {
        summary.textContent = String(renderedItem);
      }

      const occurrencesContainer = createElement("div");
      occurrencesContainer.style.cssText = "font-size:.85em;color:#999;padding-left:15px;margin-top:5px";

      const uniqueOccurrences = new Map(
        occurrences.map((occ) => [occ.source + '@' + occ.index, occ]),
      );

      uniqueOccurrences.forEach(({ source, index, secretLength, line, column }) => {
        const occurrenceDiv = createElement("div");
        const isLocal =
          source.startsWith("Inline Script") || source === "Main HTML Document";
        const isURL = source.startsWith("http");

        occurrenceDiv.appendChild(createText("↳ "));

        if (isURL) {
          const link = createSecureLink(source, escapeHTML(source));
          if (link) {
            occurrenceDiv.appendChild(link);
          } else {
            occurrenceDiv.appendChild(createText(escapeHTML(source)));
          }
          occurrenceDiv.appendChild(createSpan(`:${line}:${column}`, "finding-location"));
        } else if (isLocal) {
          const span = createSpan(
            `${escapeHTML(source)} (click to view)`,
            "clickable-source"
          );
          span.dataset.source = source;
          span.dataset.index = index;
          span.dataset.length = secretLength || (item ? item.length : 10);
          occurrenceDiv.appendChild(span);
          occurrenceDiv.appendChild(
            createSpan(` [Line: ${line} & Col: ${column}]`, "finding-location")
          );
        } else {
          occurrenceDiv.appendChild(createText(escapeHTML(source)));
        }

        occurrencesContainer.appendChild(occurrenceDiv);

        if (!isLocal) {
          const fullCode = contentMap[source];
          if (fullCode && typeof fullCode === 'string') {
            const start = Math.max(0, index - 40);
            const end = Math.min(fullCode.length, index + (secretLength || item.length) + 40);
            const context = `... ${fullCode.substring(start, end).replace(/\n/g, " ")} ...`;

            const code = createElement("code", "context-snippet", context);
            occurrencesContainer.appendChild(code);
          }
        }
      });

      details.appendChild(summary);
      details.appendChild(occurrencesContainer);
      li.appendChild(details);

      return li;
    }

    runScanner();
  })();
