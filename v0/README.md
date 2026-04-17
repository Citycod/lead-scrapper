# 🔥 Antigravity Lead Machine

A fully automated system that finds businesses **without websites** in **Abuja & Lagos** every morning — so you wake up to warm leads ready to close.

| Metric | Value |
|--------|-------|
| 💰 Startup cost | ₦0 |
| 📊 Leads/day | 30–60 |
| ⏰ Auto-runs | Daily at 9 AM WAT |
| 🎯 Clients/week | 1–2 |

## ⚡ Stack (100% Free to Start)

| Tool | Purpose |
|------|---------|
| **n8n** (self-hosted) | Automation engine — runs the whole pipeline |
| **Serper API** | The World's Fastest and Cheapest Search API — scrapes Google Maps |
| **Google Sheets** | Lead database with two tabs: Leads + Maintenance Clients |
| **OpenClaw AI** | AI agent on Telegram — answers questions, drafts outreach |
| **Telegram Bot** | Get daily notifications + interact with your AI |

---

## 📋 Quick Setup (30 minutes)

### Step 1: Get Your API Keys

**Serper API:**
1. Go to [serper.dev](https://serper.dev) → Sign up
2. Dashboard → Copy your API key
3. You get free credits to start (more affordable for scaling)

**Telegram Bot:**
1. Open Telegram → Search `@BotFather`
2. Send `/newbot` → Follow prompts → Copy the **bot token**
3. Message your new bot once (so it can send you messages)
4. Search `@userinfobot` → Send any message → Copy your **Chat ID**

### Step 2: Install n8n

Pick one option:

**Option A — Local (recommended for testing):**
```bash
# Requires pnpm installed
pnpm n8n
# Opens at http://localhost:5678
```

**Option B — n8n Cloud:**
Go to [n8n.cloud](https://n8n.cloud) → Free tier available

**Option C — Always-on (Railway):**
Deploy on [Railway.app](https://railway.app) free tier for 24/7 operation

### Step 3: Create Your Google Sheet

1. Create a new Google Sheet named **"Antigravity Leads"**
2. Create **Tab 1** named `Leads` with these exact column headers in row 1:

```
Name | Phone | Address | Niche | Website | Date | Status
```

3. Create **Tab 2** named `Maintenance Clients` with these headers:

```
Name | Phone | Website URL | Plan | Monthly Fee | Start Date | Next Renewal | Status
```

4. Copy the **Sheet ID** from the URL:
```
https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SHEET_ID/edit
```

### Step 4: Connect Google Sheets to n8n

1. In n8n → **Credentials** → Add **Google Sheets OAuth2**
2. Go to [Google Cloud Console](https://console.cloud.google.com):
   - Create a new project
   - Enable the **Google Sheets API**
   - Create **OAuth 2.0 credentials** (Desktop app)
   - Download the credentials JSON
3. Paste the Client ID and Client Secret into n8n
4. Click **Connect** and authorize

> This is a one-time 10-minute setup.

### Step 5: Configure Environment

```bash
# Copy the template
cp .env.example .env

# Edit .env with your real values
# Fill in: SERPER_API_KEY, GOOGLE_SHEET_ID, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```

### Step 6: Import n8n Workflows

**Daily Lead Scan:**
1. Open n8n at `http://localhost:5678`
2. Go to **Workflows** → **Import from File**
3. Select `n8n-workflow.json`
4. Open the **Serper Places API** node → verify the API key expression
5. Open the **Google Sheets** nodes → connect your Google Sheets credential
6. Open the **Telegram** node → add your Telegram Bot credential
7. Click **Activate** (toggle at top right)

**Weekly Stale Cleanup:**
1. Import `n8n-stale-leads.json` the same way
2. Connect the same Google Sheets and Telegram credentials
3. Activate the workflow

### Step 7: Install OpenClaw AI

```powershell
# Windows (PowerShell)
powershell -c "irm https://openclaw.ai/install.ps1 | iex"
```

Then run onboarding:
```bash
openclaw onboard --install-daemon
```

Connect Telegram:
- Follow the [Telegram channel setup](https://docs.openclaw.ai/channels/telegram)
- Link your bot token so OpenClaw can respond on Telegram

### Step 8: Install the Lead Engine Skill

Copy the `skills/` folder to your OpenClaw workspace:

```bash
# The skill is already in the project
# Just point OpenClaw to this workspace, or copy to ~/.openclaw/skills/
cp -r skills/lead-engine ~/.openclaw/skills/lead-engine
```

Verify it's loaded:
```bash
openclaw skills
# Should show "lead-engine" in the list
```

### Step 9: Setup Puppeteer Enrichment

The enrichment server visits business websites and Google Maps to extract phone numbers and emails.

**1. Install Dependencies:**
```bash
pnpm install
```

**2. Setup for Linux (VPS):**
Ensure Chrome dependencies are installed:
```bash
sudo apt-get update
sudo apt-get install -y libgbm-dev wget gnupg
sudo wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
sudo apt-get update
sudo apt-get install -y google-chrome-stable
```

**3. Run the Server:**
```bash
# Windows (local) - Browser will open for debugging
node enrich-server.mjs

# Linux (headless)
node enrich-server.mjs
```

**4. Import Receiver Workflow:**
Import `n8n-receiver-workflow.json` into n8n. This workflow receives enriched data and sends it to Telegram.

---

## 🎯 How It Works

9:00 AM WAT
  → n8n fires the cron trigger
  → Loops through niches/locations
  → Filters businesses & deduplicates
  → Appends new leads to Google Sheets
  → **Enrichment Batch**: Sends leads to Puppeteer server
  → **Puppeteer Scrapes**: Visits websites/Maps (concurrency: 2)
  → **Callback**: Server POSTs results back to n8n Webhook
  → **Telegram**: Receiver workflow sends enriched info
```

### Weekly Cleanup (Automatic — Sundays)
```
8:00 AM WAT
  → n8n reads all leads with Status = "New"
  → Flags anything older than 7 days as "Stale"
  → Updates the sheet
  → Sends Telegram alert with stale count
```

### On-Demand via Telegram (OpenClaw)

Message your Telegram bot anytime:

| Command | What Happens |
|---------|-------------|
| "How many leads today?" | Shows today's lead count + total pipeline |
| "Show me restaurant leads" | Lists top 10 restaurant leads |
| "Draft outreach for [name]" | Generates a WhatsApp/SMS pitch message |
| "Mark [name] as contacted" | Updates lead status in the sheet |
| "Run a scan now" | Triggers the n8n workflow immediately |
| "Add [business] to maintenance" | Tracks them as a maintenance client |
| "Which clients renew this week?" | Shows upcoming maintenance renewals |
| "Draft renewal message for [client]" | Generates a renewal reminder |

---

## 🏷️ Lead Status Flow

```
New → Contacted → Closed (won the client!)
 │                   ↓
 │              Add to Maintenance Clients tab
 │
 └→ Stale (7+ days, auto-flagged)
 └→ Lost (manually marked)
```

---

## 📊 Niches (Default — Customize in the Code node)

| Niche | Why |
|-------|-----|
| Restaurant | Always need online menus + ordering |
| Salon | Bookings, gallery, location map |
| Gym | Class schedules, membership sign-up |
| Hotel | Room booking, photos, reviews |
| Clinic | Appointment booking, services list |
| Bakery | Menu, ordering, delivery info |
| Pharmacy | Product listings, store hours |
| Car Wash | Pricing, booking, location |
| Laundry | Pricing, pickup scheduling |
| Boutique | Product catalog, Instagram integration |

> Edit the `Build Niche × Location Combos` code node in n8n to add/remove niches.

---

## 💰 Cost Breakdown

| Tier | Monthly Cost | Credits | Estimated Leads |
|------|-------------|---------|-----------------|
| **Free/Entry**| $0-$50 | Varies | ~5,000+ |

> Start with the default key or yours. Upgrade Serper only when you're making money.

---

## 🔒 Security

- `.env` file is gitignored — your API keys stay local
- On a VPS/Railway, set environment variables in the platform's dashboard instead
- OpenClaw runs locally — your data stays on your machine
- Google Sheets OAuth tokens are stored in n8n's encrypted credential store

---

## 📁 Project Structure

```
lead generation system/
├── .env.example          # Environment variable template (safe to commit)
├── .gitignore            # Blocks .env from Git
├── n8n-workflow.json           # Main daily lead scan workflow
├── n8n-receiver-workflow.json  # Receiver for enriched results
├── n8n-stale-leads.json        # Weekly stale lead cleanup workflow
├── enrich-server.mjs           # Puppeteer enrichment server
├── package.json                # Dependencies for enrichment
├── README.md                   # This file
└── skills/
    └── lead-engine/
        └── SKILL.md            # OpenClaw AI skill for Telegram
```
