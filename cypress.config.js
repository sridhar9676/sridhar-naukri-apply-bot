const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      on('before:browser:launch', (browser = {}, launchOptions) => {
        if (browser.family === 'chromium' && browser.name !== 'electron') {
          launchOptions.args.push('--ignore-certificate-errors');
          launchOptions.args.push('--no-sandbox');
          launchOptions.args.push('--disable-setuid-sandbox');
          launchOptions.args.push(
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
          );
        }
        return launchOptions;
      });
    },
    baseUrl: 'https://www.naukri.com',
    specPattern: 'cypress/e2e/**/*.js',
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' https://www.naukri.com",
    },
    retries: {
      runMode: 2,
      openMode: 1,
    },
    chromeWebSecurity: false,
    modifyObstructiveCode: false,
    defaultCommandTimeout: 60000,
    requestTimeout: 60000,
    responseTimeout: 60000,
    env: {
      NO_PROXY: 'www.naukri.com',
    },
  },
});
