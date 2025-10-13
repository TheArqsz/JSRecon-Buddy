/**
 * Parses the page's HTML to find the __NEXT_DATA__ script tag and extracts
 * information needed to find the build manifest.
 *
 * @param {string} htmlContent The full HTML of the page.
 * @param {string} pageUrl The URL of the page being scanned.
 * @returns {{manifestUrl: string|null, buildId: string|null}} An object containing the URL
 * to the build manifest and the buildId, or null values if not found.
 */
export function extractNextJsData(htmlContent, pageUrl) {
  const nextDataRegex = /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s;
  const match = htmlContent.match(nextDataRegex);

  if (!match || !match[1]) {
    return { manifestUrl: null, buildId: null };
  }

  try {
    const nextData = JSON.parse(match[1]);
    const buildId = nextData.buildId;

    if (!buildId || typeof buildId !== 'string') {
      console.warn('[JS Recon Buddy] Found __NEXT_DATA__ but it is missing a valid buildId.');
      return { manifestUrl: null, buildId: null };
    }

    const baseUrl = nextData.assetPrefix || new URL(pageUrl).origin;
    const manifestUrl = `${baseUrl.replace(/\/$/, '')}/_next/static/${buildId}/_buildManifest.js`;

    return { manifestUrl, buildId };
  } catch (error) {
    console.warn('[JS Recon Buddy] Could not parse __NEXT_DATA__ JSON:', error);
    return { manifestUrl: null, buildId: null };
  }
}

/**
 * FUTURE: This function is not used until the Firefox sandbox is implemented.
 *
 * Creates a sandboxed iframe to securely parse a Next.js manifest.
 * @param {string} manifestCode The raw JS code of the manifest file.
 * @returns {Promise<string[]>} A promise that resolves with an array of routes.
 *
export function securelyParseManifest(manifestCode) {
  return new Promise((resolve, reject) => {
    const sandbox = document.createElement('iframe');
    sandbox.src = chrome.runtime.getURL('src/utils/nextjs/nextjsSandbox.html');
    sandbox.style.display = 'none';

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Sandbox parsing timed out after 5 seconds.'));
    }, 5000);

    const messageListener = (event) => {
      if (event.source !== sandbox.contentWindow) {
        return;
      }

      cleanup();

      if (event.data.status === 'success') {
        resolve(event.data.data);
      } else {
        reject(new Error(event.data.message));
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      window.removeEventListener('message', messageListener);
      if (document.body.contains(sandbox)) {
        document.body.removeChild(sandbox);
      }
    };

    window.addEventListener('message', messageListener);

    sandbox.onload = () => {
      sandbox.contentWindow.postMessage({ manifestCode }, '*');
    };

    document.body.appendChild(sandbox);
  });
}
*/

/**
 * Parses the JavaScript code of a _buildManifest.js file using a regular expression.
 *
 * @param {string} manifestCode The raw JavaScript code from the manifest file.
 * @returns {string[]} An array of discovered endpoint routes.
 */
export function parseManifestWithString(manifestCode) {
  try {
    const routeRegex = /"(\/[^"]*)"\s*:/g;
    const allMatches = [...manifestCode.matchAll(routeRegex)];
    const routes = allMatches.map(match => match[1]);

    if (!routes || routes.length === 0) {
      return [];
    }

    const filteredRoutes = routes.filter(route =>
      !route.startsWith('/_') && !route.includes('[...') && !route.includes('[[...')
    );

    return filteredRoutes;
  } catch (error) {
    console.warn('[JS Recon Buddy] Could not parse manifest with regex:', error);
    return [];
  }
}
