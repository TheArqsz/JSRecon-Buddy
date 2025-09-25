import { describe, test, expect } from '@jest/globals';
import { secretRules } from '../../src/utils/rules.js';

describe('secretRules Data Structure', () => {
  test('should be a non-empty array', () => {
    expect(Array.isArray(secretRules)).toBe(true);
    expect(secretRules.length).toBeGreaterThan(0);
  });

  describe('each rule object', () => {
    test.each(secretRules)('rule with id "$id" should have a valid structure', (rule) => {
      expect(rule.id).toBeDefined();
      expect(rule.description).toBeDefined();
      expect(rule.regex).toBeDefined();
      expect(rule.group).toBeDefined();

      expect(typeof rule.id).toBe('string');
      expect(typeof rule.description).toBe('string');
      expect(rule.regex).toBeInstanceOf(RegExp);
      expect(typeof rule.group).toBe('number');

      expect(rule.id).not.toBe('');
      expect(rule.description).not.toBe('');

      if (rule.entropy !== undefined) {
        expect(typeof rule.entropy).toBe('number');
        expect(rule.entropy).toBeGreaterThan(0);
      }
    });
  });
});
