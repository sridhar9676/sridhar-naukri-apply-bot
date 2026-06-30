# Setup Guide — Step by Step

Complete guide to set up the Naukri Auto-Apply Bot from scratch.

---

## Prerequisites

Before starting, make sure you have:

| Requirement | How to check | Install link |
|-------------|-------------|-------------|
| Node.js v16+ | `node --version` | [nodejs.org](https://nodejs.org/) |
| npm | `npm --version` | Comes with Node.js |
| Google Chrome | Open Chrome browser | [google.com/chrome](https://www.google.com/chrome/) |
| Git | `git --version` | [git-scm.com](https://git-scm.com/) |
| Naukri.com account | Can log in at naukri.com | [naukri.com/register](https://www.naukri.com/register) |

---

## Step 1: Clone the Repository

Open a terminal (PowerShell on Windows, Terminal on Mac/Linux):

```bash
git clone https://github.com/sridhar9676/sridhar-naukri-apply-bot.git
cd sridhar-naukri-apply-bot
```

---

## Step 2: Install Dependencies

```bash
npm install
```

This installs:
- `puppeteer` — Chrome browser automation
- `puppeteer-extra` + `puppeteer-extra-plugin-stealth` — Anti-bot-detection
- `dotenv` — Loads config from `.env` file
- `node-cron` — Scheduling
- `nodemailer` — Email sending

---

## Step 3: Create Configuration File

```bash
cp .env.example .env
```

On Windows (PowerShell):
```powershell
Copy-Item .env.example .env
```

---

## Step 4: Edit `.env` with Your Details

Open `.env` in any text editor and fill in:

```env
# === Required ===
NAUKRI_USERNAME=your_naukri_email@example.com
NAUKRI_PASSWORD=your_naukri_password

# === Job Search ===
JOB_KEYWORDS=QA Automation Engineer,SDET,Test Automation Engineer,Selenium Engineer
JOB_LOCATION=Hyderabad,Bengaluru
JOB_EXPERIENCE=4
JOB_AGE=3

# === Chatbot Answers ===
NOTICE_PERIOD=30
CURRENT_CTC=16
EXPECTED_CTC=20
```

### How to choose values:

**JOB_KEYWORDS** — List all job titles you're targeting, separated by commas. The FIRST keyword is used for the search URL. Others are used for relevance filtering.

**JOB_LOCATION** — First location is used in search URL.

**JOB_AGE** — How recent should jobs be:
- `1` = Posted today only
- `3` = Last 3 days (recommended)
- `7` = Last week
- `15` = Last 2 weeks

---

## Step 5: Run the Bot (First Time)

```bash
npm start
```

**What happens:**
1. Chrome opens (you can watch it work)
2. Bot logs into Naukri with your credentials
3. Searches for jobs matching your keywords
4. Filters out irrelevant jobs (Sales, Telecom, etc.)
5. Applies to relevant jobs with direct "Apply" button
6. Handles chatbot questions automatically
7. Prints report in terminal
8. Saves `application-report.json`
9. Chrome closes

**First run notes:**
- If Naukri shows a CAPTCHA, solve it manually. The bot will wait.
- Some jobs may require you to solve them once manually, then the bot can handle them.

---

## Step 6: Set Up Email Reports (Optional)

### 6a. Enable 2-Factor Authentication on Gmail

1. Go to https://myaccount.google.com/security
2. Under "Signing in to Google", enable **2-Step Verification**

### 6b. Generate App Password

1. Go to https://myaccount.google.com/apppasswords
2. Type a name: `naukri-bot`
3. Click **Create**
4. Copy the 16-character password (looks like: `abcd efgh ijkl mnop`)

### 6c. Add Email Config to `.env`

```env
# === Email Report ===
EMAIL_TO=your_email@gmail.com
EMAIL_FROM=your_email@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

### 6d. Test Email

```bash
npm run schedule
```

The bot runs immediately and sends an email report. Check your inbox.

---

## Step 7: Set Up Daily Automation

You have 3 options:

### Option A: GitHub Actions (Recommended — works even when laptop is off)

#### 7a-1. Push code to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git add -A
git commit -m "Initial setup"
git push -u origin master
```

#### 7a-2. Add Secrets

Go to: `https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions`

Add each of these as a **New repository secret**:

| Secret Name | Value |
|---|---|
| `NAUKRI_USERNAME` | Your Naukri email |
| `NAUKRI_PASSWORD` | Your Naukri password |
| `JOB_KEYWORDS` | Your keywords (comma-separated) |
| `JOB_LOCATION` | Your locations |
| `JOB_EXPERIENCE` | e.g., `4` |
| `JOB_AGE` | e.g., `3` |
| `NOTICE_PERIOD` | e.g., `30` |
| `CURRENT_CTC` | e.g., `16` |
| `EXPECTED_CTC` | e.g., `20` |
| `EMAIL_TO` | Your Gmail |
| `EMAIL_FROM` | Your Gmail |
| `EMAIL_PASSWORD` | Your Gmail App Password |

#### 7a-3. Test It

1. Go to: `https://github.com/YOUR_USERNAME/YOUR_REPO/actions`
2. Click **"Daily Naukri Auto-Apply"**
3. Click **"Run workflow"** → **"Run workflow"**
4. Wait ~5-10 minutes
5. Check your email for the report

#### 7a-4. Automatic Schedule

The workflow runs automatically at **9:00 AM IST every day**. No action needed.

---

### Option B: Windows Task Scheduler (Requires laptop to be on)

```powershell
schtasks /create /tn "NaukriAutoApply" /tr "cmd /c cd /d C:\path\to\sridhar-naukri-apply-bot && node scheduler.js" /sc daily /st 09:00 /f
```

Replace `C:\path\to\sridhar-naukri-apply-bot` with your actual project path.

**Manage:**
```powershell
schtasks /query /tn "NaukriAutoApply" /fo LIST   # Check status
schtasks /change /tn "NaukriAutoApply" /st 10:00  # Change time
schtasks /delete /tn "NaukriAutoApply" /f         # Remove
```

---

### Option C: Keep Terminal Running (Simplest)

```bash
npm run schedule
```

Keep the terminal open. Bot runs on schedule (default: 9 AM daily). Stops when terminal is closed.

---

## Step 8: Verify Everything Works

### Checklist:

- [ ] `npm start` runs without errors
- [ ] Bot logs into Naukri successfully
- [ ] Irrelevant jobs are skipped
- [ ] Relevant jobs show "✓ APPLIED"
- [ ] `application-report.json` is created
- [ ] Email report arrives in inbox (if configured)
- [ ] GitHub Actions workflow succeeds (if configured)

---

## Updating

When you modify `.env` or code:

```bash
git add -A
git commit -m "Update config"
git push
```

GitHub Actions will use the new code on the next run. If you changed secrets, update them in GitHub Settings → Secrets.

---

## Uninstall

### Remove Windows Task Scheduler:
```powershell
schtasks /delete /tn "NaukriAutoApply" /f
```

### Remove Gmail App Password:
Go to https://myaccount.google.com/apppasswords and delete it.

### Delete the project:
```bash
cd ..
rm -rf sridhar-naukri-apply-bot
```

---

## FAQ

**Q: Will Naukri block my account?**
A: The bot uses stealth mode and applies at human speed (3-5 second delays between actions). Running once daily is safe.

**Q: Can I apply to multiple locations?**
A: Currently searches the first location in `JOB_LOCATION`. Multiple location support can be added.

**Q: What if a job asks a question the bot doesn't understand?**
A: It defaults to your experience value. If that's wrong, the company might reject — but you won't lose anything.

**Q: How many jobs does it apply to per day?**
A: Depends on your keywords and JOB_AGE. Typically 3-15 new relevant jobs per day.

**Q: Can I see what's happening during GitHub Actions?**
A: Yes — go to Actions → click the run → expand "Run bot with virtual display" to see live logs.
