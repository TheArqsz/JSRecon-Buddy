/**
 * @description The prefix for keys used to store scan results in chrome.storage.local.
 * @type {string}
 */
export const PASSIVE_SCAN_RESULT_PREFIX = 'jsrb_passive_scan';

export const MAX_CONTENT_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * @description The maximum age of a stored scan result in milliseconds before it's considered stale.
 * @type {number}
 */
export const MAX_PASSIVE_SCAN_RESULTS_CACHE_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * @description The maximum number of pages to keep in the in-memory scan cache.
 * @type {number}
 */
export const SCANNED_PAGES_CACHE_LIMIT = 100;

/**
 * @description The maximum number of network requests allowed to run concurrently.
 * This constant is the core of the throttling mechanism, preventing the service
 * worker from being saturated with too many simultaneous fetches.
 * @type {number}
 */
export const MAX_CONCURRENT_FETCHES = 3;

/**
 * @description The maximum number of full-page scans allowed to run concurrently.
 * @type {number}
 */
export const MAX_CONCURRENT_SCANS = 7

/**
 * @description The minimum delay in milliseconds between the completion of one
 * fetch request queue and the start of the next. This acts as a rate limiter to
 * prevent sending requests too quickly to a server.
 * @type {number}
 */
export const REQUEST_DELAY_MS = 100;

/**
 * @description The duration in milliseconds the offscreen document can be idle before it's closed.
 * @type {number}
 */
export const OFFSCREEN_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * @description The delay in milliseconds for debouncing scan triggers.
 * @type {number}
 */
export const DEBOUNCE_DELAY_MS = 200;
