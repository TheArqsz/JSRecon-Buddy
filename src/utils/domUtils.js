/**
 * Safely creates a text node from any input value.
 * Converts the input to a string to prevent type errors.
 *
 * @param {*} text - The text content to create a node from.
 * @returns {Text} A text node containing the stringified content.
 *
 * @example
 * const textNode = createText('Hello World');
 * element.appendChild(textNode);
 */
export function createText(text) {
  return document.createTextNode(String(text));
}

/**
 * Safely creates an HTML element with optional className and text content.
 *
 * @param {string} tag - The HTML tag name (e.g., 'div', 'span', 'p').
 * @param {string} [className=''] - Optional CSS class name(s) to apply.
 * @param {string} [textContent=''] - Optional text content (will be safely escaped).
 * @returns {HTMLElement} The created element.
 *
 * @example
 * const heading = createElement('h2', 'title', 'My Heading');
 * document.body.appendChild(heading);
 */
export function createElement(tag, className = '', textContent = '') {
  const el = document.createElement(tag);
  if (className) {
    el.className = className;
  }
  if (textContent) {
    el.textContent = String(textContent);
  }
  return el;
}

/**
 * Validates and sanitizes a URL.
 * Only allows http: and https: protocols.
 *
 * @param {string} url - The URL string to validate.
 * @returns {string|null} The sanitized URL if valid, null otherwise.
 *
 * @example
 * const safeUrl = sanitizeUrl('https://example.com');
 * if (safeUrl) {
 *   link.href = safeUrl;
 * }
 *
 * @example
 * sanitizeUrl('javascript:alert(1)'); // returns null
 */
export function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}


/**
 * Generates a cryptographically secure random storage key.
 * Falls back to a combination of timestamp and random string if crypto.randomUUID is unavailable.
 *
 * @param {string} prefix - The prefix to prepend to the generated key.
 * @returns {string} A unique storage key in the format: prefix-{uuid|timestamp-random}.
 *
 * @example
 * const key = generateStorageKey('source-viewer');
 * // Returns: 'source-viewer-550e8400-e29b-41d4-a716-446655440000'
 *
 * @example
 * // Fallback when crypto.randomUUID is unavailable
 * // Returns: 'cache-1699564800000-7x3m9k2p4'
 */
export function generateStorageKey(prefix) {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch (error) {
    console.warn('[JS Recon Buddy] crypto.randomUUID failed, using fallback key generation:', error);
  }
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Sanitizes finding data to prevent injection attacks and limit memory usage.
 * Validates types and enforces maximum lengths for all fields.
 *
 * @param {object} finding - The raw finding object from scan results.
 * @param {string} [finding.id] - The rule ID that triggered the finding.
 * @param {string} [finding.description] - Description of what was found.
 * @param {string} [finding.source] - The source file or location.
 * @param {string} [finding.secret] - The detected secret value.
 * @param {number} [finding.line] - Line number where secret was found.
 * @param {number} [finding.column] - Column number where secret was found.
 * @param {boolean} [finding.isSourceTooLarge] - Whether the source file exceeds size limits.
 * @returns {object} A sanitized finding object with validated and truncated fields.
 *
 * @example
 * const rawFinding = {
 *   id: 'API_KEY',
 *   secret: 'sk_test_very_long_secret_key...',
 *   source: 'config.js',
 *   line: 42,
 *   column: 10
 * };
 * const safe = sanitizeFinding(rawFinding);
 */
export function sanitizeFinding(finding) {
  if (!finding || typeof finding !== 'object') {
    return {
      id: 'Unknown',
      description: null,
      source: '',
      secret: '',
      line: null,
      column: null,
      isSourceTooLarge: false
    };
  }

  return {
    id: String(finding.id || 'Unknown').substring(0, 200),
    description: finding.description ? String(finding.description).substring(0, 500) : null,
    source: String(finding.source || '').substring(0, 2000),
    secret: String(finding.secret || '').substring(0, 10000),
    line: Number.isInteger(finding.line) ? finding.line : null,
    column: Number.isInteger(finding.column) ? finding.column : null,
    isSourceTooLarge: Boolean(finding.isSourceTooLarge)
  };
}

/**
 * Creates a secure external link element with proper security attributes.
 * Validates the URL and adds rel="noopener noreferrer" to prevent window.opener attacks.
 *
 * @param {string} url - The URL to link to.
 * @param {string} [displayText] - Optional custom display text (defaults to URL).
 * @returns {HTMLAnchorElement|null} A configured anchor element, or null if URL is invalid.
 *
 * @example
 * const link = createSecureLink('https://example.com', 'Visit Example');
 * if (link) {
 *   container.appendChild(link);
 * }
 */
export function createSecureLink(url, displayText) {
  const sanitized = sanitizeUrl(url);
  if (!sanitized) {
    return null;
  }

  const link = document.createElement('a');
  link.href = sanitized;
  link.textContent = displayText || url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

/**
 * Clears all child nodes from a DOM element.
 *
 * @param {HTMLElement} element - The element to clear.
 * @returns {void}
 *
 * @example
 * const list = document.getElementById('findings-list');
 * clearElement(list);
 */
export function clearElement(element) {
  if (!element || !(element instanceof HTMLElement)) {
    return;
  }
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Creates a text span with optional CSS class.
 *
 * @param {string} text - The text content.
 * @param {string} [className=''] - Optional CSS class name.
 * @returns {HTMLSpanElement} A span element with the specified text and class.
 *
 * @example
 * const label = createSpan('Finding Location:', 'label-text');
 * const value = createSpan(':42:10', 'location-coords');
 */
export function createSpan(text, className = '') {
  const span = document.createElement('span');
  if (className) {
    span.className = className;
  }
  span.textContent = String(text);
  return span;
}

/**
 * Validates that an element exists and is a valid HTMLElement.
 *
 * @param {*} element - The element to validate.
 * @returns {boolean} True if element is a valid HTMLElement, false otherwise.
 *
 * @example
 * const list = document.getElementById('findings-list');
 * if (isValidElement(list)) {
 *   clearElement(list);
 * }
 */
export function isValidElement(element) {
  return element instanceof HTMLElement;
}
