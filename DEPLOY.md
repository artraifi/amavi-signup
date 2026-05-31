# Deploying amavisocials.co to Vercel via GitHub

You've got three files in this folder: `index.html`, `vercel.json`, `.gitignore`. That's all Vercel needs.

---

## Step 1 — Put the folder on GitHub

1. Go to https://github.com/new and create a new repository. Name it something like `amavi-signup`. Leave it **Private** if you prefer. Don't tick "Add a README" — keep it empty.
2. On your Mac, open Terminal and run:

   ```bash
   cd ~/Downloads/amavi-signup   # or wherever you saved this folder
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/amavi-signup.git
   git push -u origin main
   ```

   Replace `YOUR-USERNAME` with your GitHub handle. If git asks for credentials, use a Personal Access Token (Settings → Developer settings → Tokens) as the password.

---

## Step 2 — Import the repo into Vercel

1. Go to https://vercel.com/new
2. Click **Import** next to your `amavi-signup` repo. If you don't see it, click **Adjust GitHub App Permissions** and grant Vercel access.
3. On the configuration screen, leave everything at defaults — Framework Preset will say "Other", and that's correct. Click **Deploy**.
4. After ~30 seconds you'll get a live URL like `amavi-signup-xxxx.vercel.app`. Open it to confirm the page renders.

---

## Step 3 — Add amavisocials.co as a custom domain in Vercel

1. In Vercel, open your project → **Settings** → **Domains**.
2. Type `amavisocials.co` and click **Add**.
3. Add `www.amavisocials.co` too — Vercel will offer to redirect www → root (or vice versa). Pick **root** as the primary.
4. Vercel will now show you DNS records to add. They'll look like this:

   - **A record** for `@` → `76.76.21.21`
   - **CNAME record** for `www` → `cname.vercel-dns.com`

   Keep this tab open — you'll need those values in the next step.

---

## Step 4 — Point GoDaddy DNS at Vercel

1. Log in to https://godaddy.com → **My Products** → find `amavisocials.co` → click **DNS**.
2. **Delete or edit** the existing `A` record where Name = `@` (it currently points to a GoDaddy parking page).
3. Add a new **A record**:
   - Type: `A`
   - Name: `@`
   - Value: `76.76.21.21`
   - TTL: `1 Hour` (or default)
4. Find the existing `CNAME` for `www` and edit it (or add one):
   - Type: `CNAME`
   - Name: `www`
   - Value: `cname.vercel-dns.com`
   - TTL: `1 Hour`
5. Save.

DNS usually propagates in 5–30 minutes, occasionally up to a few hours. Vercel polls automatically and will issue an SSL certificate as soon as it sees the records.

---

## Step 5 — Verify

- Refresh the **Domains** page in Vercel. The grey "Invalid Configuration" warnings should turn into green ticks.
- Visit https://amavisocials.co — you should see the signup page with a valid HTTPS padlock.

---

## Email notifications (Resend)

Form submissions are emailed to **hello@amavisocials.co** by the serverless
function at `api/submit.js`, which calls [Resend](https://resend.com). The
Resend API key is **not** in the code — it's an environment variable, so it
stays secret.

### One-time setup

1. In Vercel, open your project → **Settings** → **Environment Variables**.
2. Add:
   - **Name:** `RESEND_API_KEY` — **Value:** your Resend key (`re_...`).
   - *(optional)* `RESEND_TO` — recipient. Defaults to `hello@amavisocials.co`.
   - *(optional)* `RESEND_FROM` — sender. Defaults to
     `AMAVI Signups <signups@notifications.amavisocials.co>` (your verified
     Resend domain), so you usually don't need to set this.
3. **Redeploy** (Deployments → ⋯ → Redeploy) so the new variable takes effect.

### Sender domain

The sender uses **notifications.amavisocials.co**, which is verified in Resend,
so mail to **hello@amavisocials.co** delivers reliably. The local part is
arbitrary — `signups@notifications.amavisocials.co` is just a label. Override it
with `RESEND_FROM` if you want a different from-name or address (it must stay on
the verified `notifications.amavisocials.co` domain).

### Testing locally

`api/submit.js` only runs under the Vercel runtime, so use:

```bash
npm i -g vercel
vercel dev          # then open the printed localhost URL
```

Create a `.env` file (gitignored) with `RESEND_API_KEY=re_...` for local runs.
Opening `index.html` directly as a file will show the form but the submit call
to `/api/submit` won't work — that's expected.

---

## Google Sheet (logging every submission)

Submissions are also appended as a row to this sheet:
https://docs.google.com/spreadsheets/d/1j_PCme8funsC6j__ec9af3rGO0o0qpAupjPD8Yjr2vA/edit

A plain share link can't be written to programmatically — you deploy a small
Apps Script web app *from that sheet*, which gives you an `…/exec` URL that
`api/submit.js` posts to (via the `GOOGLE_SCRIPT_URL` env var). Email and the
sheet are independent: if one fails, the other still records the lead.

### One-time setup

1. Open the sheet and put these headers in **Row 1** (left to right):

   `Timestamp | First Name | Last Name | Email | City | Country | Instagram | TikTok | YouTube | X (Twitter) | LinkedIn | Blog | Other Platform | Followers | Engagement | Niches | Gifted | Content Types | Rate: Reel | Rate: Static | Rate: Story | Rate: UGC | Rate: Long-form | Rate: Live | Currency | Rate Notes | Audience Insights | Past Collabs | Media Kit | Anything Else`

2. **Extensions → Apps Script**. Delete the default code, paste this, and Save:

   ```javascript
   function doPost(e) {
     var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
     var d = JSON.parse(e.postData.contents);
     sheet.appendRow([
       new Date(), d.firstName, d.lastName, d.email, d.city, d.country,
       d.instagram, d.tiktok, d.youtube, d.twitter, d.linkedin, d.blog,
       d.otherPlatform, d.followers, d.engagement, d.niches, d.gifted,
       d.contentTypes, d.rateReel, d.rateStatic, d.rateStory, d.rateUGC,
       d.rateLongform, d.rateLive, d.rateCurrency, d.rateNotes,
       d.audienceInsights, d.pastCollabs, d.mediaKit, d.anythingElse
     ]);
     return ContentService
       .createTextOutput(JSON.stringify({ result: 'success' }))
       .setMimeType(ContentService.MimeType.JSON);
   }
   ```

3. **Deploy → New deployment → Type: Web app.**
   - **Execute as:** Me
   - **Who has access:** Anyone
   - Click **Deploy**, authorize, and copy the **Web app URL** (ends in `/exec`).

4. In Vercel → **Settings → Environment Variables**, add
   `GOOGLE_SCRIPT_URL` = that `/exec` URL, then **redeploy**.

> Apps Script does a 302 redirect on POST. Vercel's runtime follows it
> automatically, so no extra config is needed.

---

## Making changes later

Any time you edit `index.html` and push to GitHub, Vercel auto-deploys within ~20 seconds. From Terminal:

```bash
cd ~/Downloads/amavi-signup
# edit index.html in your editor
git add index.html
git commit -m "Update copy"
git push
```

That's it.

---

## Troubleshooting

- **"Invalid Configuration" stays red after an hour** → double-check the A record value is exactly `76.76.21.21` and there are no duplicate A records on `@`.
- **www doesn't work** → make sure the CNAME value is `cname.vercel-dns.com` with no trailing dot, and that no conflicting A record exists on `www`.
- **GoDaddy won't let you delete the parking A record** → edit it instead and change the value to `76.76.21.21`.
- **SSL not provisioning** → wait 15 more minutes; Vercel retries automatically once DNS is correct.
