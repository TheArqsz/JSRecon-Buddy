import { describe, test, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../../src/utils/coreUtils.js', () => ({
  shannonEntropy: jest.fn(str => str.length > 5 ? 5 : 3),
  getLineAndColumn: jest.fn(() => ({ line: 1, column: 1 })),
  matchAllWithTimeout: jest.fn((regex, content) => [...content.matchAll(regex)]),
}));

const { performScan } = await import('../../src/offscreen/offscreen.js');

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

  describe('Offscreen Message Listener', () => {
    let capturedListener;
    let getLineAndColumnSpy;

    beforeEach(async () => {
      jest.resetModules();

      global.chrome = {
        runtime: {
          onMessage: {
            addListener: jest.fn(listener => {
              capturedListener = listener;
            })
          }
        }
      };

      const coreUtils = await import('../../src/utils/coreUtils.js');
      getLineAndColumnSpy = jest.spyOn(coreUtils, 'getLineAndColumn').mockReturnValue({ line: 1, column: 1 });

      await import('../../src/offscreen/offscreen.js');
    });

    test('should respond to "ping" without triggering a scan', async () => {
      const sendResponse = jest.fn();
      capturedListener({ type: 'ping' }, {}, sendResponse);
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(sendResponse).toHaveBeenCalledWith({ status: 'ready' });
      expect(getLineAndColumnSpy).not.toHaveBeenCalled();
    });

    test('should route "scanContent" messages to the handler and return findings', async () => {
      const sendResponse = jest.fn();
      const request = {
        type: 'scanContent',
        allContentSources: [{ source: 'test.js', content: 'SECRET_KEY_123' }],
        serializableRules: [{ regex: { source: 'SECRET_KEY_\\d+', flags: 'g' } }]
      };
      capturedListener(request, {}, sendResponse);
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(getLineAndColumnSpy).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
      const response = sendResponse.mock.calls[0][0];
      expect(response.data[0].secret).toBe('SECRET_KEY_123');
    });

    test('should respond with an error if scanning fails', async () => {
      const sendResponse = jest.fn();
      const request = { type: 'scanContent', serializableRules: 'not-an-array' };
      capturedListener(request, {}, sendResponse);
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
    });

    test('should attach a listener that does NOT call scan logic for a "ping" message', async () => {
      const request = { type: 'ping' };

      capturedListener(request, {}, jest.fn());
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(getLineAndColumnSpy).not.toHaveBeenCalled();
    });

    test('should correctly route a "scanContent" message to the handler', async () => {
      const sendResponse = jest.fn();
      const request = {
        type: 'scanContent',
        allContentSources: [{ source: 'test.js', content: 'SECRET_KEY_123' }],
        serializableRules: [{
          id: 'test-rule',
          regex: { source: 'SECRET_KEY_\\d+', flags: 'g' },
        }]
      };

      capturedListener(request, {}, sendResponse);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(sendResponse).toHaveBeenCalledTimes(1);
      expect(getLineAndColumnSpy).toHaveBeenCalled();

      const response = sendResponse.mock.calls[0][0];

      expect(response.status).toBe('success');
      expect(response.data.length).toBe(1);
      expect(response.data[0].secret).toBe('SECRET_KEY_123');
    });

    test('should do nothing for an unknown message type', async () => {
      const sendResponse = jest.fn();
      const request = { type: 'SOME_OTHER_TYPE' };

      capturedListener(request, {}, sendResponse);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(sendResponse).not.toHaveBeenCalled();

      expect(getLineAndColumnSpy).not.toHaveBeenCalled();
    });
  });
});
