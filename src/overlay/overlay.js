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
		const { shannonEntropy, getLineAndColumn, getDOMAsText } = await import(
			chrome.runtime.getURL("src/utils/findingUtils.js")
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
		 * Generates a unique cache key for the current page URL.
		 * @returns {string} The cache key.
		 */
		function getCacheKey() {
			return `${CACHE_KEY_PREFIX}${window.location.href}`;
		}

		/**
		 * Retrieves and deserializes scan results from local storage for the current page.
		 * It reconstructs Map objects from the stored plain objects.
		 * @returns {Promise<object|null>} A promise that resolves to the cached data object,
		 * or null if no cache is found.
		 */
		async function getCachedResults() {
			const key = getCacheKey();
			const dataWrapper = await chrome.storage.local.get(key);
			const cachedData = dataWrapper[key];
			if (!cachedData || !cachedData.timestamp) {
				return null;
			}

			if (!cachedData.contentMap) {
				cachedData.contentMap = {};
			}

			const now = new Date().getTime();
			const cacheAge = now - cachedData.timestamp;

			if (cacheAge > CACHE_DURATION_MS) {
				console.log("[JS Recon Buddy] Results cache is expired.");
				chrome.runtime.sendMessage({
					type: 'CLEAR_STALE_CACHE',
					cacheKeyPrefix: key,
					maxCacheAge: CACHE_DURATION_MS
				});
				return null;
			}

			const results = {};
			for (const category in cachedData.results) {
				results[category] = new Map(Object.entries(cachedData.results[category]));
			}
			return { ...cachedData, results };
		}

		/**
		 * Serializes and saves the scan results to local storage.
		 * It converts Map objects into plain objects for storage.
		 * @param {object} results - The scan results object, where values are Maps of findings.
		 * @param {object} contentMap - The map of source content.
		 * @returns {Promise<void>}
		 */
		async function setCachedResults(results, contentMap) {
			const key = getCacheKey();
			chrome.runtime.sendMessage({
				type: 'CLEAR_STALE_CACHE',
				cacheKeyPrefix: CACHE_KEY_PREFIX,
				maxCacheAge: CACHE_DURATION_MS
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

			if (estimatedSize > MAX_CACHE_SIZE_BYTES) {
				console.warn(`[JS Recon Buddy] Total cache size (${Math.round(estimatedSize / 1024)} KB) exceeds limit. Caching results without source content.`);
				dataToCache = {
					results: serializableResults,
					contentMap: {},
					timestamp: new Date().getTime()
				};
			}

			try {
				await chrome.storage.local.set({ [key]: dataToCache });
			} catch (error) {
				console.warn(`[JS Recon Buddy] Failed to set cache for ${key}, even after size check:`, error);
			}
		}

		/**
		 * Copies text to the clipboard, using a fallback for insecure (HTTP) pages.
		 * @param {string} textToCopy The text to be copied.
		 * @returns {Promise<void>} A promise that resolves when the copy is complete.
		 */
		async function copyTextToClipboard(textToCopy) {
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
			const allScripts = await gatherScripts();

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
				const { parameters } = await chrome.storage.sync.get({
					parameters: DEFAULT_PARAMETERS,
				});

				const PATTERNS = getPatterns(parameters);

				const { results, contentMap } = await processScriptsAsync(allScripts, PATTERNS, onProgressCallback);

				await setCachedResults(results, contentMap);

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

					if (!forceRescan) {
						const cachedData = await getCachedResults();
						if (cachedData && cachedData.results) {
							const timestamp = new Date(cachedData.timestamp).toLocaleString();
							updateOverlayHeader(`Cached Scan (${timestamp})`);
							renderResults(cachedData.results, cachedData.contentMap);
							return;
						}
					}

					updateOverlayHeader("Live Scan", "live");
					await performScan();
				});
		}

		/**
		 * Updates the header text in the overlay UI to reflect scan status.
		 * @param {string} titleText - The text to display in the header.
		 * @param {string} [scanType='else'] - The type of scan ('live' or other) for styling.
		 */
		function updateOverlayHeader(titleText, scanType = 'else') {
			const statusSpan = shadowRoot.querySelector("#scan-status");
			if (statusSpan) {
				statusSpan.textContent = titleText;
				if (scanType === 'live') {
					statusSpan.classList.add('live-scan');
				} else {
					statusSpan.classList.remove('live-scan');
				}
			}
		}

		/**
		 * Gathers all relevant content from the page for analysis.
		 * This includes inline scripts, external scripts (via the service worker), and the main HTML.
		 * @returns {Promise<Array<{source: string, code: string}>>} A promise that resolves
		 * to an array of content objects.
		 */
		async function gatherScripts() {
			const inlineScripts = Array.from(
				document.querySelectorAll("script:not([src])"),
			).map((el, idx) => ({
				source: `Inline Script #${idx + 1}`,
				code: el.innerHTML,
			}));
			const externalScriptUrls = Array.from(
				document.querySelectorAll("script[src]"),
			).map((tag) => tag.src);

			const externalScripts = await chrome.runtime.sendMessage({
				type: "FETCH_SCRIPTS",
				urls: externalScriptUrls,
			});

			const mainHtml = getDOMAsText();
			return [
				...inlineScripts,
				...externalScripts.filter(Boolean),
				{ source: "Main HTML Document", code: mainHtml },
			];
		}

		/**
		 * The core scanning engine. It processes all collected code against a set of patterns.
		 * This function runs asynchronously in chunks to avoid freezing the page.
		 * @param {Array<{source: string, code: string}>} scripts - The array of content to scan.
		 * @param {object} patterns - The compiled regex patterns to apply.
		 * @param {ProgressCallback} [onProgress] - Optional callback to report progress.
		 * @returns {Promise<object>} A promise that resolves to the final results object,
		 * with findings grouped by category in Maps.
		 */
		async function processScriptsAsync(scripts, patterns, onProgress) {
			const { currentHostname, baseDomain } = getDomainInfo();
			const isValidSubdomain = (domain) =>
				domain === currentHostname ||
				domain.endsWith(`.${currentHostname}`) ||
				domain === baseDomain ||
				domain.endsWith(`.${baseDomain}`);
			const isValidEntropy = (secret, ruleEntropy) =>
				shannonEntropy(secret) >= ruleEntropy;
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
			const processMatch = (
				match,
				{ group, context: contextType, ruleId, ruleEntropy },
				name,
				code,
				source,
			) => {
				let finding = match[group]?.trim();
				if (!finding) return;

				const validationMap = {
					Subdomains: () => isValidSubdomain(finding),
					"Potential Secrets": () => isValidEntropy(finding, ruleEntropy),
					Endpoints: () => isValidEndpoint(finding),
				};

				if (validationMap[name] && !validationMap[name]()) {
					return;
				}

				if (!results[name].has(finding)) {
					results[name].set(finding, []);
				}
				const { line, column } = getLineAndColumn(code, match.index);
				const occurrence = {
					source: source,
					ruleId: ruleId,
					index: match.index,
					secretLength: finding.length,
					line: line,
					column: column
				};
				results[name]
					.get(finding)
					.push(occurrence);
			};

			/**
			 * Applies all defined patterns to a single piece of source code.
			 * @param {string} code - The source code to scan.
			 * @param {string} source - The identifier for the source code.
			 */
			const applyRulesToCode = (code, source) => {
				for (const name in patterns) {
					const rules = Array.isArray(patterns[name])
						? patterns[name]
						: [patterns[name]];
					for (const rule of rules) {
						if (!rule.regex) continue;
						for (const match of code.matchAll(rule.regex)) {
							processMatch(match, rule, name, code, source);
						}
					}
				}
			};

			/**
			 * Prepares and processes a single script object from the gathered content.
			 * @param {{source: string, code: string}} script - The script object to process.
			 */
			const processSingleScript = (script, index) => {
				let { code, source } = script;
				if (!code) return;

				const decodedCode = decodeText(code);

				contentMap[source] = decodedCode;

				applyRulesToCode(decodedCode, source);

				if (onProgress) {
					onProgress(index + 1, scripts.length);
				}
			};

			/**
			 * Recursively processes the scripts array in small, asynchronous chunks to prevent
			 * freezing the browser's main thread.
			 * @param {number} startIndex - The index of the scripts array from which to start the chunk.
			 * @returns {Promise<void>} A promise that resolves when all chunks are processed.
			 */
			const processChunk = (startIndex) => {
				return new Promise((resolve) => {
					const endIndex = Math.min(startIndex + 5, scripts.length);

					for (let i = startIndex; i < endIndex; i++) {
						processSingleScript(scripts[i], i);
					}

					if (endIndex < scripts.length) {
						setTimeout(() => processChunk(endIndex).then(resolve), 0);
					} else {
						resolve();
					}
				});
			};

			await processChunk(0);
			return { results, contentMap };
		}

		/**
		 * A utility function to decode various text encodings found in scripts.
		 * @param {string} str - The string to decode.
		 * @returns {string} The decoded, plain text string.
		 */
		function decodeText(str) {
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
			resultsContainer.addEventListener("click", (event) => {
				const target = event.target;

				if (target.classList.contains("clickable-source")) {
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

			attachExportListener(results);
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

		/**
		 * A utility to generate an HTML file tree from a flat array of file paths.
		 * @param {string[]} filePaths - An array of source file paths.
		 * @returns {string} The generated HTML string for the file tree.
		 */
		function generateFileTreeHTML(filePaths) {
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

			const createHTML = (node, path = '') => {
				let html = '<ul>';
				const entries = Object.entries(node);
				if (entries.length === 0) return '';

				entries.forEach(([name, children]) => {
					const currentPath = path ? `${path}/${name}` : name;
					const hasChildren = Object.keys(children).length > 0;

					html += '<li>';
					if (hasChildren) {
						html += `<details open><summary><span class="folder-icon">🗀</span> ${name}</summary>${createHTML(children, currentPath)}</details>`;
					} else {
						html += `<a href="#" class="file-link" data-filename="${currentPath}"><span class="file-icon">🖹</span> ${name}</a>`;
					}
					html += '</li>';
				});

				html += '</ul>';
				return html;
			};

			return createHTML(root);
		}

		let exportController = new AbortController();

		/**
		 * Attaches an event listener to the "Export" button for downloading results as JSON.
		 * @param {object} results - The results object to be exported.
		 */
		function attachExportListener(results) {
			exportController.abort();
			exportController = new AbortController();
			shadowRoot.getElementById("export-button").addEventListener(
				"click",
				() => {
					if (!results) return;

					const exportableResults = {};
					for (const key in results) {
						if (results[key] instanceof Map) {
							exportableResults[key] = Object.fromEntries(results[key]);
						}
					}
					const dataStr =
						"data:text/json;charset=utf-8," +
						encodeURIComponent(JSON.stringify(exportableResults, null, 2));
					const downloadAnchorNode = document.createElement("a");
					downloadAnchorNode.setAttribute("href", dataStr);
					downloadAnchorNode.setAttribute(
						"download",
						`recon_${location.hostname}.json`,
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
			} else {
				findingsMap.forEach((occurrences, item) => {
					itemsHTML += renderListItem(item, occurrences, formatter, contentMap);
				});
			}

			const copySelector = selector || ".finding-details > summary";
			const modifierAttribute = copyModifier
				? `data-copy-modifier="${copyModifier}"`
				: "";

			const summaryHTML = `
      <span>${title} (${findingsMap.size})</span>
      <button class="btn btn--copy-section" data-copy-selector="${copySelector}" ${modifierAttribute}>Copy</button>
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

			/**
			 * Escapes HTML special characters in a string to prevent injection when rendering.
			 * @param {string} str - The string to escape.
			 * @returns {string} The HTML-safe string.
			 */
			const escapeHTML = (str) => {
				return str
					.replace(/&/g, "&amp;")
					.replace(/</g, "&lt;")
					.replace(/>/g, "&gt;")
					.replace(/"/g, "&quot;")
					.replace(/'/g, "&#039;");
			};

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

		/**
		 * A utility to extract the current hostname and its base domain from the page URL.
		 * @returns {{currentHostname: string, baseDomain: string}} An object containing hostname info.
		 */
		function getDomainInfo() {
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

		runScanner();
	})();
