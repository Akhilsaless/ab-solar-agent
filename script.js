// ============================================================
// AB SOLAR AGENT — Frontend Script
// Handles session init, message flow, typing indicators,
// suggestion buttons, auto-resize, particles, and more.
// ============================================================

(function () {
  "use strict";

  // ── DOM References ────────────────────────────────────────
  const chatMessages   = document.getElementById("chatMessages");
  const messageInput   = document.getElementById("messageInput");
  const sendBtn        = document.getElementById("sendBtn");
  const suggestionsBar = document.getElementById("suggestionsBar");
  const startChatBtn   = document.getElementById("startChatBtn");
  const welcomeCard    = document.getElementById("welcomeCard");
  const toast          = document.getElementById("toast");

  // ── State ─────────────────────────────────────────────────
  let sessionId       = null;
  let isWaiting       = false;
  let leadCaptured    = false;
  let typingEl        = null;

  // ── Initialize Background Particles ──────────────────────
  function initParticles() {
    const container = document.getElementById("particles");
    if (!container) return;
    const count = window.innerWidth < 768 ? 8 : 18;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      p.style.left = `${Math.random() * 100}%`;
      p.style.width = p.style.height = `${Math.random() * 3 + 2}px`;
      p.style.animationDuration = `${Math.random() * 20 + 15}s`;
      p.style.animationDelay    = `${Math.random() * 20}s`;
      p.style.opacity           = `${Math.random() * 0.5 + 0.1}`;
      container.appendChild(p);
    }
  }

  // ── Session Creation ──────────────────────────────────────
  async function createSession() {
    try {
      const res  = await fetch("/api/session", { method: "POST" });
      const data = await res.json();
      sessionId  = data.sessionId;
      localStorage.setItem("ab_solar_session", sessionId);
    } catch (err) {
      console.error("Session creation failed:", err);
      showToast("Connection error. Please refresh.", "error");
    }
  }

  // ── Initial Greeting from Bot ─────────────────────────────
  async function initChat() {
    // Remove welcome card
    welcomeCard.style.animation = "none";
    welcomeCard.style.opacity   = "0";
    welcomeCard.style.transform = "scale(0.96)";
    welcomeCard.style.transition = "all 0.3s ease";

    setTimeout(() => welcomeCard.remove(), 300);

    // Enable input
    messageInput.disabled = false;
    messageInput.focus();

    // Show typing
    showTyping();

    try {
      const res  = await fetch("/api/chat/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      removeTyping();
      appendBotMessage(data.reply);
      if (data.suggestions?.length) setSuggestions(data.suggestions);
    } catch (err) {
      removeTyping();
      appendBotMessage("Hi! I'm AB SOLAR AGENT ☀️ Tell me your monthly electricity bill and I'll show you how much you can save with solar!");
      setSuggestions(["Analyze My Bill", "Know My Savings", "Book Free Consultation"]);
    }
  }

  // ── Send a User Message ───────────────────────────────────
  async function sendMessage(text) {
    if (!text?.trim() || isWaiting || !sessionId || leadCaptured) return;

    const msg = text.trim();
    setWaiting(true);
    clearSuggestions();

    // Append user bubble immediately
    appendUserMessage(msg);
    messageInput.value = "";
    autoResize();

    // Show typing indicator
    showTyping();

    try {
      const res  = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: msg }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();
      removeTyping();

      // Small natural delay before reply appears (feels more human)
      await sleep(120);
      appendBotMessage(data.reply);

      if (data.suggestions?.length) setSuggestions(data.suggestions);

      if (data.leadCaptured && !leadCaptured) {
        leadCaptured = true;
        handleLeadCaptured();
      }
    } catch (err) {
      removeTyping();
      appendBotMessage("I'm having a momentary issue. Please send your message again — I'm right here! ☀️");
      console.error("Chat error:", err);
    } finally {
      setWaiting(false);
    }
  }

  // ── Handle Lead Captured ──────────────────────────────────
  function handleLeadCaptured() {
    // Disable input after lead is captured
    setTimeout(() => {
      messageInput.disabled = true;
      sendBtn.disabled      = true;
      messageInput.placeholder = "Thank you! Our team will contact you shortly ☀️";
      clearSuggestions();
      showToast("✅ Lead captured successfully!", "success");
    }, 2500);
  }

  // ── Append Bot Message ────────────────────────────────────
  function appendBotMessage(text) {
    const row    = document.createElement("div");
    row.className = "message-row bot";

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = "☀️";

    const col    = document.createElement("div");

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.innerHTML = formatText(text);

    const time   = document.createElement("div");
    time.className = "msg-time";
    time.textContent = getTime();

    col.appendChild(bubble);
    col.appendChild(time);
    row.appendChild(avatar);
    row.appendChild(col);

    chatMessages.appendChild(row);
    scrollToBottom();
  }

  // ── Append User Message ───────────────────────────────────
  function appendUserMessage(text) {
    const row    = document.createElement("div");
    row.className = "message-row user";

    const col    = document.createElement("div");

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = text;

    const time   = document.createElement("div");
    time.className = "msg-time";
    time.textContent = getTime();

    col.appendChild(bubble);
    col.appendChild(time);
    row.appendChild(col);

    chatMessages.appendChild(row);
    scrollToBottom();
  }

  // ── Typing Indicator ──────────────────────────────────────
  function showTyping() {
    if (typingEl) return;
    typingEl = document.createElement("div");
    typingEl.className = "typing-row";
    typingEl.innerHTML = `
      <div class="msg-avatar">☀️</div>
      <div class="typing-bubble">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    `;
    chatMessages.appendChild(typingEl);
    scrollToBottom();
  }

  function removeTyping() {
    if (typingEl) {
      typingEl.remove();
      typingEl = null;
    }
  }

  // ── Quick Suggestion Buttons ──────────────────────────────
  function setSuggestions(list) {
    clearSuggestions();
    list.forEach((label) => {
      const btn = document.createElement("button");
      btn.className = "suggestion-btn";
      btn.textContent = label;
      btn.addEventListener("click", () => {
        sendMessage(label);
      });
      suggestionsBar.appendChild(btn);
    });
  }

  function clearSuggestions() {
    suggestionsBar.innerHTML = "";
  }

  // ── Utility: Format text (newlines → <br>) ────────────────
  function formatText(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");
  }

  // ── Utility: Get current time string ─────────────────────
  function getTime() {
    return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  }

  // ── Utility: Scroll to bottom of messages ─────────────────
  function scrollToBottom() {
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
  }

  // ── Utility: Sleep helper ─────────────────────────────────
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ── Utility: Toggle waiting state ─────────────────────────
  function setWaiting(val) {
    isWaiting          = val;
    sendBtn.disabled   = val || leadCaptured;
    messageInput.disabled = val || leadCaptured;
  }

  // ── Toast Notification ────────────────────────────────────
  function showToast(message, type = "info") {
    toast.textContent = message;
    toast.style.borderColor = type === "success"
      ? "rgba(16,185,129,0.3)"
      : type === "error"
      ? "rgba(239,68,68,0.3)"
      : "rgba(245,158,11,0.2)";
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3500);
  }

  // ── Auto-resize textarea ──────────────────────────────────
  function autoResize() {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
  }

  // ── Event Listeners ───────────────────────────────────────

  // Start chat button
  startChatBtn.addEventListener("click", async () => {
    startChatBtn.disabled = true;
    startChatBtn.textContent = "Connecting...";
    await createSession();
    await initChat();
  });

  // Send button click
  sendBtn.addEventListener("click", () => {
    sendMessage(messageInput.value);
  });

  // Enter to send (Shift+Enter = new line)
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(messageInput.value);
    }
  });

  // Auto-resize textarea as user types
  messageInput.addEventListener("input", () => {
    autoResize();
    // Enable/disable send based on content
    sendBtn.disabled = !messageInput.value.trim() || isWaiting || leadCaptured;
  });

  // ── Boot ──────────────────────────────────────────────────
  initParticles();

})();
