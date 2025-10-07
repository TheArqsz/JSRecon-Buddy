import { jest } from '@jest/globals';

import {
  shannonEntropy,
  getLineAndColumn,
  getDOMAsText,
  isScannable,
  isUrlExcluded,
  isScanningGloballyEnabled,
  isPassiveScanningEnabled
} from '../../src/utils/coreUtils.js';

import { initializePopup } from '../../src/popup/popup.js';

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
    document.documentElement.innerHTML = '<head><title>Test</title></head><body><p>Hello</p></body>';

    const htmlString = getDOMAsText();

    expect(htmlString).toContain('<!DOCTYPE html>');
    expect(htmlString).toContain('<html><head><title>Test</title></head><body><p>Hello</p></body></html>');
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
