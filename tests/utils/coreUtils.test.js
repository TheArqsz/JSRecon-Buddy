import { jest } from '@jest/globals';

import {
  shannonEntropy,
  getLineAndColumn,
  getDOMAsText,
  isScannable,
  isUrlExcluded,
  isScanningGloballyEnabled,
  isPassiveScanningEnabled,
  escapeHTML,
  createLRUCache
} from '../../src/utils/coreUtils.js';

global.chrome = {
  tabs: {
    onActivated: {
      addListener: jest.fn(),
    },
    get: jest.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
  },

  storage: {
    onChanged: {
      addListener: jest.fn(),
    },
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn(),
    },
  }
};

describe('shannonEntropy', () => {
  test('should return 0 for an empty or null string', () => {
    expect(shannonEntropy('')).toBe(0);
    expect(shannonEntropy(null)).toBe(0);
  });

  test('should return 0 for a string with no variety', () => {
    expect(shannonEntropy('aaaaa')).toBe(0);
  });

  test('should calculate the correct entropy for a simple string', () => {
    expect(shannonEntropy('aabb')).toBeCloseTo(1);
  });

  test('should calculate the correct entropy for a more complex string', () => {
    expect(shannonEntropy('abaaccc')).toBeCloseTo(1.44882);
  });

  test('should calculate high entropy for a highly random string', () => {
    const randomString = 'abcdefghijklmnopqrstuvwxyz0123456789';
    expect(shannonEntropy(randomString)).toBeCloseTo(Math.log2(randomString.length));
  });
});

describe('getLineAndColumn', () => {
  const multilineContent = `const a = 1;\nconst b = 2;\nconst c = 3;`;

  test('should return line 1 for an index on the first line', () => {
    expect(getLineAndColumn(multilineContent, 6)).toEqual({ line: 1, column: 7 });
  });

  test('should return the correct line and column for the start of a new line', () => {
    expect(getLineAndColumn(multilineContent, 13)).toEqual({ line: 2, column: 1 });
  });

  test('should return the correct line and column for a character mid-line', () => {
    expect(getLineAndColumn(multilineContent, 29)).toEqual({ line: 3, column: 4 });
  });

  test('should handle index 0 correctly', () => {
    expect(getLineAndColumn(multilineContent, 0)).toEqual({ line: 1, column: 1 });
  });
});

describe('getDOMAsText', () => {
  test('should serialize the current document state into a string', () => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    Object.defineProperty(document, 'doctype', { value: null, configurable: true });


    const htmlString = getDOMAsText();

    expect(htmlString).toContain('<!DOCTYPE html>');
    expect(htmlString).toContain('<html><head></head><body></body></html>');
  });

  test('should serialize an existing doctype using XMLSerializer', () => {
    const mockDoctype = {};
    const mockDoctypeString = '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN">';
    document.documentElement.innerHTML = '<head></head><body></body>';
    Object.defineProperty(document, 'doctype', { value: mockDoctype, configurable: true });

    global.XMLSerializer = jest.fn(() => ({
      serializeToString: jest.fn().mockReturnValue(mockDoctypeString),
    }));

    const htmlString = getDOMAsText();

    expect(htmlString).toContain(mockDoctypeString);
    expect(htmlString).not.toContain('<!DOCTYPE html>');
    expect(htmlString).toContain('\n<html><head></head><body></body></html>');
  });
});

describe('isUrlExcluded', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => { });
    jest.spyOn(console, 'error').mockImplementation(() => { });
  });

  test('should return true for a simple string match', () => {
    const list = 'google.com\nexample.com';
    expect(isUrlExcluded('https://www.google.com/maps', list)).toBe(true);
  });

  test('should return true for a regex match', () => {
    const list = '/maps\\/api/';
    expect(isUrlExcluded('https://example.com/maps/api/place', list)).toBe(true);
  });

  test('should return false if there is no match', () => {
    const list = 'bing.com\n/yahoo\\.com/';
    expect(isUrlExcluded('https://www.google.com', list)).toBe(false);
  });

  test('should return false for an empty exclusion list', () => {
    expect(isUrlExcluded('https://example.com', '')).toBe(false);
    expect(isUrlExcluded('https://example.com', null)).toBe(false);
  });

  test('should not throw an error for an invalid regex and should continue checking', () => {
    const list = '/[invalid-regex/\nexample.com';
    expect(isUrlExcluded('https://sub.example.com', list)).toBe(true);
  });
});

describe('isScannable', () => {
  beforeEach(() => {
    chrome.storage.sync.get.mockClear();
    jest.spyOn(console, 'warn').mockImplementation(() => { });
    jest.spyOn(console, 'error').mockImplementation(() => { });
  });

  test('should return true for a valid, non-excluded URL', async () => {
    chrome.storage.sync.get.mockResolvedValue({ excludedDomains: '' });
    const result = await isScannable('https://www.some-random-site.com');
    expect(result).toBe(true);
  });

  test('should return false for a URL excluded by a simple string', async () => {
    chrome.storage.sync.get.mockResolvedValue({ excludedDomains: 'baddomain.com' });
    const result = await isScannable('https://baddomain.com/page');
    expect(result).toBe(false);
  });

  test('should return false for a URL excluded by regex', async () => {
    chrome.storage.sync.get.mockResolvedValue({ excludedDomains: '/^https:\\/\\/github\\.com/' });
    const result = await isScannable('https://github.com/TheArqsz');
    expect(result).toBe(false);
  });

  test('should return false for a non-http URL', async () => {
    const result = await isScannable('file:///local/index.html');
    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  test('should return false for a protected Chrome Web Store URL', async () => {
    const result = await isScannable('https://chrome.google.com/webstore/detail/some-extension');
    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });
});

describe('isScanningGloballyEnabled', () => {
  beforeEach(async () => {
    chrome.storage.sync.get.mockClear();
    document.body.innerHTML = `
      <label class="switch">
        <input type="checkbox" id="scan-toggle">
        <span class="slider round"></span>
      </label>
      <button id="scan-button"></button>
      <button id="rescan-passive-btn"></button>
      <button id="settings-btn"></button>
      <main id="main-content"></main>
      <div id="disabled-content"></div>
      <div id="findings-list"></div>
      <span id="findings-count"></span>
      <span id="version-display"></span>
    `;
  });

  test('should return true when the setting in storage is explicitly true', async () => {
    chrome.storage.sync.get.mockResolvedValue({ isScanningEnabled: true });

    const result = await isScanningGloballyEnabled();

    expect(result).toBe(true);
    expect(chrome.storage.sync.get).toHaveBeenCalledWith({ isScanningEnabled: true });
  });

  test('should return false when the setting in storage is explicitly false', async () => {
    chrome.storage.sync.get.mockResolvedValue({ isScanningEnabled: false });

    const result = await isScanningGloballyEnabled();

    expect(result).toBe(false);
    expect(chrome.storage.sync.get).toHaveBeenCalledWith({ isScanningEnabled: true });
  });

  test('should return true when the setting is not present in storage (default case)', async () => {
    chrome.storage.sync.get.mockImplementation(defaults => Promise.resolve(defaults));

    const result = await isScanningGloballyEnabled();

    expect(result).toBe(true);
    expect(chrome.storage.sync.get).toHaveBeenCalledWith({ isScanningEnabled: true });
  });

  test('should handle storage API errors gracefully', async () => {
    const mockError = new Error('Storage API is unavailable');
    chrome.storage.sync.get.mockRejectedValue(mockError);

    await expect(isScanningGloballyEnabled()).rejects.toThrow('Storage API is unavailable');
  });
});

describe('isPassiveScanningEnabled', () => {
  beforeEach(() => {
    chrome.storage.sync.get.mockClear();
  });

  test('should return true when the setting in storage is explicitly true', async () => {
    chrome.storage.sync.get.mockResolvedValue({ isPassiveScanningEnabled: true });

    const result = await isPassiveScanningEnabled();

    expect(result).toBe(true);
    expect(chrome.storage.sync.get).toHaveBeenCalledWith({ isPassiveScanningEnabled: true });
  });

  test('should return false when the setting in storage is explicitly false', async () => {
    chrome.storage.sync.get.mockResolvedValue({ isPassiveScanningEnabled: false });

    const result = await isPassiveScanningEnabled();

    expect(result).toBe(false);
    expect(chrome.storage.sync.get).toHaveBeenCalledWith({ isPassiveScanningEnabled: true });
  });

  test('should return true when the setting is not present in storage (default case)', async () => {
    chrome.storage.sync.get.mockImplementation(defaults => Promise.resolve(defaults));

    const result = await isPassiveScanningEnabled();

    expect(result).toBe(true);
    expect(chrome.storage.sync.get).toHaveBeenCalledWith({ isPassiveScanningEnabled: true });
  });

  test('should handle storage API errors gracefully', async () => {
    const mockError = new Error('Storage API is unavailable');
    chrome.storage.sync.get.mockRejectedValue(mockError);

    await expect(isPassiveScanningEnabled()).rejects.toThrow('Storage API is unavailable');
  });
});

describe('escapeHTML', () => {
  test('should escape all special HTML characters', () => {
    const input = `<script>alert("It's a test & PoC code")</script>`;
    const expected = '&lt;script&gt;alert(&quot;It&#039;s a test &amp; PoC code&quot;)&lt;/script&gt;';
    expect(escapeHTML(input)).toBe(expected);
  });

  test('should return an empty string if the input is empty', () => {
    expect(escapeHTML('')).toBe('');
  });

  test('should not change a string with no special characters', () => {
    const input = 'This is a perfectly safe string.';
    expect(escapeHTML(input)).toBe(input);
  });

  test('should handle null or undefined input by returning an empty string', () => {
    const safeEscapeHTML = (str) => {
      if (!str) return '';
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };
    expect(safeEscapeHTML(null)).toBe('');
    expect(safeEscapeHTML(undefined)).toBe('');
  });
});

describe('createLRUCache', () => {
  test('should set and get items correctly', () => {
    const cache = createLRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
  });

  test('should return undefined for non-existent keys', () => {
    const cache = createLRUCache(3);
    cache.set('a', 1);
    expect(cache.get('b')).toBeUndefined();
  });

  test('should update the value of an existing key', () => {
    const cache = createLRUCache(3);
    cache.set('a', 1);
    cache.set('a', 100);
    expect(cache.get('a')).toBe(100);
  });

  test('should correctly report presence of keys with has()', () => {
    const cache = createLRUCache(3);
    cache.set('a', 1);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  test('should evict the least recently used item when capacity is exceeded', () => {
    const cache = createLRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4);
    expect(cache.has('a')).toBe(false);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  test('should make an item the most recently used on get()', () => {
    const cache = createLRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.get('a');
    cache.set('d', 4);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
  });

  test('should make an item the most recently used on set() for an existing key', () => {
    const cache = createLRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('a', 100);
    cache.set('d', 4);
    expect(cache.has('b')).toBe(false);
    expect(cache.get('a')).toBe(100);
  });

  test('should delete items correctly', () => {
    const cache = createLRUCache(3);
    cache.set('a', 1);
    expect(cache.has('a')).toBe(true);
    cache.delete('a');
    expect(cache.has('a')).toBe(false);
  });

  test('should be iterable and yield [key, value] pairs in insertion order', () => {
    const cache = createLRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    const entries = [...cache];
    expect(entries).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  test('keys() should return an iterator of keys in insertion order', () => {
    const cache = createLRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    const keys = [...cache.keys()];
    expect(keys).toEqual(['a', 'b', 'c']);
  });

  test('should handle a maxSize of 1', () => {
    const cache = createLRUCache(1);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.has('a')).toBe(false);
    expect(cache.get('b')).toBe(2);
  });

  test('should handle a maxSize of 0', () => {
    const cache = createLRUCache(0);
    cache.set('a', 1);
    expect(cache.has('a')).toBe(false);
  });

  test('should handle various key and value types', () => {
    const cache = createLRUCache(5);
    const objKey = { id: 1 };
    cache.set(123, 'number key');
    cache.set('a', null);
    cache.set(objKey, { data: 'object key' });
    expect(cache.get(123)).toBe('number key');
    expect(cache.get('a')).toBeNull();
    expect(cache.get(objKey)).toEqual({ data: 'object key' });
  });
});
