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

/**
 * Captures the current state of the live DOM and serializes it into a
 * full HTML text string.
 *
 * This is an approximation of the "View Source" content but reflects
 * any modifications made by JavaScript after the page has loaded.
 *
 * @returns {string} A string representing the complete, current HTML
 * of the document, including the DOCTYPE declaration.
 * @example
 * const currentPageHTML = getDOMAsText();
 * console.log(currentPageHTML);
 */
export function getDOMAsText() {
  const doctype = new XMLSerializer().serializeToString(document.doctype);
  const html = document.documentElement.outerHTML;
  return doctype + '\n' + html;
}