# Page Change Tracker (change-on-page)

A standalone Node.js tool that automatically detects content changes on web pages you
monitor, shows **real-time in-browser notifications**, and **sends email alerts to any
addresses you choose**.

Designed for tracking pages that update **in real time** — exam results, capacity/quota
updates, announcements, etc.

---

## Features

- **Automatic tracking**: Re-fetches the page at your chosen interval and compares a **SHA-256 hash**.
- **Change diff**: When the hash changes, it extracts the page text and finds **added / removed** lines.
- **Real-time notifications (SSE)**: The UI updates immediately on a change + audible alert.
- **Email notifications**: Sends mail (with the content diff) to the recipients you define per page.
- **Test button**: Send a test mail with one click to verify your settings.
- **Persistent data**: Watched pages and recipients are stored in `data.json` and **auto-restored** when the server restarts.
- **Dynamic settings**: Change the **check interval** and recipients **after adding** a page.
- **Multi-page**: Monitor unlimited pages, each with its own interval and recipients.

---

## Tech stack

| Package | Purpose |
|---------|---------|
| `express` | Web server and REST API |
| `axios` | HTTP requests to fetch pages |
| `cheerio` | Extracting text from HTML |
| `nodemailer` | Sending mail over SMTP |
| `dotenv` | Reading secrets from a `.env` file |

**SSE (Server-Sent Events)** pushes instant notifications to the browser (no polling).

---

## Requirements

- **Node.js 18+** (tested on v24)
- npm
- (Optional) An SMTP account for mail alerts (Gmail, Yandex, corporate mail, etc.)

---

## Installation

```bash
git clone <repo-url>
cd change-on-page
npm install
```

---

## Configuration (`.env`)

Secrets live in the **`.env`** file. It is listed in `.gitignore` and is **never
committed to git**. To set it up, copy the template:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
# Server port
PORT=3000

# Mail notifications (SMTP credentials - keep PRIVATE)
MAIL_ENABLED=true
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=you@gmail.com
MAIL_PASS=app-password
MAIL_FROM=you@gmail.com

# Optional: fallback recipients for pages without recipients entered
MAIL_TO=
```

### Sending mail with Gmail

A normal Gmail password **will not work**. You need an **App Password**:

1. Go to [myaccount.google.com](https://myaccount.google.com) → **Security**
2. Turn on **2-Step Verification**
3. **App passwords** → [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
4. App: **Mail**, device: **Other** → create it
5. Put the resulting **16-character** code into `MAIL_PASS`

| Provider | MAIL_HOST | MAIL_PORT | MAIL_SECURE |
|----------|-----------|-----------|-------------|
| Gmail | `smtp.gmail.com` | `587` | `false` |
| Gmail (SSL) | `smtp.gmail.com` | `465` | `true` |
| Yandex | `smtp.yandex.com` | `465` | `true` |
| Outlook | `smtp-mail.outlook.com` | `587` | `false` |
| Test (Mailtrap) | `sandbox.smtp.mailtrap.io` | `2525` | `false` |

> **Note:** `MAIL_PASS` lives **only** in `.env`. It is never requested by the UI and
> never returned by any API. Recipient addresses, by contrast, are entered **from the UI**
> and stored in `data.json` — not in `.env`.

---

## Running

```bash
npm start
```

Then open it in a browser:

```
http://localhost:3000
```

The startup status is printed to the console:

```
Server running: http://localhost:3000
Mail alerts active. Recipients are entered in the UI.
```

---

## Usage

1. Fill in the **"+ Add New Page"** form:
   - **Name**: A memorable label (e.g. `TUS 2. Term Results`)
   - **URL**: The address to watch
   - **Interval**: Check frequency (10 sec → 1 hour)
   - **Notification emails**: Recipients for this page (comma-separated; empty means no mail)
2. Click **Start Tracking**.
3. (Optional) Click **📧 Test Mail** to send a test message to the addresses you entered.

### Controls on each card

| Control | Effect |
|---------|--------|
| **Interval dropdown** | Change the check frequency later (10s / 15s / 30s / 1m / 2m / 5m / 30m / 1 hour) |
| **📧 Mail** | Edit this page's recipients |
| **⏸ Pause / ▶ Resume** | Temporarily pause or resume tracking |
| **✕ Delete** | Remove the page and its stored data (also deleted from the data file) |

---

## How it works

1. The page HTML is fetched with `axios`.
2. `cheerio` strips noise (`<script>`, `<style>`, ...) and extracts **text-only** lines.
3. A SHA-256 hash of those lines is compared against the **previous hash**.
4. If the hash changed:
   - The old and new text are **diffed** → added/removed lines are found.
   - A `change` event is pushed over SSE to the UI.
   - A **mail** is sent to the page's recipients (or `MAIL_TO` as fallback).
5. The result is saved to `data.json`.

The **first check runs immediately** when tracking starts; subsequent checks run at the
selected interval.

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/events` | SSE stream (live notifications) |
| `GET` | `/api/monitors` | List all watched pages |
| `POST` | `/api/monitors` | Add a page `{name, url, interval, emails}` |
| `PATCH` | `/api/monitors/:id/toggle` | Pause / resume |
| `DELETE` | `/api/monitors/:id` | Delete a page |
| `PATCH` | `/api/monitors/:id/emails` | Update recipients `{emails}` |
| `PATCH` | `/api/monitors/:id/interval` | Update check interval `{interval}` |
| `GET` | `/api/mail-status` | Whether the mail service is ready |
| `POST` | `/api/test-mail` | Send a test mail `{emails}` |

---

## Project structure

```
change-on-page/
├── server.js            # Server, monitoring engine, API
├── public/
│   └── index.html       # Single-page UI (SSE + control panel)
├── .env                 # Secrets (NEVER COMMITTED)
├── .env.example         # Settings template (safe)
├── data.json            # Watched pages + recipients (NEVER COMMITTED)
├── .gitignore           # Excludes secrets/local files
├── package.json
└── README.md
```

---

## Security

- **`.env`** (SMTP password) and **`data.json`** (emails + data) are in `.gitignore` — they are **never committed or pushed**.
- Secrets are read only server-side and **never sent** to the client (browser).
- The shareable `.env.example` contains only sample values.
- Page content is fetched **read-only**; nothing is ever written back.

You can always verify before pushing:

```bash
git status                 # .env / data.json must not appear
git ls-files | grep -E "\.env$|data\.json$"   # must be empty
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "Mail not configured" | Make sure `.env` has `MAIL_ENABLED=true`, `MAIL_USER`, `MAIL_PASS` |
| "Failed to send mail" | Check host/port/credentials; Gmail requires an **app password** |
| "No recipients" warning | Add recipients via **📧 Mail** on the card |
| Page always shows "error" | The site may be down or blocking; update the User-Agent in `server.js` |
| Port conflict | Set a different `PORT=3000` in `.env` |

---

## License

MIT
