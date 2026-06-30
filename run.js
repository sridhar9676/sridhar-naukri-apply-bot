const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
require('dotenv').config();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handles Naukri's post-apply chatbot/form.
 * Answers questions about experience, notice period, CTC, etc.
 * Handles: contenteditable text inputs, radio buttons, select dropdowns.
 */
async function handleApplyForm(page, config) {
  const { noticePeriod, currentCTC, expectedCTC, experience } = config;

  try {
    let attempts = 0;
    let lastQuestion = '';

    while (attempts++ < 15) {
      await delay(2500);

      // Check completion status
      const status = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        if (text.includes('applied successfully') || text.includes('application submitted') || text.includes('already applied') || text.includes('thank you for applying')) return 'success';
        if (text.includes('not accepted') || text.includes('incomplete information') || text.includes('reapplying')) return 'rejected';
        return 'pending';
      });

      if (status === 'success') return 'success';
      if (status === 'rejected') return 'rejected';

      // Detect form elements
      const state = await page.evaluate(() => {
        // Chatbot text input (contenteditable div)
        let chatInput = null;
        let selector = '';
        const editables = [...document.querySelectorAll('div.textArea[contenteditable="true"], [contenteditable="true"][class*="textArea"], [contenteditable="true"][placeholder*="message"]')].filter(el => el.offsetParent !== null);
        if (editables.length > 0) {
          chatInput = editables[0];
          selector = 'div.textArea[contenteditable="true"]';
        }
        // Fallback: standard inputs (exclude search bar)
        if (!chatInput) {
          const inputs = [...document.querySelectorAll('input[placeholder*="Type message"], input[placeholder*="message here"], textarea[placeholder*="Type message"]')];
          if (inputs.length > 0) { chatInput = inputs[0]; selector = `input[placeholder="${inputs[0].placeholder}"]`; }
        }

        // Question detection
        let question = '';
        for (const el of document.querySelectorAll('p, span, div, label')) {
          const t = el.textContent.trim().toLowerCase();
          if (t.includes('?') && t.length > 15 && t.length < 300 && el.offsetParent !== null) {
            if (t.includes('how many') || t.includes('experience') || t.includes('notice') || t.includes('ctc') || t.includes('salary') || t.includes('willing') || t.includes('years')) {
              question = t;
              break;
            }
          }
        }

        // Save/submit button
        const saveBtn = [...document.querySelectorAll('button')].find(b => {
          const t = b.textContent.trim().toLowerCase();
          return t === 'save' || t === 'submit' || t === 'next' || t === 'continue';
        });

        // Radio buttons (exclude search bar)
        const radios = [...document.querySelectorAll('input[type="radio"]')].filter(r => !(r.className || '').includes('suggestor') && r.name !== 'experienceDD');

        return {
          hasInput: !!chatInput,
          selector,
          question,
          hasSave: !!saveBtn,
          hasRadios: radios.length > 0,
          radioCount: radios.length,
        };
      });

      // Nothing found — exit after retries
      if (!state.hasInput && !state.hasSave && !state.hasRadios) {
        if (attempts >= 3) break;
        continue;
      }

      // Handle radio buttons
      if (!state.hasInput && state.hasRadios) {
        await page.evaluate(() => {
          const radios = [...document.querySelectorAll('input[type="radio"]')].filter(r => !(r.className || '').includes('suggestor') && r.name !== 'experienceDD');
          const labels = radios.map(r => {
            const label = r.closest('label') || r.parentElement;
            return label ? label.textContent.trim().toLowerCase() : '';
          });
          const yesIdx = labels.findIndex(l => l.includes('yes'));
          const target = yesIdx >= 0 ? radios[yesIdx] : radios[radios.length - 1];
          target.click();
          target.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await delay(1000);
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find(b => ['save', 'submit', 'next', 'continue', 'apply'].includes(b.textContent.trim().toLowerCase()));
          if (btn) btn.click();
        });
        await delay(2000);
        continue;
      }

      // Prevent infinite loop on repeating questions
      if (state.question === lastQuestion && attempts > 3) {
        await page.keyboard.press('Enter');
        await delay(2000);
        continue;
      }
      lastQuestion = state.question;

      // Determine answer
      const q = state.question;
      let answer = experience;
      if (q.includes('notice') && !q.includes('experience')) answer = noticePeriod;
      else if (q.includes('current') && (q.includes('ctc') || q.includes('salary'))) answer = currentCTC;
      else if (q.includes('expected') && (q.includes('ctc') || q.includes('salary'))) answer = expectedCTC;
      else if (q.includes('willing') || q.includes('relocate')) answer = 'Yes';

      // Type answer into chatbot input
      if (state.hasInput) {
        try {
          await page.click(state.selector);
          await delay(300);
          await page.keyboard.down('Control');
          await page.keyboard.press('KeyA');
          await page.keyboard.up('Control');
          await page.keyboard.press('Backspace');
          await delay(200);
          await page.keyboard.type(answer, { delay: 50 });
        } catch {
          await page.evaluate((sel, val) => {
            const el = document.querySelector(sel);
            if (el) { el.innerText = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
          }, state.selector, answer);
        }

        await delay(1000);
        const clicked = await page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find(b => ['save', 'submit', 'send'].includes(b.textContent.trim().toLowerCase()));
          if (btn) { btn.click(); return true; }
          return false;
        });
        if (!clicked) await page.keyboard.press('Enter');
        await delay(2000);
      } else if (state.hasSave) {
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim().toLowerCase() === 'save');
          if (btn) btn.click();
        });
        await delay(2000);
      }
    }

    // Final status
    const final = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      if (text.includes('applied successfully') || text.includes('application submitted') || text.includes('already applied')) return 'success';
      if (text.includes('not accepted') || text.includes('incomplete')) return 'rejected';
      return 'unknown';
    });
    return final;
  } catch (err) {
    console.log(`   >> Form error: ${err.message}`);
    return 'error';
  }
}

// ===== MAIN =====
async function runBot() {
  const username = process.env.NAUKRI_USERNAME;
  const password = process.env.NAUKRI_PASSWORD;
  const keywords = process.env.JOB_KEYWORDS;
  const location = process.env.JOB_LOCATION;
  const experience = process.env.JOB_EXPERIENCE || '4';
  const noticePeriod = process.env.NOTICE_PERIOD || '30';
  const currentCTC = process.env.CURRENT_CTC || '16';
  const expectedCTC = process.env.EXPECTED_CTC || '20';
  const jobAge = process.env.JOB_AGE || '3';

  if (!username || !password || !keywords || !location) {
    console.error('Error: Missing required .env variables. See .env.example');
    process.exit(1);
  }

  if (!fs.existsSync('screenshots')) fs.mkdirSync('screenshots');

  console.log(`\n=== Naukri Auto-Apply Bot ===`);
  console.log(`Keywords:       ${keywords}`);
  console.log(`Location:       ${location}`);
  console.log(`Experience:     ${experience} years`);
  console.log(`Posted within:  ${jobAge} days`);
  console.log(`Notice Period:  ${noticePeriod} days`);
  console.log(`Current CTC:    ${currentCTC} LPA`);
  console.log(`Expected CTC:   ${expectedCTC} LPA\n`);

  const browser = await puppeteer.launch({
    headless: process.env.HEADLESS === 'true' ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');

  // Step 1: Login
  console.log('[1/4] Logging in...');
  await page.goto('https://www.naukri.com/', { waitUntil: 'networkidle2', timeout: 60000 });
  await delay(3000);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('a, span, div')].find(e => e.textContent.trim().match(/^Login$/i));
    if (el) el.click();
  });
  await delay(3000);
  await page.type('input[placeholder="Enter your active Email ID / Username"]', username);
  await page.type('input[placeholder="Enter your password"]', password);
  await page.click('button[type="submit"]');
  await delay(10000);
  console.log('   Logged in.\n');

  // Step 2: Search
  console.log('[2/4] Searching jobs...');
  const searchKeyword = keywords.split(',')[0].trim();
  const searchLocation = location.split(',')[0].trim();
  const keywordsSlug = searchKeyword.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const locationSlug = searchLocation.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const searchUrl = `https://www.naukri.com/${keywordsSlug}-jobs-in-${locationSlug}?experience=${experience}&jobAge=${jobAge}`;

  console.log(`   ${searchKeyword} | ${searchLocation} | ${experience} yrs | Last ${jobAge} days`);
  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await delay(5000);
  await page.screenshot({ path: 'screenshots/search-results.png' });

  // Step 3: Extract links
  console.log('[3/4] Extracting job links...');
  const jobLinks = await page.evaluate(() => {
    const links = [];
    document.querySelectorAll('a[href*="/job-listings-"], a[href*="/job/"]').forEach(el => {
      let href = el.getAttribute('href');
      if (!href) return;
      if (!href.startsWith('http')) href = 'https://www.naukri.com' + href;
      if (href.includes('naukri.com') && !links.includes(href)) links.push(href);
    });
    return links;
  });

  console.log(`   Found ${jobLinks.length} jobs.\n`);
  if (jobLinks.length === 0) {
    console.log(`No new jobs posted in the last ${jobAge} days. Check back later.`);
    await browser.close();
    process.exit(0);
  }

  // Build relevance keywords from JOB_KEYWORDS for filtering
  const relevanceTerms = keywords.split(',').map(k => k.trim().toLowerCase());
  function isRelevantJob(title) {
    const t = title.toLowerCase();
    return relevanceTerms.some(term => {
      const words = term.split(/\s+/);
      // Match if at least 2 significant words from any keyword appear in the title
      const matched = words.filter(w => w.length > 2 && t.includes(w));
      return matched.length >= 2;
    });
  }

  // Step 4: Apply
  console.log('[4/4] Applying...\n');
  const report = { applied: [], skippedExternal: [], skippedNoButton: [], skippedIrrelevant: [], failed: [] };

  for (let i = 0; i < jobLinks.length; i++) {
    const jobLink = jobLinks[i];
    try {
      console.log(`   [${i + 1}/${jobLinks.length}] Opening...`);
      await page.goto(jobLink, { waitUntil: 'networkidle2', timeout: 30000 });
      await delay(3000);

      const { jobTitle, company } = await page.evaluate(() => {
        const titleEl = document.querySelector('h1, .jd-header-title');
        const companyEl = document.querySelector('a[href*="/company-jobs"], .jd-header-comp-name a, a[class*="comp-name"], .company-name');
        return {
          jobTitle: titleEl ? titleEl.textContent.trim() : 'Unknown',
          company: companyEl ? companyEl.textContent.trim() : '',
        };
      });

      // Skip irrelevant jobs
      if (!isRelevantJob(jobTitle)) {
        console.log(`   ${jobTitle}${company ? ` (${company})` : ''} → SKIP (not relevant)`);
        report.skippedIrrelevant.push({ title: jobTitle, company, link: jobLink });
        continue;
      }

      // Detect button type
      const btn = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button, a.apply-button, a[class*="apply"]')];
        for (const b of buttons) {
          const t = b.textContent.trim().toLowerCase();
          if (t.includes('apply on company') || t.includes('company site')) return { type: 'external' };
          if (t === 'apply' || t === 'apply now' || t === 'early applicant' || t.includes('i am interested')) return { type: 'apply', index: buttons.indexOf(b) };
        }
        return { type: 'none' };
      });

      if (btn.type === 'external') {
        console.log(`   ${jobTitle}${company ? ` (${company})` : ''} → SKIP (company portal)`);
        report.skippedExternal.push({ title: jobTitle, company, link: jobLink });
        continue;
      }
      if (btn.type !== 'apply') {
        console.log(`   ${jobTitle}${company ? ` (${company})` : ''} → SKIP (no button)`);
        report.skippedNoButton.push({ title: jobTitle, company, link: jobLink });
        continue;
      }

      // Click Apply
      await page.evaluate((idx) => {
        const buttons = [...document.querySelectorAll('button, a.apply-button, a[class*="apply"]')];
        buttons[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        buttons[idx].click();
      }, btn.index);
      await delay(4000);

      // Check if already applied successfully (no chatbot needed)
      const quickStatus = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        if (text.includes('applied successfully') || text.includes('application submitted') || text.includes('already applied') || text.includes('thank you for applying')) return 'success';
        return 'pending';
      });

      let result;
      if (quickStatus === 'success') {
        result = 'success';
      } else {
        result = await handleApplyForm(page, { noticePeriod, currentCTC, expectedCTC, experience });
      }

      if (result === 'success') {
        console.log(`   ${jobTitle}${company ? ` (${company})` : ''} → ✓ APPLIED`);
        report.applied.push({ title: jobTitle, company, link: jobLink });
      } else if (result === 'rejected') {
        console.log(`   ${jobTitle}${company ? ` (${company})` : ''} → ✗ REJECTED`);
        report.failed.push({ title: jobTitle, company, link: jobLink, reason: 'rejected' });
      } else {
        // Check one more time after form handling
        const finalCheck = await page.evaluate(() => {
          const text = document.body.innerText.toLowerCase();
          if (text.includes('applied successfully') || text.includes('application submitted') || text.includes('already applied') || text.includes('thank you for applying')) return 'success';
          return 'unknown';
        });
        if (finalCheck === 'success') {
          console.log(`   ${jobTitle}${company ? ` (${company})` : ''} → ✓ APPLIED`);
          report.applied.push({ title: jobTitle, company, link: jobLink });
        } else {
          console.log(`   ${jobTitle}${company ? ` (${company})` : ''} → ? UNCERTAIN`);
          report.applied.push({ title: jobTitle, company, link: jobLink, note: 'uncertain' });
        }
      }
      await delay(3000);
    } catch (err) {
      console.error(`   ERROR: ${err.message}`);
      report.failed.push({ link: jobLink, error: err.message });
    }
  }

  // Report
  console.log('\n========================================');
  console.log('        APPLICATION REPORT');
  console.log('========================================');
  console.log(`Total Jobs:          ${jobLinks.length}`);
  console.log(`Applied:             ${report.applied.length}`);
  console.log(`Skipped (external):  ${report.skippedExternal.length}`);
  console.log(`Skipped (irrelevant):${report.skippedIrrelevant.length}`);
  console.log(`Failed/Rejected:     ${report.failed.length}`);
  console.log('========================================\n');

  if (report.applied.length === 0 && report.failed.length === 0) {
    console.log('No new jobs to apply! All require company portal or already applied.\n');
  }
  if (report.applied.length > 0) {
    console.log('Applied:');
    report.applied.forEach((j, i) => console.log(`  ${i + 1}. ${j.title}${j.note ? ` (${j.note})` : ''}`));
    console.log('');
  }
  if (report.failed.length > 0) {
    console.log('Failed:');
    report.failed.forEach((j, i) => console.log(`  ${i + 1}. ${j.title || j.link} - ${j.reason || j.error}`));
    console.log('');
  }

  fs.writeFileSync('application-report.json', JSON.stringify(report, null, 2));
  console.log('Report saved: application-report.json\n');
  await browser.close();
  return report;
}

// Run directly if called as main script
if (require.main === module) {
  runBot().catch(err => {
    console.error('Bot crashed:', err.message);
    process.exit(1);
  });
}

module.exports = { runBot };
