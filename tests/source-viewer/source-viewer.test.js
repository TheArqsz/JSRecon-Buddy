import { describe, test, expect, beforeEach, jest } from '@jest/globals';

import {
  escapeHTML,
  getLanguageFromSource,
  initializeViewer
} from '../../src/source-viewer/source-viewer.js';

global.Prism = {
  highlightElement: jest.fn((el, async, callback) => {
    if (callback) {
      callback();
    }
  }),
};

describe('Source Viewer Utilities', () => {
  describe('escapeHTML', () => {
    test('should escape all special HTML characters', () => {
      const input = `<script>&'"</script>`;
      const expected = '&lt;script&gt;&amp;&#039;&quot;&lt;/script&gt;';
      expect(escapeHTML(input)).toBe(expected);
    });

    test('should return an empty string for null or undefined input', () => {
      expect(escapeHTML(null)).toBe('');
      expect(escapeHTML(undefined)).toBe('');
    });
  });

  describe('getLanguageFromSource', () => {
    test('should identify javascript files', () => {
      expect(getLanguageFromSource('test.js')).toBe('javascript');
    });
    test('should identify css files', () => {
      expect(getLanguageFromSource('styles.css')).toBe('css');
    });
    test('should identify json files', () => {
      expect(getLanguageFromSource('data.json')).toBe('json');
    });
    test('should identify markup for html files and descriptors', () => {
      expect(getLanguageFromSource('index.html')).toBe('markup');
      expect(getLanguageFromSource('HTML Document')).toBe('markup');
    });
    test('should default to javascript for unknown types', () => {
      expect(getLanguageFromSource('file.txt')).toBe('javascript');
    });
  });
});

describe('initializeViewer', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="content-container"></div>';
    window.location.hash = '';
    chrome.storage.local.get.mockClear();
    chrome.storage.local.remove.mockClear();
    Prism.highlightElement.mockClear();
  });

  test('should display content and highlight the secret on success', async () => {
    const storageKey = 'test-key-success';
    const secret = 'API_KEY_12345';
    const content = `const key = "${secret}"; // This is the secret`;
    window.location.hash = `#${storageKey}`;
    chrome.storage.local.get.mockResolvedValue({
      [storageKey]: { content, secret, source: 'config.js' }
    });

    await initializeViewer();

    const codeEl = document.getElementById('content-container');
    expect(codeEl.textContent).toBe(content);
    expect(codeEl.className).toBe('language-javascript');
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(storageKey);

    await new Promise(resolve => setTimeout(resolve, 20));

    const highlightEl = codeEl.querySelector('.highlight');
    expect(highlightEl).not.toBeNull();
    expect(highlightEl.textContent).toBe(secret);
    expect(Prism.highlightElement).toHaveBeenCalled();
  });

  test('should display an error if no storage key is in the URL hash', async () => {
    await initializeViewer();
    const codeEl = document.getElementById('content-container');
    expect(codeEl.textContent).toContain('storage key not found');
  });

  test('should display an error if content is not found in local storage', async () => {
    window.location.hash = '#not-found-key';
    chrome.storage.local.get.mockResolvedValue({});

    await initializeViewer();

    const codeEl = document.getElementById('content-container');
    expect(codeEl.textContent).toContain('content not found in local storage');
  });

  test('should display an error if stored data is missing content or secret', async () => {
    const storageKey = 'test-key-missing-data';
    window.location.hash = `#${storageKey}`;
    chrome.storage.local.get.mockResolvedValue({
      [storageKey]: { source: 'config.js' }
    });

    await initializeViewer();

    const codeEl = document.getElementById('content-container');
    expect(codeEl.textContent).toContain('Error: Could not display content');
  });
});
