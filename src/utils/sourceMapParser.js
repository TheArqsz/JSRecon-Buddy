/**
 * @description Reconstructs original source code from a given JavaScript source map URL.
 * It fetches the source map, then retrieves each individual source file, either
 * from the embedded `sourcesContent` property or by fetching the source file's URL directly.
 * @param {string} sourceMapUrl - The fully qualified URL to the `.map` source map file.
 * @returns {Promise<Object<string, string>>} A promise that resolves to an object where keys
 * are the original source file paths (e.g., "webpack:///src/index.js") and values are
 * their corresponding text content. In case of a critical parsing error, it resolves to
 * an object with a single `jsrecon.buddy.error.log` key containing the error message.
 */
export async function reconstructSource(sourceMapUrl) {
  try {
    const sourceMapData = await chrome.runtime.sendMessage({
      type: 'FETCH_FROM_CONTENT_SCRIPT',
      url: sourceMapUrl
    });

    if (sourceMapData && sourceMapData.status && sourceMapData.status === 'not_found') {
      throw new Error(`Source map not found at ${sourceMapUrl} (404 Not Found).`);
    }

    if (sourceMapData && sourceMapData.status && sourceMapData.status === 'error') {
      throw new Error(`Failed to fetch source map due to a network or CORS error: ${sourceMapData.message}`);
    }

    if (!sourceMapData || !sourceMapData.sources) {
      throw new Error(`Source map from ${sourceMapUrl} is invalid or does not contain a 'sources' array.`);
    }

    const reconstructedSources = {};
    const setSource = (sourceFile, content) => {
      Object.defineProperty(reconstructedSources, sourceFile, {
        value: content,
        writable: true,
        enumerable: true,
        configurable: true
      });
    };

    for (const [index, sourceFile] of sourceMapData.sources.entries()) {
      const embeddedContent = sourceMapData.sourcesContent?.[index];
      if (embeddedContent !== undefined && embeddedContent !== null) {
        setSource(sourceFile, embeddedContent);
        continue;
      }

      try {
        const sourceUrl = new URL(sourceFile, sourceMapUrl).href;
        const sourceResponse = await fetch(sourceUrl);

        if (!sourceResponse.ok) {
          setSource(sourceFile, `[JS Recon Buddy] Skipping missing source file: ${sourceUrl} (Status: ${sourceResponse.status})`);
          continue;
        }

        setSource(sourceFile, await sourceResponse.text());
      } catch (fetchError) {
        console.warn(`[JS Recon Buddy] Skipping source file due to network error: ${fetchError.message}`);
        continue;
      }
    }

    return reconstructedSources;

  } catch (error) {
    return { "jsrecon.buddy.error.log": error.toString() };
  }
}
