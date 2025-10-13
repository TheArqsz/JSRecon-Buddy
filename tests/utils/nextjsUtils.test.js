import { jest, describe, beforeEach, test, expect } from '@jest/globals';
import { extractNextJsData, parseManifestWithString } from '../../src/utils/nextjsUtils.js';

global.console = {
  ...console,
  warn: jest.fn(),
};

describe('nextjsUtils.js', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractNextJsData', () => {
    const pageUrl = 'https://example.com/path/page';

    test('should extract buildId and construct manifest URL correctly', () => {
      const htmlContent = `
        <html>
          <head></head>
          <body>
            <script id="__NEXT_DATA__" type="application/json">
              { "buildId": "test-build-id-123" }
            </script>
          </body>
        </html>
      `;
      const result = extractNextJsData(htmlContent, pageUrl);
      expect(result).toEqual({
        buildId: 'test-build-id-123',
        manifestUrl: 'https://example.com/_next/static/test-build-id-123/_buildManifest.js',
      });
    });

    test('should prioritize assetPrefix for the manifest URL', () => {
      const htmlContent = `
        <script id="__NEXT_DATA__" type="application/json">
          { "buildId": "test-build-id-456", "assetPrefix": "https://cdn.example.com" }
        </script>
      `;
      const result = extractNextJsData(htmlContent, pageUrl);
      expect(result).toEqual({
        buildId: 'test-build-id-456',
        manifestUrl: 'https://cdn.example.com/_next/static/test-build-id-456/_buildManifest.js',
      });
    });

    test('should handle assetPrefix with a trailing slash', () => {
      const htmlContent = `
          <script id="__NEXT_DATA__" type="application/json">
            { "buildId": "test-build-id-789", "assetPrefix": "https://cdn.example.com/" }
          </script>
        `;
      const result = extractNextJsData(htmlContent, pageUrl);
      expect(result).toEqual({
        buildId: 'test-build-id-789',
        manifestUrl: 'https://cdn.example.com/_next/static/test-build-id-789/_buildManifest.js',
      });
    });

    test('should return null if __NEXT_DATA__ script is not found', () => {
      const htmlContent = '<html><body><p>No data</p></body></html>';
      const result = extractNextJsData(htmlContent, pageUrl);
      expect(result).toEqual({ manifestUrl: null, buildId: null });
    });

    test('should return null and warn if JSON is invalid', () => {
      const htmlContent = '<script id="__NEXT_DATA__" type="application/json">{ "buildId": "invalid-json", }</script>';
      const result = extractNextJsData(htmlContent, pageUrl);
      expect(result).toEqual({ manifestUrl: null, buildId: null });
      expect(console.warn).toHaveBeenCalledWith('[JS Recon Buddy] Could not parse __NEXT_DATA__ JSON:', expect.any(Error));
    });

    test('should return null and warn if buildId is missing', () => {
      const htmlContent = '<script id="__NEXT_DATA__" type="application/json">{ "props": {} }</script>';
      const result = extractNextJsData(htmlContent, pageUrl);
      expect(result).toEqual({ manifestUrl: null, buildId: null });
      expect(console.warn).toHaveBeenCalledWith('[JS Recon Buddy] Found __NEXT_DATA__ but it is missing a valid buildId.');
    });

    test('should return null and warn if buildId is not a string', () => {
      const htmlContent = '<script id="__NEXT_DATA__" type="application/json">{ "buildId": 12345 }</script>';
      const result = extractNextJsData(htmlContent, pageUrl);
      expect(result).toEqual({ manifestUrl: null, buildId: null });
      expect(console.warn).toHaveBeenCalledWith('[JS Recon Buddy] Found __NEXT_DATA__ but it is missing a valid buildId.');
    });
  });

  describe('parseManifestWithString', () => {
    test('should extract and filter routes from a valid manifest string', () => {
      const manifestCode = `
        self.__BUILD_MANIFEST = {
          "/": ["static/chunks/pages/index.js"],
          "/404": ["static/chunks/pages/404.js"],
          "/about": ["static/chunks/pages/about.js"],
          "/products/[...slug]": ["static/chunks/pages/products/[...slug].js"],
          "/_app": ["static/chunks/pages/_app.js"],
          "/api/hello": ["static/chunks/pages/api/hello.js"],
          "sortedPages": ["/","/about","/api/hello"]
        };
      `;
      const result = parseManifestWithString(manifestCode);
      expect(result).toEqual(['/', '/404', '/about', '/api/hello']);
    });

    test('should return an empty array if no routes are found', () => {
      const manifestCode = 'self.__BUILD_MANIFEST = { "sortedPages": [] };';
      const result = parseManifestWithString(manifestCode);
      expect(result).toEqual([]);
    });

    test('should return an empty array for an empty input string', () => {
      const result = parseManifestWithString('');
      expect(result).toEqual([]);
    });

    test('should return an empty array and warn on regex error', () => {
      const originalMatchAll = String.prototype.matchAll;
      String.prototype.matchAll = jest.fn().mockImplementation(() => {
        throw new Error('Regex engine failed');
      });

      const result = parseManifestWithString('"key": "value"');

      expect(result).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith('[JS Recon Buddy] Could not parse manifest with regex:', expect.any(Error));

      String.prototype.matchAll = originalMatchAll;
    });
  });
});
