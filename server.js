// ============================================================
// AB SOLAR AGENT v2.0 — server.js
// Features: Claude AI, Lead Capture, Email, WhatsApp (CallMeBot),
// Google Sheets, Session Memory, Anti-Repeat Logic, Follow-up
// ============================================================

require("dotenv").config();

const express    = require("express");
const cors       = require("cors");
const fs         = require("fs");
const path       = require("path");
const { v4: uuidv4 } = require("uuid");
const Anthropic  = require("@anthropic-ai/sdk");
const nodemailer = require("nodemailer");
const axios      = require("axios");

const app  = express();
const PORT = process.env.PORT || 3000;
const LEADS_FILE = path.join(__dirname, "leads.json");

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ── Anthropic Client ──────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY || "" });

// ── Session Store ─────────────────────────────────────────────
const sessions = {};

// Clean sessions older than 3 hours
setInterval(function () {
  var cutoff = Date.now() - 3 * 60 * 60 * 1000;
  Object.keys(sessions).forEach(function (id) {
    if (sessions[id].createdAt < cutoff) delete sessions[id];
  });
}, 30 * 60 * 1000);

// ── Follow-up timers store ────────────────────────────────────
const followUpTimers = {};

// ── Build AI System Prompt ────────────────────────────────────
function buildSystemPrompt(fields) {
  var known = [];
  if (fields.bill_amount)     known.push("Monthly bill: Rs." + fields.bill_amount);
  if (fields.estimated_units) known.push("Monthly units: ~" + fields.estimated_units);
  if (fields.system_size)     known.push("Recommended system: " + fields.system_size + "kW");
  if (fields.location)        known.push("Location: " + fields.location);
  if (fields.property_type)   known.push("Property: " + fields.property_type);
  if (fields.name)            known.push("Customer name: " + fields.name);
  if (fields.phone_number)    known.push("Phone: " + fields.phone_number);

  var knownBlock = known.length > 0
    ? "\n\nALREADY KNOWN — NEVER ASK AGAIN:\n" + known.map(function(k){ return "• " + k; }).join("\n")
    : "";

  var stage = fields.stage || "greeting";
  var closed = !!(fields.name && fields.phone_number);

  return "You are AB SOLAR AGENT — India's most helpful AI solar consultant. You work for AB SOLAR, a trusted solar installation company. You speak like a warm, friendly, knowledgeable human expert — never like a robot.\n\nMISSION: Guide the customer through their solar journey and collect their name + phone number as a qualified lead.\n\nSTAGE: " + stage + "\nLEAD DONE: " + (closed ? "YES — give warm closing message" : "NO — keep guiding naturally") + knownBlock + "\n\n== CONVERSATION STEPS ==\n1. Greet warmly, ask for monthly electricity bill\n2. Analyze bill (Rs.6-8 per unit), estimate units\n3. Recommend solar system size (1kW = 120-150 units/month)\n4. Explain savings (70-90% bill reduction) with real numbers\n5. Ask ONLY what is missing: city OR home/business (one at a time)\n6. Naturally ask: 'May I get your name and phone so our team can send you a custom proposal?'\n7. After name + phone: give warm thank you closing\n\n== STRICT RULES ==\n- NEVER ask about budget — not once\n- NEVER repeat any question already answered\n- NEVER ask two questions in one message\n- Keep replies SHORT — 2 to 4 sentences max\n- Sound human, warm, and genuine\n- Use emojis naturally: ☀️ 💡 ✅ 💰\n- If customer asks anything — answer it first, then continue\n\n== OBJECTION HANDLING ==\n- 'Too expensive' → 'Solar actually pays for itself in 4-5 years, then it is pure savings for 20+ more years. Most customers save Rs.2000-8000 every single month.'\n- 'I rent the property' → 'Many landlords actually love solar as it increases property value. We can also provide portable solutions for renters.'\n- 'Already have solar' → 'Great choice! We can check if your system is optimally sized or help with maintenance and upgrades.'\n- 'Not sure if it works in my area' → 'Solar works across all of India. Even on cloudy days the panels generate 60-70% of normal power.'\n- 'What about maintenance' → 'Solar panels need minimal maintenance — just a wash every 2-3 months. We provide free AMC for the first year.'\n\n== COMPETITOR COMPARISON (if asked) ==\nAB SOLAR offers: Tier-1 panels, 25-year warranty, in-house installation team, post-installation support, govt subsidy assistance, EMI options. We do not outsource installation like many competitors.\n\n== SOLAR CALCULATIONS ==\n- Units per month = Bill amount divided by 7\n- System size in kW = Units divided by 130 (round to nearest 0.5)\n- Monthly savings = 75 to 90 percent of bill\n- Payback period = 4 to 5 years\n- System life = 25 plus years\n\n== CLOSING MESSAGE (only when name AND phone collected) ==\nThank you [Name]! Your details are safely recorded. Our AB SOLAR expert will call you within 24 hours with a personalized solar proposal. You are making one of the smartest financial decisions — solar will save you lakhs over its lifetime. Welcome to the AB SOLAR family! ☀️\n\n== FIELD EXTRACTION ==\nAt the very END of your reply, if you learned NEW information, append exactly this (no spaces, no markdown):\nFIELDS_UPDATE:{\"bill_amount\":\"5000\",\"estimated_units\":\"700\",\"system_size\":\"5\",\"location\":\"Mumbai\",\"property_type\":\"home\",\"name\":\"Rahul\",\"phone_number\":\"9876543210\",\"stage\":\"qualification\"}\n\nOnly include fields that changed. Skip unchanged ones. If nothing new, do not append anything.";
}

// ── Extract field updates ─────────────────────────────────────
function extractFields(text) {
  var match = text.match(/FIELDS_UPDATE:(\{[^\n]+\})/);
  if (!match) return { cleanText: text.trim(), newFields: {} };
  try {
    var newFields = JSON.parse(match[1]);
    var cleanText = text.replace(/\n?FIELDS_UPDATE:\{[^\n]+\}/, "").trim();
    return { cleanText: cleanText, newFields: newFields };
  } catch (e) {
    return { cleanText: text.replace(/FIELDS_UPDATE:.*/, "").trim(), newFields: {} };
  }
}

// ── Smart Suggestions (context-aware, never repeat) ──────────
function buildSuggestions(fields, messageHistory) {
  var stage = fields.stage || "greeting";

  // Closed — no suggestions
  if (stage === "closed" || (fields.name && fields.phone_number)) return [];

  // No bill yet — show bill options
  if (!fields.bill_amount) {
    return ["My bill is Rs.2,000", "My bill is Rs.5,000", "My bill is Rs.10,000"];
  }

  // Have bill but no system recommendation yet
  if (fields.bill_amount && !fields.system_size) {
    return ["How much will I save?", "Is solar worth it?", "How does solar work?"];
  }

  // Have system size but no location
  if (fields.system_size && !fields.location) {
    return ["Mumbai", "Delhi", "Hyderabad", "Bangalore"];
  }

  // Have location but no property type
  if (fields.location && !fields.property_type) {
    return ["It's my home", "It's my business/office", "It's a factory"];
  }

  // Have property type but no name yet — ready for lead capture
  if (fields.property_type && !fields.name) {
    return ["Yes, I'm interested!", "How do I get started?"];
  }

  // Have name but no phone
  if (fields.name && !fields.phone_number) {
    return [];
  }

  return [];
}

// ── Save Lead to File ─────────────────────────────────────────
function saveLead(fields, messages) {
  var leads = [];
  try {
    if (fs.existsSync(LEADS_FILE)) {
      var raw = fs.readFileSync(LEADS_FILE, "utf8");
      leads = JSON.parse(raw);
      if (!Array.isArray(leads)) leads = [];
    }
  } catch (e) { leads = []; }

  var lead = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    name: fields.name || "Unknown",
    phone_number: fields.phone_number || "Unknown",
    bill_amount: fields.bill_amount || null,
    estimated_units: fields.estimated_units || null,
    system_size: fields.system_size ? fields.system_size + "kW" : null,
    location: fields.location || null,
    property_type: fields.property_type || null,
    conversation_summary: messages
      .filter(function(m){ return m.role === "user"; })
      .map(function(m){ return m.content; })
      .slice(-6).join(" | "),
  };

  leads.push(lead);
  try {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), "utf8");
    console.log("✅ Lead saved:", lead.name, lead.phone_number);
  } catch (e) {
    console.error("Lead save error:", e.message);
  }
  return lead;
}

// ── Send Email Notification ───────────────────────────────────
async function sendLeadEmail(lead) {
  var host = process.env.EMAIL_HOST || "smtp.gmail.com";
  var user = process.env.EMAIL_USER;
  var pass = process.env.EMAIL_PASS;
  var to   = process.env.EMAIL_TO || user;

  if (!user || !pass) {
    console.log("📧 Email not configured — skipping.");
    return;
  }

  try {
    var transporter = nodemailer.createTransport({
      host: host,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: { user: user, pass: pass },
    });

    var html = "<!DOCTYPE html><html><body style='font-family:Arial,sans-serif;background:#f4f4f4;padding:20px'>"
      + "<div style='max-width:600px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1)'>"
      + "<div style='background:linear-gradient(135deg,#F59E0B,#EA580C);padding:24px;text-align:center'>"
      + "<h1 style='color:#fff;margin:0;font-size:22px'>☀️ New Solar Lead — AB SOLAR</h1></div>"
      + "<div style='padding:28px'>"
      + "<table style='width:100%;border-collapse:collapse'>"
      + "<tr><td style='padding:10px 0;color:#666;font-weight:bold;width:140px'>Name</td><td style='padding:10px 0;color:#111;font-weight:600'>" + lead.name + "</td></tr>"
      + "<tr style='background:#fafafa'><td style='padding:10px 0;color:#666;font-weight:bold'>Phone</td><td style='padding:10px 0;color:#111;font-weight:600'>" + lead.phone_number + "</td></tr>"
      + "<tr><td style='padding:10px 0;color:#666;font-weight:bold'>Monthly Bill</td><td style='padding:10px 0;color:#111'>Rs." + (lead.bill_amount || "N/A") + "</td></tr>"
      + "<tr style='background:#fafafa'><td style='padding:10px 0;color:#666;font-weight:bold'>Est. Units</td><td style='padding:10px 0;color:#111'>" + (lead.estimated_units || "N/A") + " units/month</td></tr>"
      + "<tr><td style='padding:10px 0;color:#666;font-weight:bold'>System Size</td><td style='padding:10px 0;color:#111'>" + (lead.system_size || "N/A") + "</td></tr>"
      + "<tr style='background:#fafafa'><td style='padding:10px 0;color:#666;font-weight:bold'>Location</td><td style='padding:10px 0;color:#111'>" + (lead.location || "N/A") + "</td></tr>"
      + "<tr><td style='padding:10px 0;color:#666;font-weight:bold'>Property</td><td style='padding:10px 0;color:#111'>" + (lead.property_type || "N/A") + "</td></tr>"
      + "<tr style='background:#fafafa'><td style='padding:10px 0;color:#666;font-weight:bold'>Time</td><td style='padding:10px 0;color:#111'>" + new Date(lead.timestamp).toLocaleString("en-IN") + "</td></tr>"
      + "</table>"
      + (lead.conversation_summary ? "<div style='margin-top:16px;padding:12px;background:#fff8e1;border-left:4px solid #F59E0B;border-radius:4px;font-size:13px;color:#555'><strong>Conversation:</strong><br>" + lead.conversation_summary + "</div>" : "")
      + "</div>"
      + "<div style='background:#111;padding:14px;text-align:center;color:#888;font-size:12px'>AB SOLAR AGENT • Automated Lead Alert</div>"
      + "</div></body></html>";

    await transporter.sendMail({
      from: '"AB SOLAR AGENT" <' + user + ">",
      to: to,
      subject: "☀️ New Lead: " + lead.name + " — " + lead.phone_number,
      html: html,
    });
    console.log("📧 Email sent to", to);
  } catch (e) {
    console.error("📧 Email error (non-fatal):", e.message);
  }
}

// ── Send WhatsApp via CallMeBot ───────────────────────────────
async function sendWhatsApp(lead) {
  var phone  = process.env.WHATSAPP_PHONE;
  var apiKey = process.env.CALLMEBOT_API_KEY;

  if (!phone || !apiKey) {
    console.log("📱 WhatsApp not configured — skipping.");
    return;
  }

  try {
    var msg = "☀️ NEW SOLAR LEAD!\n\n"
      + "Name: " + lead.name + "\n"
      + "Phone: " + lead.phone_number + "\n"
      + "Bill: Rs." + (lead.bill_amount || "N/A") + "/month\n"
      + "System: " + (lead.system_size || "N/A") + "\n"
      + "Location: " + (lead.location || "N/A") + "\n"
      + "Property: " + (lead.property_type || "N/A") + "\n\n"
      + "Call them now! 🚀";

    var encoded = encodeURIComponent(msg);
    var url = "https://api.callmebot.com/whatsapp.php?phone=" + phone + "&text=" + encoded + "&apikey=" + apiKey;
    await axios.get(url, { timeout: 10000 });
    console.log("📱 WhatsApp sent to", phone);
  } catch (e) {
    console.error("📱 WhatsApp error (non-fatal):", e.message);
  }
}

// ── Save to Google Sheets ─────────────────────────────────────
async function saveToGoogleSheets(lead) {
  var sheetId  = process.env.GOOGLE_SHEET_ID;
  var apiKey   = process.env.GOOGLE_SHEETS_API_KEY;

  if (!sheetId || !apiKey) {
    console.log("📊 Google Sheets not configured — skipping.");
    return;
  }

  try {
    // Using simple API key method for append
    var url = "https://sheets.googleapis.com/v4/spreadsheets/" + sheetId + "/values/Sheet1!A1:append?valueInputOption=USER_ENTERED&key=" + apiKey;
    await axios.post(url, {
      values: [[
        new Date(lead.timestamp).toLocaleString("en-IN"),
        lead.name,
        lead.phone_number,
        lead.bill_amount || "",
        lead.system_size || "",
        lead.location || "",
        lead.property_type || "",
        lead.estimated_units || "",
      ]]
    }, { timeout: 10000 });
    console.log("📊 Lead saved to Google Sheets");
  } catch (e) {
    console.error("📊 Sheets error (non-fatal):", e.message);
  }
}

// ── Schedule Follow-up Message ────────────────────────────────
function scheduleFollowUp(sessionId, delayMs) {
  // Clear existing timer
  if (followUpTimers[sessionId]) {
    clearTimeout(followUpTimers[sessionId]);
  }

  followUpTimers[sessionId] = setTimeout(function () {
    var session = sessions[sessionId];
    if (!session) return;
    if (session.leadSaved) return;
    if (!session.fields.bill_amount) return; // Don't follow up before bill collected

    var followUp = "Still thinking about solar savings? ☀️ I'm right here to help — just send a message anytime!";
    session.pendingFollowUp = followUp;
    console.log("⏰ Follow-up queued for session", sessionId);
  }, delayMs || 2 * 60 * 1000); // 2 minutes default
}

// ── API: Create Session ───────────────────────────────────────
app.post("/api/session", function (req, res) {
  var id = uuidv4();
  sessions[id] = {
    createdAt: Date.now(),
    messages: [],
    fields: { stage: "greeting" },
    leadSaved: false,
    pendingFollowUp: null,
  };
  res.json({ sessionId: id });
});

// ── API: Init Chat ────────────────────────────────────────────
app.post("/api/chat/init", async function (req, res) {
  var sessionId = req.body.sessionId;

  if (!sessionId || !sessions[sessionId]) {
    var id = sessionId || uuidv4();
    sessions[id] = {
      createdAt: Date.now(),
      messages: [],
      fields: { stage: "greeting" },
      leadSaved: false,
      pendingFollowUp: null,
    };
    sessionId = id;
  }

  var session = sessions[sessionId];

  try {
    var systemPrompt = buildSystemPrompt(session.fields);
    var response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: "Hello" }],
    });

    var rawReply = response.content[0] && response.content[0].text
      ? response.content[0].text
      : "Hi! I'm AB SOLAR AGENT ☀️\n\nI help you reduce your electricity bill by up to 90% with solar energy.\n\nWhat is your monthly electricity bill amount?";

    var extracted = extractFields(rawReply);
    Object.assign(session.fields, extracted.newFields);
    session.messages.push({ role: "assistant", content: extracted.cleanText });

    res.json({
      sessionId: sessionId,
      reply: extracted.cleanText,
      suggestions: ["My bill is Rs.2,000", "My bill is Rs.5,000", "My bill is Rs.10,000"],
    });
  } catch (err) {
    console.error("Init error:", err.message);
    res.json({
      sessionId: sessionId,
      reply: "Hi! I'm AB SOLAR AGENT ☀️\n\nI help homeowners and businesses across India cut electricity bills by up to 90% with solar.\n\nWhat is your monthly electricity bill amount?",
      suggestions: ["My bill is Rs.2,000", "My bill is Rs.5,000", "My bill is Rs.10,000"],
    });
  }
});

// ── API: Chat ─────────────────────────────────────────────────
app.post("/api/chat", async function (req, res) {
  var sessionId = req.body.sessionId;
  var message   = req.body.message;
  var imageData = req.body.imageData; // base64 image for bill upload

  if (!sessionId || !message || !message.trim()) {
    return res.status(400).json({ error: "sessionId and message required." });
  }

  // Auto-recreate expired sessions
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      createdAt: Date.now(),
      messages: [],
      fields: { stage: "greeting" },
      leadSaved: false,
      pendingFollowUp: null,
    };
  }

  var session = sessions[sessionId];

  // Cancel any pending follow-up since user is active
  if (followUpTimers[sessionId]) clearTimeout(followUpTimers[sessionId]);

  // Build message content (with optional image)
  var userContent;
  if (imageData) {
    userContent = [
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: imageData }
      },
      { type: "text", text: message.trim() + " (This is my electricity bill image)" }
    ];
  } else {
    userContent = message.trim();
  }

  session.messages.push({ role: "user", content: userContent });

  try {
    var systemPrompt = buildSystemPrompt(session.fields);

    // Build messages array (Claude needs string content only for history)
    var historyMessages = session.messages.map(function(m, idx) {
      if (idx === session.messages.length - 1) return m; // Keep last message as-is (may have image)
      return { role: m.role, content: typeof m.content === "string" ? m.content : message.trim() };
    });

    var response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      system: systemPrompt,
      messages: historyMessages,
    });

    var rawReply = response.content[0] && response.content[0].text
      ? response.content[0].text
      : "I didn't catch that. Could you please repeat?";

    var extracted = extractFields(rawReply);
    Object.assign(session.fields, extracted.newFields);

    // Store clean text in history
    session.messages[session.messages.length - 1] = { role: "user", content: message.trim() };
    session.messages.push({ role: "assistant", content: extracted.cleanText });

    // Save lead if complete
    if (session.fields.name && session.fields.phone_number && !session.leadSaved) {
      session.leadSaved    = true;
      session.fields.stage = "closed";
      var lead = saveLead(session.fields, session.messages);

      // Fire all notifications (non-blocking)
      sendLeadEmail(lead);
      sendWhatsApp(lead);
      saveToGoogleSheets(lead);
    }

    // Schedule follow-up if not closed
    if (!session.leadSaved) {
      scheduleFollowUp(sessionId, 2 * 60 * 1000);
    }

    var suggestions = buildSuggestions(session.fields, session.messages);

    // Check if there's a pending follow-up to send
    var followUpMsg = session.pendingFollowUp || null;
    session.pendingFollowUp = null;

    res.json({
      reply: extracted.cleanText,
      suggestions: suggestions,
      leadCaptured: session.leadSaved,
      followUp: followUpMsg,
    });

  } catch (err) {
    console.error("Chat error:", err.message);
    res.json({
      reply: "I had a quick issue. Please send your message again — I'm right here! ☀️",
      suggestions: [],
      leadCaptured: false,
    });
  }
});

// ── API: Check Follow-up (polled by frontend) ─────────────────
app.get("/api/followup/:sessionId", function (req, res) {
  var session = sessions[req.params.sessionId];
  if (!session) return res.json({ followUp: null });
  var msg = session.pendingFollowUp || null;
  session.pendingFollowUp = null;
  res.json({ followUp: msg });
});

// ── API: View Leads Dashboard ─────────────────────────────────
app.get("/dashboard", function (req, res) {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/api/leads", function (req, res) {
  try {
    var raw   = fs.existsSync(LEADS_FILE) ? fs.readFileSync(LEADS_FILE, "utf8") : "[]";
    var leads = JSON.parse(raw);
    res.json({ count: leads.length, leads: leads.reverse() }); // newest first
  } catch (e) {
    res.json({ count: 0, leads: [] });
  }
});

// ── Health Check ──────────────────────────────────────────────
app.get("/health", function (req, res) {
  res.json({
    status: "ok",
    agent: "AB SOLAR AGENT v2.0",
    claude: process.env.CLAUDE_API_KEY ? "configured" : "missing",
    email: process.env.EMAIL_USER ? "configured" : "not set",
    whatsapp: process.env.WHATSAPP_PHONE ? "configured" : "not set",
  });
});

// ── Serve frontend ────────────────────────────────────────────
app.get("*", function (req, res) {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, function () {
  console.log("\n☀️  AB SOLAR AGENT v2.0 running on port " + PORT);
  console.log("🔑 Claude API: " + (process.env.CLAUDE_API_KEY ? "✅" : "❌ MISSING"));
  console.log("📧 Email: " + (process.env.EMAIL_USER ? "✅ " + process.env.EMAIL_USER : "⚠️  Not set"));
  console.log("📱 WhatsApp: " + (process.env.WHATSAPP_PHONE ? "✅ " + process.env.WHATSAPP_PHONE : "⚠️  Not set"));
  console.log("📊 Sheets: " + (process.env.GOOGLE_SHEET_ID ? "✅" : "⚠️  Not set"));
  console.log("📋 Leads: http://localhost:" + PORT + "/dashboard\n");
});
