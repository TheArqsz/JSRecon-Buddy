import { beforeEach, jest } from '@jest/globals';
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

  test('should log an error if the fallback execCommand fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });

    document.execCommand = jest.fn(() => {
      throw new Error('Copy command failed');
    });

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

    await utils.copyTextToClipboard('text');

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[JS Recon Buddy] Fallback copy failed",
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
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

  test('should return the original match if decodeURIComponent fails', () => {
    const invalidSequence = 'This has a bad URI sequence: %E0%A4%A';

    const result = utils.decodeText(invalidSequence);

    expect(result).toBe(invalidSequence);
  });
});

describe('getCacheKey', () => {
  test('should correctly concatenate the prefix and the URL', () => {
    const prefix = 'scan_cache_';
    const url = 'https://example.com/page';

    const result = utils.getCacheKey(prefix, url);

    expect(result).toBe('scan_cache_https://example.com/page');
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

  test('getCachedResults should return null for missing or invalid cache data', async () => {
    const key = 'test-key';
    const maxAgeMs = 3600000;

    browser.storage.local.get.mockResolvedValue({});
    let result = await utils.getCachedResults(key, maxAgeMs);
    expect(result).toBeNull();

    browser.storage.local.get.mockResolvedValue({
      [key]: {
        results: { some: 'data' }
      }
    });
    result = await utils.getCachedResults(key, maxAgeMs);
    expect(result).toBeNull();
  });

  test('setCachedResults should remove contentMap if size exceeds limit', async () => {
    const largeContentMap = { 'large_source': 'a'.repeat(maxCacheSizeBytes) };
    await utils.setCachedResults(key, { cat: results }, largeContentMap, maxCacheSizeBytes, cacheKeyPrefix, maxCacheAgeMs);
    const callArg = browser.storage.local.set.mock.calls[0][0];
    expect(callArg[key].contentMap).toEqual({});
  });

  test('getCachedResults should create an empty contentMap if it is missing', async () => {
    browser.storage.local.get.mockResolvedValue({
      'test-key': {
        results: {},
        timestamp: new Date().getTime(),
      }
    });

    const cached = await utils.getCachedResults('test-key', 3600000);

    expect(cached).not.toBeNull();
    expect(cached.contentMap).toEqual({});
  });

  test('setCachedResults should log a warning if setting cache fails', async () => {
    const key = 'test-key';
    const error = new Error('Quota exceeded');

    browser.storage.local.set.mockRejectedValueOnce(error);

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

    await utils.setCachedResults(key, {}, {}, 5000, 'scan_', 3600000);

    expect(browser.storage.local.set).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      `[JS Recon Buddy] Failed to set cache for ${key}, even after size reduction:`,
      error
    );

    consoleSpy.mockRestore();
  });

  test('setCachedResults should correctly serialize Map objects into plain objects', async () => {
    const resultsWithMap = {
      'Potential Secrets': new Map([
        ['API_KEY_123', [{ source: 'file1.js' }]]
      ]),
      'SomeOtherCategory': ['value1', 'value2']
    };
    const key = 'serialization-test-key';

    await utils.setCachedResults(key, resultsWithMap, {}, 5000, 'scan_', 3600000);

    expect(browser.storage.local.set).toHaveBeenCalled();

    const callArg = browser.storage.local.set.mock.calls[0][0];
    const savedData = callArg[key];
    const savedResults = savedData.results;

    expect(savedResults['Potential Secrets']).not.toBeInstanceOf(Map);
    expect(savedResults['Potential Secrets']).toEqual({
      'API_KEY_123': [{ source: 'file1.js' }]
    });

    expect(savedResults).not.toHaveProperty('SomeOtherCategory');
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

  test('should log a warning if the status element is not provided', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

    utils.updateOverlayHeader(null, 'Some Text');

    expect(consoleSpy).toHaveBeenCalledWith(
      "[JS Recon Buddy] Cannot update overlay header: status element not provided."
    );

    consoleSpy.mockRestore();
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

  test('should log a warning if chrome.runtime.sendMessage is not available', async () => {
    const originalSendMessage = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = undefined;

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
    document.body.innerHTML = `<script src="https://example.com/script.js"></script>`;

    const scripts = await utils.gatherScripts('<html></html>');

    expect(consoleSpy).toHaveBeenCalledWith(
      "[JS Recon Buddy] Cannot fetch external scripts: chrome.runtime.sendMessage is not available."
    );

    const externalScripts = scripts.filter(s => s.source.startsWith('http'));
    expect(externalScripts.length).toBe(0);

    consoleSpy.mockRestore();
    chrome.runtime.sendMessage = originalSendMessage;
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

  test('should sort folders before files at the same level, regardless of alphabetical order', () => {
    const paths = [
      'a-file.js',
      'z-folder/component.js'
    ];

    const result = utils.generateFileTreeHTML(paths);

    const folderIndex = result.indexOf('z-folder');
    const fileIndex = result.indexOf('a-file.js');

    expect(folderIndex).toBeGreaterThan(-1);
    expect(fileIndex).toBeGreaterThan(-1);
    expect(folderIndex).toBeLessThan(fileIndex);
  });

  test('should also sort folders before files when the folder is first alphabetically', () => {
    const paths = [
      'z-file.js',
      'a-folder/component.js'
    ];

    const result = utils.generateFileTreeHTML(paths);

    const folderIndex = result.indexOf('a-folder');
    const fileIndex = result.indexOf('z-file.js');

    expect(folderIndex).toBeGreaterThan(-1);
    expect(fileIndex).toBeGreaterThan(-1);
    expect(folderIndex).toBeLessThan(fileIndex);
  });

  test('should correctly sort a mixed list of files and folders', () => {
    const paths = [
      'z-file.js',
      'a-folder/a.js',
      'c-file.js',
      'b-folder/b.js'
    ];

    const result = utils.generateFileTreeHTML(paths);

    const folderA_Index = result.indexOf('a-folder');
    const folderB_Index = result.indexOf('b-folder');
    const fileC_Index = result.indexOf('c-file.js');
    const fileZ_Index = result.indexOf('z-file.js');

    expect(folderA_Index).toBeGreaterThan(-1);
    expect(folderB_Index).toBeGreaterThan(-1);
    expect(fileC_Index).toBeGreaterThan(-1);
    expect(fileZ_Index).toBeGreaterThan(-1);

    expect(folderA_Index).toBeLessThan(folderB_Index);
    expect(folderB_Index).toBeLessThan(fileC_Index);
    expect(fileC_Index).toBeLessThan(fileZ_Index);
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

describe('processScriptsAsync', () => {
  let mockDependencies;
  let mockPatterns;

  beforeEach(() => {
    mockDependencies = {
      shannonEntropy: jest.fn(str => (str.includes('low_entropy') ? 1 : 5)),
      getLineAndColumn: jest.fn().mockReturnValue({ line: 1, column: 1 }),
      getDomainInfo: jest.fn().mockReturnValue({
        currentHostname: 'app.example.com',
        baseDomain: 'example.com',
      }),
    };

    mockPatterns = {
      Subdomains: { regex: /([a-z0-9-]*\.example\.com)/g, group: 1 },
      Endpoints: { regex: /(["'`])(\/(?!\/)[a-z0-9_?&=\/\-#.]*)\1/g, group: 2 },
      'Potential Secrets': [{ regex: /key="([^"]+)"/g, group: 1, ruleEntropy: 4.0 }],
    };
  });

  test('should correctly process scripts and find valid items', async () => {
    const scripts = [
      { source: 'script1.js', code: 'fetch("https://api.example.com/data")' },
      { source: 'script2.js', code: 'const apiKey = "key=\"high_entropy_secret\""' },
    ];

    const { results } = await utils.processScriptsAsync(scripts, mockPatterns, mockDependencies);
    expect(results.Subdomains.has('api.example.com')).toBe(true);
    expect(results['Potential Secrets'].has('high_entropy_secret')).toBe(true);
  });

  test('should filter out invalid findings based on validation rules', async () => {
    const scripts = [
      { source: 'script1.js', code: 'url = "other.domain.com"' },
      { source: 'script2.js', code: 'const pw = "key=\"low_entropy\""' },
    ];

    const { results } = await utils.processScriptsAsync(scripts, mockPatterns, mockDependencies);

    expect(results.Subdomains.size).toBe(0);
    expect(results['Potential Secrets'].size).toBe(0);
  });

  test('should find valid endpoints and filter out invalid ones', async () => {
    const scripts = [
      { source: 'api.js', code: 'const userPath = "/api/v1/users";' },
      { source: 'root.js', code: 'const rootPath = "/";' }
    ];

    const { results } = await utils.processScriptsAsync(scripts, mockPatterns, mockDependencies);

    expect(results.Endpoints.size).toBe(1);
    expect(results.Endpoints.has('/api/v1/users')).toBe(true);
    expect(results.Endpoints.has('/')).toBe(false);
  });

  test('should call the onProgress callback for each script processed', async () => {
    const scripts = [
      { source: 's1.js', code: 'code1' },
      { source: 's2.js', code: 'code2' },
      { source: 's3.js', code: null },
      { source: 's4.js', code: 'code4' },
    ];
    const onProgress = jest.fn();

    await utils.processScriptsAsync(scripts, mockPatterns, mockDependencies, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(3);

    expect(onProgress).toHaveBeenLastCalledWith(3, 4);
  });

  test('should not find any subdomains when the hostname is invalid', async () => {
    mockDependencies.getDomainInfo.mockReturnValue({
      currentHostname: null,
      baseDomain: null,
    });

    const scripts = [
      { source: 'script1.js', code: 'fetch("https://api.example.com/data")' }
    ];

    const { results } = await utils.processScriptsAsync(scripts, mockPatterns, mockDependencies);

    expect(results.Subdomains.size).toBe(0);
  });

  test('should not add a finding if the specified regex group is empty or undefined', async () => {
    mockPatterns['Optional Group'] = {
      regex: /(domain.com)(\/path)?/g,
      group: 2,
    };

    const scripts = [
      { source: 'test.js', code: 'const url = "domain.com";' }
    ];

    const { results } = await utils.processScriptsAsync(scripts, mockPatterns, mockDependencies);

    expect(results['Optional Group']).toBeDefined();
    expect(results['Optional Group'].size).toBe(0);
  });

  test('should correctly trim whitespace from a finding', async () => {
    const scripts = [
      { source: 'whitespace.js', code: 'const secret = "key=\"   padded-secret   \""' }
    ];

    const { results } = await utils.processScriptsAsync(scripts, mockPatterns, mockDependencies);

    expect(results['Potential Secrets'].has('padded-secret')).toBe(true);

    expect(results['Potential Secrets'].has('   padded-secret   ')).toBe(false);
  });

  test('should correctly trim whitespace when falling back to group 0', async () => {
    const mockPatternsWithGroupFallback = {
      'Potential Secrets': [{
        regex: / secret-with-whitespace /g,
        ruleId: 'whitespace-fallback-test',
        ruleEntropy: 0,
      }],
    };

    const scripts = [
      { source: 'test.js', code: 'const value = " secret-with-whitespace ";' }
    ];

    const { results } = await utils.processScriptsAsync(scripts, mockPatternsWithGroupFallback, mockDependencies);

    expect(results['Potential Secrets'].has('secret-with-whitespace')).toBe(true);

    expect(results['Potential Secrets'].has(' secret-with-whitespace ')).toBe(false);
  });

  test('should group multiple occurrences of the same finding under a single entry', async () => {
    const scripts = [
      { source: 'file1.js', code: 'const secret = \'key="unique-secret"\' ' },
      { source: 'file2.js', code: 'let anotherSecret = \'key="unique-secret"\' ' }
    ];

    const { results } = await utils.processScriptsAsync(scripts, mockPatterns, mockDependencies);

    const secretsMap = results['Potential Secrets'];

    expect(secretsMap.size).toBe(1);

    const occurrences = secretsMap.get('unique-secret');
    expect(occurrences).toBeDefined();
    expect(occurrences.length).toBe(2);

    expect(occurrences[0].source).toBe('file1.js');
    expect(occurrences[1].source).toBe('file2.js');
  });

  test('should gracefully skip any rules where the regex is null or undefined', async () => {
    const mockPatternsWithInvalidRule = {
      'MixedRules': [
        {
          regex: /find-this/g,
          group: 0,
        },
        {
          regex: null,
          group: 0,
        },
        {
          regex: /find-this-too/g,
          group: 0
        }
      ]
    };

    const scripts = [
      { source: 'test.js', code: 'This code contains find-this and also find-this-too' }
    ];

    const { results } = await utils.processScriptsAsync(scripts, mockPatternsWithInvalidRule, mockDependencies);

    expect(results['MixedRules']).toBeDefined();

    expect(results['MixedRules'].size).toBe(2);
    expect(results['MixedRules'].has('find-this')).toBe(true);
    expect(results['MixedRules'].has('find-this-too')).toBe(true);
  });
});
