import { describe, test, expect, beforeEach, jest } from '@jest/globals';

global.fetch = jest.fn();

import {
  checkVersion,
  updateUI,
  compareVersions
} from '../../src/popup/version.js';

describe('version.js', () => {

  beforeEach(() => {
    document.body.innerHTML = `
            <a class="github-link">
                <span class="tooltip"></span>
            </a>
        `;
    jest.clearAllMocks();
    chrome.runtime.getManifest.mockReturnValue({ version: '1.0.0' });
  });

  describe('compareVersions', () => {
    test('should correctly identify a greater version', () => {
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
      expect(compareVersions('1.1.0', '1.0.9')).toBe(1);
      expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    });

    test('should correctly identify a lesser version', () => {
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    });

    test('should correctly identify an equal version', () => {
      expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    });
  });

  describe('updateUI', () => {
    test('should add "update-available" class when latestVersion is newer', () => {
      updateUI('1.0.1');
      const link = document.querySelector('.github-link');
      expect(link.classList.contains('update-available')).toBe(true);
      expect(link.getAttribute('title')).toContain('1.0.1');
      expect(document.querySelector('.tooltip').textContent).toContain('New version available!');
    });

    test('should not add "update-available" class when version is the same or older', () => {
      updateUI('1.0.0');
      const link = document.querySelector('.github-link');
      expect(link.classList.contains('update-available')).toBe(false);
    });
  });

  describe('checkVersion', () => {
    test('should use cached data if it is recent and valid', async () => {
      chrome.storage.local.get.mockResolvedValue({
        versionCache: {
          latestVersion: '1.0.1',
          timestamp: Date.now() - 1000
        }
      });

      await checkVersion();

      expect(fetch).not.toHaveBeenCalled();
      const link = document.querySelector('.github-link');
      expect(link.classList.contains('update-available')).toBe(true);
    });

    test('should fetch from the network if the cache is expired', async () => {
      chrome.storage.local.get.mockResolvedValue({
        versionCache: {
          latestVersion: '1.0.1',
          timestamp: Date.now() - (10 * 60 * 60 * 1000)
        }
      });
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '1.1.0' })
      });

      await checkVersion();

      expect(fetch).toHaveBeenCalledTimes(1);
      const link = document.querySelector('.github-link');
      expect(link.classList.contains('update-available')).toBe(true);
      expect(link.getAttribute('title')).toContain('1.1.0');
    });

    test('should cache the new version if it is not an update', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '1.0.0' })
      });

      await checkVersion();

      expect(chrome.storage.local.set).toHaveBeenCalled();
      const link = document.querySelector('.github-link');
      expect(link.classList.contains('update-available')).toBe(false);
    });

    test('should not cache the new version if it is an update', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '1.1.0' })
      });

      await checkVersion();

      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      const link = document.querySelector('.github-link');
      expect(link.classList.contains('update-available')).toBe(true);
    });
  });
});
