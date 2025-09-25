import { describe, test, expect, beforeEach, jest } from '@jest/globals';

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

  test('should return an error object for an invalid source map structure', async () => {
    browser.runtime.sendMessage.mockResolvedValue({ version: 3, mappings: '...' });

    const result = await reconstructSource('https://localhost/invalid.js.map');

    expect(result['jsrecon.buddy.error.log']).toBeDefined();
    expect(result['jsrecon.buddy.error.log']).toContain("does not contain a 'sources' array");
  });

  test('should handle individual failed source file fetches gracefully', async () => {
    const mockSourceMap = {
      version: 3,
      sources: ['/src/good.js', '/src/bad.js']
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
      });

    const result = await reconstructSource('https://localhost/maps/bundle.js.map');

    expect(result['/src/good.js']).toBe('// Good file');
    expect(result['/src/bad.js']).toContain('Skipping missing source file');
    expect(result['/src/bad.js']).toContain('Status: 404');
  });
});
