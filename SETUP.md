# Madi Crasti Photography — booking site setup

The site works straight away in **preview mode** (pretend payments, calendars and emails). These steps switch on the real thing. Budget about an hour; do them in order. Never paste a secret key into a chat, an email, or any file in this repo — the repo is public.

**Your addresses once live**

- Client booking site: `https://madicrasti.github.io/mcphotography/`
- Your admin: `https://madicrasti.github.io/mcphotography/admin/`
- Link from the quiz or anywhere else to one offer: `https://madicrasti.github.io/mcphotography/#/book/headshots` (offer ids: `confidence-mini`, `downtown-edit`, `headshots`, `portfolio`, `combo`)

---

## 1. Put the site on GitHub (10 min)

1. On github.com, create a new **public** repository called `mcphotography` under your `madicrasti` account.
2. Upload **everything inside this folder** (keep the folders as they are, including the hidden `.github` folder and `.nojekyll`). On a Mac, press Cmd + Shift + . in Finder to show hidden files before dragging.
3. Repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
4. After a minute, open `https://madicrasti.github.io/mcphotography/`. You'll see the site in preview mode.

## 2. Create the back office on Supabase (10 min)

1. Sign up at supabase.com (free plan) and create a project called `mcphotography`, region **Sydney**. Save the database password somewhere safe.
2. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key**. Both are safe to publish.
3. In the GitHub repo, edit `config.js` and paste them into `supabaseUrl` and `supabaseAnonKey`. Commit. (The site now tries to talk to the back office, so finish steps 3–5 before sharing the link.)
4. **Authentication → URL Configuration**: set Site URL to `https://madicrasti.github.io/mcphotography/admin/`, and add the same address under Redirect URLs.

## 3. Deploy the back office from GitHub (5 min)

1. Supabase → your avatar → **Account → Access Tokens** → generate a token.
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**, add:
   - `SUPABASE_ACCESS_TOKEN` — the token from step 1
   - `SUPABASE_PROJECT_REF` — the id in your Project URL (`https://THIS-PART.supabase.co`)
   - `SUPABASE_DB_PASSWORD` — your database password
3. GitHub repo → **Actions → Deploy back office → Run workflow**. It goes green in about 2 minutes. It runs again by itself whenever the `supabase` folder changes.

## 4. Add the back-office secrets (15 min)

Supabase → **Edge Functions → Secrets** → add each of these:

| Name | Where it comes from |
| --- | --- |
| `ADMIN_EMAIL` | `madicrasti@gmail.com` — the only email allowed into admin |
| `SITE_URL` | `https://madicrasti.github.io/mcphotography/` |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret key. Start with the **test** key (`sk_test_…`), switch to live after testing |
| `STRIPE_WEBHOOK_SECRET` | See step 4a |
| `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` | See step 4b |

**4a. Stripe webhook.** Stripe → Developers → Webhooks → Add endpoint:
- URL: `https://YOUR-PROJECT-REF.supabase.co/functions/v1/stripe-webhook`
- Event: `checkout.session.completed`
- Copy the **Signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`. Repeat this for live mode when you switch.

**4b. Google (Calendar + Gmail drafts).** At console.cloud.google.com:
1. Create a project called `MC Booking`.
2. **APIs & Services → Library**: enable **Google Calendar API** and **Gmail API**.
3. **OAuth consent screen**: External, app name "Madi Crasti Booking", your email. Add yourself as a test user, then press **Publish app** (In production). Otherwise Google signs you out every 7 days. You'll see an "unverified app" warning when you connect; that's expected for your own account.
4. **Credentials → Create credentials → OAuth client ID** → Web application. Authorised redirect URI: `https://YOUR-PROJECT-REF.supabase.co/functions/v1/google-oauth`
5. Copy the Client ID and Client secret into the two secrets.

## 5. Connect everything from admin (5 min)

1. Open your admin and sign in with the email link (sent to `madicrasti@gmail.com`).
2. Then in Supabase → **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**. Only your existing login keeps working.
3. **Settings → Connections**:
   - **Connect Google**: pick your Gmail account and allow Calendar + Gmail.
   - **Connect iCloud**: at appleid.apple.com → Sign-In and Security → App-Specific Passwords, make one called "MC Booking". Enter your Apple ID email, that password, and the calendar name (`Shoots`, which is created if it doesn't exist).
4. **Settings → Direct deposit details**: replace the placeholder BSB and account number with yours.

## 6. Turn on the hourly jobs (2 min)

Supabase → **Integrations → Cron → Create job**:
- Name `mc-hourly`, schedule `7 * * * *` (every hour at 7 past)
- Type: **Supabase Edge Function** → `cron`, method POST, and add the header `Authorization: Bearer <your service role key>` (Project Settings → API → service_role). Or leave the header off and don't set `CRON_SECRET`. The job is harmless if run extra times.

This expires unpaid holds, drafts each 2nd invoice a week before the shoot, drafts the 48-hour reminder, and marks finished shoots as done.

## 7. Test, then go live

1. With Stripe in **test mode**, book a shoot on the site using card `4242 4242 4242 4242` (any future expiry, any CVC).
2. Check that the booking appears in admin, Google Calendar and iCloud, and that a draft is waiting in Gmail.
3. Reschedule it 4 times from the link in the draft email: the 4th should keep the deposit and ask for a new one. Then cancel it, and approve or change the refund in admin.
4. Swap `STRIPE_SECRET_KEY` for your live key, add the live webhook (4a), and make one real $1 booking. (Edit an offer's price to $1 temporarily, then change it back.)
5. Point the quiz's Book buttons at the new links, and switch off Cal.com.

---

### How emails work

Every client email is written from your templates and put in **Gmail Drafts**. Nothing reaches a client until you press Send. Once you're happy with a template, tick *Send automatically* on it in admin → Emails. Alerts to you (new booking, refund to approve, URGENT late change) are sent straight to your inbox, and the urgent ones are marked high priority.

### Files

- `index.html`: client booking site · `admin/index.html`: your admin
- `assets/core.js`: booking rules (hours, buffers, deposit, reschedule and cancellation policy, email wording)
- `assets/engine.js`: the booking flow, shared by the website preview and the back office
- `supabase/`: database and back-office functions
- `config.js`: the only file you need to edit to go live
