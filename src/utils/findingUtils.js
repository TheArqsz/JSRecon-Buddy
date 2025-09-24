/**
 * Calculates the Shannon entropy of a string.
 * @param {string} str The string to analyze.
 * @returns {number} The entropy value.
 */
export function shannonEntropy(str) {
  if (!str) {
    return 0;
  }
  const len = str.length;
  const frequencies = {};

  for (const char of str) {
    frequencies[char] = (frequencies[char] || 0) + 1;
  }

  let entropy = 0;
  for (const freq of Object.values(frequencies)) {
    const p = freq / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}


/**
 * Calculates the line and column number for a given character index in a string.
 * @param {string} content The full text content.
 * @param {number} index The character index of the finding.
 * @returns {{line: number, column: number}}
 */
export function getLineAndColumn(content, index) {
  const textUpToIndex = content.substring(0, index);
  const lines = textUpToIndex.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}