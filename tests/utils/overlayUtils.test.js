import { afterEach, beforeEach, jest } from '@jest/globals';
import * as utils from '../../src/utils/overlayUtils.js';

global.chrome = browser;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => { });
  jest.spyOn(console, 'log').mockImplementation(() => { });
  document.body.innerHTML = '';
});

describe('copyTextToClipboard', () => {
  test('should use navigator.clipboard in a secure context', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    await utils.copyTextToClipboard('test text');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test text');
  });

  test('should use execCommand as a fallback in an insecure context', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });

    document.execCommand = jest.fn();

    await utils.copyTextToClipboard('fallback text');
    expect(document.execCommand).toHaveBeenCalledWith('copy');

    delete document.execCommand;
  });
});


describe('decodeText', () => {
  test('should decode URI-encoded strings', () => {
    const encoded = 'Hello%20World';
    expect(utils.decodeText(encoded)).toBe('Hello World');
  });

  test('should decode unicode escape sequences', () => {
    const encoded = 'This is a test\\u003cscript\\u003e';
    expect(utils.decodeText(encoded)).toBe('This is a test<script>');
  });

  test('should decode HTML entities', () => {
    const encoded = '&lt;div&gt;Hello&lt;/div&gt;';
    expect(utils.decodeText(encoded)).toBe('<div>Hello</div>');
  });

  test('should handle an empty string', () => {
    expect(utils.decodeText('')).toBe('');
  });

  test('should return a string with no encoding unchanged', () => {
    expect(utils.decodeText('plain string')).toBe('plain string');
  });
});

describe('getDomainInfo', () => {
  test('should handle a standard domain', () => {
    expect(utils.getDomainInfo('www.example.com')).toEqual({
      currentHostname: 'www.example.com',
      baseDomain: 'example.com',
    });
  });

  test('should handle a second-level domain (SLD) like .com.pl', () => {
    expect(utils.getDomainInfo('sub.domain.com.pl')).toEqual({
      currentHostname: 'sub.domain.com.pl',
      baseDomain: 'domain.com.pl',
    });
  });

  test('should handle a simple two-part domain', () => {
    expect(utils.getDomainInfo('example.com')).toEqual({
      currentHostname: 'example.com',
      baseDomain: 'example.com',
    });
  });

  test('should handle localhost', () => {
    expect(utils.getDomainInfo('localhost')).toEqual({
      currentHostname: 'localhost',
      baseDomain: 'localhost',
    });
  });

  test('should handle localhost with port', () => {
    expect(utils.getDomainInfo('localhost:4000')).toEqual({
      currentHostname: 'localhost:4000',
      baseDomain: 'localhost:4000',
    });
  });

  test('should handle an IP', () => {
    expect(utils.getDomainInfo('127.0.0.1')).toEqual({
      currentHostname: null,
      baseDomain: null,
    });
  });
});

describe('Caching Functions (get/set)', () => {
  const key = 'test-key';
  const results = new Map([['finding1', []]]);
  const contentMap = { 'source1': 'content' };
  const maxCacheSizeBytes = 5000;
  const cacheKeyPrefix = 'scan_';
  const maxCacheAgeMs = 3600000;

  test('setCachedResults should save data to local storage', async () => {
    await utils.setCachedResults(key, { cat: results }, contentMap, maxCacheSizeBytes, cacheKeyPrefix, maxCacheAgeMs);
    expect(browser.storage.local.set).toHaveBeenCalled();
    const callArg = browser.storage.local.set.mock.calls[0][0];
    expect(callArg[key].results.cat).toEqual({ finding1: [] });
  });

  test('getCachedResults should retrieve and deserialize data', async () => {
    browser.storage.local.get.mockResolvedValue({
      [key]: {
        results: { cat: { finding1: [] } },
        contentMap: {},
        timestamp: new Date().getTime(),
      }
    });

    const cached = await utils.getCachedResults(key, maxCacheAgeMs);
    expect(cached.results.cat).toBeInstanceOf(Map);
    expect(cached.results.cat.has('finding1')).toBe(true);
  });

  test('getCachedResults should return null for expired cache', async () => {
    browser.storage.local.get.mockResolvedValue({
      [key]: {
        timestamp: new Date().getTime() - (maxCacheAgeMs * 2),
      }
    });
    const cached = await utils.getCachedResults(key, maxCacheAgeMs);
    expect(cached).toBeNull();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'CLEAR_STALE_CACHE' }));
  });

  test('setCachedResults should remove contentMap if size exceeds limit', async () => {
    const largeContentMap = { 'large_source': 'a'.repeat(maxCacheSizeBytes) };
    await utils.setCachedResults(key, { cat: results }, largeContentMap, maxCacheSizeBytes, cacheKeyPrefix, maxCacheAgeMs);
    const callArg = browser.storage.local.set.mock.calls[0][0];
    expect(callArg[key].contentMap).toEqual({});
  });
});

describe('updateOverlayHeader', () => {
  test('should update the text and add the correct class', () => {
    const statusElement = document.createElement('span');
    utils.updateOverlayHeader(statusElement, 'Scanning...', 'live');
    expect(statusElement.textContent).toBe('Scanning...');
    expect(statusElement.classList.contains('live-scan')).toBe(true);
  });

  test('should remove the class for non-live scans', () => {
    const statusElement = document.createElement('span');
    statusElement.classList.add('live-scan');
    utils.updateOverlayHeader(statusElement, 'Scan Complete');
    expect(statusElement.textContent).toBe('Scan Complete');
    expect(statusElement.classList.contains('live-scan')).toBe(false);
  });
});

describe('gatherScripts', () => {
  test('should gather inline, external, and main HTML content', async () => {
    document.body.innerHTML = `
            <script>console.log("inline");</script>
            <script src="https://example.com/script.js"></script>
        `;
    browser.runtime.sendMessage.mockResolvedValue([{ source: 'https://example.com/script.js', code: 'external code' }]);

    const scripts = await utils.gatherScripts('<html>...</html>');

    expect(scripts).toHaveLength(3);
    expect(scripts[0].source).toBe('Inline Script #1');
    expect(scripts[1].source).toBe('https://example.com/script.js');
    expect(scripts[2].source).toBe('Main HTML Document');
  });
});


describe('generateFileTreeHTML', () => {
  test('should create a sorted, nested list of files and folders', () => {
    const paths = ['src/utils/api.js', 'assets/image.png', 'src/components/button.js'];
    const result = utils.generateFileTreeHTML(paths);

    expect(result).toContain('<details open><summary><span class="folder-icon">');
    expect(result).toContain('assets');
    expect(result).toContain('src');
    expect(result).toContain('api.js');
    expect(result.indexOf('assets')).toBeLessThan(result.indexOf('src'));
  });

  test('should return an empty string for no file paths', () => {
    expect(utils.generateFileTreeHTML([])).toBe('');
  });
});

describe('generateReconFilename', () => {
  test('should generate a filename with both hostname and a sanitized path', () => {
    const url = 'https://www.example.com/user/profile/settings';
    const expected = 'recon_www.example.com_user_profile_settings.json';
    expect(utils.generateReconFilename(url)).toBe(expected);
  });

  test('should handle a URL with no path component', () => {
    const url = 'https://example.com';
    const expected = 'recon_example.com.json';
    expect(utils.generateReconFilename(url)).toBe(expected);
  });

  test('should return a fallback for an invalid URL', () => {
    const invalidUrl = 'not-a-valid-url';
    const expected = 'recon_scan_results.json';
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
    expect(utils.generateReconFilename(invalidUrl)).toBe(expected);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
