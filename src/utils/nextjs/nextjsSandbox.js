/**
 * FUTURE: This code is not used until Firefox sandbox is implemented
 *
 * This script runs inside a sandboxed iframe.
 * Its job is to listen for manifest code, safely evaluate it in
 * its isolated context, and post the result back.
 *
window.addEventListener('message', (event) => {
  if (event.source !== window.parent) {
    return;
  }

  const { manifestCode } = event.data;
  if (!manifestCode) {
    return;
  }

  try {
    const manifestData = (function (self) {
      'use strict';
      eval(manifestCode);
      return self.__BUILD_MANIFEST;
    })({});

    if (typeof manifestData !== 'object' || manifestData === null) {
      throw new Error('Manifest code did not produce a valid object.');
    }

    const routes = Object.keys(manifestData);
    const filteredRoutes = routes.filter(route =>
      !route.startsWith('/_') && route !== 'sortedPages' && !route.includes('[...') && !route.includes('[[...')
    );

    window.parent.postMessage({ status: 'success', data: filteredRoutes }, '*');
  } catch (e) {
    window.parent.postMessage({ status: 'error', message: e.message }, '*');
  }
});
 */
