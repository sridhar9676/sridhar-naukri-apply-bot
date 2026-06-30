# Naukri Auto-Apply Bot

Automatically search and apply to jobs on [Naukri.com](https://www.naukri.com) with a single command. Filters by keywords, location, experience, and recency — then applies to eligible jobs hands-free.

## What It Does

1. **Logs in** to your Naukri account
2. **Searches** jobs with your keywords + location + experience + posted date filter
3. **Applies** to jobs that have a direct "Apply" button on Naukri
4. **Skips** jobs that redirect to company portals (can't be automated)
5. **Handles chatbot questions** — fills experience, notice period, CTC automatically
6. **Handles radio/select questions** — selects "Yes" or first option by default
7. **Reports** what was applied, skipped, or failed

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v16+
- Google Chrome installed
- A Naukri.com account

### Setup

```bash
# Clone the repo
git clone https://github.com/sridhar9676/sridhar-naukri-apply-bot.git
cd sridhar-naukri-apply-bot

# Install dependencies
npm install

# Create your config
cp .env.example .env
```

### Configure `.env`

Edit the `.env` file with your details:

```env
NAUKRI_USERNAME=your_naukri_email@example.com
NAUKRI_PASSWORD=your_naukri_password
JOB_KEYWORDS=QA Automation Engineer,SDET,Test Automation Engineer
JOB_LOCATION=Hyderabad,Bengaluru
JOB_EXPERIENCE=4
JOB_AGE=3
NOTICE_PERIOD=30
CURRENT_CTC=16
EXPECTED_CTC=20
```

| Variable | Description | Example |
|----------|-------------|---------|
| `NAUKRI_USERNAME` | Your Naukri email/username | `john@gmail.com` |
| `NAUKRI_PASSWORD` | Your Naukri password | `mypassword` |
| `JOB_KEYWORDS` | Comma-separated job titles to search (first one is used in URL) | `SDET,QA Engineer` |
| `JOB_LOCATION` | Comma-separated locations (first one is used in URL) | `Hyderabad,Bengaluru` |
| `JOB_EXPERIENCE` | Years of experience | `4` |
| `JOB_AGE` | Only jobs posted within X days (`1`, `3`, `7`, `15`) | `3` |
| `NOTICE_PERIOD` | Your notice period in days | `30` |
| `CURRENT_CTC` | Current CTC in LPA | `16` |
| `EXPECTED_CTC` | Expected CTC in LPA | `20` |

### Run (one-time)

```bash
npm start
```

A Chrome window will open and you can watch the bot work. After completion, you'll see a report in the terminal and `application-report.json`.

### Run with Daily Schedule + Email Report

Add email config to your `.env`:

```env
# Email Report
EMAIL_TO=your_email@gmail.com
EMAIL_FROM=your_email@gmail.com
EMAIL_PASSWORD=your_gmail_app_password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

# Schedule (cron expression — default: 9 AM daily)
CRON_SCHEDULE=0 9 * * *
```

Then run:

```bash
npm run schedule
```

The bot will:
1. Run immediately on start
2. Then run again every day at 9 AM (or your custom schedule)
3. Email you the report after each run

**Gmail Setup:** Go to [Google App Passwords](https://myaccount.google.com/apppasswords), generate a password for "Mail", and use that as `EMAIL_PASSWORD` (requires 2FA enabled).

## How the Bot Handles Questions

After clicking "Apply", Naukri sometimes shows a chatbot with pre-screening questions:

| Question Type | Bot's Answer |
|---------------|-------------|
| Experience in [any skill]? | Your `JOB_EXPERIENCE` value (default: 4) |
| Notice period? | Your `NOTICE_PERIOD` value |
| Current CTC/salary? | Your `CURRENT_CTC` value |
| Expected CTC/salary? | Your `EXPECTED_CTC` value |
| Willing to relocate? | Yes |
| Radio buttons (Yes/No) | Selects "Yes" |
| Any other question | Defaults to experience value |

## Project Structure

```
sridhar-naukri-apply-bot/
├── run.js              # Main bot script (login → search → apply)
├── scheduler.js        # Daily scheduler + email reports
├── package.json        # Dependencies and scripts
├── .env.example        # Template for configuration
├── .env                # Your config (not committed)
├── .gitignore          # Ignores node_modules, .env, screenshots
└── screenshots/        # Generated: screenshots during execution
```

## Output

The bot generates:
- **Terminal report** — summary of applied/skipped/failed jobs
- **`application-report.json`** — detailed report with job titles and links
- **`screenshots/`** — screenshots of search results and apply attempts

## Important Notes

- **Personal use only** — designed to save time on repetitive applications
- **Run daily** — use `npm run schedule` or `JOB_AGE=1` to only apply to today's posts
- **Most Naukri jobs redirect** to company portals — the bot correctly skips these
- **Don't run too frequently** — Naukri may rate-limit or flag your account
- **Keep your Naukri profile updated** — the resume on your profile is what gets sent
- **Selectors may break** — if Naukri updates their UI, selectors might need updating

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot can't log in | Check credentials in `.env`. Naukri may have CAPTCHA — solve it manually once |
| No jobs found | Try broader keywords, different location, or increase `JOB_AGE` |
| All jobs are "company portal" | Normal — most Naukri listings redirect to company sites |
| Chatbot questions fail | The bot handles most cases but unusual questions may cause rejection |
| Chrome doesn't open | Make sure Chrome is installed and Puppeteer can find it |

## License

MIT
