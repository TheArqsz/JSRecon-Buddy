/**
 * Sanitizes a string by replacing special HTML characters with their corresponding entities.
 * This is a security measure to prevent Cross-Site Scripting (XSS) when rendering content.
 * @param {string | undefined | null} str The input string to escape.
 * @returns {string} The sanitized string, safe for insertion into HTML.
 */
export const escapeHTML = (str) => {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/**
 * Determines the appropriate Prism.js language class name from a given source string.
 * It checks the file extension or specific keywords to return a language identifier.
 * @param {string} source The source file path or a descriptor like "HTML Document".
 * @returns {string} The language class name for Prism.js (e.g., 'javascript', 'markup'). Defaults to 'javascript'.
 */
export const getLanguageFromSource = (source) => {
  if (source.endsWith('.js')) return 'javascript';
  if (source.endsWith('.css')) return 'css';
  if (source.endsWith('.json')) return 'json';
  if (source.endsWith('.html') || source === 'HTML Document') return 'markup';
  return 'javascript';
};

/**
 * @description Main logic for the source viewer page. It reads a storage key from the URL hash,
 * fetches the corresponding content and secret from local storage, renders the content
 * into the DOM, and then uses Prism.js to syntax highlight the code and scroll to the secret.
 * @returns {Promise<void>}
 */
export async function initializeViewer() {
  const codeEl = document.getElementById('content-container');

  try {
    const storageKey = window.location.hash.substring(1);
    if (!storageKey) {
      codeEl.textContent = "[JS Recon Buddy] Source viewer - storage key not found in the URL.";
      return;
    }

    const storageData = await chrome.storage.local.get(storageKey);
    if (!storageData[storageKey]) {
      codeEl.textContent = "[JS Recon Buddy] Source viewer - content not found in local storage.";
      return;
    }

    chrome.storage.local.remove(storageKey);

    const { content, secret, source } = storageData[storageKey];

    if (content && secret) {
      const language = getLanguageFromSource(source);
      const escapedSecret = escapeHTML(secret);
      const updatedContent = content.replace(
        new RegExp(escapedSecret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        escapedSecret
      );
      codeEl.className = `language-${language}`;
      codeEl.textContent = updatedContent;

      setTimeout(() => {
        Prism.highlightElement(codeEl, false, function () {
          const xpath = `//text()[contains(., ${JSON.stringify(secret)})]`;
          const result = document.evaluate(xpath, codeEl, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);

          let currentNode = result.iterateNext();
          if (currentNode) {
            const startIndex = currentNode.textContent.indexOf(secret);
            if (startIndex > -1) {
              const range = document.createRange();
              range.setStart(currentNode, startIndex);
              range.setEnd(currentNode, startIndex + secret.length);

              const tempHighlight = document.createElement('span');
              tempHighlight.className = 'highlight';
              range.surroundContents(tempHighlight);

              if (tempHighlight.scrollIntoView) {
                tempHighlight.scrollIntoView({
                  behavior: 'auto',
                  block: 'center',
                  inline: 'center'
                });
              }
            }
          }
        });
      }, 10);
    } else {
      codeEl.textContent = "[JS Recon Buddy] Error: Could not display content.";
    }
  } catch (e) {
    codeEl.textContent = "[JS Recon Buddy] Error: Failed to parse content from URL.";
    console.error("[JS Recon Buddy] Source viewer error:", e);
  }
}

document.addEventListener('DOMContentLoaded', initializeViewer);
