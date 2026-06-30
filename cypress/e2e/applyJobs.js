const puppeteer = require('puppeteer');
const fs = require('fs');
require('dotenv').config();

// Utility function to introduce delay
function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  // Set a realistic user agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  );

  // Read job URLs from JSON file
  const jobLinksPath = 'cypress/fixtures/internalSiteJobs.json';
  if (!fs.existsSync(jobLinksPath)) {
    console.error('No job links file found. Run fetchJobLinks first.');
    await browser.close();
    process.exit(1);
  }

  const jobLinks = JSON.parse(fs.readFileSync(jobLinksPath));
  console.log(`Found ${jobLinks.length} jobs to apply to.`);

  if (jobLinks.length === 0) {
    console.log('No jobs to apply to. Exiting.');
    await browser.close();
    process.exit(0);
  }

  // Load credentials from environment variables
  const username = process.env.NAUKRI_USERNAME;
  const password = process.env.NAUKRI_PASSWORD;

  if (!username || !password) {
    console.error('NAUKRI_USERNAME and NAUKRI_PASSWORD must be set.');
    await browser.close();
    process.exit(1);
  }

  // Log in to Naukri
  await page.goto('https://www.naukri.com/', { waitUntil: 'networkidle2' });

  // Click login link
  const loginLink = await page.waitForSelector(
    'a[data-ga-track="Main Navigation LogIn"]',
    { timeout: 15000 }
  );
  if (loginLink) {
    await loginLink.click();
  } else {
    // Fallback: try clicking any element with "Login" text
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('a')].find((a) =>
        a.textContent.includes('Login')
      );
      if (el) el.click();
    });
  }

  await delay(2000);

  // Enter credentials
  await page.type(
    'input[placeholder="Enter your active Email ID / Username"]',
    username
  );
  await page.type('input[placeholder="Enter your password"]', password);
  await page.click('button[type="submit"]');

  // Wait for login to complete
  await delay(10000);
  console.log('Logged in successfully.');

  let applied = 0;
  let failed = 0;

  for (const jobLink of jobLinks) {
    try {
      await page.goto(jobLink, { waitUntil: 'networkidle2', timeout: 30000 });
      console.log(`Visited: ${jobLink}`);

      // Wait for and find the apply button using page.evaluate (no :contains pseudo-selector)
      const applyButton = await page.waitForFunction(
        () => {
          const buttons = [...document.querySelectorAll('button')];
          return buttons.find(
            (b) =>
              b.textContent.trim().toLowerCase().includes('apply') &&
              b.offsetParent !== null
          );
        },
        { timeout: 10000 }
      );

      if (applyButton) {
        // Scroll into view
        await page.evaluate((btn) => {
          btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, applyButton);

        await delay(500);

        // Click the apply button
        await applyButton.click();
        console.log(`Applied for job: ${jobLink}`);
        applied++;
      } else {
        console.log(`No apply button found for: ${jobLink}`);
        failed++;
      }

      // Wait between applications to avoid rate limiting
      await delay(3000);
    } catch (error) {
      console.error(`Failed to apply for job: ${jobLink}`, error.message);
      failed++;

      // Capture a screenshot if an error occurs
      await page.screenshot({
        path: `error_screenshot_${Date.now()}.png`,
      });
    }
  }

  console.log(`\nDone. Applied: ${applied}, Failed: ${failed}`);
  await browser.close();
})();
