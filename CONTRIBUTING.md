# Introduction

First off, thank you for considering contributing to this repository.

Following these guidelines helps to communicate that you respect the time of the developers managing and developing this open source project. In return, they should reciprocate that respect in addressing your issue, assessing changes, and helping you finalize your pull requests.

There are many ways to contribute, from writing tutorials or blog posts, improving the documentation, submitting bug reports and feature requests or writing code which can be incorporated into JS Recon Buddy itself.

## Table of Contents
- [Ground Rules](#ground-rules)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Writing and running tests](#writing-and-running-tests)
- [Standard Contributions](#standard-contributions)
- [Core concepts](#core-concepts)
- [Adding a new finding category](#adding-a-new-finding-category)
- [Adding or modifying secret rules](#adding-or-modifying-secret-rules)


# Ground Rules

* Create issues for any major changes and enhancements that you wish to make. Discuss things transparently and get community feedback.
* Keep feature versions as small as possible, preferably one new feature per version.
* Be welcoming to newcomers and encourage diverse new contributors from all backgrounds.

## Commit Message Guidelines

This project uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary) to automate the release process and generate the [CHANGELOG.md](CHANGELOG.md) file. Following this format for your commit messages is essential, as it tells our automated system how to bump the version number and categorize your changes.

### The format

Each commit message must follow this simple structure:

```
<type>: <description>
```

For example: `feat: add a new scanner for session storage`

### Commit types

You must use one of the following types in your commit message prefix. Here are the most common ones we use:

* **`feat`**: Use this for a **new feature**.
    * *Example*: `feat: add passive rescan button to popup`
    * *Effect*: Triggers a **minor** version release (e.g., 1.2.0 → 1.3.0).

* **`fix`**: Use this for a **bug fix**.
    * *Example*: `fix: prevent crash on pages with no scripts`
    * *Effect*: Triggers a **patch** version release (e.g., 1.2.0 → 1.2.1).

* **`test`**: For adding missing tests or refactoring existing ones.

    * *Example*: `test: add unit tests for the caching utility`
    * *Effect*: Does not trigger a release.

* **`docs`**: For changes to documentation only (like updating this file or the README).
* **`style`**: For code style changes that don't affect logic (formatting, whitespace, etc.).
* **`refactor`**: For code changes that don't add a feature or fix a bug (like improving the structure of a function).
* **`chore`**: For changes to the build process or other maintenance tasks (like updating the GitHub Actions workflow).

### Breaking changes

A "breaking change" is a change that is not backward-compatible. To mark a commit as a breaking change, add a `!` after the type. This will trigger a **major** version release (e.g., 1.2.0 → 2.0.0).

* *Example*: `refactor!: remove support for legacy cache format`

### Multiline commits

For changes that are more complex than a single line can describe, you can add an optional **body**. A blank line between the subject and the body is required.

The body can provide more context about the problem and the solution. You can also add a **footer** to reference issue numbers.

**Example:**

```
fix: properly update icon from in-memory cache

The previous logic failed to use the Map correctly, causing a TypeError.
This change uses map.get() to retrieve the cached finding count
and updates the UI instantly upon tab activation.

Closes #27
```

---

At this point, you're ready to make your changes! Feel free to ask for help - everyone is a beginner at first.

## Writing and running tests

This project uses Jest for unit and integration testing. We believe that a strong test suite is crucial for maintaining the quality and stability of the extension.

- *Location*: Test files are located in the `tests` directory and mirror the `src` directory structure. For example, tests for `src/utils/coreUtils.js` are in `tests/utils/coreUtils.test.js`.

- *Requirement*: All new features (`feat`) and bug fixes (`fix`) must be accompanied by corresponding tests to verify their correctness.

- *Running tests*: You can run the entire test suite from the root of the project with the following command:

```bash
npm test
```

## Standard Contributions

1. Fork the repository.
2. Create a new branch for your feature or bug fix (`git checkout -b feature/your-feature-name`).
3. Make your code changes
4. Write or update tests for your changes and ensure the entire test suite passes by running `npm test`.
5. Commit your changes (`git commit -am 'Add some amazing feature'`).
6. Push to the branch (`git push origin feature/your-feature-name`).
7. Open a Pull Request.

## Core concepts

### Passive scan vs on-demand scan

The extension operates in two distinct scanning modes:

- Passive Scan (`background.js`): This is a lightweight scan that runs automatically on every page load. It only looks for high-confidence secrets and its main job is to update the browser action icon with a status (e.g. green for clear, red for secrets found). It is designed to be fast and have minimal performance impact.

- On-Demand Scan (`overlay.js`): This is a comprehensive, manual scan triggered when a user clicks "Analyze Full Page". It is much more intensive, searching for all categories of findings (secrets, endpoints, NPM packages, etc.). The results are displayed in a detailed, interactive overlay on the page.

### Offloading heavy tasks (Workers)

Running hundreds of regular expressions can be CPU-intensive. To avoid crashing the main service worker (`background.js`), this heavy lifting is offloaded to a separate process.

- For Chromium, this is done using the `chrome.offscreen` API to create an offscreen document.
- For Firefox, it uses a standard `Worker`.

Any new, CPU-intensive logic should follow this pattern to ensure the extension remains stable.

### Storage: settings vs cache

The extension uses `chrome.storage` for two different purposes:

- User Settings (`chrome.storage.sync`): This is used for small, user-configurable options like toggles and exclusion lists. Data here is synced across a user's devices.
- Scan Results (`chrome.storage.local`): This is used for larger datasets, specifically the results of on-demand scans. This data is browser-specific and serves as a cache to improve performance when a page is re-analyzed.

### Communication via message passing

The different parts of the extension (popup, background script, overlay content script) are isolated from each other for security. They communicate using `chrome.runtime.sendMessage`. This is how a content script can ask the background script to perform a privileged action.

For example, the overlay script (`overlay.js`) cannot open a new tab itself. Instead, it sends a message to `background.js` requesting that a tab be opened, and the background script performs the action on its behalf.

### Network requests - throttling & rate limiting

To prevent overwhelming servers or the browser itself, the background script uses a throttled fetch system. This system controls both concurrency and the rate of requests.

- Concurrency (`MAX_CONCURRENT_FETCHES`): Limits how many network requests can be active at the same time.

- Rate Limiting (`REQUEST_DELAY_MS`): Enforces a minimum delay between the completion of one request queue and the start of the next.

There are two different throttled fetch functions available in `background.js`:

1. `throttledFetch(url)`: Use this when you only need the text content of a file (e.g. fetching a JavaScript file for scanning). It automatically handles checking if the response was successful (`res.ok`).

2. `throttledFetchResponse(url)`: Use this when you need the full `Response` object, which is necessary for checking HTTP status codes. This is used e.g. for the NPM package verification, where a `404 Not Found` is the desired "success" condition.

## Adding a new finding category

The on-demand scanner (`overlay.js`) is designed to be easily extensible. To add a new category of findings, you need to modify two files.

1. Add the Pattern in `patterns.js`

In the `getPatterns` function, add a new entry to the `patterns` object. This includes a key, a regex, the capturing group, and the context type (`snippet`, `line` or null).

**Single pattern example**:

```javascript
'My New Scanner': {
  regex: /your-regex-here/g,
  group: 1,
  context: 'snippet'
},
```

**Multiple pattern example (like Potential Secrets)**:

```javascript
'My New Scanner': [
  { regex: /pattern-one/g, group: 1, context: 'line' },
  { regex: /pattern-two/g, group: 0, context: 'snippet' }
],
```

2. Add the UI Section in `overlay.js`

In the `renderResults` function, add a corresponding entry to the `sectionConfig` array. This defines how the results for your new category will be displayed.

**For simple lists (like External Scripts)**:

If your finding is just a simple string (like a URL) and doesn't have detailed "occurrences", you can render it as a simple list. The key is to provide a `formatter` that creates the entire list item's content (e.g. a clickable link) and to ensure the `renderSection` function has logic to handle it.

In `renderResults`:

```javascript
{
  key: 'My New Scanner',
  title: '[?] My New Scanner',
  formatter: (safeItem) => `<a href="${safeItem}" target="_blank">${safeItem}</a>`,
  copySelector: 'details > ul > li > a'
},
```

In `renderSection` add your new category's title to the condition that handles simple lists.

```javascript
if (title === "[S] External Scripts" || title === "[I] Inline Scripts" || title === "[?] My New Scanner") {
    findingsMap.forEach((_, item) => {
        const safeItem = escapeHTML(item);
        const renderedItem = formatter ? formatter(safeItem) : safeItem;
        itemsHTML += `<li>${renderedItem}</li>`;
    });
} else {
    // ... default logic ...
}
```

**For detailed findings (like Potential Secrets)**:

If your finding has occurrences (i.e. it can appear in multiple places), the system will automatically use `renderListItem` to create an expandable `<details>` view that shows the context for each occurrence.

While you can omit the `formatter` to show the raw finding, you should typically provide one to style the main finding text. For example, wrapping it in a `<code>` tag.

In `renderResults`:

```javascript
{
  key: 'My New Scanner',
  title: '[!] My New Scanner',
  formatter: (safeItem) => `<code>${safeItem}</code>`,
  copySelector: '.finding-details > summary'
},
```

## Adding or modifying secret rules

The secret detection logic is powered by a list of rules in the [rules.js](src/utils/rules.js) file. To add a new secret to detect, simply add a new object to the `secretRules` array in this file.

As an example, to add a rule for detecting Postman API keys, you would add the following object to the array:

```js
{
  id: "postman-api-key",
  description: "Postman API Key",
  regex: '(PMAK-[0-9a-f]{24}-[0-9a-f]{34})',
  group: 1,
  entropy: 4.5,
},
```

Each rule requires:
- `id` - a unique, descriptive ID for the rule.
- `description` - ashort description of what the key is.
- `regex` - the regular expression used to find the secret.
- `group` - *(optional)* the specific capturing group from the regex to extract as the finding. Defaults to `0` (the entire match).
- `entropy` - *(optional)* a minimum Shannon entropy value. The finding will only be reported if its calculated entropy is higher than this value, which helps reduce false positives. Defaults to `0`.
