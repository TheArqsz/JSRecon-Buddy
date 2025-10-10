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

  test('should display content, highlight the secret, and scroll it into view', async () => {
    const storageKey = 'test-key-success';
    const secret = 'API_KEY_12345';
    const content = `const key = "${secret}"; // This is the secret`;
    window.location.hash = `#${storageKey}`;
    chrome.storage.local.get.mockResolvedValue({
      [storageKey]: { content, secret, source: 'config.js' }
    });

    const scrollIntoViewMock = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

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

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'center',
      inline: 'center'
    });
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

  test('should display a generic error if an unexpected error occurs during initialization', async () => {
    const storageKey = 'test-key-failure';
    window.location.hash = `#${storageKey}`;
    const mockError = new Error('Simulated storage failure');

    chrome.storage.local.get.mockRejectedValue(mockError);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

    await initializeViewer();

    const codeEl = document.getElementById('content-container');

    expect(codeEl.textContent).toBe("[JS Recon Buddy] Error: Failed to parse content from URL.");

    expect(consoleErrorSpy).toHaveBeenCalledWith("[JS Recon Buddy] Source viewer error:", mockError);

    consoleErrorSpy.mockRestore();
  });

  test('should display content without highlighting when no secret is provided', async () => {
    const storageKey = 'test-key-no-secret';
    const content = `const key = "SOME_VALUE"; // No secret here`;
    window.location.hash = `#${storageKey}`;
    chrome.storage.local.get.mockResolvedValue({
      [storageKey]: { content, source: 'config.js' }
    });

    await initializeViewer();
    await new Promise(resolve => setTimeout(resolve, 20));

    const codeEl = document.getElementById('content-container');
    expect(codeEl.textContent).toBe(content);
    expect(Prism.highlightElement).toHaveBeenCalled();

    const highlightEl = codeEl.querySelector('.highlight');
    expect(highlightEl).toBeNull();
  });

  test('should display content without highlighting if secret is not found in the content', async () => {
    const storageKey = 'test-key-secret-not-found';
    const secret = 'THIS_SECRET_IS_NOT_IN_THE_CODE';
    const content = `const key = "SOME_OTHER_VALUE";`;
    window.location.hash = `#${storageKey}`;
    chrome.storage.local.get.mockResolvedValue({
      [storageKey]: { content, secret, source: 'config.js' }
    });

    await initializeViewer();
    await new Promise(resolve => setTimeout(resolve, 20));

    const codeEl = document.getElementById('content-container');
    expect(codeEl.textContent).toBe(content);
    expect(Prism.highlightElement).toHaveBeenCalled();

    const highlightEl = codeEl.querySelector('.highlight');
    expect(highlightEl).toBeNull();
  });

  test('should handle the edge case where XPath finds a node but indexOf does not', async () => {
    const storageKey = 'test-key-xpath-mismatch';
    const secret = 'API_KEY_12345';
    const content = `const key = "${secret}";`;
    window.location.hash = `#${storageKey}`;
    chrome.storage.local.get.mockResolvedValue({
      [storageKey]: { content, secret, source: 'config.js' }
    });

    const evaluateSpy = jest.spyOn(document, 'evaluate');
    evaluateSpy.mockImplementation((xpath, contextNode, resolver, type, result) => {
      return {
        iterateNext: () => {
          return document.createTextNode('some other unrelated text');
        },
        snapshotLength: 1,
        snapshotItem: (i) => document.createTextNode('some other unrelated text'),
        invalidIteratorState: false,
      };
    });

    await initializeViewer();
    await new Promise(resolve => setTimeout(resolve, 20));

    const codeEl = document.getElementById('content-container');
    const highlightEl = codeEl.querySelector('.highlight');

    expect(highlightEl).toBeNull();

    evaluateSpy.mockRestore();
  });

  test('should not throw an error if scrollIntoView is not available on the highlight element', async () => {
    const storageKey = 'test-key-no-scroll';
    const secret = 'API_KEY_12345';
    const content = `const key = "${secret}";`;
    window.location.hash = `#${storageKey}`;
    chrome.storage.local.get.mockResolvedValue({
      [storageKey]: { content, secret, source: 'config.js' }
    });

    const createElementSpy = jest.spyOn(document, 'createElement');
    createElementSpy.mockImplementation((tagName) => {
      const element = document.createElementNS('http://www.w3.org/1999/xhtml', tagName);

      if (tagName.toLowerCase() === 'span') {
        element.scrollIntoView = undefined;
      }
      return element;
    });

    await initializeViewer();
    await new Promise(resolve => setTimeout(resolve, 20));

    const codeEl = document.getElementById('content-container');
    const highlightEl = codeEl.querySelector('.highlight');

    expect(highlightEl).not.toBeNull();
    expect(highlightEl.textContent).toBe(secret);

    expect(createElementSpy).toHaveBeenCalledWith('span');

    createElementSpy.mockRestore();
  });
});
