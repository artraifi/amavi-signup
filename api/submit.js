// Vercel serverless function — receives signup submissions and emails them
// via Resend. The Resend API key is read from an environment variable so it
// is never exposed to the browser. Set these in Vercel → Settings → Environment
// Variables:
//   RESEND_API_KEY  (required)  your Resend secret, e.g. re_xxxxxxxx
//   RESEND_TO       (optional)  recipient, defaults to hello@amavisocials.co
//   RESEND_FROM     (optional)  verified sender, defaults to
//                               signups@notifications.amavisocials.co

const esc = (v) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]));

const fields = [
  ['First Name', 'firstName'],
  ['Last Name', 'lastName'],
  ['Email', 'email'],
  ['City', 'city'],
  ['Country', 'country'],
  ['Instagram', 'instagram'],
  ['TikTok', 'tiktok'],
  ['YouTube', 'youtube'],
  ['X (Twitter)', 'twitter'],
  ['LinkedIn', 'linkedin'],
  ['Blog / Website', 'blog'],
  ['Other Platform', 'otherPlatform'],
  ['Follower Count', 'followers'],
  ['Engagement Rate', 'engagement'],
  ['Niches', 'niches'],
  ['Open to Gifted', 'gifted'],
  ['Content Types', 'contentTypes'],
  ['Rate: Reel', 'rateReel'],
  ['Rate: Static', 'rateStatic'],
  ['Rate: Story', 'rateStory'],
  ['Rate: UGC', 'rateUGC'],
  ['Rate: Long-form', 'rateLongform'],
  ['Rate: Live', 'rateLive'],
  ['Preferred Currency', 'rateCurrency'],
  ['Rate Notes', 'rateNotes'],
  ['Audience Insights', 'audienceInsights'],
  ['Past Collaborations', 'pastCollabs'],
  ['Media Kit', 'mediaKit'],
  ['Anything Else', 'anythingElse'],
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Email service is not configured.' });
  }

  const data = (typeof req.body === 'string' ? safeParse(req.body) : req.body) || {};

  // Honeypot — pretend success so bots don't retry.
  if (data.website) {
    return res.status(200).json({ result: 'success' });
  }

  if (!data.firstName || !data.email) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const to = process.env.RESEND_TO || 'hello@amavisocials.co';
  const from = process.env.RESEND_FROM || 'AMAVI Signups <signups@notifications.amavisocials.co>';

  const rows = fields
    .filter(([, key]) => data[key] != null && String(data[key]).trim() !== '')
    .map(
      ([label, key]) =>
        `<tr><td style="padding:8px 14px;border-bottom:1px solid #eee;font-weight:600;color:#3219E0;vertical-align:top;white-space:nowrap;">${esc(
          label
        )}</td><td style="padding:8px 14px;border-bottom:1px solid #eee;color:#1a1a1a;">${esc(
          data[key]
        )}</td></tr>`
    )
    .join('');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="color:#1a1a1a;">New AMAVI influencer signup</h2>
      <p style="color:#555;font-size:14px;">${esc(data.firstName)} ${esc(
    data.lastName || ''
  )} just submitted the signup form.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">${rows}</table>
    </div>`;

  // Fire the email and the Google Sheets append in parallel. Each is
  // best-effort: a submission counts as received if *either* destination
  // accepts it, so one outage doesn't lose the lead.
  const [emailResult, sheetResult] = await Promise.allSettled([
    sendEmail({ apiKey, from, to, data, html }),
    appendToSheet(data),
  ]);

  const emailOk = emailResult.status === 'fulfilled';
  // appendToSheet resolves to `true` only when it actually wrote a row;
  // `false` means the sheet isn't configured (so it doesn't count as success).
  const sheetOk = sheetResult.status === 'fulfilled' && sheetResult.value === true;

  if (emailOk || sheetOk) {
    return res.status(200).json({ result: 'success', emailOk, sheetOk });
  }

  return res.status(502).json({
    error: 'Could not record the submission.',
    email: emailResult.reason ? String(emailResult.reason) : null,
    sheet: sheetResult.reason ? String(sheetResult.reason) : null,
  });
}

async function sendEmail({ apiKey, from, to, data, html }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: data.email,
      subject: `New signup — ${data.firstName} ${data.lastName || ''}`.trim(),
      html,
    }),
  });
  if (!resp.ok) throw new Error('Resend ' + resp.status + ': ' + (await resp.text()));
}

// Appends a row to the Google Sheet via a deployed Apps Script web app.
// Set GOOGLE_SCRIPT_URL to the script's /exec URL. No-op if it isn't set,
// so email keeps working until the sheet is wired up.
async function appendToSheet(data) {
  const url = process.env.GOOGLE_SCRIPT_URL;
  if (!url) return false; // sheet not configured — nothing written

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error('Sheet ' + resp.status + ': ' + (await resp.text()));
  return true;
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
