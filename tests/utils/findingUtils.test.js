import { shannonEntropy, getLineAndColumn, getDOMAsText } from '../../src/utils/findingUtils.js';

describe('shannonEntropy', () => {
  test('should return 0 for an empty or null string', () => {
    expect(shannonEntropy('')).toBe(0);
    expect(shannonEntropy(null)).toBe(0);
  });

  test('should return 0 for a string with no variety', () => {
    expect(shannonEntropy('aaaaa')).toBe(0);
  });

  test('should calculate the correct entropy for a simple string', () => {
    expect(shannonEntropy('aabb')).toBeCloseTo(1);
  });

  test('should calculate the correct entropy for a more complex string', () => {
    expect(shannonEntropy('abaaccc')).toBeCloseTo(1.44882);
  });

  test('should calculate high entropy for a highly random string', () => {
    const randomString = 'abcdefghijklmnopqrstuvwxyz0123456789';
    expect(shannonEntropy(randomString)).toBeCloseTo(Math.log2(randomString.length));
  });
});

describe('getLineAndColumn', () => {
  const multilineContent = `const a = 1;\nconst b = 2;\nconst c = 3;`;

  test('should return line 1 for an index on the first line', () => {
    expect(getLineAndColumn(multilineContent, 6)).toEqual({ line: 1, column: 7 });
  });

  test('should return the correct line and column for the start of a new line', () => {
    expect(getLineAndColumn(multilineContent, 13)).toEqual({ line: 2, column: 1 });
  });

  test('should return the correct line and column for a character mid-line', () => {
    expect(getLineAndColumn(multilineContent, 29)).toEqual({ line: 3, column: 4 });
  });

  test('should handle index 0 correctly', () => {
    expect(getLineAndColumn(multilineContent, 0)).toEqual({ line: 1, column: 1 });
  });
});

describe('getDOMAsText', () => {
  test('should serialize the current document state into a string', () => {
    document.documentElement.innerHTML = '<head><title>Test</title></head><body><p>Hello</p></body>';

    const htmlString = getDOMAsText();

    expect(htmlString).toContain('<!DOCTYPE html>');
    expect(htmlString).toContain('<html><head><title>Test</title></head><body><p>Hello</p></body></html>');
  });
});
