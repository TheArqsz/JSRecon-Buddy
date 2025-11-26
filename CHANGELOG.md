## [1.18.0](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.17.3...v1.18.0) (2025-11-26)


### Features

* add ability to download full source map tree as JSON ([53e2c43](https://github.com/TheArqsz/JSRecon-Buddy/commit/53e2c436f60686d11ea27c8bd7ee2ab6f0d75edb))
* implement GraphQL endpoint and operation discovery ([07a0c3b](https://github.com/TheArqsz/JSRecon-Buddy/commit/07a0c3b7e5909b9565da47fe9c08b7632a2bb8be))

## [1.17.3](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.17.2...v1.17.3) (2025-11-24)


### Bug Fixes

* **background:** unify throttledFetch signature for privacy hardening ([c9445ef](https://github.com/TheArqsz/JSRecon-Buddy/commit/c9445ef8853079277dda1e8e76fc8ae696e3bbf2))

## [1.17.2](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.17.1...v1.17.2) (2025-11-24)


### Bug Fixes

* **overlay:** prevent DOM XSS in source map file tree generation ([e830503](https://github.com/TheArqsz/JSRecon-Buddy/commit/e8305034139293a5474354e645cd842ab767a786))

## [1.17.1](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.17.0...v1.17.1) (2025-11-24)


### Bug Fixes

* **overlay:** prevent browser freeze on large scripts and reduce memory usage ([e7a9a70](https://github.com/TheArqsz/JSRecon-Buddy/commit/e7a9a70a765d404ab068646bf0ad81f3a00267e1))


### Performance Improvements

* **background:** optimize memory footprint of passive scan ([6e4a55a](https://github.com/TheArqsz/JSRecon-Buddy/commit/6e4a55af6fdde9abb1d9f27d1eda5b38a2e24df8))

## [1.17.0](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.16.4...v1.17.0) (2025-11-24)


### Features

* Added .map finding for existing js scripts as requested in [#7](https://github.com/TheArqsz/JSRecon-Buddy/issues/7) ([5d46dcc](https://github.com/TheArqsz/JSRecon-Buddy/commit/5d46dccb7a9d459acc368e0b3fc7f63e141ed124))


### Bug Fixes

* Fixed wrong status of async requests ([f46e3de](https://github.com/TheArqsz/JSRecon-Buddy/commit/f46e3def637cfc0eb7a3b16fae90aa0455e91e25))

## [1.16.4](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.16.3...v1.16.4) (2025-10-22)


### Bug Fixes

* Implemented a single AbortController to manage proper event management ([caac648](https://github.com/TheArqsz/JSRecon-Buddy/commit/caac64837d9ec4f5a81fa12d9546380f95bb19c1))
* Replaced raw html element creation in the overlay with domUtils ([cfaac0a](https://github.com/TheArqsz/JSRecon-Buddy/commit/cfaac0a751c75171de5b9ba5bc23d304d49fa0d3))

## [1.16.3](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.16.2...v1.16.3) (2025-10-19)


### Bug Fixes

* Added proper message on extension being installed/updated ([1097c57](https://github.com/TheArqsz/JSRecon-Buddy/commit/1097c576b2bc724a4b54e3a4f91ee293724d19bb))

## [1.16.2](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.16.1...v1.16.2) (2025-10-19)


### Bug Fixes

* Added domUtils to manifest ([e54d9b6](https://github.com/TheArqsz/JSRecon-Buddy/commit/e54d9b65a7e6ecce912df83131a255496fdb7dd8))
* Added try catch to generateStorageKey ([c9b18bc](https://github.com/TheArqsz/JSRecon-Buddy/commit/c9b18bc7eef70ae4885d8388138fa1dba960418c))
* **popup:** Changed how popup handles findings (sanitization) ([5b58285](https://github.com/TheArqsz/JSRecon-Buddy/commit/5b58285af46c07e6b7d992bc660169e29bd1d649))

## [1.16.1](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.16.0...v1.16.1) (2025-10-17)


### Bug Fixes

* **popup:** Added handler for stale global vars on tab change (tab switches while popup is open) ([31ecbf4](https://github.com/TheArqsz/JSRecon-Buddy/commit/31ecbf4c5487df1ead57e5939a5724ad097f0dea))
* **popup:** Fixed potential race condition ([1d3ff11](https://github.com/TheArqsz/JSRecon-Buddy/commit/1d3ff11982ed5937349c4d46af890751bb501921))
* **popup:** Fixed potential security issue (xss in secret card) ([147b568](https://github.com/TheArqsz/JSRecon-Buddy/commit/147b56801ac4b3dfaa87662ff21fa49e98b196d3))

## [1.16.0](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.15.0...v1.16.0) (2025-10-16)


### Features

* **storage:** share scan results across tabs with URL-based caching ([fd17fc3](https://github.com/TheArqsz/JSRecon-Buddy/commit/fd17fc3c13faec01a9a11e4442b0e4e0a6fa0067))


### Bug Fixes

* Added debounce for passive scanning and offscreen idle timeout ([1d725ff](https://github.com/TheArqsz/JSRecon-Buddy/commit/1d725ffe884ffb2fb1bc813cd4bf7ea1c21826e0))
* Added LRU cache (scanned pages) to fix the unbounded memory growth ([9d609bf](https://github.com/TheArqsz/JSRecon-Buddy/commit/9d609bfbe20c4213da46e7abd861e1552f89bc25))
* **queue:** prevent scan queue from freezing ([b262f88](https://github.com/TheArqsz/JSRecon-Buddy/commit/b262f88e373efdb0279e0f0f416327db147486b5))

## [1.15.0](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.14.3...v1.15.0) (2025-10-13)


### Features

* **nextjs_manifest:** Added next.js manifest analysis to endpoints parser ([37f2d4d](https://github.com/TheArqsz/JSRecon-Buddy/commit/37f2d4df879521cf47897dcc7504d9338aa2e0a5))

## [1.14.3](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.14.2...v1.14.3) (2025-10-10)


### Bug Fixes

* Added proper await to updateUI (based on test results) ([3fb47cb](https://github.com/TheArqsz/JSRecon-Buddy/commit/3fb47cbe2c0ab97d35d67d4ee462ea85538208c1))
* Improved popup load (based on test results) ([c368df2](https://github.com/TheArqsz/JSRecon-Buddy/commit/c368df26d5bd70ec74f9c6c6a4db84d6ad4dfbca))

## [1.14.2](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.14.1...v1.14.2) (2025-10-10)


### Bug Fixes

* Properly added throttledFetch to FETCH_FROM_CONTENT_SCRIPT message handler ([3047a85](https://github.com/TheArqsz/JSRecon-Buddy/commit/3047a85d43bce3ddda78eef585fbd10d68e12389))

## [1.14.1](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.14.0...v1.14.1) (2025-10-09)


### Bug Fixes

* Properly forced FETCH_SCRIPTS to use throttledFetch ([d8bb841](https://github.com/TheArqsz/JSRecon-Buddy/commit/d8bb841c241e036ef8ee6a6550ead8880b95d585))

## [1.14.0](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.13.0...v1.14.0) (2025-10-08)


### Features

* Added message handler for dependency check in npm. Updated throttled fetch with a delay ([f07bea3](https://github.com/TheArqsz/JSRecon-Buddy/commit/f07bea37ff0f8d664a52454fdd5043baec0010f6))
* **npm_dependency_scan:** Added entry in the overlay for dependency confusion ([8dcf0f2](https://github.com/TheArqsz/JSRecon-Buddy/commit/8dcf0f2dde3382896eff01103b11f02a96fd2edd))
* **npm_dependency_scan:** Added new setting in the options page ([1e6c730](https://github.com/TheArqsz/JSRecon-Buddy/commit/1e6c730eb9aac1e13e99830ba24ab07dadb74fe4))

## [1.13.0](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.12.1...v1.13.0) (2025-10-08)


### Features

* Added Inline and External scripts to the overlay ([4dd15eb](https://github.com/TheArqsz/JSRecon-Buddy/commit/4dd15eb0a9dc6ce5fb7a2693cabb0531918e6005))
* Added OPEN_VIEWER_TAB onMessage trigger to background.js to handle source-viewer ([ff2003a](https://github.com/TheArqsz/JSRecon-Buddy/commit/ff2003a7caa47a8e7074a53455584e84c28a59ae))


### Bug Fixes

* Allowed source-viewer to be used without secret ([3fbe93b](https://github.com/TheArqsz/JSRecon-Buddy/commit/3fbe93b6ef90d620f05b6a434df19be0742cc874))

## [1.12.1](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.12.0...v1.12.1) (2025-10-07)


### Bug Fixes

* This commit implements fix for wrong handling of async events in the background.js ([a46b8d4](https://github.com/TheArqsz/JSRecon-Buddy/commit/a46b8d4798f5d9631ccfafc16aaedae4e5c682a4))

## [1.12.0](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.11.1...v1.12.0) (2025-10-07)


### Features

* Added disable passive scanning checkbox to options page. ([5ade191](https://github.com/TheArqsz/JSRecon-Buddy/commit/5ade19169c5b9c5fc2454ab824328cfdf0db6ecc))

## [1.11.1](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.11.0...v1.11.1) (2025-10-07)


### Bug Fixes

* This commit adds max concurrent passive scans. ([066edce](https://github.com/TheArqsz/JSRecon-Buddy/commit/066edce6416ed042350dedc5e389e3911c007cef)), closes [#5](https://github.com/TheArqsz/JSRecon-Buddy/issues/5)

## [1.11.0](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.10.0...v1.11.0) (2025-10-07)


### Features

* Added exclude secret rules to the options page and a basic logic ([d23da24](https://github.com/TheArqsz/JSRecon-Buddy/commit/d23da2471ea8f9d5395dc6c880e0c36d76e93384))
* **exclude_rules:** Implement exclude rules in passive scanning ([8e64e1d](https://github.com/TheArqsz/JSRecon-Buddy/commit/8e64e1d3b0fd65f4a00b5c75d9d8d184953fffdb))


### Bug Fixes

* Fixed onMessage listener always returning True indicating async ([4886879](https://github.com/TheArqsz/JSRecon-Buddy/commit/4886879975bc01283b2bd471e3736199485cca5c))

## [1.10.0](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.9.3...v1.10.0) (2025-10-01)


### Features

* Added on/off toggle implementing feature requested in [#2](https://github.com/TheArqsz/JSRecon-Buddy/issues/2) ([708bb30](https://github.com/TheArqsz/JSRecon-Buddy/commit/708bb3076547849a41de9257199d719edb936835))

## [1.9.3](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.9.2...v1.9.3) (2025-09-26)


### Bug Fixes

* Fixed getDOMAsText not properly handling pages without proper doctype ([1861e95](https://github.com/TheArqsz/JSRecon-Buddy/commit/1861e9557136ab38071520c31fe71706d706fe48))

## [1.9.2](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.9.1...v1.9.2) (2025-09-26)


### Bug Fixes

* Added handler for IPs in getDomainInfo ([8ba2903](https://github.com/TheArqsz/JSRecon-Buddy/commit/8ba2903a96aabd2b6c0e179be1113228b0bcd558))

## [1.9.1](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.9.0...v1.9.1) (2025-09-25)


### Bug Fixes

* Fixed popup's header size ([a73bbea](https://github.com/TheArqsz/JSRecon-Buddy/commit/a73bbeaa2ffa85f1f89cc4e22a5118fe9127de00))
* Fixed version to use session instead of local and properly refresh ([5589a6d](https://github.com/TheArqsz/JSRecon-Buddy/commit/5589a6d260cae6b1a88e864d6cccb0843acd69f3))

## [1.9.0](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.8.3...v1.9.0) (2025-09-25)


### Features

* Added options button in the popup itself ([7138a0f](https://github.com/TheArqsz/JSRecon-Buddy/commit/7138a0ffbac47ffb956bacc555cdc1c09dbe4108))
* Added options page ([a27d314](https://github.com/TheArqsz/JSRecon-Buddy/commit/a27d3147f1aab2cabb77f0008390344b4d294429))

## [1.8.3](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.8.2...v1.8.3) (2025-09-24)


### Bug Fixes

* Fixed sourceMap modal not closing when user clicked on the background ([bc1fe1a](https://github.com/TheArqsz/JSRecon-Buddy/commit/bc1fe1acdd23eb179fabd50408543d0c6e0b7360))

## [1.8.2](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.8.1...v1.8.2) (2025-09-24)


### Bug Fixes

* Fixed findings count not refreshing when passive scan is forced ([53a746a](https://github.com/TheArqsz/JSRecon-Buddy/commit/53a746a93898a9c2a699ab1f2b0dc75165a8de47))

## [1.8.1](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.8.0...v1.8.1) (2025-09-24)


### Bug Fixes

* Added export to getDOMAsText function ([d385ef1](https://github.com/TheArqsz/JSRecon-Buddy/commit/d385ef142bafad15a457937aa7e01aea7d6e07a0))

## [1.8.0](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.7.1...v1.8.0) (2025-09-24)


### Features

* Added line and column to each finding ([070edcc](https://github.com/TheArqsz/JSRecon-Buddy/commit/070edccaa6097cda0dcb9b34d8eee2105a83c47c))


### Bug Fixes

* Fixed how conventional commits actions uses App username ([a259c45](https://github.com/TheArqsz/JSRecon-Buddy/commit/a259c457939d35600ef84d8fd489f50212218857))
* Fixed how conventional commits actions uses App username - wrong action ([96f4d79](https://github.com/TheArqsz/JSRecon-Buddy/commit/96f4d7932d288b98ab98e058a5cb57ecb55cf5b4))
* Fixed how conventional commits actions uses App username - wrong variables ([38bf387](https://github.com/TheArqsz/JSRecon-Buddy/commit/38bf387a6af3526c009900022ad797eadc285099))


### Reverts

* Changed previous edit on workflow ([4ab8299](https://github.com/TheArqsz/JSRecon-Buddy/commit/4ab8299a76a1e3415b17da234723ea9b562ba848))
* Changed previous edit on workflow ([24823a6](https://github.com/TheArqsz/JSRecon-Buddy/commit/24823a63d0594cd3e971d310f23b05f8d7441ba4))

## [1.7.1](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.7.0...v1.7.1) (2025-09-23)


### Bug Fixes

* Added fix for the latest version not being shown in the title of the notification ([14e409b](https://github.com/TheArqsz/JSRecon-Buddy/commit/14e409b1d1b41dedee70f43b6d191ad1b5b85eb6))
* Added handler for Mozilla's Addon store throwing permission errors ([b0ece38](https://github.com/TheArqsz/JSRecon-Buddy/commit/b0ece38e01a46c9001c25807702d963808ccec15))
* Added handler for Mozilla's Addon store throwing permission errors ([60269c4](https://github.com/TheArqsz/JSRecon-Buddy/commit/60269c43d2dd7641d5628399c521801ee4b163bb))

## [1.7.0](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.6.2...v1.7.0) (2025-09-23)


### Features

* Added basic support for Firefox browser (manifest.json + background.js) ([a3d347c](https://github.com/TheArqsz/JSRecon-Buddy/commit/a3d347c2e48b0d138ce8473ce188252da99cd05c))


### Bug Fixes

* Follow up on the storage fix from the last commit (popup.js) ([e0d0451](https://github.com/TheArqsz/JSRecon-Buddy/commit/e0d04511fe75abf604cfd918955cd0acb7d74c51))

## [1.6.2](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.6.1...v1.6.2) (2025-09-22)


### Bug Fixes

* Updated the logic behind the popup rendering ([5720fc6](https://github.com/TheArqsz/JSRecon-Buddy/commit/5720fc6637d00447865fd596bfb0fe58ca8d5782))

## [1.6.1](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.6.0...v1.6.1) (2025-09-22)


### Bug Fixes

* Changed handling of fetch requests ([f286d95](https://github.com/TheArqsz/JSRecon-Buddy/commit/f286d954b5286e744ddab8485579a9a3a1096bf6))

## [1.6.0](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.5.4...v1.6.0) (2025-09-19)


### Features

* Added new HTML sink values in patterns.js ([9baaee3](https://github.com/TheArqsz/JSRecon-Buddy/commit/9baaee350a8bf75b530c65cfe20a8a1efab90424))


### Bug Fixes

* Added mechanism that clears old local storage cache properly ([9e4a937](https://github.com/TheArqsz/JSRecon-Buddy/commit/9e4a937ff5a1561927adf416df3416b2fe0b4c0b))

## [1.5.4](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.5.3...v1.5.4) (2025-09-18)


### Bug Fixes

* Changed how text is copied in the overlay ([8ebf591](https://github.com/TheArqsz/JSRecon-Buddy/commit/8ebf591c794cc85d216b978885e509c0b0cbc99e))

## [1.5.3](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.5.2...v1.5.3) (2025-09-18)


### Bug Fixes

* Source map parser was fixed to properly handle 404s and other URL issues when collecting maps ([65c11f4](https://github.com/TheArqsz/JSRecon-Buddy/commit/65c11f4fc1805d0f9a018acc46b4f6f1e85a5223))

## [1.5.2](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.5.1...v1.5.2) (2025-09-17)


### Bug Fixes

* Fixed code not being wrapped and added copy button ([54a1f36](https://github.com/TheArqsz/JSRecon-Buddy/commit/54a1f36d063d2878107c5d467d543cf1b3351410))
* Fixed source maps not being properly downloaded due to context restrictions (moved source map downloading to background.js ([2b34820](https://github.com/TheArqsz/JSRecon-Buddy/commit/2b3482089c1849728f5fe7b4301d6634c2080893))
* Fixed styles not being respected on some websites ([eb643cd](https://github.com/TheArqsz/JSRecon-Buddy/commit/eb643cdb3dbe650da0379bf23748238b37991028))
* Popup is no longer throwing errors on chrome webstore and other google's pages ([45b6453](https://github.com/TheArqsz/JSRecon-Buddy/commit/45b6453f07af01cbf516a218f8f7f684791d3d49))

## [1.5.1](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.5.0...v1.5.1) (2025-09-16)


### Bug Fixes

* Removed race condition issue for passive scanning ([4c20d14](https://github.com/TheArqsz/JSRecon-Buddy/commit/4c20d1415e6075d54f55232591f37d356697cf19))

## [1.5.0](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.4.8...v1.5.0) (2025-09-16)


### Features

* Added support for Offscreen API that allows the extension to be executed async in multiple tabs at once ([76f3cb2](https://github.com/TheArqsz/JSRecon-Buddy/commit/76f3cb23fc8470a4ccd30e96e37c66973fc81757))


### Bug Fixes

* Fixed responsiveness of the extension by making passive scanning async ([3cb04bb](https://github.com/TheArqsz/JSRecon-Buddy/commit/3cb04bbe027d082d8d01a412330d9c346419d886))
* Fixed the behavior of icon not being set properly and scanning not updating the results ([96b7623](https://github.com/TheArqsz/JSRecon-Buddy/commit/96b76231c519f3ff1ad39f9d584984432bae8038))

## [1.4.8](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.4.7...v1.4.8) (2025-09-08)


### Bug Fixes

* Added error handling for one of the scanning phases ([e05ab75](https://github.com/TheArqsz/JSRecon-Buddy/commit/e05ab7528c044c63da2bd3b3751c79d5ee2546cb))

## [1.4.7](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.4.6...v1.4.7) (2025-09-08)


### Bug Fixes

* Added scan queue to be able to properly scan pages in order ([fa0358f](https://github.com/TheArqsz/JSRecon-Buddy/commit/fa0358fc0513cd1f1b8d1fc537412351de15926c))
* Removed unnecessary logging and fixed global variable assignment ([41f9f6e](https://github.com/TheArqsz/JSRecon-Buddy/commit/41f9f6e283e0dec853a19083373bac36eab8d5dc))

## [1.4.6](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.4.5...v1.4.6) (2025-09-05)


### Bug Fixes

* proper content update on passive scanning ([f84c6eb](https://github.com/TheArqsz/JSRecon-Buddy/commit/f84c6ebdba383f979a330289fbfb41edd00a75d5))

## [1.4.5](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.4.4...v1.4.5) (2025-09-05)


### Bug Fixes

* edited version in manifest.json ([75d5207](https://github.com/TheArqsz/JSRecon-Buddy/commit/75d52074a89778334ff4228e1277eb4a6c5b90c4))
* env -> secrets in release.yml ([a31200b](https://github.com/TheArqsz/JSRecon-Buddy/commit/a31200bba63cedb6b5cd4118ea6bb4988c9ee532))
* Fixed the behaviour of the extension on active tabs and reloads ([dfd76f9](https://github.com/TheArqsz/JSRecon-Buddy/commit/dfd76f95174d2ace6144876b83c26e091ea3e56d))

## [1.4.4](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.4.3...v1.4.4) (2025-09-04)


### Bug Fixes

* Fixed isScannable not being passed ([833d484](https://github.com/TheArqsz/JSRecon-Buddy/commit/833d4841cc9f260c42b06164d6e3aa4f44c78e68))
* Properly changed version in manifest.json ([f77f10f](https://github.com/TheArqsz/JSRecon-Buddy/commit/f77f10fc6f5d84ad6d42b2a2e913bade7daf5e20))

## [1.4.3](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.4.2...v1.4.3) (2025-09-04)


### Bug Fixes

* Cache handling and popup ui ([38fb776](https://github.com/TheArqsz/JSRecon-Buddy/commit/38fb776c6de78061e298f1ac67cde87cb9fcbd4b))
* Properly set version in cache ([66714ba](https://github.com/TheArqsz/JSRecon-Buddy/commit/66714ba740e5cc9cc016e623c015a5a8425afb8c))

## [1.4.2](https://github.com/TheArqsz/JSRecon-Buddy/compare/v1.0.0...v1.4.2) (2025-09-04)


### Features

* added passive scanning and docstrings ([5b3e0af](https://github.com/TheArqsz/JSRecon-Buddy/commit/5b3e0afa60b7b5c611815b9192981f7f81157c6f))
* Added source map deconstruction ([a538159](https://github.com/TheArqsz/JSRecon-Buddy/commit/a538159610b235098a6cb65ce55a73f79b429caf))
* changed version handling to match semver versioning scheme ([a77d42e](https://github.com/TheArqsz/JSRecon-Buddy/commit/a77d42e72671c1f5c9c4cd7421c4770cc6301451))


### Bug Fixes

* Changed color for Live scan status badge ([4294aa4](https://github.com/TheArqsz/JSRecon-Buddy/commit/4294aa4a57fe79ebf08895577172c675711767de))
* Changed some rules in rules.js ([f38682b](https://github.com/TheArqsz/JSRecon-Buddy/commit/f38682bf046d7f2b84340824d56a1f97193d0b84))
* Fixed regex for sourceMaps and changed the fileBrowsing logic ([01ba7e5](https://github.com/TheArqsz/JSRecon-Buddy/commit/01ba7e50de598b734abaa4727664a51f55ceee55))
* Styles in overlay.css are no longer overwriting styles in the analyzed page ([906b6cf](https://github.com/TheArqsz/JSRecon-Buddy/commit/906b6cf381098e3fa7254812a4fdd94ea2afd9f5))
* update manifest.json with new version ([1749a3d](https://github.com/TheArqsz/JSRecon-Buddy/commit/1749a3dcf517eeb79af59d20e5f189a83c1a91ea))
* Updated regex for generic-api-key ([f8d8ca1](https://github.com/TheArqsz/JSRecon-Buddy/commit/f8d8ca160e91f2f984ff40b1c03f207da312915a))

## 1.0.0 (2025-08-29)

