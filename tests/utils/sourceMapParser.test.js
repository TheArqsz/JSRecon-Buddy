import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import fc from 'fast-check';

global.fetch = jest.fn();

import { reconstructSource } from '../../src/utils/sourceMapParser.js';

describe('reconstructSource', () => {
  beforeEach(() => {
    browser.runtime.sendMessage.mockReset();
    global.fetch.mockReset();
  });

  test('should correctly reconstruct sources from embedded content', async () => {
    const mockSourceMap = {
      version: 3,
      sources: ['webpack:///src/index.js', 'webpack:///src/utils.js'],
      sourcesContent: ['console.log("hello");', 'export const util = () => {};']
    };
    browser.runtime.sendMessage.mockResolvedValue(mockSourceMap);

    const result = await reconstructSource('https://localhost/bundle.js.map');

    expect(result['webpack:///src/index.js']).toBe('console.log("hello");');
    expect(result['webpack:///src/utils.js']).toBe('export const util = () => {};');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('should preserve empty embedded content without fetching the source', async () => {
    browser.runtime.sendMessage.mockResolvedValue({
      sources: ['webpack:///src/empty.js'],
      sourcesContent: ['']
    });

    const result = await reconstructSource('https://localhost/bundle.js.map');

    expect(result['webpack:///src/empty.js']).toBe('');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('should preserve unusual filenames as own properties', async () => {
    browser.runtime.sendMessage.mockResolvedValue({
      sources: ['__proto__'],
      sourcesContent: ['embedded content']
    });

    const result = await reconstructSource('https://localhost/bundle.js.map');

    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(result['__proto__']).toBe('embedded content');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('should keep the last embedded content for duplicate filenames', async () => {
    // Source entries are processed in order, so later entries overwrite earlier ones.
    browser.runtime.sendMessage.mockResolvedValue({
      sources: ['src/shared.js', 'src/shared.js'],
      sourcesContent: ['first content', 'last content']
    });

    const result = await reconstructSource('https://localhost/bundle.js.map');

    expect(result['src/shared.js']).toBe('last content');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('should preserve generated embedded filenames and content exactly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(fc.string({ maxLength: 40 }), fc.string({ maxLength: 80 })),
          { minLength: 1, maxLength: 12 }
        ),
        async entries => {
          browser.runtime.sendMessage.mockResolvedValue({
            sources: entries.map(([source]) => source),
            sourcesContent: entries.map(([, content]) => content)
          });

          const result = await reconstructSource('https://localhost/bundle.js.map');
          const expected = Object.fromEntries(entries);

          expect(result).toStrictEqual(expected);
          expect(global.fetch).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('should preserve generated unusual filename keys', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('__proto__', 'constructor', 'toString', 'hasOwnProperty'),
        fc.string({ maxLength: 80 }),
        async (sourceFile, content) => {
          browser.runtime.sendMessage.mockResolvedValue({
            sources: [sourceFile],
            sourcesContent: [content]
          });

          const result = await reconstructSource('https://localhost/bundle.js.map');

          expect(Object.hasOwn(result, sourceFile)).toBe(true);
          expect(result[sourceFile]).toBe(content);
          expect(global.fetch).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('should fetch source files when sourcesContent is not available', async () => {
    const mockSourceMap = {
      version: 3,
      sources: ['/src/app.js']
    };
    browser.runtime.sendMessage.mockResolvedValue(mockSourceMap);

    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('const app = "works";')
    });

    const result = await reconstructSource('https://localhost/maps/bundle.js.map');

    expect(result['/src/app.js']).toBe('const app = "works";');
    expect(global.fetch).toHaveBeenCalledWith('https://localhost/src/app.js');
  });

  test('should return an error object if the source map is not found (404)', async () => {
    browser.runtime.sendMessage.mockResolvedValue({ status: 'not_found' });

    const result = await reconstructSource('https://localhost/nonexistent.js.map');

    expect(result['jsrecon.buddy.error.log']).toBeDefined();
    expect(result['jsrecon.buddy.error.log']).toContain('Source map not found');
  });

  test('should return an error object if there was a network error', async () => {
    browser.runtime.sendMessage.mockResolvedValue({ status: 'error' });

    const result = await reconstructSource('https://localhost/nonexistent.js.map');

    expect(result['jsrecon.buddy.error.log']).toBeDefined();
    expect(result['jsrecon.buddy.error.log']).toContain('Failed to fetch source map due to a network or CORS error');
  });

  test('should return an error object for an invalid source map structure', async () => {
    browser.runtime.sendMessage.mockResolvedValue({ version: 3, mappings: '...' });

    const result = await reconstructSource('https://localhost/invalid.js.map');

    expect(result['jsrecon.buddy.error.log']).toBeDefined();
    expect(result['jsrecon.buddy.error.log']).toContain("does not contain a 'sources' array");
  });

  test('should handle individual failed source file fetches gracefully', async () => {
    const mockSourceMap = {
      version: 3,
      sources: ['/src/good.js', '/src/bad.js', '/src/error.js']
    };
    browser.runtime.sendMessage.mockResolvedValue(mockSourceMap);

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('// Good file')
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404
      })
      .mockRejectedValueOnce(new Error('Network connection failed'));

    const result = await reconstructSource('https://localhost/maps/bundle.js.map');

    expect(result['/src/good.js']).toBe('// Good file');
    expect(result['/src/bad.js']).toContain('Skipping missing source file');
    expect(result['/src/bad.js']).toContain('Status: 404');
    expect(result).not.toHaveProperty('/src/error.js');
  });
});
