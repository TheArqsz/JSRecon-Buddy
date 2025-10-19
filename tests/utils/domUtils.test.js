import { describe, test, expect, jest } from '@jest/globals';
import {
  createText,
  createElement,
  sanitizeUrl,
  generateStorageKey,
  sanitizeFinding,
  createSecureLink,
  clearElement,
  createSpan,
  isValidElement
} from '../../src/utils/domUtils.js';

global.chrome = {
  tabs: {
    onActivated: {
      addListener: jest.fn(),
    },
  }
}

describe('domUtils', () => {
  describe('createText', () => {
    test('should create a text node from string', () => {
      const node = createText('Hello');
      expect(node.nodeType).toBe(Node.TEXT_NODE);
      expect(node.textContent).toBe('Hello');
    });

    test('should convert non-string values to strings', () => {
      expect(createText(123).textContent).toBe('123');
      expect(createText(null).textContent).toBe('null');
      expect(createText(undefined).textContent).toBe('undefined');
      expect(createText({ key: 'value' }).textContent).toBe('[object Object]');
    });
  });

  describe('createElement', () => {
    test('should create an element with className and textContent', () => {
      const el = createElement('div', 'test-class', 'Test Text');
      expect(el.tagName).toBe('DIV');
      expect(el.className).toBe('test-class');
      expect(el.textContent).toBe('Test Text');
    });

    test('should create an element without className or textContent', () => {
      const el = createElement('span');
      expect(el.tagName).toBe('SPAN');
      expect(el.className).toBe('');
      expect(el.textContent).toBe('');
    });

    test('should convert textContent to string', () => {
      const el = createElement('p', '', 42);
      expect(el.textContent).toBe('42');
    });
  });

  describe('sanitizeUrl', () => {
    test('should accept valid https URLs', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
      expect(sanitizeUrl('https://example.com/path')).toBe('https://example.com/path');
    });

    test('should accept valid http URLs', () => {
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com/');
    });

    test('should reject javascript: protocol', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    });

    test('should reject data: protocol', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    });

    test('should reject file: protocol', () => {
      expect(sanitizeUrl('file:///etc/passwd')).toBeNull();
    });

    test('should reject invalid URLs', () => {
      expect(sanitizeUrl('not a url')).toBeNull();
      expect(sanitizeUrl('')).toBeNull();
    });

    test('should handle URLs with special characters', () => {
      const url = 'https://example.com/path?query=value&other=123#hash';
      expect(sanitizeUrl(url)).toBe(url);
    });
  });

  describe('generateStorageKey', () => {
    let randomUUIDSpy;

    beforeEach(() => {
      if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        randomUUIDSpy = jest.spyOn(globalThis.crypto, 'randomUUID');
      } else {
        randomUUIDSpy = null;
      }
    });

    afterEach(() => {
      randomUUIDSpy?.mockRestore();
    });

    test('should generate a key with the correct prefix', () => {
      const key = generateStorageKey('test-prefix');
      expect(key).toMatch(/^test-prefix-/);
    });

    test('should generate unique keys', () => {
      randomUUIDSpy?.mockReturnValueOnce('uuid-1').mockReturnValueOnce('uuid-2');
      const key1 = generateStorageKey('test');
      const key2 = generateStorageKey('test');
      expect(key1).not.toBe(key2);
    });

    test('should use crypto.randomUUID if available', () => {
      if (!randomUUIDSpy) {
        console.warn("Skipping crypto.randomUUID test: not available in this environment.");
        return;
      }

      const mockUUID = '550e8400-e29b-41d4-a716-446655440000';
      randomUUIDSpy.mockReturnValue(mockUUID);

      const key = generateStorageKey('prefix');
      expect(key).toBe(`prefix-${mockUUID}`);
      expect(randomUUIDSpy).toHaveBeenCalledTimes(1);
    });

    test('should fallback to timestamp+random when crypto unavailable', () => {
      if (randomUUIDSpy) {
        randomUUIDSpy.mockImplementation(() => { throw new Error('Not available'); });
      } else {
        const originalCrypto = globalThis.crypto;
        globalThis.crypto = undefined;
        afterEach(() => {
          globalThis.crypto = originalCrypto;
        });
      }
      const key = generateStorageKey('prefix');
      expect(key).toMatch(/^prefix-\d+-[a-z0-9]+$/);
      if (randomUUIDSpy) {
        expect(randomUUIDSpy).toHaveBeenCalledTimes(1);
      }
    });

    test('should fallback if crypto exists but randomUUID does not', () => {
      const cryptoSpy = jest.spyOn(globalThis, 'crypto', 'get');
      cryptoSpy.mockReturnValue({});

      const key = generateStorageKey('prefix');

      expect(key).toMatch(/^prefix-\d+-[a-z0-9]+$/);

      cryptoSpy.mockRestore();
    });
  });

  describe('sanitizeFinding', () => {
    test('should sanitize a valid finding object', () => {
      const input = {
        id: 'API_KEY',
        description: 'Found an API key',
        source: 'config.js',
        secret: 'sk_test_12345',
        line: 42,
        column: 10,
        isSourceTooLarge: false
      };

      const result = sanitizeFinding(input);
      expect(result).toEqual(input);
    });

    test('should truncate long id to 200 characters', () => {
      const longId = 'x'.repeat(300);
      const result = sanitizeFinding({ id: longId });
      expect(result.id.length).toBe(200);
    });

    test('should truncate long description to 500 characters', () => {
      const longDesc = 'x'.repeat(600);
      const result = sanitizeFinding({ description: longDesc });
      expect(result.description.length).toBe(500);
    });

    test('should truncate long source to 2000 characters', () => {
      const longSource = 'x'.repeat(3000);
      const result = sanitizeFinding({ source: longSource });
      expect(result.source.length).toBe(2000);
    });

    test('should truncate long secret to 10000 characters', () => {
      const longSecret = 'x'.repeat(15000);
      const result = sanitizeFinding({ secret: longSecret });
      expect(result.secret.length).toBe(10000);
    });

    test('should set null for invalid line/column', () => {
      const result = sanitizeFinding({ line: 'invalid', column: NaN });
      expect(result.line).toBeNull();
      expect(result.column).toBeNull();
    });

    test('should handle missing fields with defaults', () => {
      const result = sanitizeFinding({});
      expect(result.id).toBe('Unknown');
      expect(result.description).toBeNull();
      expect(result.source).toBe('');
      expect(result.secret).toBe('');
      expect(result.line).toBeNull();
      expect(result.column).toBeNull();
      expect(result.isSourceTooLarge).toBe(false);
    });

    test('should handle null or undefined input', () => {
      const resultNull = sanitizeFinding(null);
      const resultUndefined = sanitizeFinding(undefined);

      expect(resultNull.id).toBe('Unknown');
      expect(resultUndefined.id).toBe('Unknown');
    });

    test('should convert non-string fields to strings', () => {
      const result = sanitizeFinding({
        id: 123,
        source: { url: 'test' },
        secret: ['array']
      });
      expect(typeof result.id).toBe('string');
      expect(typeof result.source).toBe('string');
      expect(typeof result.secret).toBe('string');
    });
  });

  describe('createSecureLink', () => {
    test('should create a link with correct attributes', () => {
      const link = createSecureLink('https://example.com', 'Example');
      expect(link.tagName).toBe('A');
      expect(link.href).toBe('https://example.com/');
      expect(link.textContent).toBe('Example');
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');
    });

    test('should use URL as display text if not provided', () => {
      const link = createSecureLink('https://example.com');
      expect(link.textContent).toBe('https://example.com');
    });

    test('should return null for invalid URLs', () => {
      expect(createSecureLink('javascript:alert(1)')).toBeNull();
      expect(createSecureLink('not a url')).toBeNull();
    });

    test('should sanitize the URL', () => {
      expect(createSecureLink('data:text/html,test')).toBeNull();
    });
  });

  describe('clearElement', () => {
    test('should remove all child nodes', () => {
      const parent = document.createElement('div');
      parent.innerHTML = '<span>child1</span><span>child2</span>';
      expect(parent.children.length).toBe(2);

      clearElement(parent);
      expect(parent.children.length).toBe(0);
      expect(parent.innerHTML).toBe('');
    });

    test('should handle empty elements', () => {
      const parent = document.createElement('div');
      expect(() => clearElement(parent)).not.toThrow();
      expect(parent.innerHTML).toBe('');
    });

    test('should handle non-HTMLElement gracefully', () => {
      expect(() => clearElement(null)).not.toThrow();
      expect(() => clearElement(undefined)).not.toThrow();
      expect(() => clearElement('string')).not.toThrow();
    });
  });

  describe('createSpan', () => {
    test('should create a span with text', () => {
      const span = createSpan('Hello');
      expect(span.tagName).toBe('SPAN');
      expect(span.textContent).toBe('Hello');
    });

    test('should create a span with className', () => {
      const span = createSpan('Text', 'my-class');
      expect(span.className).toBe('my-class');
      expect(span.textContent).toBe('Text');
    });

    test('should convert text to string', () => {
      const span = createSpan(123);
      expect(span.textContent).toBe('123');
    });
  });

  describe('isValidElement', () => {
    test('should return true for HTMLElement', () => {
      const div = document.createElement('div');
      expect(isValidElement(div)).toBe(true);
    });

    test('should return false for null', () => {
      expect(isValidElement(null)).toBe(false);
    });

    test('should return false for undefined', () => {
      expect(isValidElement(undefined)).toBe(false);
    });

    test('should return false for non-elements', () => {
      expect(isValidElement('string')).toBe(false);
      expect(isValidElement(123)).toBe(false);
      expect(isValidElement({})).toBe(false);
    });

    test('should return false for text nodes', () => {
      const textNode = document.createTextNode('text');
      expect(isValidElement(textNode)).toBe(false);
    });
  });
});
