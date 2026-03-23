(function () {
  "use strict";

  const chatMessages   = document.getElementById("chatMessages");
  const messageInput   = document.getElementById("messageInput");
  const sendBtn        = document.getElementById("sendBtn");
  const suggestionsBar = document.getElementById("suggestionsBar");
  const toast          = document.getElementById("toast");

  let sessionId    = null;
  let isWaiting    = false;
  let leadCaptured = false;
  let typingEl     = null;
  let chatStarted  = false;

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

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

  function attachStartButton() {
    let attempts = 0;
    const tryAttach = () => {
      const btn = document.getElementById("startChatBtn");
      if (btn) {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener("click", handleStartConsultation, { passive: false });
        newBtn.addEventListener("touchend", function(e) {
          e.preventDefault();
          handleStartConsultation(e);
        }, { passive: false });
      } else if (attempts < 10) {
        attempts++;
        setTimeout(tryAttach, 200);
      }
    };
    tryAttach();
  }

  async function handleStartConsultation(e) {
    if (e) e.preventDefault();
    if (chatStarted) return;
    chatStarted = true;

    const btn = document.getElementById("startChatBtn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "<span>Connecting...</span>";
      btn.style.opacity = "0.7";
    }

    const chatPanel = document.querySelector(".chat-panel");
    if (chatPanel) {
      chatPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    await createSession();

    const welcomeCard = document.getElementById("welcomeCard");
    if (welcomeCard) {
      welcomeCard.style.transition = "all 0.35s ease";
      welcomeCard.style.opacity    = "0";
      welcomeCard.style.transform  = "scale(0.94) translateY(-10px)";
      setTimeout(() => {
        if (welcomeCard.parentNode) welcomeCard.remove();
      }, 350);
    }

    if (messageInput) messageInput.disabled = false;

    await sleep(400);
    showTyping();
    await initChat();

    setTimeout(() => {
      if (messageInput) {
        messageInput.focus();
        scrollToBottom();
      }
    }, 600);
  }

  async function createSession() {
    try {
      const res  = await fetch("/api/session", { method: "POST" });
      const data = await res.json();
      sessionId  = data.sessionId;
    } catch (err) {
      sessionId = "fallback-" + Date.now();
      showToast("Connection issue — retrying...", "error");
    }
  }

  async function initChat() {
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
      appendBotMessage("Hi! I'm AB SOLAR AGENT ☀️\n\nTell me your monthly electricity bill and I'll show you exactly how much you can save with solar!");
      setSuggestions(["Analyze My Bill", "Know My Savings", "Book Free Consultation"]);
    }
  }

  async function sendMessage(text) {
    if (!text?.trim() || isWaiting || !sessionId || leadCaptured) return;
    const msg = text.trim();
    setWaiting(true);
    clearSuggestions();
    appendUserMessage(msg);
    messageInput.value = "";
    autoResize();
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
    } finally {
      setWaiting(false);
    }
  }

  function handleLeadCaptured() {
    setTimeout(() => {
      messageInput.disabled    = true;
      sendBtn.disabled         = true;
      messageInput.placeholder = "Thank you! Our team will contact you shortly ☀️";
      clearSuggestions();
      showToast("✅ Lead captured successfully!", "success");
    }, 2500);
  }

  function appendBotMessage(text) {
    const row    = document.createElement("div");
    row.className = "message-row bot";
    const avatar = document.createElement("div");
    avatar.className   = "msg-avatar";
    avatar.textContent = "☀️";
    const col    = document.createElement("div");
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.innerHTML = formatText(text);
    const time = document.createElement("div");
    time.className   = "msg-time";
    time.textContent = getTime();
    col.appendChild(bubble);
    col.appendChild(time);
    row.appendChild(avatar);
    row.appendChild(col);
    chatMessages.appendChild(row);
    scrollToBottom();
  }

  function appendUserMessage(text) {
    const row    = document.createElement("div");
    row.className = "message-row user";
    const col    = document.createElement("div");
    const bubble = document.createElement("div");
    bubble.className   = "msg-bubble";
    bubble.textContent = text;
    const time = document.createElement("div");
    time.className   = "msg-time";
    time.textContent = getTime();
    col.appendChild(bubble);
    col.appendChild(time);
    row.appendChild(col);
    chatMessages.appendChild(row);
    scrollToBottom();
  }

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
      </div>`;
    chatMessages.appendChild(typingEl);
    scrollToBottom();
  }

  function removeTyping() {
    if (typingEl) { typingEl.remove(); typingEl = null; }
  }

  function setSuggestions(list) {
    clearSuggestions();
    list.forEach((label) => {
      const btn = document.createElement("button");
      btn.className   = "suggestion-btn";
      btn.textContent = label;
      btn.type        = "button";
      btn.addEventListener("click", () => sendMessage(label));
      btn.addEventListener("touchend", (e) => {
        e.preventDefault();
        sendMessage(label);
      }, { passive: false });
      suggestionsBar.appendChild(btn);
    });
  }

  function clearSuggestions() { suggestionsBar.innerHTML = ""; }

  function formatText(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");
  }

  function getTime() {
    return new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
    });
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function setWaiting(val) {
    isWaiting             = val;
    sendBtn.disabled      = val || leadCaptured;
    messageInput.disabled = val || leadCaptured;
  }

  function showToast(message, type = "info") {
    toast.textContent = message;
    toast.style.borderColor =
      type === "success" ? "rgba(16,185,129,0.3)" :
      type === "error"   ? "rgba(239,68,68,0.3)"  :
                           "rgba(245,158,11,0.2)";
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3500);
  }

  function autoResize() {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
  }

  ready(() => {
    sendBtn.addEventListener("click", () => sendMessage(messageInput.value));
    sendBtn.addEventListener("touchend", (e) => {
      e.preventDefault();
      sendMessage(messageInput.value);
    }, { passive: false });

    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(messageInput.value);
      }
    });

    messageInput.addEventListener("input", () => {
      autoResize();
      sendBtn.disabled = !messageInput.value.trim() || isWaiting || leadCaptured;
    });

    attachStartButton();
    initParticles();
  });

})();
