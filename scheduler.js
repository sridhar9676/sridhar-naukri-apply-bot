const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { runBot } = require('./run');
require('dotenv').config();

const SCHEDULE = process.env.CRON_SCHEDULE || '0 9 * * *'; // Default: 9 AM daily
const EMAIL_TO = process.env.EMAIL_TO;
const EMAIL_FROM = process.env.EMAIL_FROM;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');

async function sendEmailReport(report) {
  if (!EMAIL_TO || !EMAIL_FROM || !EMAIL_PASSWORD) {
    console.log('Email not configured. Skipping email report.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: EMAIL_FROM, pass: EMAIL_PASSWORD },
  });

  const applied = report.applied || [];
  const skipped = report.skippedExternal || [];
  const failed = report.failed || [];
  const total = applied.length + skipped.length + (report.skippedNoButton || []).length + failed.length;

  const appliedList = applied.length > 0
    ? applied.map((j, i) => `  ${i + 1}. ${j.title}${j.note ? ` (${j.note})` : ''}\n     ${j.link}`).join('\n')
    : '  None';

  const failedList = failed.length > 0
    ? failed.map((j, i) => `  ${i + 1}. ${j.title || j.link} - ${j.reason || j.error}`).join('\n')
    : '  None';

  const date = new Date().toLocaleDateString('en-IN', { dateStyle: 'full' });

  const text = `
Naukri Auto-Apply Report — ${date}
========================================
Total Jobs Found:    ${total}
Applied:             ${applied.length}
Skipped (external):  ${skipped.length}
Failed/Rejected:     ${failed.length}
========================================

Applied Jobs:
${appliedList}

Failed Jobs:
${failedList}

— Naukri Auto-Apply Bot
`;

  const html = `
<h2>Naukri Auto-Apply Report — ${date}</h2>
<table style="border-collapse:collapse;font-family:sans-serif;">
  <tr><td><b>Total Jobs Found</b></td><td>${total}</td></tr>
  <tr><td><b>Applied</b></td><td style="color:green;font-weight:bold;">${applied.length}</td></tr>
  <tr><td><b>Skipped (external)</b></td><td>${skipped.length}</td></tr>
  <tr><td><b>Failed/Rejected</b></td><td style="color:red;">${failed.length}</td></tr>
</table>
${applied.length > 0 ? `
<h3>Applied Jobs:</h3>
<ol>${applied.map(j => `<li><a href="${j.link}">${j.title}</a>${j.note ? ` <em>(${j.note})</em>` : ''}</li>`).join('')}</ol>
` : ''}
${failed.length > 0 ? `
<h3>Failed Jobs:</h3>
<ol>${failed.map(j => `<li>${j.title || j.link} — ${j.reason || j.error}</li>`).join('')}</ol>
` : ''}
<hr><p style="color:gray;font-size:12px;">Sent by Naukri Auto-Apply Bot</p>
`;

  await transporter.sendMail({
    from: `"Naukri Bot" <${EMAIL_FROM}>`,
    to: EMAIL_TO,
    subject: `Naukri Report: ${applied.length} applied, ${failed.length} failed — ${date}`,
    text,
    html,
  });

  console.log(`Email sent to ${EMAIL_TO}`);
}

async function execute() {
  console.log(`\n[${new Date().toLocaleString()}] Scheduled run starting...\n`);
  try {
    const report = await runBot();
    await sendEmailReport(report);
  } catch (err) {
    console.error('Bot run failed:', err.message);
    // Send failure notification if email configured
    if (EMAIL_TO && EMAIL_FROM && EMAIL_PASSWORD) {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: EMAIL_FROM, pass: EMAIL_PASSWORD },
      });
      await transporter.sendMail({
        from: `"Naukri Bot" <${EMAIL_FROM}>`,
        to: EMAIL_TO,
        subject: `Naukri Bot FAILED — ${new Date().toLocaleDateString('en-IN')}`,
        text: `Bot crashed with error:\n\n${err.message}\n\n${err.stack}`,
      }).catch(() => {});
    }
  }
}

// Validate cron expression
if (!cron.validate(SCHEDULE)) {
  console.error(`Invalid CRON_SCHEDULE: "${SCHEDULE}"`);
  process.exit(1);
}

console.log(`Naukri Auto-Apply Bot Scheduler`);
console.log(`Schedule: ${SCHEDULE}`);
console.log(`Email to: ${EMAIL_TO || '(not configured)'}`);
console.log(`Waiting for next scheduled run...\n`);

// Run immediately on first start, then on schedule
execute().then(() => {
  cron.schedule(SCHEDULE, execute);
});
