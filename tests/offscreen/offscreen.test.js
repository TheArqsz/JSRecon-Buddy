import { describe, test, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../../src/utils/findingUtils.js', () => ({
  shannonEntropy: jest.fn(str => str.length > 5 ? 5 : 3),
  getLineAndColumn: jest.fn(() => ({ line: 1, column: 1 })),
}));

const { performScan, messageHandler } = await import('../../src/offscreen/offscreen.js');

describe('Offscreen Document Logic', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => { });
  });

  describe('performScan', () => {
    test('should find secrets in content and return structured finding objects', async () => {
      const contentSources = [{
        source: 'test.js',
        content: 'const key = "SECRET_KEY_123";',
        isTooLarge: false
      }];
      const secretRules = [{
        id: 'test-rule',
        description: 'A test secret',
        regex: /SECRET_KEY_\d+/g,
        group: 0,
      }];

      const findings = await performScan(contentSources, secretRules);

      expect(findings.length).toBe(1);
      expect(findings[0].id).toBe('test-rule');
      expect(findings[0].secret).toBe('SECRET_KEY_123');
      expect(findings[0].line).toBe(1);
    });

    test('should skip content that is marked as too large or is empty', async () => {
      const contentSources = [
        { source: 'large.js', content: '...', isTooLarge: true },
        { source: 'empty.js', content: '', isTooLarge: false }
      ];
      const secretRules = [{ regex: /a/g, group: 0 }];

      const findings = await performScan(contentSources, secretRules);

      expect(findings.length).toBe(0);
    });

    test('should respect the entropy check', async () => {
      const contentSources = [{ source: 'test.js', content: 'short', isTooLarge: false }];
      const secretRules = [{ regex: /short/g, group: 0, entropy: 4 }];

      const findings = await performScan(contentSources, secretRules);

      expect(findings.length).toBe(0);
    });
  });

  describe('messageHandler', () => {
    test('should handle "ping" request and respond with "ready"', async () => {
      const sendResponse = jest.fn();
      const request = { type: 'ping' };

      await messageHandler(request, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ status: 'ready' });
    });

    test('should handle "scanContent" request and respond with findings on success', async () => {
      const sendResponse = jest.fn();
      const request = {
        type: 'scanContent',
        allContentSources: [{ source: 'test.js', content: 'const key = "SECRET_KEY_123";' }],
        serializableRules: [{
          id: 'test-rule',
          regex: { source: 'SECRET_KEY_\\d+', flags: 'g' },
          group: 0
        }]
      };

      await messageHandler(request, {}, sendResponse);

      const response = sendResponse.mock.calls[0][0];
      expect(response.status).toBe('success');
      expect(response.data.length).toBe(1);
      expect(response.data[0].id).toBe('test-rule');
    });

    test('should handle "scanContent" request and respond with an error on failure', async () => {
      const sendResponse = jest.fn();
      const request = {
        type: 'scanContent',
        allContentSources: [],
        serializableRules: "not an array"
      };

      await messageHandler(request, {}, sendResponse);

      const response = sendResponse.mock.calls[0][0];
      expect(response.status).toBe('error');
      expect(response.message).toBeDefined();
    });
  });
});
