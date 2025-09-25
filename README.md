<p align="center">
    <img src="./src/icons/buddy.png" alt="Buddy Logo" width="30%"/>
</p>
<p align="center">
    <strong>JS Recon Buddy</strong>
</p>


<p align="center">
    <a href="#how-to-install-or-update">
        <img alt="Chromium Extension" src="https://img.shields.io/badge/Chromium%20Supported-blue?style=for-the-badge&logo=googlechrome&logoColor=white">
    </a>
    <a href="#how-to-install-or-update">
        <img alt="Firefox Extension" src="https://img.shields.io/badge/Firefox%20Supported-E66000?style=for-the-badge&logo=firefox&logoColor=331E54&link=%23how-to-install-or-update">
    </a>
    <a href="manifest.json">
        <img alt="GitHub manifest version" src="https://img.shields.io/github/manifest-json/v/TheArqsz/JSRecon-Buddy?style=for-the-badge&label=Ver.">
    </a>
</p>

<p align="center">
    <a href="https://github.com/TheArqsz/JSRecon-Buddy/actions/workflows/ci.yml">
        <img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/TheArqsz/JSRecon-Buddy/ci.yml?style=for-the-badge&label=Tests">
    </a>
</p>


A simple browser extension to quickly find interesting security-related information on a webpage. It injects an overlay to display its findings without interrupting your workflow.

## Features

- On-Page Overlay - all results are displayed in an overlay directly on the page you're testing.
- Comprehensive Scan - analyzes inline scripts, external JavaScript files, and the main HTML document.
- Categorized Findings - organizes results into logical categories for clear and easy analysis.
- Interactive Results - easily copy individual sections or export all findings to a JSON file for further use.

## What it finds?

The scanner uses a set of regex patterns to identify and categorize potential security-related information:

- Subdomains - discovers related subdomains within the code.
- Endpoints & Paths - uncovers potential API endpoints and other useful paths.
- Potential Secrets - scans for API keys, tokens, and other sensitive data using pattern matching and Shannon entropy checks.
- Potential DOM XSS Sinks - identifies dangerous properties and functions like .innerHTML and document.write.

| Sink / Keyword | Category | Finding Example |
| :--- | :--- | :--- |
| **`after`** | Library (jQuery) | `$('#msg').after(new URLSearchParams(location.search).get('userHtml'));` |
| **`append`** | Library (jQuery) | `$('#comments').append(new URLSearchParams(location.search).get('comment'));`|
| **`assign`** | URL/Location | `location.assign(new URLSearchParams(location.search).get('redirect'));` |
| **`before`** | Library (jQuery) | `$('#ad').before(new URLSearchParams(location.search).get('adContent'));` |
| **`cssText`** | Attribute/Style | `el.style.cssText = new URLSearchParams(location.search).get('css');` |
| **`eval`** | Execution | `eval("var config = " + new URLSearchParams(location.search).get('cfg'));` |
| **`html`** | Library (jQuery) | `$('#profile').html(new URLSearchParams(location.search).get('bio'));` |
| **`href`** | URL/Location | `link.href = new URLSearchParams(location.search).get('url');` |
| **`innerHTML`** | HTML/DOM | `div.innerHTML = location.hash.substring(1);` |
| **`insertAdjacentHTML`** | HTML/DOM | `div.insertAdjacentHTML('afterbegin', document.cookie);` |
| **`open`** | URL/Location | `window.open(new URLSearchParams(location.search).get('popupUrl'));` |
| **`outerHTML`** | HTML/DOM | `el.outerHTML = new URLSearchParams(location.search).get('widget');` |
| **`parseHTML`** | Library (jQuery) | `$.parseHTML(new URLSearchParams(location.search).get('content'));` |
| **`prepend`** | Library (jQuery) | `$('#list').prepend(new URLSearchParams(location.search).get('newItem'));` |
| **`replace`** | URL/Location | `location.replace(new URLSearchParams(location.search).get('path'));` |
| **`setAttribute`** | Attribute/Event | `el.setAttribute('onerror', new URLSearchParams(location.search).get('err'));` |
| **`setInterval`** | Execution | `setInterval("checkStatus('" + document.cookie + "')");` |
| **`setTimeout`** | Execution | `setTimeout("alert('" + new URLSearchParams(location.search).get('msg') + "')");` |
| **`src`** | URL/Location | `iframe.src = new URLSearchParams(location.search).get('page');` |
| **`style`** | Attribute/Style | `el.style = new URLSearchParams(location.search).get('styles');` |
| **`write`** | HTML/DOM | `document.write("Welcome " + new URLSearchParams(location.search).get('name'));`|
| **`writeln`** | HTML/DOM | `document.writeln(new URLSearchParams(location.search).get('line'));` |

- Interesting Parameters - flags potentially vulnerable URL parameters (e.g., redirect, debug, url).
- Source Maps - finds links to source maps which can expose original source code.
> If it is a valid source map, the extension tries to deconstruct source files based on data there
- JS Libraries - lists identified JavaScript libraries and their versions.



## Why this exists?

This project was inspired by the simple yet powerful JavaScript bookmarklets popular in the bug bounty community, such as:

- https://x.com/grumpzsux/status/1830317635629949134
- https://x.com/Evan_Connelly/status/1830407433480450318
- https://github.com/0dayCTF/endlets
- ...and more iterations of the similar nature

While those are great for a quick look, they have a few key limitations:

- Modifying a bookmarklet to add new patterns or change its functionality is a pain.
- Most are hardcoded to find specific things, like just endpoints. Adding new scanners for secrets or parameters isn't straightforward.
- CORS...Bookmarklets [have hard time analyzing](https://medium.com/making-instapaper/bookmarklets-are-dead-d470d4bbb626) scripts from other domains, leaving major blind spots.

Another major inspiration was the original [TruffleHog Chrome Extension](https://github.com/trufflesecurity/Trufflehog-Chrome-Extension). While it was a great concept, it always annoyed me with its intrusive popups for every finding, and it hasn't been maintained for the last 4 years. I am also a huge fan of Gitleaks and use it in my projects, so I thought, why not combine these ideas?

JS Recon Buddy was built to solve these problems. It takes the great idea of a recon bookmarklet and a browser-based secret scanner and makes them more powerful and customizable.

## Examples

- Extension's popup
<p align="center">
	<img src="./assets/popup.png" alt="Popup" width="40%"/>
</p>

- First scan of a given website
<p align="center">
	<img src="./assets/github-first-scan.png" alt="First scan" width="90%"/>
</p>

- Cached results of a given website
<p align="center">
	<img src="./assets/github-rescan.png" alt="Cached results" width="90%"/>
</p>

- New version is available on Github
<p align="center">
	<img src="./assets/new-version-av.png" alt="New Version" width="40%"/>
</p>

- Extension found secrets in the background
<p align="center">
	<img src="./assets/popup-secret-found.png" alt="Secret found" width="40%"/>
</p>

- Deconstructed source map
<p align="center">
	<img src="./assets/deconstructed-sources.png" alt="Source maps" width="90%"/>
</p>

## Browser Compatibility

> **TL;DR**: This extension is built for Chromium-based browsers (Chrome, Brave, Edge) and also works on Firefox. However Chromium will always be the top priority, unless it says otherwise here.

This extension was primarily developed and tested on **Chromium-based** browsers, including Google Chrome, Brave, and Microsoft Edge. The core functionality is optimized for this environment, ensuring the most stable and reliable experience.

While cross-browser support for **Mozilla Firefox** [has been implemented](https://github.com/TheArqsz/JSRecon-Buddy/commit/a3d347c2e48b0d138ce8473ce188252da99cd05c), please be aware that the primary development focus remains on the Chromium family. Consequently, I reserve the right to deprecate or remove Firefox support in the future if its maintenance introduces significant bugs or compromises the extension's stability on its main platforms.

### A Note for Chromium-based Users (Known Issue)

When you load the extension as an unpacked extension in a Chromium-based browser, you may see a non-critical error in the chrome://extensions page that says:

```
'background.scripts' requires manifest version 2 or lower.
```

**You can safely ignore this message.**

This is an expected and harmless side effect of maintaining a single codebase for both Chromium and Firefox. To ensure Firefox compatibility (due to its current limitations with Manifest V3), a background script is declared in a way that modern Chromium browsers flag as outdated. To the best of [my knowledge](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background#browser_support), this does not affect the extension's performance or functionality in any way.

This approach was chosen to avoid maintaining two separate versions of the extension. For the technically curious, you can read more about the underlying issue [in the mozilla/web-ext repository thread](https://github.com/mozilla/web-ext/issues/2532).

## How to Install or Update?

### Chromium-based browser

Since this extension is not on the Chrome Web Store, it must be loaded as an unpacked extension in developer mode.

1. Download [ZIP from releases](https://github.com/TheArqsz/JSRecon-Buddy/releases/latest/download/js-recon-buddy.zip) or clone this repository to your local machine.

   > If downloaded as a file, unzip it to a directory called e.g. `js-recon-buddy`.
3. Open Google Chrome (or other chromium-based browser) and navigate to chrome://extensions.
4. Turn on "Developer mode" using the toggle in the top-right corner.
5. Click the "Load unpacked" button.
6. Select the directory where you cloned the repository or unzipped the archive.

The extension will now be installed or updated.

### Firefox

TBD

## How to use?

### Main usage

1. Navigate to the target website.
2. Click the extension icon in your browser's toolbar.
4. Press 'Analyze full page'
5. An overlay will appear and automatically start scanning the page.
    - If you've analyzed this page before, it will instantly show the cached results (indicated in the top-left corner) while a new scan runs.
    - You can rescan the page again if you want
7. Review the categorized findings!

### Passive secret scanning

In addition to the on-demand full analysis, JS Recon Buddy automatically performs a passive scan for secrets on every page you visit. This feature is designed to provide at-a-glance awareness of potential secret leaks without any user interaction. The results of this background scan are reflected directly in the extension's toolbar icon. This entire process happens within your browser using only the regular expressions bundled with the extension - **no findings** or **page data** are ever sent to an external server.

#### Icon Status Indicators

The extension icon changes color and uses a small badge (the notification on the corner) to communicate the status of the passive scan in real-time.

By clicking the icon, you can open the popup to view a detailed list of these passively found secrets and inspect their source, all without needing to run the full page analysis. This ensures you never miss a potential finding while browsing.

- **Scanning (Yellow)** - when a page is loading, the icon turns yellow with a "..." badge, indicating that the passive scan is in progress.

> If the icon is yellow, without the indicator, it means that the webpage cannot be scanned or there was an error within the extension

<p align="center">
	<img src="./assets/example-passive-scanning.png" alt="Passive scanning" width="90%"/>
</p>

- **No Secrets Found (Green)** - once the scan is complete, a green icon means that no secrets were found in the page's HTML or scripts, based on our rules.

<p align="center">
	<img src="./assets/example-passive-notfound.png" alt="Passive scanning - not found" width="90%"/>
</p>

- **Secrets Found (Red)** - the icon turns red and displays a badge with a number, showing exactly how many potential secrets were discovered.

<p align="center">
	<img src="./assets/example-passive-found.png" alt="Passive scanning - found" width="90%"/>
</p>

### Source maps deconstruction

If you want to view deconstructed source files, click on the Source Map entry, then on the url. What you will see, is the source code as available in the source map itself.

<p align="center">
	<img src="./assets/deconstructed-sources.png" alt="Source maps" width="90%"/>
</p>

## Automatic version check

The extension automatically checks for new versions. When you open the popup, it compares its own version against the [manifest.json](manifest.json) file in this GitHub repository. To avoid excessive requests, the latest version number is cached for 6 hours. If a newer version is available on GitHub, an asterisk will appear on the GitHub logo in the popup.

<p align="center">
	<img src="./assets/new-version-av-tip.png" alt="New Version" width="40%"/>
</p>

## Contributing

Contributions are welcome! Whether it's a bug report, a feature request, or a pull request, all help is appreciated - get started [here](CONTRIBUTING.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

The secret detection patterns in [rules.js](src/utils/rules.js) were heavily inspired by [the comprehensive rule set](https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml) from the fantastic open-source project, Gitleaks, which I've adapted and expanded upon. A big thanks to the Gitleaks creators and contributors for providing such a great foundation, which is distributed under the MIT License.

A special thanks goes to the many security researchers in the bug bounty community whose clever JavaScript bookmarklets were the original inspiration for this extension and to the creators of the original [TruffleHog Chrome Extension](https://github.com/trufflesecurity/Trufflehog-Chrome-Extension).

## Disclaimer

This tool is intended for **educational** and **authorized** security testing purposes only. Do not use this tool on any system or website for which you do not have explicit, prior authorization. The author accepts no liability and is not responsible for any misuse or damage caused by this program. Use at your own risk.
