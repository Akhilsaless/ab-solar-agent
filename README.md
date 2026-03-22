# ☀️ AB SOLAR AGENT

A production-ready AI solar sales chatbot powered by **Claude (Anthropic)** and **Node.js/Express**.  
Talks like a real human solar consultant. Captures leads. Sends email notifications.

---

## 🗂 Project Structure

```
ab-solar-agent/
├── server.js          # Express backend + Claude API + lead storage + email
├── package.json       # Dependencies
├── .env.example       # Environment variable template
├── .env               # Your secrets (never commit this!)
├── leads.json         # Auto-created lead storage
├── README.md          # This file
└── public/
    ├── index.html     # Chat UI
    ├── style.css      # Solar-themed dark UI styles
    └── script.js      # Frontend chat logic
```

---

## 🚀 Quick Start

### 1. Install Node.js

Download and install **Node.js 18+** from [nodejs.org](https://nodejs.org/).

Verify:
```bash
node --version   # should be v18 or higher
npm --version
```

---

### 2. Clone / Download the Project

```bash
# If using Git:
git clone https://github.com/yourname/ab-solar-agent.git
cd ab-solar-agent

# Or just unzip the downloaded folder and open a terminal inside it
```

---

### 3. Install Dependencies

```bash
npm install
```

This installs: `express`, `@anthropic-ai/sdk`, `nodemailer`, `uuid`, `dotenv`, `cors`

---

### 4. Add Your Claude API Key

**Step 1:** Copy the environment template:
```bash
cp .env.example .env
```

**Step 2:** Open `.env` in any text editor and add your key:
```env
CLAUDE_API_KEY=sk-ant-your-key-here
PORT=3000
```

Get your API key from: [console.anthropic.com](https://console.anthropic.com/)

---

### 5. Run Locally

```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

Open your browser: **http://localhost:3000**

---

## 📧 Optional: Email Notifications for New Leads

When a customer completes lead capture (name + phone), the server can email you the details.

Add these to your `.env`:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password_here
EMAIL_TO=leads@yourbusiness.com
```

**Gmail App Password setup:**
1. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
2. Enable 2-Factor Authentication
3. Go to **App Passwords** → Select "Mail" → Generate
4. Use the 16-character password as `EMAIL_PASS`

> ⚠️ If email is not configured, the chatbot still works perfectly — email is fully optional.

---

## 📋 View Captured Leads

All leads are saved to `leads.json` automatically.

You can also view them via the API:
```
GET http://localhost:3000/api/leads
```

Each lead includes:
- `name`, `phone_number`
- `bill_amount`, `estimated_units`, `system_size`
- `location`, `property_type`
- `timestamp`, `conversation_summary`

---

## 🌐 Deployment

### Option A: Railway (Easiest — Free Tier Available)

1. Push your code to a GitHub repo
2. Go to [railway.app](https://railway.app/) → New Project → Deploy from GitHub
3. Add environment variables in the Railway dashboard (same as your `.env`)
4. Railway auto-detects `npm start` and deploys
5. Get your shareable URL (e.g. `https://ab-solar-agent.up.railway.app`)

---

### Option B: Render (Free Tier)

1. Push to GitHub
2. Go to [render.com](https://render.com/) → New Web Service
3. Connect repo → Build command: `npm install` → Start command: `node server.js`
4. Add environment variables in the Render dashboard
5. Deploy and share your URL

---

### Option C: VPS / DigitalOcean / EC2

```bash
# On your server:
git clone your-repo
cd ab-solar-agent
npm install
cp .env.example .env
nano .env   # add your API key

# Run with PM2 for persistence:
npm install -g pm2
pm2 start server.js --name ab-solar-agent
pm2 startup
pm2 save

# Optional: set up Nginx reverse proxy for port 80/443
```

---

### Option D: Vercel / Netlify

> Not recommended for this project because it requires a persistent Express server.
> Use Railway or Render instead.

---

## 🧪 Testing the Chatbot

1. Open the chatbot URL in your browser
2. Click **"Start Free Consultation"**
3. Try these test inputs:

| Your message              | Expected bot behavior                     |
|---------------------------|-------------------------------------------|
| `My bill is ₹5000`        | Calculates units, recommends system size  |
| `Tell me about savings`   | Explains 70-90% bill reduction            |
| `I live in Mumbai`        | Saves location, asks property type        |
| `It's my home`            | Asks for name and phone                   |
| `Rahul, 9876543210`       | Saves lead, sends closing message         |

4. Check `leads.json` to confirm the lead was saved
5. If email is configured, check your inbox

---

## 🔧 Configuration Reference

| Variable       | Required | Description                              |
|----------------|----------|------------------------------------------|
| `CLAUDE_API_KEY` | ✅ Yes  | Your Anthropic API key                   |
| `PORT`         | No       | Server port (default: 3000)              |
| `EMAIL_HOST`   | No       | SMTP host (e.g. smtp.gmail.com)          |
| `EMAIL_PORT`   | No       | SMTP port (587 or 465)                   |
| `EMAIL_USER`   | No       | Sender email address                     |
| `EMAIL_PASS`   | No       | Email password or app password           |
| `EMAIL_TO`     | No       | Recipient for lead notifications         |

---

## 🤖 How the AI Works

- The Claude model is prompted with a detailed solar consultant persona
- All conversation history is sent with each request (context window memory)
- The AI extracts and returns structured field updates (bill, name, phone, etc.) in each response
- The server stores these fields per session and injects known fields into the next prompt
- This prevents the AI from ever asking for information it already has
- When name + phone are collected, the lead is saved and email is sent

---

## 🛠 Common Issues

**"Cannot connect to server"**
→ Make sure `npm start` is running and you're visiting `http://localhost:3000`

**"Claude API error"**
→ Check your `CLAUDE_API_KEY` in `.env` — make sure it starts with `sk-ant-`

**Email not sending**
→ For Gmail, make sure you're using an **App Password**, not your regular password
→ Check that 2FA is enabled on your Google account

**leads.json permission error**
→ Make sure the file exists and is writable: `touch leads.json`

---

## 📞 Support

Built by: **AB SOLAR** — India's trusted solar installation partner

For customization, white-labeling, or enterprise deployment, contact your development team.

---

*AB SOLAR AGENT — Because the sun should pay your bills.*
