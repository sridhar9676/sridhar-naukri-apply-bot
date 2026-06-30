# Architecture

## Overview

This bot automates job applications on Naukri.com using browser automation (Puppeteer). It logs into your account, searches for relevant jobs, filters out irrelevant ones, and applies — handling chatbot forms, radio buttons, dropdowns, and iframes automatically.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EXECUTION ENVIRONMENTS                        │
├──────────────────────────────┬──────────────────────────────────────┤
│     LOCAL (Your Laptop)      │     CLOUD (GitHub Actions)           │
│                              │                                      │
│  Windows Task Scheduler      │  Cron: 3:30 AM UTC (9 AM IST)       │
│  → node scheduler.js         │  → xvfb-run node scheduler.js       │
│  → Headed Chrome (visible)   │  → Virtual display (xvfb)           │
│  → Cookies/session persist   │  → Fresh browser each run           │
└──────────────────────────────┴──────────────────────────────────────┘
```

## Application Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  scheduler.js │────▶│    run.js     │────▶│  Email Report    │
│  (entry)      │     │  (bot logic)  │     │  (nodemailer)    │
└──────────────┘     └──────────────┘     └──────────────────┘
       │                     │
       │              ┌──────┴──────┐
       │              ▼             ▼
       │     ┌─────────────┐  ┌─────────────┐
       │     │   Login      │  │   Report    │
       │     │   Search     │  │   JSON file │
       │     │   Filter     │  └─────────────┘
       │     │   Apply      │
       │     │   Handle Form│
       │     └─────────────┘
       │
       ▼
  ┌─────────────┐
  │  node-cron   │ (keeps process alive for scheduled re-runs)
  └─────────────┘
```

## Detailed Execution Flow

```
START
  │
  ▼
┌─────────────────────────────────────┐
│  1. LOAD CONFIG (.env)              │
│     - Credentials                    │
│     - Keywords, Location, Experience │
│     - CTC, Notice Period             │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  2. LAUNCH BROWSER                  │
│     - puppeteer-extra + stealth     │
│     - Headed (local) / xvfb (cloud) │
│     - Anti-detection flags          │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  3. LOGIN TO NAUKRI                 │
│     - Navigate to naukri.com        │
│     - Click Login                    │
│     - Enter email + password         │
│     - Wait for dashboard (10s)       │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  4. SEARCH JOBS                     │
│     - Build URL from config:         │
│       /qa-automation-engineer-jobs   │
│       -in-hyderabad?experience=4     │
│       &jobAge=3                      │
│     - Navigate & wait for results    │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  5. EXTRACT JOB LINKS              │
│     - Query: a[href*="/job-listings"]│
│     - Deduplicate URLs               │
│     - Returns array of job URLs      │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  6. FOR EACH JOB:                   │
│                                      │
│  ┌───────────────────────────────┐  │
│  │ a. Open job page              │  │
│  │ b. Extract title + company    │  │
│  │ c. RELEVANCE CHECK ──────────▶│──┼──▶ SKIP (not relevant)
│  │ d. Detect button type:        │  │
│  │    - "Apply on company" ─────▶│──┼──▶ SKIP (external)
│  │    - "Apply" / "Apply Now" ──▶│  │
│  │    - No button ──────────────▶│──┼──▶ SKIP (no button)
│  │ e. CLICK APPLY                │  │
│  │ f. Check instant success      │  │
│  │ g. Handle chatbot form ───────│──┼──▶ See Form Handler below
│  │ h. Record result              │  │
│  └───────────────────────────────┘  │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  7. GENERATE REPORT                 │
│     - Console summary                │
│     - application-report.json        │
│     - Return report object           │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  8. SEND EMAIL (if configured)      │
│     - HTML formatted report          │
│     - Applied, Skipped, Failed lists │
│     - Via Gmail SMTP                 │
└─────────────────────────────────────┘
```

## Relevance Filter Logic

```
Input: Job Title (e.g., "Sales Engineer - Automation & Instrumentation")

Step 1: EXCLUDE CHECK
  └─ Contains any of: sales, network support, desktop support,
     telecom, civil, mechanical, electrical, hardware, ups,
     patch engineer, design engineer
  └─ If YES → SKIP (not relevant)

Step 2: DOMAIN CHECK
  └─ Must contain at least one of: qa, test, testing, sdet,
     quality, automation, selenium, playwright, api
  └─ If NONE → SKIP (not relevant)

Step 3: KEYWORD MATCH
  └─ Compare against each keyword in JOB_KEYWORDS
  └─ Must match ≥2 words (length > 2 chars) from any keyword
  └─ If NO match → SKIP (not relevant)

All 3 pass → JOB IS RELEVANT → Proceed to apply
```

## Form Handler (handleApplyForm)

```
AFTER CLICKING "APPLY":
  │
  ▼
┌─────────────────────────────────────┐
│  QUICK STATUS CHECK                 │
│  - Text: "applied successfully"?    │
│  - Button changed to "Applied"?     │
│  - Apply button disappeared?        │
│  If YES → return SUCCESS            │
└─────────────────┬───────────────────┘
                  │ (pending)
                  ▼
┌─────────────────────────────────────┐
│  CHATBOT FORM LOOP (max 15 rounds) │
│                                      │
│  Each round:                         │
│  ┌───────────────────────────────┐  │
│  │ 1. Check success/rejection    │  │
│  │ 2. Check for new tabs/popups  │  │
│  │ 3. Detect form elements:      │  │
│  │    - Main page                │  │
│  │    - All iframes              │  │
│  │ 4. Handle what's found:       │  │
│  │    ┌─────────────────────┐    │  │
│  │    │ Radio? → Click "Yes" │    │  │
│  │    │ Select? → Pick "Yes" │    │  │
│  │    │ Checkbox? → Check all│    │  │
│  │    │ Text input?          │    │  │
│  │    │  → Detect question   │    │  │
│  │    │  → Choose answer     │    │  │
│  │    │  → Type + submit     │    │  │
│  │    └─────────────────────┘    │  │
│  │ 5. Click Save/Submit/Next     │  │
│  └───────────────────────────────┘  │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  FINAL STATUS                       │
│  - Success detected → SUCCESS       │
│  - Rejection detected → REJECTED    │
│  - Interacted + no rejection        │
│    → LIKELY APPLIED (counts as ✓)   │
│  - No interaction → APPLIED(assumed)│
└─────────────────────────────────────┘
```

## Question-Answer Mapping

```
┌────────────────────────────────────┬──────────────────┐
│  Question Contains                 │  Answer           │
├────────────────────────────────────┼──────────────────┤
│  "notice" (not "experience")       │  NOTICE_PERIOD    │
│  "current" + "ctc/salary/package"  │  CURRENT_CTC      │
│  "expected" + "ctc/salary/package" │  EXPECTED_CTC     │
│  "willing" / "relocate"            │  "Yes"            │
│  "work from office" / "hybrid"     │  "Yes"            │
│  "location" / "city"               │  "Hyderabad"      │
│  "certif" / "degree"              │  "Yes"            │
│  "immediate" / "ready to join"     │  "Yes"            │
│  Everything else                   │  JOB_EXPERIENCE   │
└────────────────────────────────────┴──────────────────┘
```

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Browser Automation | Puppeteer v22 | Control Chrome programmatically |
| Bot Detection Bypass | puppeteer-extra-plugin-stealth | Avoid Naukri blocking automation |
| Configuration | dotenv | Load .env variables |
| Scheduling | node-cron | Local cron-based scheduling |
| Email | nodemailer | Send HTML reports via Gmail SMTP |
| CI/CD | GitHub Actions | Cloud-based daily execution |
| Virtual Display | xvfb (Linux) | Headed browser on headless server |

## Security Considerations

- **Credentials** — Stored in `.env` (gitignored) or GitHub Secrets (encrypted)
- **App Password** — Uses Gmail App Password, not actual password
- **No data stored** — Bot doesn't store job data beyond the session report
- **Stealth plugin** — Avoids fingerprinting, doesn't spoof identity

## Scheduler Modes

```
┌─────────────────────────────────────────────────────────┐
│  MODE 1: Local Scheduler (npm run schedule)             │
│  - Process stays alive                                   │
│  - Runs on cron (default: 9 AM daily)                   │
│  - Requires: laptop on + logged in                      │
│  - Chrome window visible                                 │
├─────────────────────────────────────────────────────────┤
│  MODE 2: Windows Task Scheduler                         │
│  - Task: "NaukriAutoApply" at 9:00 AM                   │
│  - Launches: node scheduler.js                          │
│  - Requires: laptop on + logged in                      │
├─────────────────────────────────────────────────────────┤
│  MODE 3: GitHub Actions (Recommended)                   │
│  - Cron: 3:30 AM UTC = 9:00 AM IST                     │
│  - Runs on Ubuntu with xvfb                             │
│  - Requires: nothing (cloud server)                     │
│  - Can also be triggered manually                       │
└─────────────────────────────────────────────────────────┘
```

## Email Report Format

```
Subject: "Naukri Report: 5 applied, 0 failed — Tuesday, 1 July 2026"

Body (HTML):
┌─────────────────────────────────────────┐
│  Naukri Auto-Apply Report — [Date]      │
│                                          │
│  Total Jobs Found:    17                 │
│  Applied:             5  (green)         │
│  Skipped (external):  0                  │
│  Skipped (irrelevant):12                 │
│  Failed/Rejected:     0  (red)           │
│                                          │
│  ✅ Applied Jobs:                        │
│    1. QA Automation Engineer — TechCorp  │
│    2. Automation Test Engineer — XYZ Ltd │
│                                          │
│  🚫 Skipped (Not Relevant):             │
│    1. Sales Engineer — ABC Inc           │
│    2. Desktop Support — 365 Admin        │
└─────────────────────────────────────────┘
```
