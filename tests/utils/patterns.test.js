import { jest, describe, beforeEach, test, expect } from '@jest/globals';

describe('getPatterns', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('should return all default patterns when no parameters are provided', async () => {
    jest.unstable_mockModule('../../src/utils/rules.js', () => ({
      secretRules: []
    }));

    const { getPatterns } = await import('../../src/utils/patterns.js');
    const patterns = getPatterns([]);

    expect(patterns.Subdomains).toBeDefined();
    expect(patterns.Endpoints).toBeDefined();
    expect(patterns['Source Maps']).toBeDefined();
    expect(patterns['JS Libraries']).toBeDefined();
    expect(patterns['Potential DOM XSS Sinks']).toBeDefined();
    expect(patterns.Subdomains.regex).toBeInstanceOf(RegExp);
  });

  test('should set "Interesting Parameters" regex to null when parameters array is empty', async () => {
    jest.unstable_mockModule('../../src/utils/rules.js', () => ({ secretRules: [] }));
    const { getPatterns } = await import('../../src/utils/patterns.js');

    const patterns = getPatterns([]);
    expect(patterns['Interesting Parameters'].regex).toBeNull();
  });

  test('should correctly build the regex for "Interesting Parameters" when provided', async () => {
    jest.unstable_mockModule('../../src/utils/rules.js', () => ({ secretRules: [] }));
    const { getPatterns } = await import('../../src/utils/patterns.js');

    const parameters = ['redirect_uri', 'token', 'client_id'];
    const patterns = getPatterns(parameters);

    const expectedRegexSource = '[?&"\']((redirect_uri|token|client_id))\\s*[:=]';

    expect(patterns['Interesting Parameters'].regex).toBeInstanceOf(RegExp);
    expect(patterns['Interesting Parameters'].regex.source).toBe(expectedRegexSource);
    expect(patterns['Interesting Parameters'].regex.flags).toBe('gi');
  });

  test('should correctly compile "Potential Secrets" from the imported secretRules', async () => {
    jest.unstable_mockModule('../../src/utils/rules.js', () => ({
      secretRules: [
        {
          id: 'aws-access-key',
          regex: 'AKIA[0-9A-Z]{16}',
          entropy: 3.5,
          group: 0
        },
        {
          id: 'generic-api-key',
          regex: '[aA][pP][iI]_?[kK][eE][yY]="([^"]+)"',
          group: 1
        },
        {
          id: 'slack-webhook',
          regex: 'T[a-zA-Z0-9_]{8}/B[a-zA-Z0-9_]{8}/[a-zA-Z0-9_]{24}',
          group: undefined,
        }
      ]
    }));
    const { getPatterns } = await import('../../src/utils/patterns.js');

    const patterns = getPatterns([]);
    const potentialSecrets = patterns['Potential Secrets'];

    expect(potentialSecrets).toBeDefined();
    expect(Array.isArray(potentialSecrets)).toBe(true);
    expect(potentialSecrets.length).toBe(3);

    expect(potentialSecrets[0].ruleId).toBe('aws-access-key');
    expect(potentialSecrets[0].regex).toBeInstanceOf(RegExp);
    expect(potentialSecrets[0].regex.source).toBe('AKIA[0-9A-Z]{16}');
    expect(potentialSecrets[0].ruleEntropy).toBe(3.5);

    expect(potentialSecrets[1].ruleId).toBe('generic-api-key');
    expect(potentialSecrets[1].regex.source).toBe('[aA][pP][iI]_?[kK][eE][yY]="([^"]+)"');
    expect(potentialSecrets[1].ruleEntropy).toBe(0);

    expect(potentialSecrets[2].ruleId).toBe('slack-webhook');
    expect(potentialSecrets[2].group).toBe(0);
  });

  test('should include correct patterns for "Potential NPM Packages"', async () => {
    jest.unstable_mockModule('../../src/utils/rules.js', () => ({
      secretRules: []
    }));
    const { getPatterns } = await import('../../src/utils/patterns.js');

    const patterns = getPatterns([]);
    const npmPatterns = patterns['Potential NPM Packages'];

    expect(npmPatterns).toBeDefined();
    expect(Array.isArray(npmPatterns)).toBe(true);
    expect(npmPatterns.length).toBe(2);

    expect(npmPatterns[0].regex).toBeInstanceOf(RegExp);
    expect(npmPatterns[0].regex.source).toBe(
      '"name":\\s*"(@[a-z0-9-~][a-z0-9-._~]*\\/[a-z0-9-~][a-z0-9-._~]*)"'
    );
    expect(npmPatterns[0].group).toBe(1);

    expect(npmPatterns[1].regex).toBeInstanceOf(RegExp);
    expect(npmPatterns[1].regex.source).toBe(
      '(?:from|require\\()\\s*[\'"](@[a-z0-9-~][a-z0-9-._~]*\\/[a-z0-9-~][a-z0-9-._~]*)[\'"]'
    );
    expect(npmPatterns[1].group).toBe(1);
  });
});
