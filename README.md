# Naukri Auto-Apply Bot

An intelligent job application bot that automatically searches and applies to relevant jobs on [Naukri.com](https://www.naukri.com). Built with Puppeteer and Node.js — runs locally or on GitHub Actions (even when your laptop is off).

> **5 relevant jobs applied in 9 minutes — zero manual effort.**

## Features

- **Smart Search** — URL-based search with keyword, location, experience & date filters
- **Relevance Filter** — Skips irrelevant jobs using keyword matching + exclusion rules
- **Auto-Apply** — Clicks Apply, handles chatbot forms, radio buttons, dropdowns
- **Chatbot Handler** — Answers experience, notice period, CTC questions automatically
- **Iframe & Popup Support** — Detects forms in iframes and new tabs
- **Daily Scheduler** — Runs on cron schedule (local or GitHub Actions)
- **Email Reports** — HTML email with applied/skipped/failed jobs after each run
- **Stealth Mode** — Uses puppeteer-extra-plugin-stealth to avoid bot detection
- **Cloud Ready** — GitHub Actions workflow runs daily even if your PC is off

## Quick Start

```bash
git clone https://github.com/sridhar9676/sridhar-naukri-apply-bot.git
cd sridhar-naukri-apply-bot
npm install
cp .env.example .env   # Edit with your credentials
npm start              # Run once (opens Chrome, applies to jobs)
```

## Configuration

Edit `.env` with your details:

```env
# Required
NAUKRI_USERNAME=your_naukri_email@example.com
NAUKRI_PASSWORD=your_naukri_password
JOB_KEYWORDS=QA Automation Engineer,SDET,Test Automation Engineer
JOB_LOCATION=Hyderabad,Bengaluru
JOB_EXPERIENCE=4
JOB_AGE=3
NOTICE_PERIOD=30
CURRENT_CTC=16
EXPECTED_CTC=20

# Optional — Email Reports
EMAIL_TO=your_email@gmail.com
EMAIL_FROM=your_email@gmail.com
EMAIL_PASSWORD=your_gmail_app_password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

# Optional — Scheduler
CRON_SCHEDULE=0 9 * * *
```

| Variable | Description | Example |
|----------|-------------|---------|
| `NAUKRI_USERNAME` | Naukri login email | `john@gmail.com` |
| `NAUKRI_PASSWORD` | Naukri password | `mypass123` |
| `JOB_KEYWORDS` | Comma-separated job titles (first used in search URL) | `SDET,QA Engineer` |
| `JOB_LOCATION` | Comma-separated locations (first used in search URL) | `Hyderabad,Bengaluru` |
| `JOB_EXPERIENCE` | Years of experience | `4` |
| `JOB_AGE` | Jobs posted within X days (`1`, `3`, `7`, `15`) | `3` |
| `NOTICE_PERIOD` | Notice period in days | `30` |
| `CURRENT_CTC` | Current CTC in LPA | `16` |
| `EXPECTED_CTC` | Expected CTC in LPA | `20` |
| `EMAIL_TO` | Email to receive reports | `you@gmail.com` |
| `EMAIL_FROM` | Gmail sending the report | `you@gmail.com` |
| `EMAIL_PASSWORD` | Gmail App Password ([generate here](https://myaccount.google.com/apppasswords)) | `abcd efgh ijkl mnop` |
| `CRON_SCHEDULE` | Cron expression for scheduler | `0 9 * * *` (9 AM daily) |

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Run bot once (opens Chrome, applies, exits) |
| `npm run schedule` | Start scheduler (runs immediately + on cron schedule) |
| `node scheduler.js --once` | Run once and exit (used by GitHub Actions) |

## GitHub Actions (Cloud — No Laptop Needed)

The bot runs daily on GitHub servers via `.github/workflows/daily-apply.yml`.

**Setup:**
1. Go to your repo → Settings → Secrets and variables → Actions
2. Add all `.env` variables as repository secrets
3. Go to Actions → "Daily Naukri Auto-Apply" → "Run workflow" to test

Runs automatically at **9:00 AM IST** every day.

## Project Structure

```
sridhar-naukri-apply-bot/
├── run.js                          # Main bot (login → search → filter → apply)
├── scheduler.js                    # Cron scheduler + email report sender
├── package.json                    # Dependencies & scripts
├── .env.example                    # Config template
├── .env                            # Your config (gitignored)
├── .gitignore                      # Ignore rules
├── .github/workflows/
│   └── daily-apply.yml             # GitHub Actions workflow
├── screenshots/                    # Auto-generated screenshots
└── application-report.json         # Auto-generated run report
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't log in | Check `.env` credentials. If CAPTCHA appears, solve manually once |
| No jobs found | Broaden keywords, try different location, increase `JOB_AGE` |
| All "company portal" | Normal — most Naukri jobs redirect externally |
| Email not sending | Verify Gmail App Password (not regular password). Need 2FA enabled |
| GitHub Actions fails | Check secrets are set correctly. Run manually first to debug |

## License

MIT
