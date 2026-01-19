import { describe, test, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../../src/utils/coreUtils.js', () => ({
  shannonEntropy: jest.fn(str => (str.length > 5 ? 5 : 3)),
  getLineAndColumn: jest.fn(() => ({ line: 1, column: 1 })),
  matchAllWithTimeout: jest.fn((regex, content) => [...content.matchAll(regex)]),
}));

const self = {
  postMessage: jest.fn(),
  onmessage: null,
};
global.self = self;

await import('../../src/offscreen/firefox-scan-worker.js');

describe('Firefox Scan Worker', () => {

  beforeEach(() => {
    self.postMessage.mockClear();
  });

  test('should process a scan request and post a success message with findings', () => {
    const event = {
      data: {
        allContentSources: [{
          source: 'app.js',
          content: 'const secret = "API_KEY_12345";',
          isTooLarge: false,
        }],
        serializableRules: [{
          id: 'api-key-rule',
          description: 'Finds API keys',
          regex: { source: 'API_KEY_\\d+', flags: 'g' },
          group: 0,
        }],
      },
    };

    self.onmessage(event);

    expect(self.postMessage).toHaveBeenCalledTimes(1);
    const response = self.postMessage.mock.calls[0][0];
    expect(response.status).toBe('success');
    expect(response.data.length).toBe(1);
    expect(response.data[0].id).toBe('api-key-rule');
    expect(response.data[0].secret).toBe('API_KEY_12345');
  });

  test('should post an error message if an exception occurs during scanning', () => {
    const event = {
      data: {
        allContentSources: [],
        serializableRules: 'this is not an array',
      },
    };

    self.onmessage(event);

    expect(self.postMessage).toHaveBeenCalledTimes(1);
    const response = self.postMessage.mock.calls[0][0];
    expect(response.status).toBe('error');
    expect(response.message).toContain('is not a function');
  });

  test('should correctly handle requests with no findings', () => {
    const event = {
      data: {
        allContentSources: [{
          source: 'app.js',
          content: 'no secrets here',
          isTooLarge: false,
        }],
        serializableRules: [{
          id: 'api-key-rule',
          regex: { source: 'API_KEY_\\d+', flags: 'g' },
        }],
      },
    };

    self.onmessage(event);

    const response = self.postMessage.mock.calls[0][0];
    expect(response.status).toBe('success');
    expect(response.data.length).toBe(0);
  });

  test('should skip a finding if its entropy is below the rule threshold', () => {
    const event = {
      data: {
        allContentSources: [{
          source: 'config.js',
          content: 'const key = "abc";',
          isTooLarge: false,
        }],
        serializableRules: [{
          id: 'low-entropy-rule',
          description: 'A rule that requires high entropy',
          regex: { source: '"(abc)"', flags: 'g' },
          group: 1,
          entropy: 4,
        }],
      },
    };

    self.onmessage(event);

    expect(self.postMessage).toHaveBeenCalledTimes(1);
    const response = self.postMessage.mock.calls[0][0];

    expect(response.status).toBe('success');
    expect(response.data.length).toBe(0);
  });

  test('should skip content sources that are empty or marked as too large', () => {
    const event = {
      data: {
        allContentSources: [
          {
            source: 'empty.js',
            content: null,
            isTooLarge: false,
          },
          {
            source: 'large-file.js',
            content: 'some content',
            isTooLarge: true,
          },
          {
            source: 'good-file.js',
            content: 'const key = "API_KEY_98765";',
            isTooLarge: false,
          }
        ],
        serializableRules: [{
          id: 'api-key-rule',
          regex: { source: 'API_KEY_\\d+', flags: 'g' },
          group: 0,
        }],
      },
    };

    self.onmessage(event);

    expect(self.postMessage).toHaveBeenCalledTimes(1);
    const response = self.postMessage.mock.calls[0][0];

    expect(response.status).toBe('success');
    expect(response.data.length).toBe(1);
    expect(response.data[0].secret).toBe('API_KEY_98765');
  });
});
