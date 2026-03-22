// ============================================================
// AB SOLAR AGENT - Server
// Express backend with Claude AI, session memory,
// lead capture, and optional email notifications
// ============================================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const Anthropic = require("@anthropic-ai/sdk");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;
const LEADS_FILE = path.join(__dirname, "leads.json");

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Anthropic Client ─────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// ── In-memory session store ──────────────────────────────────
// Each session holds: messages[], and extracted lead fields
const sessions = {};

// Clean up sessions older than 2 hours to prevent memory leaks
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, session] of Object.entries(sessions)) {
    if (session.createdAt < cutoff) delete sessions[id];
  }
}, 30 * 60 * 1000);

// ── System Prompt ────────────────────────────────────────────
function buildSystemPrompt(fields) {
  const known = [];
  if (fields.bill_amount)    known.push(`Monthly electricity bill: ₹${fields.bill_amount}`);
  if (fields.estimated_units) known.push(`Estimated usage: ~${fields.estimated_units} units/month`);
  if (fields.system_size)    known.push(`Recommended solar system: ${fields.system_size}kW`);
  if (fields.location)       known.push(`Location: ${fields.location}`);
  if (fields.property_type)  known.push(`Property type: ${fields.property_type}`);
  if (fields.name)           known.push(`Customer name: ${fields.name}`);
  if (fields.phone_number)   known.push(`Phone number: ${fields.phone_number}`);

  const knownSection = known.length > 0
    ? `\n\nINFORMATION ALREADY COLLECTED — DO NOT ASK FOR THESE AGAIN:\n${known.map(k => `• ${k}`).join("\n")}`
    : "";

  const stage = fields.stage || "greeting";
  const leadCaptured = !!(fields.name && fields.phone_number);

  return `You are AB SOLAR AGENT — a warm, confident, highly professional AI solar consultant representing AB SOLAR, one of India's leading solar installation companies. You speak like a real human solar expert, not a robot or script.

YOUR MISSION: Guide customers through understanding their solar savings potential and convert them into qualified leads by naturally collecting their name and phone number.

CURRENT CONVERSATION STAGE: ${stage}
LEAD CAPTURED: ${leadCaptured ? "YES — CLOSE THE CONVERSATION POSITIVELY" : "NO — CONTINUE GUIDING TOWARD LEAD CAPTURE"}
${knownSection}

═══════════════════════════════════════════
CONVERSATION FLOW (follow this sequence):
═══════════════════════════════════════════

1. GREETING — Welcome warmly, ask for their monthly electricity bill amount
2. BILL ANALYSIS — Estimate units (₹6–₹8 per unit in India), acknowledge their situation
3. SOLAR RECOMMENDATION — Calculate system size (1kW ≈ 120–150 units/month), recommend clearly
4. SAVINGS EXPLANATION — Explain 70–90% bill reduction with realistic rupee savings
5. QUALIFICATION — Ask ONLY what's missing: city/location, home or business property
6. LEAD CAPTURE — Naturally ask: "May I get your name and contact number so our team can assist you personally?"
7. CLOSING — After name + phone: thank them warmly, confirm team will reach out, end positively

═══════════════════════════════════════════
STRICT RULES — NEVER BREAK THESE:
═══════════════════════════════════════════

✗ NEVER ask about budget — not once, not ever
✗ NEVER repeat a question already answered (check known fields above)
✗ NEVER ask multiple questions in one message — one at a time only
✗ NEVER use giant paragraphs — keep messages short (2–4 sentences max)
✗ NEVER be robotic, formal, or script-like
✗ NEVER exaggerate savings beyond realistic ranges

✓ ALWAYS sound like a helpful, knowledgeable human consultant
✓ ALWAYS remember what the user told you earlier
✓ ALWAYS answer customer questions before continuing the flow
✓ ALWAYS move the conversation forward toward lead capture
✓ ALWAYS be slightly warm and enthusiastic about solar benefits

═══════════════════════════════════════════
SOLAR CALCULATION GUIDELINES:
═══════════════════════════════════════════

• Estimate units from bill: ₹3,000 ÷ ₹7/unit ≈ 430 units/month
• System size: units ÷ 130 ≈ kW needed (round to nearest 0.5 or 1)
• Example: 430 units → 3–3.5kW system
• Monthly savings: 70–90% of bill amount (realistic range)
• Payback period: typically 4–6 years in India
• System lifespan: 25+ years

═══════════════════════════════════════════
TONE & STYLE:
═══════════════════════════════════════════

• Conversational, warm, and confident
• Use light emojis naturally (☀️ 💡 ✅) — not excessively
• Short sentences. Clear language. No jargon.
• When giving numbers, be specific but realistic
• Sound like you genuinely care about helping them save money

═══════════════════════════════════════════
CLOSING MESSAGE (use when lead is fully captured):
═══════════════════════════════════════════

"Thank you, [Name]! ✅ Your details have been recorded. Our AB SOLAR team will reach out to you shortly with a customized solar proposal. You're making a smart move — solar pays for itself and keeps giving for 25+ years. We look forward to helping you save big! ☀️"

═══════════════════════════════════════════
FIELD EXTRACTION — IMPORTANT:
═══════════════════════════════════════════

At the END of your response, if you extracted any new information from the user's message, append a JSON block in this EXACT format (no markdown, just raw JSON on its own line):

FIELDS_UPDATE:{"bill_amount":"3000","estimated_units":"430","system_size":"3","location":"Mumbai","property_type":"home","name":"Rahul","phone_number":"9876543210","stage":"lead_capture"}

Only include fields that are NEW or UPDATED. Omit fields that haven't changed. If no new fields, do not append anything.`;
}

// ── Extract fields from AI response ─────────────────────────
function extractFieldsFromResponse(text) {
  const match = text.match(/FIELDS_UPDATE:(\{.*\})/);
  if (!match) return { cleanText: text, newFields: {} };
  try {
    const newFields = JSON.parse(match[1]);
    const cleanText = text.replace(/\nFIELDS_UPDATE:\{.*\}/, "").replace(/FIELDS_UPDATE:\{.*\}/, "").trim();
    return { cleanText, newFields };
  } catch {
    return { cleanText: text.replace(/FIELDS_UPDATE:.*/, "").trim(), newFields: {} };
  }
}

// ── Lead Storage ─────────────────────────────────────────────
function saveLead(fields, conversationHistory) {
  let leads = [];
  try {
    const raw = fs.readFileSync(LEADS_FILE, "utf8");
    leads = JSON.parse(raw);
  } catch {
    leads = [];
  }

  const lead = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    name: fields.name || "Unknown",
    phone_number: fields.phone_number || "Unknown",
    bill_amount: fields.bill_amount || null,
    estimated_units: fields.estimated_units || null,
    system_size: fields.system_size ? `${fields.system_size}kW` : null,
    location: fields.location || null,
    property_type: fields.property_type || null,
    conversation_summary: conversationHistory
      .filter(m => m.role === "user")
      .map(m => m.content)
      .slice(-5)
      .join(" | "),
  };

  leads.push(lead);
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), "utf8");
  console.log(`✅ Lead saved: ${lead.name} — ${lead.phone_number}`);
  return lead;
}

// ── Email Notification ────────────────────────────────────────
async function sendLeadEmail(lead) {
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_TO } = process.env;

  // Gracefully skip if email not configured
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS || !EMAIL_TO) {
    console.log("📧 Email not configured — skipping notification.");
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: parseInt(EMAIL_PORT) || 587,
      secure: parseInt(EMAIL_PORT) === 465,
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #f59e0b, #ea580c); padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">☀️ New Solar Lead — AB SOLAR AGENT</h1>
        </div>
        <div style="padding: 28px; background: #fafafa;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #666; font-weight: bold;">Name</td><td style="padding: 8px 0; color: #111;">${lead.name}</td></tr>
            <tr><td style="padding: 8px 0; color: #666; font-weight: bold;">Phone</td><td style="padding: 8px 0; color: #111;">${lead.phone_number}</td></tr>
            <tr><td style="padding: 8px 0; color: #666; font-weight: bold;">Monthly Bill</td><td style="padding: 8px 0; color: #111;">₹${lead.bill_amount || "Not provided"}</td></tr>
            <tr><td style="padding: 8px 0; color: #666; font-weight: bold;">Estimated Units</td><td style="padding: 8px 0; color: #111;">${lead.estimated_units || "—"} units/month</td></tr>
            <tr><td style="padding: 8px 0; color: #666; font-weight: bold;">Recommended System</td><td style="padding: 8px 0; color: #111;">${lead.system_size || "—"}</td></tr>
            <tr><td style="padding: 8px 0; color: #666; font-weight: bold;">Location</td><td style="padding: 8px 0; color: #111;">${lead.location || "—"}</td></tr>
            <tr><td style="padding: 8px 0; color: #666; font-weight: bold;">Property Type</td><td style="padding: 8px 0; color: #111;">${lead.property_type || "—"}</td></tr>
            <tr><td style="padding: 8px 0; color: #666; font-weight: bold;">Timestamp</td><td style="padding: 8px 0; color: #111;">${new Date(lead.timestamp).toLocaleString("en-IN")}</td></tr>
          </table>
          ${lead.conversation_summary ? `<div style="margin-top: 16px; padding: 12px; background: #fff3cd; border-radius: 8px; font-size: 13px; color: #555;"><strong>Conversation snippets:</strong><br/>${lead.conversation_summary}</div>` : ""}
        </div>
        <div style="background: #111; padding: 16px; text-align: center; color: #888; font-size: 12px;">AB SOLAR AGENT • Automated Lead Notification</div>
      </div>
    `;

    await transporter.sendMail({
      from: `"AB SOLAR AGENT" <${EMAIL_USER}>`,
      to: EMAIL_TO,
      subject: `☀️ New Solar Lead: ${lead.name} — ${lead.phone_number}`,
      html,
    });

    console.log(`📧 Lead email sent to ${EMAIL_TO}`);
  } catch (err) {
    // Never crash the server over email failure
    console.error("📧 Email failed (non-fatal):", err.message);
  }
}

// ── POST /api/session — Create a new chat session ────────────
app.post("/api/session", (req, res) => {
  const sessionId = uuidv4();
  sessions[sessionId] = {
    createdAt: Date.now(),
    messages: [],
    fields: { stage: "greeting" },
    leadSaved: false,
  };
  res.json({ sessionId });
});

// ── POST /api/chat — Main chat endpoint ──────────────────────
app.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message?.trim()) {
    return res.status(400).json({ error: "sessionId and message are required." });
  }

  if (!sessions[sessionId]) {
    return res.status(404).json({ error: "Session not found. Please refresh and start again." });
  }

  const session = sessions[sessionId];

  // Add user message to history
  session.messages.push({ role: "user", content: message.trim() });

  try {
    // Build context-aware system prompt with known fields
    const systemPrompt = buildSystemPrompt(session.fields);

    // Call Claude API
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      system: systemPrompt,
      messages: session.messages,
    });

    const rawReply = response.content[0]?.text || "I'm sorry, I didn't catch that. Could you please repeat?";

    // Extract any field updates from the response
    const { cleanText, newFields } = extractFieldsFromResponse(rawReply);

    // Merge new fields into session
    Object.assign(session.fields, newFields);

    // Add assistant reply to history
    session.messages.push({ role: "assistant", content: cleanText });

    // If lead is now complete (name + phone) and not yet saved
    if (session.fields.name && session.fields.phone_number && !session.leadSaved) {
      session.leadSaved = true;
      session.fields.stage = "closed";

      const lead = saveLead(session.fields, session.messages);
      sendLeadEmail(lead); // Fire-and-forget
    }

    // Determine if we should show quick reply suggestions
    const suggestions = buildSuggestions(session.fields, cleanText);

    res.json({
      reply: cleanText,
      suggestions,
      fields: session.fields, // Optionally expose to frontend for debugging
      leadCaptured: session.leadSaved,
    });

  } catch (err) {
    console.error("Claude API error:", err.message);

    // Friendly fallback
    const fallback = "I'm having a quick connection issue. Please send your message again — I'm right here! ☀️";
    session.messages.push({ role: "assistant", content: fallback });
    res.json({ reply: fallback, suggestions: [], leadCaptured: false });
  }
});

// ── POST /api/chat/init — Get the initial greeting ───────────
app.post("/api/chat/init", async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId || !sessions[sessionId]) {
    return res.status(400).json({ error: "Invalid session." });
  }

  const session = sessions[sessionId];

  try {
    const systemPrompt = buildSystemPrompt(session.fields);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: "Hello" }],
    });

    const rawReply = response.content[0]?.text || "Hi! I'm AB SOLAR AGENT. Tell me your monthly electricity bill and I'll show you how much you can save with solar! ☀️";
    const { cleanText, newFields } = extractFieldsFromResponse(rawReply);

    Object.assign(session.fields, newFields);
    session.messages.push({ role: "assistant", content: cleanText });

    res.json({
      reply: cleanText,
      suggestions: ["Analyze My Bill", "Know My Savings", "Book Free Consultation"],
    });
  } catch (err) {
    console.error("Init error:", err.message);
    res.json({
      reply: "Hi! I'm AB SOLAR AGENT ☀️ — your personal solar consultant. Tell me your monthly electricity bill amount and I'll calculate exactly how much you can save with solar!",
      suggestions: ["Analyze My Bill", "Know My Savings", "Book Free Consultation"],
    });
  }
});

// ── GET /api/leads — View all captured leads (protected) ─────
app.get("/api/leads", (req, res) => {
  try {
    const raw = fs.readFileSync(LEADS_FILE, "utf8");
    const leads = JSON.parse(raw);
    res.json({ count: leads.length, leads });
  } catch {
    res.json({ count: 0, leads: [] });
  }
});

// ── Determine contextual quick-reply suggestions ─────────────
function buildSuggestions(fields, replyText) {
  const text = replyText.toLowerCase();
  const stage = fields.stage || "greeting";

  if (stage === "closed" || (fields.name && fields.phone_number)) return [];

  if (stage === "greeting" || !fields.bill_amount) {
    return ["My bill is ₹2,000", "My bill is ₹5,000", "My bill is ₹10,000"];
  }

  if (fields.bill_amount && !fields.system_size) {
    return ["Tell me the savings", "How does solar work?", "Is solar worth it?"];
  }

  if (fields.system_size && !fields.location) {
    return ["Mumbai", "Delhi", "Bangalore", "Chennai"];
  }

  if (fields.location && !fields.property_type) {
    return ["It's my home", "It's my business/office"];
  }

  if (fields.property_type && !fields.name) {
    return ["Yes, I'm interested!", "Tell me more first"];
  }

  if (text.includes("name") || text.includes("contact") || text.includes("number")) {
    return [];
  }

  return [];
}

// ── Serve frontend for all other routes ──────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n☀️  AB SOLAR AGENT server running on http://localhost:${PORT}`);
  console.log(`📋 Leads dashboard: http://localhost:${PORT}/api/leads`);
  console.log(`🔑 Claude API: ${process.env.CLAUDE_API_KEY ? "✅ Configured" : "❌ Missing — set CLAUDE_API_KEY in .env"}\n`);
});
