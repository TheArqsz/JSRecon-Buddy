(/**
 * @description Checks for a new extension version by fetching the `manifest.json` from GitHub.
 * It uses a local cache to avoid excessive network requests and updates the UI
 * if the remote version is newer than the currently installed version.
 * @see {@link https://raw.githubusercontent.com/TheArqsz/JSRecon-Buddy/main/manifest.json}
 */
	async function checkVersion() {
		const GITHUB_MANIFEST_URL = 'https://raw.githubusercontent.com/TheArqsz/JSRecon-Buddy/main/manifest.json';
		const CACHE_DURATION = 6 * 60 * 60 * 1000;
		const githubLink = document.querySelector('.github-link');
		if (!githubLink) return;

		const cache = await chrome.storage.local.get(['versionCache']);
		const now = new Date().getTime();

		if (cache.versionCache && (now - cache.versionCache.timestamp < CACHE_DURATION)) {
			updateUI(cache.versionCache.latestVersion);
			return;
		}

		try {
			let response = null;
			response = await fetch(GITHUB_MANIFEST_URL);
			if (response && response.status === 404) {
				return;
			}
			if (response && !response.ok) return;

			const remoteManifest = await response.json();
			const latestVersion = remoteManifest.version;

			const currentVersion = chrome.runtime.getManifest().version;
			if (compareVersions(latestVersion, currentVersion) > 0) {
				githubLink.classList.add('update-available');
				githubLink.setAttribute('title', `Version ${latestVersion} is available`);
			} else {
				await chrome.storage.local.set({
					versionCache: {
						latestVersion: latestVersion,
						timestamp: now
					}
				});
			}
		} catch (error) {
			console.warn('[JS Recon Buddy] Could not check for new version:', error);
		}

		/**
		 * Compares two semantic version strings (e.g., "1.2.3" vs "1.2.1").
		 * @param {string} v1 - The first version string.
		 * @param {string} v2 - The second version string.
		 * @returns {number} Returns `1` if v1 > v2, `-1` if v1 < v2, and `0` if they are equal.
		 */
		function compareVersions(v1, v2) {
			const parts1 = v1.split('.').map(Number);
			const parts2 = v2.split('.').map(Number);

			const len = Math.max(parts1.length, parts2.length);

			for (let i = 0; i < len; i++) {
				const p1 = parts1[i] || 0;
				const p2 = parts2[i] || 0;

				if (p1 > p2) {
					return 1;
				}
				if (p1 < p2) {
					return -1;
				}
			}

			return 0;
		}
	})();

/**
* Updates the GitHub link in the UI to show an indicator if a new version is available.
* @param {string} latestVersion - The latest version string from GitHub or cache.
*/
function updateUI(latestVersion) {
	const githubLink = document.querySelector('.github-link');
	const tooltip = document.querySelector('.tooltip');
	const currentVersion = chrome.runtime.getManifest().version;

	if (latestVersion > currentVersion) {
		githubLink.classList.add('update-available');
		githubLink.setAttribute('title', `Version ${latestVersion} is available`);
		tooltip.textContent = `New version available!`;
	}
}
