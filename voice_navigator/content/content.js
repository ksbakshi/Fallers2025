if (!window.__voice_nav_injected__) {
  window.__voice_nav_injected__ = true;

  const btn = document.createElement("button");
  btn.textContent = "🎤 Voice Nav (off)";
  btn.id = "vn-btn";
  Object.assign(btn.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    padding: "10px 14px",
    fontSize: "14px",
    borderRadius: "8px",
    background: "#1f6feb",
    color: "white",
    border: "none",
    zIndex: "999999",
  });

  document.body.appendChild(btn);

  btn.style.display = "none";

  window.__voice_nav_toggle = () => {
    const current = btn.style.display || getComputedStyle(btn).display;
    btn.style.display = current === "none" ? "block" : "none";
  };

  let listening = false;
  let recognition;

  function processVoiceCommand(transcript) {
    const cleaned = transcript
      .toLowerCase()
      .replace(/[.,!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const m = cleaned.match(/\bsearch(?: for)?\s+(.+)$/i);
    if (!m) return false;

    let query = m[1].trim();

    // target parsing
    let target = "current"; // default: same tab
    if (/\b(in|on)\s+(a\s+)?new\s+tab\b/.test(query) || /\bnew\s+tab\b/.test(query)) {
      target = "new";
      query = query.replace(/\b(in|on)\s+(a\s+)?new\s+tab\b/g, "").replace(/\bnew\s+tab\b/g, "").trim();
    } else if (/\b(here|this\s+tab|same\s+tab)\b/.test(query)) {
      target = "current";
      query = query.replace(/\b(here|this\s+tab|same\s+tab)\b/g, "").trim();
    }

    if (!query) return false;

    executeSearch(query, target);
    stopListening();
    return true;
  }

  function executeSearch(query, target = "current") {
    btn.textContent = `🔍 Searching: ${query}`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    chrome.runtime.sendMessage({
      type: "OPEN_SEARCH",
      url: searchUrl,
      target,                   // "current" or "new"
    });

    hideCommandHint();
    setTimeout(() => { btn.textContent = "🎤 Voice Nav (off)"; }, 1200);
  }

  // (helper) add this to manage consistent stopping
  function stopListening() {
    if (recognition && listening) {
      recognition.stop();
      listening = false;
    }
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;     // end after each phrase
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const res = event.results[event.results.length - 1];
      if (!res || !res.isFinal) return;

      const transcript = res[0].transcript;
      processVoiceCommand(transcript);   // this calls executeSearch() immediately if it finds "search ..."
    };

    recognition.onend = () => {
      hideCommandHint();
      if (listening) {                   // auto-restart while toggle is ON
        try { recognition.start(); } catch (_) {}
        btn.textContent = "🎤 Listening...";
      } else if (!btn.textContent.includes('🔍 Searching:')) {
        btn.textContent = "🎤 Voice Nav (off)";
      }
    };
  } else {
    console.warn("SpeechRecognition API not supported in this browser.");
    btn.textContent = "⚠️ No STT";
  }

  btn.addEventListener("click", () => {
    if (!recognition) return;
    if (!listening) {
      listening = true;
      try { recognition.start(); } catch (_) {}
      btn.textContent = "🎤 Listening...";
      showCommandHint();
    } else {
      listening = false;
      try { recognition.stop(); } catch (_) {}
      btn.textContent = "🎤 Voice Nav (off)";
      hideCommandHint();
    }
  });

  // Show command hints
  function showCommandHint() {
    if (document.getElementById("voice-hint")) return;

    const hint = document.createElement("div");
    hint.id = "voice-hint";
    hint.innerHTML = `
      <div style="
        position: fixed;
        right: 20px;
        bottom: 80px;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 10px;
        border-radius: 8px;
        font-size: 12px;
        z-index: 999998;
        max-width: 200px;
      ">
        <strong>Available Commands:</strong><br>
        • "search [your query]"<br>
        • "search for [your query]"
      </div>
    `;
    document.body.appendChild(hint);
  }

  // Hide command hints
  function hideCommandHint() {
    const hint = document.getElementById("voice-hint");
    if (hint) {
      hint.remove();
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TOGGLE_OVERLAY") {
      btn.style.display = btn.style.display === "none" ? "block" : "none";
    }
  });
}
