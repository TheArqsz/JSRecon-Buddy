module.exports = {
  testEnvironment: 'jest-environment-jsdom',

  setupFiles: ['jest-webextension-mock'],

  testMatch: ['<rootDir>/tests/**/*.test.js'],
};
