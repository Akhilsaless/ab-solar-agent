// ============================================================
// AB SOLAR AGENT v2.0 — script.js
// All features: chat, bill upload, follow-up, PWA, calculator,
// testimonials, solar animations, context-aware suggestions
// ============================================================

// ── Global State ─────────────────────────────────────────────
var sessionId      = null;
var isWaiting      = false;
var leadCaptured   = false;
var typingEl       = null;
var chatStarted    = false;
var pendingImage   = null;
var followUpTimer  = null;
var deferredPrompt = null;

// ── PWA Install ───────────────────────────────────────────────
window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault();
  deferredPrompt = e;
  var banner = document.getElementById("pwaBanner");
  if (banner) banner.style.display = "flex";
});

function installPWA() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () {
      deferredPrompt = null;
      var banner = document.getElementById("pwaBanner");
      if (banner) banner.style.display = "none";
    });
  }
}

// ── Solar Background Animation ────────────────────────────────
function initSolarBackground() {
  // Sun rays
  var sunRays = document.getElementById("sunRays");
  if (sunRays) {
    var rayCount = 12;
    for (var i = 0; i < rayCount; i++) {
      var ray = document.createElement("div");
      ray.className = "sun-ray";
      var angle = (i / rayCount) * 360;
      var len   = 60 + Math.random() * 40;
      ray.style.height = len + "px";
      ray.style.transform = "rotate(" + angle + "deg) translateY(-50%)";
      ray.style.opacity = (0.4 + Math.random() * 0.4).toString();
      sunRays.appendChild(ray);
    }
  }

  // Welcome card rays
  var welcomeRays = document.getElementById("welcomeRays");
  if (welcomeRays) {
    for (var j = 0; j < 8; j++) {
      var wRay = document.createElement("div");
      wRay.className = "welcome-ray";
      wRay.style.transform = "rotate(" + (j * 45) + "deg) translateY(-50%)";
      wRay.style.opacity = "0.5";
      welcomeRays.appendChild(wRay);
    }
  }

  // Solar panels
  var panelsGrid = document.getElementById("panelsGrid");
  if (panelsGrid) {
    var panelCount = window.innerWidth < 768 ? 6 : 10;
    for (var k = 0; k < panelCount; k++) {
      var panel = document.createElement("div");
      panel.className = "solar-panel";
      panel.style.animationDelay = (k * 0.3) + "s";
      panelsGrid.appendChild(panel);
    }
  }

  // Energy particles
  var particleContainer = document.getElementById("energyParticles");
  if (particleContainer) {
    var pCount = window.innerWidth < 768 ? 15 : 30;
    for (var p = 0; p < pCount; p++) {
      var particle = document.createElement("div");
      particle.className = "energy-particle";
      var size  = 2 + Math.random() * 4;
      var isGold = Math.random() > 0.5;
      particle.style.width  = size + "px";
      particle.style.height = size + "px";
      particle.style.left   = Math.random() * 100 + "%";
      particle.style.bottom = Math.random() * 30 + "%";
      particle.style.background = isGold
        ? "rgba(245,158,11," + (0.4 + Math.random() * 0.5) + ")"
        : "rgba(100,200,255," + (0.3 + Math.random() * 0.4) + ")";
      particle.style.boxShadow = isGold
        ? "0 0 6px rgba(245,158,11,0.8)"
        : "0 0 6px rgba(100,200,255,0.8)";
      particle.style.animationDuration  = (8 + Math.random() * 12) + "s";
      particle.style.animationDelay     = (-Math.random() * 15) + "s";
      particle.style.setProperty("--drift", (Math.random() * 100 - 50) + "px");
      particleContainer.appendChild(particle);
    }
  }
}

// ── Savings Calculator ────────────────────────────────────────
function updateCalc() {
  var slider = document.getElementById("billSlider");
  if (!slider) return;

  var bill    = parseInt(slider.value) || 5000;
  var saving  = Math.round(bill * 0.85);
  var units   = Math.round(bill / 7);
  var sysSize = Math.round((units / 130) * 10) / 10;
  var payback = (sysSize * 50000 / (saving * 12)).toFixed(1);

  // Update slider gradient
  var pct = ((bill - 500) / (20000 - 500)) * 100;
  slider.style.setProperty("--val", pct + "%");
  slider.style.background = "linear-gradient(90deg, #F59E0B " + pct + "%, rgba(255,255,255,0.1) " + pct + "%)";

  var billDisplay = document.getElementById("calcBillDisplay");
  var savingEl    = document.getElementById("calcSaving");
  var systemEl    = document.getElementById("calcSystem");
  var paybackEl   = document.getElementById("calcPayback");

  if (billDisplay) billDisplay.textContent = "Rs. " + bill.toLocaleString("en-IN") + " / month";
  if (savingEl)    savingEl.textContent    = "Rs. " + saving.toLocaleString("en-IN");
  if (systemEl)    systemEl.textContent    = sysSize + " kW";
  if (paybackEl)   paybackEl.textContent   = payback + " yrs";
}

// ── Testimonials Carousel ─────────────────────────────────────
var currentTestimonial = 0;
var testimonialTimer   = null;

function initTestimonials() {
  var items = document.querySelectorAll(".testimonial");
  var dotsEl = document.getElementById("testimonialDots");
  if (!items.length || !dotsEl) return;

  items.forEach(function (_, i) {
    var dot = document.createElement("div");
    dot.className = "testimonial-dot" + (i === 0 ? " active" : "");
    dot.onclick = function () { showTestimonial(i); };
    dotsEl.appendChild(dot);
  });

  testimonialTimer = setInterval(function () {
    currentTestimonial = (currentTestimonial + 1) % items.length;
    showTestimonial(currentTestimonial);
  }, 4000);
}

function showTestimonial(index) {
  var items = document.querySelectorAll(".testimonial");
  var dots  = document.querySelectorAll(".testimonial-dot");
  items.forEach(function (el, i) {
    el.classList.toggle("active", i === index);
  });
  dots.forEach(function (d, i) {
    d.classList.toggle("active", i === index);
  });
  currentTestimonial = index;
}

// ── Start Consultation ────────────────────────────────────────
function startConsultation() {
  if (chatStarted) return;
  chatStarted = true;

  var btn = document.getElementById("startChatBtn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "<span>Connecting...</span>";
    btn.style.opacity = "0.75";
  }

  // Fade welcome card
  var card = document.getElementById("welcomeCard");
  if (card) {
    card.style.transition = "opacity 0.35s ease, transform 0.35s ease";
    card.style.opacity    = "0";
    card.style.transform  = "scale(0.94) translateY(-10px)";
    setTimeout(function () {
      if (card.parentNode) card.parentNode.removeChild(card);
    }, 380);
  }

  // Enable input
  var input = document.getElementById("messageInput");
  var uploadBtn = document.getElementById("uploadBtn");
  if (input)     input.disabled     = false;
  if (uploadBtn) uploadBtn.disabled = false;

  // Create session → init chat
  createSession(function () {
    setTimeout(function () {
      showTyping();
      loadGreeting();
    }, 420);
  });
}

// ── Handle Send ───────────────────────────────────────────────
function handleSend() {
  var input = document.getElementById("messageInput");
  if (input) sendMessage(input.value);
}

// ── Create Session ────────────────────────────────────────────
function createSession(callback) {
  fetch("/api/session", { method: "POST" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      sessionId = d.sessionId;
      if (callback) callback();
    })
    .catch(function () {
      sessionId = "local-" + Date.now();
      if (callback) callback();
    });
}

// ── Load Initial Greeting ─────────────────────────────────────
function loadGreeting() {
  fetch("/api/chat/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: sessionId }),
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.sessionId) sessionId = d.sessionId;
      removeTyping();
      addBotMessage(d.reply);
      if (d.suggestions && d.suggestions.length) showSuggestions(d.suggestions);
      focusInput();
      startFollowUpPoller();
    })
    .catch(function () {
      removeTyping();
      addBotMessage("Hi! I'm AB SOLAR AGENT ☀️\n\nI help you reduce your electricity bill by up to 90% with solar energy.\n\nWhat is your current monthly electricity bill?");
      showSuggestions(["My bill is Rs.2,000", "My bill is Rs.5,000", "My bill is Rs.10,000"]);
      focusInput();
    });
}

// ── Send Message ──────────────────────────────────────────────
function sendMessage(text) {
  if (!text || !text.trim() || isWaiting || leadCaptured || !sessionId) return;

  var msg      = text.trim();
  var input    = document.getElementById("messageInput");
  var sendBtn  = document.getElementById("sendBtn");
  var uploadBtn = document.getElementById("uploadBtn");

  isWaiting = true;
  if (input)     { input.value = ""; input.disabled = true; autoResize(); }
  if (sendBtn)   sendBtn.disabled   = true;
  if (uploadBtn) uploadBtn.disabled = true;

  clearSuggestions();
  addUserMessage(msg + (pendingImage ? " 📄" : ""));
  showTyping();

  var body = { sessionId: sessionId, message: msg };
  if (pendingImage) {
    body.imageData = pendingImage;
    pendingImage = null;
    hideImagePreview();
  }

  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      removeTyping();
      addBotMessage(d.reply);

      if (d.suggestions && d.suggestions.length) showSuggestions(d.suggestions);

      if (d.leadCaptured && !leadCaptured) {
        leadCaptured = true;
        onLeadCaptured();
      } else {
        isWaiting = false;
        if (input)     { input.disabled     = false; }
        if (uploadBtn) { uploadBtn.disabled  = false; }
        if (sendBtn)   sendBtn.disabled = !input || !input.value.trim();
        focusInput();
      }
    })
    .catch(function () {
      removeTyping();
      addBotMessage("I had a quick issue. Please send again — I'm here! ☀️");
      isWaiting = false;
      if (input)     input.disabled     = false;
      if (uploadBtn) uploadBtn.disabled = false;
      if (sendBtn)   sendBtn.disabled   = false;
    });
}

// ── Lead Captured Handler ─────────────────────────────────────
function onLeadCaptured() {
  setTimeout(function () {
    var input   = document.getElementById("messageInput");
    var sendBtn = document.getElementById("sendBtn");
    var uploadBtn = document.getElementById("uploadBtn");
    if (input)     { input.disabled = true; input.placeholder = "Thank you! Our team will contact you soon ☀️"; }
    if (sendBtn)   sendBtn.disabled   = true;
    if (uploadBtn) uploadBtn.disabled = true;
    clearSuggestions();
    showToast("✅ Lead captured! Team will contact you shortly.", "success");
  }, 2200);
}

// ── Image Upload ──────────────────────────────────────────────
function handleImageUpload(e) {
  var file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast("Image too large. Max 5MB.", "error"); return; }

  var reader = new FileReader();
  reader.onload = function (ev) {
    // Strip data:image/jpeg;base64, prefix
    var base64 = ev.target.result.split(",")[1];
    pendingImage = base64;
    showImagePreview();
    // Auto-set message
    var input = document.getElementById("messageInput");
    if (input && !input.value.trim()) {
      input.value = "Here is my electricity bill image, please analyze it.";
      autoResize();
      var sendBtn = document.getElementById("sendBtn");
      if (sendBtn) sendBtn.disabled = false;
    }
  };
  reader.readAsDataURL(file);
  e.target.value = "";
}

function showImagePreview() {
  var bar = document.getElementById("imagePreviewBar");
  if (bar) bar.style.display = "flex";
}

function hideImagePreview() {
  var bar = document.getElementById("imagePreviewBar");
  if (bar) bar.style.display = "none";
}

function removeImage() {
  pendingImage = null;
  hideImagePreview();
  var input = document.getElementById("messageInput");
  if (input && input.value === "Here is my electricity bill image, please analyze it.") {
    input.value = "";
    autoResize();
  }
}

// ── Follow-up Poller ──────────────────────────────────────────
function startFollowUpPoller() {
  if (followUpTimer) clearInterval(followUpTimer);
  followUpTimer = setInterval(function () {
    if (leadCaptured || !sessionId) { clearInterval(followUpTimer); return; }
    fetch("/api/followup/" + sessionId)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.followUp && !isWaiting) {
          addBotMessage(d.followUp);
        }
      })
      .catch(function () {});
  }, 30000); // Poll every 30 seconds
}

// ── Add Bot Message ───────────────────────────────────────────
function addBotMessage(text) {
  var feed = document.getElementById("chatMessages");
  if (!feed) return;

  var row    = document.createElement("div");
  row.className = "message-row bot";

  var avatar = document.createElement("div");
  avatar.className   = "msg-avatar";
  avatar.textContent = "☀️";

  var col    = document.createElement("div");
  var bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.innerHTML  = escapeHtml(text);

  var time = document.createElement("div");
  time.className   = "msg-time";
  time.textContent = now();

  col.appendChild(bubble);
  col.appendChild(time);
  row.appendChild(avatar);
  row.appendChild(col);
  feed.appendChild(row);
  scrollDown();
}

// ── Add User Message ──────────────────────────────────────────
function addUserMessage(text) {
  var feed = document.getElementById("chatMessages");
  if (!feed) return;

  var row    = document.createElement("div");
  row.className = "message-row user";

  var col    = document.createElement("div");
  var bubble = document.createElement("div");
  bubble.className   = "msg-bubble";
  bubble.textContent = text;

  var time = document.createElement("div");
  time.className   = "msg-time";
  time.textContent = now();

  col.appendChild(bubble);
  col.appendChild(time);
  row.appendChild(col);
  feed.appendChild(row);
  scrollDown();
}

// ── Typing ────────────────────────────────────────────────────
function showTyping() {
  if (typingEl) return;
  var feed = document.getElementById("chatMessages");
  if (!feed) return;
  typingEl = document.createElement("div");
  typingEl.className = "typing-row";
  typingEl.innerHTML =
    '<div class="msg-avatar">☀️</div>' +
    '<div class="typing-bubble">' +
    '<div class="typing-dot"></div>' +
    '<div class="typing-dot"></div>' +
    '<div class="typing-dot"></div>' +
    "</div>";
  feed.appendChild(typingEl);
  scrollDown();
}

function removeTyping() {
  if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
  typingEl = null;
}

// ── Suggestions ───────────────────────────────────────────────
function showSuggestions(list) {
  clearSuggestions();
  var bar = document.getElementById("suggestionsBar");
  if (!bar || !list || !list.length) return;
  list.forEach(function (label) {
    var btn = document.createElement("button");
    btn.type      = "button";
    btn.className = "suggestion-btn";
    btn.textContent = label;
    btn.onclick   = function () { sendMessage(label); };
    bar.appendChild(btn);
  });
}

function clearSuggestions() {
  var bar = document.getElementById("suggestionsBar");
  if (bar) bar.innerHTML = "";
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type) {
  var toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.style.borderColor =
    type === "success" ? "rgba(16,185,129,0.4)" :
    type === "error"   ? "rgba(239,68,68,0.4)"  :
                         "rgba(245,158,11,0.3)";
  toast.classList.add("show");
  setTimeout(function () { toast.classList.remove("show"); }, 4000);
}

// ── Utilities ─────────────────────────────────────────────────
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function now() {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function scrollDown() {
  var feed = document.getElementById("chatMessages");
  if (feed) setTimeout(function () { feed.scrollTop = feed.scrollHeight; }, 60);
}

function focusInput() {
  setTimeout(function () {
    var input = document.getElementById("messageInput");
    if (input && !input.disabled) input.focus();
  }, 350);
}

function autoResize() {
  var input = document.getElementById("messageInput");
  if (!input) return;
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 100) + "px";
}

// ── DOM Ready ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {

  // Init solar background
  initSolarBackground();

  // Init calculator
  updateCalc();

  // Init testimonials
  initTestimonials();

  // Enter to send
  var input = document.getElementById("messageInput");
  if (input) {
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    input.addEventListener("input", function () {
      autoResize();
      var sendBtn = document.getElementById("sendBtn");
      if (sendBtn) sendBtn.disabled = !input.value.trim() || isWaiting || leadCaptured;
    });
  }

  // Service Worker for PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  }

});
