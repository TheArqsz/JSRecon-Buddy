import { shannonEntropy, getLineAndColumn } from '../utils/coreUtils.js';

/**
 * @typedef {object} ContentSource
 * @property {string} source - The origin of the content (e.g., URL, 'Inline Script').
 * @property {string} content - The text content to be scanned.
 * @property {boolean} isTooLarge - Flag indicating if the content was too large to process.
 */

/**
 * @typedef {object} SecretRule
 * @property {string} id - The unique identifier for the rule.
 * @property {string} description - A description of what the rule finds.
 * @property {RegExp} regex - The compiled regular expression to execute.
 * @property {number} [group] - The capture group index to extract as the secret. Defaults to 0.
 * @property {number} [entropy] - The minimum Shannon entropy required for a match to be valid.
 */

/**
 * @typedef {object} Finding
 * @property {string} id - The ID of the rule that found the secret.
 * @property {string} description - The description from the rule.
 * @property {string} secret - The matched secret string.
 * @property {string} source - The source where the secret was found.
 * @property {boolean} isSourceTooLarge - Flag indicating if the source content was too large.
 * @property {number} line - The 1-based line number where the secret was found.
 * @property {number} column - The 1-based column number where the secret begins.
 */

/**
 * Iterates through content sources and applies regex rules to find secrets.
 * @param {ContentSource[]} allContentSources - An array of content source objects to be scanned.
 * @param {SecretRule[]} secretRules - An array of compiled secret-finding rule objects.
 * @returns {Finding[]} An array of finding objects.
 */
function performScan(allContentSources, secretRules) {
  const allFindings = [];

  for (const { source, content, isTooLarge } of allContentSources) {
    if (!content || isTooLarge) continue;
    for (const rule of secretRules) {
      const matches = content.matchAll(rule.regex);
      for (const match of matches) {
        const secret = match[rule.group || 0];

        if (rule.entropy && shannonEntropy(secret) < rule.entropy) {
          continue;
        }
        const { line, column } = getLineAndColumn(content, match.index);
        allFindings.push({
          id: rule.id,
          description: rule.description,
          secret: secret,
          source: source,
          isSourceTooLarge: isTooLarge,
          line: line,
          column: column
        });
      }
    }
  }
  return allFindings;
}

/**
 * @description Main message handler for the worker. It orchestrates the scanning process
 * when a message is received from the background script.
 * @param {MessageEvent} event The message event from the main script.
 * @param {object} event.data The data payload from the message.
 * @param {ContentSource[]} event.data.allContentSources The content sources to scan.
 * @param {object[]} event.data.serializableRules The rules in a serializable format (RegExp parts).
 */
self.onmessage = (event) => {
  try {
    const { allContentSources, serializableRules } = event.data;

    const secretRules = serializableRules.map(rule => ({
      ...rule,
      regex: new RegExp(rule.regex.source, rule.regex.flags)
    }));

    const findings = performScan(allContentSources, secretRules);
    self.postMessage({ status: 'success', data: findings });
  } catch (error) {
    self.postMessage({
      status: 'error',
      message: error.message,
      stack: error.stack
    });
  }
};
