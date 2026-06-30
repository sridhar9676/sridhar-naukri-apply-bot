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
    let interactedWithForm = false;

    while (attempts++ < 15) {
      await delay(2500);

      // Check completion status (main page + iframes)
      const status = await checkSuccess(page);
      if (status === 'success') return 'success';
      if (status === 'rejected') return 'rejected';

      // Check if a new tab/page opened (popup apply form)
      const pages = await page.browser().pages();
      let activePage = page;
      if (pages.length > 2) {
        // Use the newest non-blank page
        const newPage = pages[pages.length - 1];
        const url = newPage.url();
        if (url && url !== 'about:blank' && url !== page.url()) {
          activePage = newPage;
          await delay(2000);
          const popupStatus = await checkSuccess(activePage);
          if (popupStatus === 'success') {
            await newPage.close().catch(() => {});
            return 'success';
          }
        }
      }

      // Detect form elements (check main page and iframes)
      let state = await detectFormElements(activePage);

      // If nothing on main page, check iframes
      if (!state.hasInput && !state.hasSave && !state.hasRadios && !state.hasSelect) {
        const frames = activePage.frames();
        for (const frame of frames) {
          if (frame === activePage.mainFrame()) continue;
          try {
            state = await detectFormElements(frame);
            if (state.hasInput || state.hasSave || state.hasRadios || state.hasSelect) {
              activePage = frame;
              break;
            }
          } catch { /* frame may be detached */ }
        }
      }

      // Nothing found — exit after retries
      if (!state.hasInput && !state.hasSave && !state.hasRadios && !state.hasSelect) {
        if (attempts >= 3) break;
        continue;
      }

      interactedWithForm = true;

      // Handle select/dropdown
      if (state.hasSelect) {
        await activePage.evaluate(() => {
          const selects = [...document.querySelectorAll('select')].filter(s => s.offsetParent !== null && !s.className.includes('suggestor'));
          for (const sel of selects) {
            const opts = [...sel.options];
            const yesOpt = opts.find(o => o.text.toLowerCase().includes('yes'));
            sel.value = yesOpt ? yesOpt.value : opts[opts.length - 1].value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        await delay(1000);
      }

      // Handle radio buttons
      if (!state.hasInput && state.hasRadios) {
        await activePage.evaluate(() => {
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
        await activePage.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find(b => ['save', 'submit', 'next', 'continue', 'apply'].includes(b.textContent.trim().toLowerCase()));
          if (btn) btn.click();
        });
        await delay(2000);
        continue;
      }

      // Handle checkbox (auto-check all)
      await activePage.evaluate(() => {
        const checks = [...document.querySelectorAll('input[type="checkbox"]')].filter(c => c.offsetParent !== null && !c.checked && !c.className.includes('suggestor'));
        checks.forEach(c => { c.click(); });
      });

      // Prevent infinite loop on repeating questions
      if (state.question === lastQuestion && attempts > 3) {
        // Try pressing Enter or clicking any available button
        await activePage.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find(b => {
            const t = b.textContent.trim().toLowerCase();
            return ['save', 'submit', 'next', 'continue', 'send', 'apply', 'ok', 'done'].includes(t);
          });
          if (btn) btn.click();
        });
        await delay(2000);
        continue;
      }
      lastQuestion = state.question;

      // Determine answer based on question
      const q = state.question;
      let answer = experience;
      if (q.includes('notice') && !q.includes('experience')) answer = noticePeriod;
      else if (q.includes('current') && (q.includes('ctc') || q.includes('salary') || q.includes('package') || q.includes('compensation'))) answer = currentCTC;
      else if (q.includes('expected') && (q.includes('ctc') || q.includes('salary') || q.includes('package') || q.includes('compensation'))) answer = expectedCTC;
      else if (q.includes('willing') || q.includes('relocate') || q.includes('comfortable') || q.includes('ready to join') || q.includes('immediate')) answer = 'Yes';
      else if (q.includes('work from office') || q.includes('wfo') || q.includes('onsite') || q.includes('hybrid')) answer = 'Yes';
      else if (q.includes('location') || q.includes('city') || q.includes('where')) answer = 'Hyderabad';
      else if (q.includes('certif') || q.includes('degree') || q.includes('qualification')) answer = 'Yes';

      // Type answer into chatbot input
      if (state.hasInput) {
        try {
          if (state.isFrame) {
            await activePage.click(state.selector);
          } else {
            await page.click(state.selector);
          }
          await delay(300);
          await page.keyboard.down('Control');
          await page.keyboard.press('KeyA');
          await page.keyboard.up('Control');
          await page.keyboard.press('Backspace');
          await delay(200);
          await page.keyboard.type(answer, { delay: 50 });
        } catch {
          await activePage.evaluate((sel, val) => {
            const el = document.querySelector(sel);
            if (el) { el.innerText = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
          }, state.selector, answer);
        }

        await delay(1000);
        const clicked = await activePage.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find(b => ['save', 'submit', 'send', 'next', 'continue'].includes(b.textContent.trim().toLowerCase()));
          if (btn) { btn.click(); return true; }
          return false;
        });
        if (!clicked) await page.keyboard.press('Enter');
        await delay(2000);
      } else if (state.hasSave) {
        await activePage.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find(b => {
            const t = b.textContent.trim().toLowerCase();
            return ['save', 'submit', 'next', 'continue', 'apply', 'send'].includes(t);
          });
          if (btn) btn.click();
        });
        await delay(2000);
      }
    }

    // Close any extra tabs
    const finalPages = await page.browser().pages();
    for (let i = 2; i < finalPages.length; i++) {
      await finalPages[i].close().catch(() => {});
    }

    // Final status check
    const final = await checkSuccess(page);
    if (final === 'success') return 'success';
    if (final === 'rejected') return 'rejected';

    // If we interacted with the form and weren't rejected, it likely went through
    if (interactedWithForm) return 'likely_applied';
    return 'unknown';
  } catch (err) {
    console.log(`   >> Form error: ${err.message}`);
    return 'error';
  }
}

// Check for success/rejection indicators across page and iframes
async function checkSuccess(pageOrFrame) {
  try {
    const status = await pageOrFrame.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      // Success indicators
      const successPhrases = [
        'applied successfully', 'application submitted', 'already applied',
        'thank you for applying', 'you have applied', 'application sent',
        'your application', 'successfully submitted', 'applied on',
        'resume sent', 'profile shared'
      ];
      if (successPhrases.some(p => text.includes(p))) return 'success';

      // Check for "Applied" button state
      const btns = [...document.querySelectorAll('button, a')];
      if (btns.find(b => b.textContent.trim().toLowerCase() === 'applied')) return 'success';

      // Rejection indicators
      const rejectPhrases = ['not accepted', 'incomplete information', 'reapplying', 'criteria not met', 'not eligible'];
      if (rejectPhrases.some(p => text.includes(p))) return 'rejected';

      return 'pending';
    });
    return status;
  } catch {
    return 'pending';
  }
}

// Detect all form elements on a page or frame
async function detectFormElements(pageOrFrame) {
  try {
    return await pageOrFrame.evaluate(() => {
      // Chatbot text input (contenteditable div)
      let chatInput = null;
      let selector = '';
      const editables = [...document.querySelectorAll('div.textArea[contenteditable="true"], [contenteditable="true"][class*="textArea"], [contenteditable="true"][placeholder*="message"], [contenteditable="true"][placeholder*="type"], [contenteditable="true"][role="textbox"]')].filter(el => el.offsetParent !== null);
      if (editables.length > 0) {
        chatInput = editables[0];
        selector = 'div.textArea[contenteditable="true"]';
      }
      // Fallback: standard inputs
      if (!chatInput) {
        const inputs = [...document.querySelectorAll('input[placeholder*="Type message"], input[placeholder*="message here"], textarea[placeholder*="Type message"], textarea:not([style*="display:none"])')].filter(el => el.offsetParent !== null && !el.className.includes('suggestor'));
        if (inputs.length > 0) { chatInput = inputs[0]; selector = `input[placeholder="${inputs[0].placeholder}"]`; }
      }

      // Question detection — broader matching
      let question = '';
      for (const el of document.querySelectorAll('p, span, div, label, h3, h4')) {
        const t = el.textContent.trim().toLowerCase();
        if (t.length > 10 && t.length < 300 && el.offsetParent !== null) {
          if (t.includes('?') || t.includes('how many') || t.includes('experience') ||
              t.includes('notice') || t.includes('ctc') || t.includes('salary') ||
              t.includes('willing') || t.includes('years') || t.includes('available') ||
              t.includes('relocate') || t.includes('work from') || t.includes('immediate') ||
              t.includes('current') || t.includes('expected') || t.includes('comfortable') ||
              t.includes('certif') || t.includes('location')) {
            question = t;
            break;
          }
        }
      }

      // Save/submit button
      const saveBtn = [...document.querySelectorAll('button')].find(b => {
        const t = b.textContent.trim().toLowerCase();
        return ['save', 'submit', 'next', 'continue', 'send', 'apply', 'ok', 'done'].includes(t);
      });

      // Radio buttons
      const radios = [...document.querySelectorAll('input[type="radio"]')].filter(r => r.offsetParent !== null && !(r.className || '').includes('suggestor') && r.name !== 'experienceDD');

      // Select dropdowns
      const selects = [...document.querySelectorAll('select')].filter(s => s.offsetParent !== null && !s.className.includes('suggestor'));

      return {
        hasInput: !!chatInput,
        selector,
        question,
        hasSave: !!saveBtn,
        hasRadios: radios.length > 0,
        radioCount: radios.length,
        hasSelect: selects.length > 0,
        isFrame: false,
      };
    });
  } catch {
    return { hasInput: false, selector: '', question: '', hasSave: false, hasRadios: false, radioCount: 0, hasSelect: false, isFrame: false };
  }
}

// ===== MAIN =====
async function runBot() {
  const username = process.env.NAUKRI_USERNAME;
  const password = process.env.NAUKRI_PASSWORD;
  const keywords = process.env.JOB_KEYWORDS;
  const location = process.env.JOB_LOCATION;
  const experience = process.env.JOB_EXPERIENCE || '4';
  const noticePeriod = (process.env.NOTICE_PERIOD || '30').replace(/\D/g, '') || '30';
  const currentCTC = process.env.CURRENT_CTC || '16';
  const expectedCTC = process.env.EXPECTED_CTC || '20';
  const jobAge = process.env.JOB_AGE || '3';
  // Daily safety cap so we don't exhaust Naukri's per-day application limit.
  const maxApplications = parseInt(process.env.MAX_APPLICATIONS || '50', 10);

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
  console.log(`Expected CTC:   ${expectedCTC} LPA`);
  console.log(`Max apply/run:  ${maxApplications} jobs\n`);

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

  // Step 2+3: Search across ALL keywords (batched) and merge unique job links.
  // Naukri's search accepts multiple comma-separated keywords via the `k=` param
  // and multiple locations via `l=`, so we batch keywords to minimize searches.
  console.log('[2/4] Searching jobs across all keywords...');
  const allKeywords = keywords.split(',').map(k => k.trim()).filter(Boolean);
  const allLocations = location.split(',').map(l => l.trim()).filter(Boolean);
  const locationSlug = allLocations[0].toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const locationParam = encodeURIComponent(allLocations.join(', '));

  // How many keywords to send per search (Naukri handles several at once).
  const BATCH_SIZE = parseInt(process.env.KEYWORD_BATCH_SIZE || '4', 10);
  const keywordBatches = [];
  for (let b = 0; b < allKeywords.length; b += BATCH_SIZE) {
    keywordBatches.push(allKeywords.slice(b, b + BATCH_SIZE));
  }

  // Dedupe by Naukri job ID (falls back to full URL) so the same job
  // returned by multiple searches is only applied to once.
  const jobMap = new Map();
  const jobKey = (url) => {
    const m = url.match(/(\d{8,})/);
    return m ? m[1] : url;
  };

  // Track exactly which keywords were successfully searched so none are missed.
  const searchedKeywords = new Set();
  const failedKeywords = new Set();

  // Run a single Naukri search for a group of keywords and merge the results.
  async function searchKeywords(group) {
    const slug = group.join(' ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const kParam = encodeURIComponent(group.join(', '));
    const searchUrl = `https://www.naukri.com/${slug}-jobs-in-${locationSlug}?k=${kParam}&l=${locationParam}&experience=${experience}&jobAge=${jobAge}`;
    console.log(`   URL: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await delay(3000);
    const links = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('a[href*="/job-listings-"], a[href*="/job/"]').forEach(el => {
        let href = el.getAttribute('href');
        if (!href) return;
        if (!href.startsWith('http')) href = 'https://www.naukri.com' + href;
        if (href.includes('naukri.com')) out.push(href);
      });
      return out;
    });
    let added = 0;
    for (const l of links) {
      const key = jobKey(l);
      if (!jobMap.has(key)) { jobMap.set(key, l); added++; }
    }
    return { found: links.length, added };
  }

  for (const batch of keywordBatches) {
    try {
      const { found, added } = await searchKeywords(batch);
      batch.forEach(k => searchedKeywords.add(k));
      console.log(`   [${batch.join(', ')}] → ${found} found, +${added} new (total unique: ${jobMap.size})`);
    } catch (e) {
      // A whole batch failed — retry each keyword on its own so we don't drop any.
      console.log(`   [${batch.join(', ')}] → batch failed (${e.message}); retrying individually...`);
      for (const kw of batch) {
        try {
          const { found, added } = await searchKeywords([kw]);
          searchedKeywords.add(kw);
          console.log(`      "${kw}" → ${found} found, +${added} new (total unique: ${jobMap.size})`);
        } catch (e2) {
          failedKeywords.add(kw);
          console.log(`      "${kw}" → FAILED (${e2.message})`);
        }
      }
    }
  }

  // Coverage report — confirm every keyword was actually searched.
  console.log(`\n   Keyword coverage: ${searchedKeywords.size}/${allKeywords.length} searched.`);
  if (failedKeywords.size > 0) {
    console.log(`   ⚠️  Missed keywords (${failedKeywords.size}): ${[...failedKeywords].join(', ')}`);
  } else {
    console.log(`   ✅ All keywords searched — none missed.`);
  }

  const jobLinks = [...jobMap.values()];
  console.log(`\n   Total unique jobs across all keywords: ${jobLinks.length}\n`);
  if (jobLinks.length === 0) {
    console.log(`No new jobs posted in the last ${jobAge} days. Check back later.`);
    await browser.close();
    process.exit(0);
  }

  // Build relevance keywords from JOB_KEYWORDS for filtering
  const relevanceTerms = keywords.split(',').map(k => k.trim().toLowerCase());
  // Core domain words — at least one must appear in the job title
  const domainWords = ['qa', 'test', 'testing', 'sdet', 'quality', 'automation', 'selenium', 'playwright', 'api'];
  // Exclusion words — if any of these appear, skip the job
  const excludeWords = ['sales', 'network support', 'desktop support', 'telecom', 'civil', 'mechanical', 'electrical', 'hardware', 'ups ', 'patch engineer', 'design engineer'];

  function isRelevantJob(title) {
    const t = title.toLowerCase();
    // Exclude clearly irrelevant roles
    if (excludeWords.some(w => t.includes(w))) return false;
    // Keep if it has a domain-specific word (qa/test/sdet/automation/...)
    const hasDomainWord = domainWords.some(w => t.includes(w));
    // ...or if it matches at least one meaningful word from any keyword
    const matchesKeyword = relevanceTerms.some(term =>
      term.split(/\s+/).some(w => w.length > 2 && t.includes(w))
    );
    return hasDomainWord || matchesKeyword;
  }

  // Step 4: Apply
  console.log('[4/4] Applying...\n');
  console.log(`   Daily cap: will stop after ${maxApplications} successful applications.\n`);
  const report = { applied: [], skippedExternal: [], skippedNoButton: [], skippedIrrelevant: [], skippedOld: [], failed: [] };

  const maxJobAgeDays = parseInt(jobAge, 10);
  // Convert Naukri's "Posted: X ago" text into a number of days.
  // Returns null when the text can't be parsed (then we don't skip).
  function parsePostedDays(text) {
    if (!text) return null;
    const t = text.toLowerCase();
    if (t.includes('just now') || t.includes('today') || t.includes('few hour') || t.includes('hour')) return 0;
    const num = parseInt((t.match(/\d+/) || ['0'])[0], 10);
    if (t.includes('day')) return num;
    if (t.includes('week')) return num * 7;
    if (t.includes('month')) return num * 30;
    if (t.includes('year')) return num * 365;
    return null;
  }

  for (let i = 0; i < jobLinks.length; i++) {
    // Stop once we hit the daily application cap.
    if (report.applied.length >= maxApplications) {
      console.log(`\n   Reached daily cap of ${maxApplications} applications — stopping (${jobLinks.length - i} jobs left unprocessed).`);
      break;
    }
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

      // Skip jobs posted more than JOB_AGE days ago (Naukri's URL filter is unreliable)
      const postedText = await page.evaluate(() => {
        const m = document.body.innerText.match(/posted[:\s]+([^|\n\r]+)/i);
        return m ? m[1].trim() : '';
      });
      const postedDays = parsePostedDays(postedText);
      if (postedDays !== null && postedDays > maxJobAgeDays) {
        console.log(`   ${jobTitle}${company ? ` (${company})` : ''} → SKIP (posted ${postedText}, older than ${maxJobAgeDays}d)`);
        report.skippedOld.push({ title: jobTitle, company, link: jobLink, posted: postedText });
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
        // Check if the Apply button changed to "Applied" or disappeared
        const btns = [...document.querySelectorAll('button, a.apply-button, a[class*="apply"]')];
        const appliedBtn = btns.find(b => {
          const t = b.textContent.trim().toLowerCase();
          return t === 'applied' || t === 'already applied';
        });
        if (appliedBtn) return 'success';
        // No "Apply" button remaining = likely applied
        const applyBtn = btns.find(b => {
          const t = b.textContent.trim().toLowerCase();
          return t === 'apply' || t === 'apply now' || t === 'early applicant';
        });
        if (!applyBtn) return 'likely_success';
        return 'pending';
      });

      let result;
      if (quickStatus === 'success' || quickStatus === 'likely_success') {
        result = 'success';
      } else {
        // Wait a bit more and check again (toast notifications)
        await delay(2000);
        const recheck = await page.evaluate(() => {
          const text = document.body.innerText.toLowerCase();
          if (text.includes('applied successfully') || text.includes('application submitted') || text.includes('already applied')) return 'success';
          const btns = [...document.querySelectorAll('button')];
          if (btns.find(b => b.textContent.trim().toLowerCase() === 'applied')) return 'success';
          return 'pending';
        });
        if (recheck === 'success') {
          result = 'success';
        } else {
          result = await handleApplyForm(page, { noticePeriod, currentCTC, expectedCTC, experience });
        }
      }

      if (result === 'success' || result === 'likely_applied') {
        console.log(`   ${jobTitle}${company ? ` (${company})` : ''} → ✓ APPLIED`);
        report.applied.push({ title: jobTitle, company, link: jobLink });
      } else if (result === 'rejected') {
        console.log(`   ${jobTitle}${company ? ` (${company})` : ''} → ✗ REJECTED`);
        report.failed.push({ title: jobTitle, company, link: jobLink, reason: 'rejected' });
      } else {
        // Check one more time after form handling
        const finalCheck = await checkSuccess(page);
        if (finalCheck === 'success') {
          console.log(`   ${jobTitle}${company ? ` (${company})` : ''} → ✓ APPLIED`);
          report.applied.push({ title: jobTitle, company, link: jobLink });
        } else {
          // If we clicked Apply and weren't rejected, it most likely went through
          console.log(`   ${jobTitle}${company ? ` (${company})` : ''} → ✓ APPLIED (assumed)`);
          report.applied.push({ title: jobTitle, company, link: jobLink });
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
  console.log(`Skipped (too old):   ${report.skippedOld.length}`);
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
