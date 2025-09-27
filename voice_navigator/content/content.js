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

  // Voice command processing function
  function processVoiceCommand(transcript) {
    // Normalize: strip filler punctuation & extra spaces
    const cleaned = transcript
      .toLowerCase()
      .replace(/[.,!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Look for "search ..." or "search for ..."
    const m = cleaned.match(/\bsearch(?: for)?\s+(.+?)$/i);
    if (m && m[1]) {
      const query = m[1].trim();
      executeSearch(query);
      stopListening();
      return true;
    }
    return false;
  }

  // (helper) add this to manage consistent stopping
  function stopListening() {
    if (recognition && listening) {
      recognition.stop();
      listening = false;
    }
  }

  // Execute search function
  function executeSearch(query) {
    // Provide visual feedback
    btn.textContent = `🔍 Searching: ${query}`;

    // Create search URL
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
      query
    )}`;

    // Open search in new tab
    chrome.runtime.sendMessage({
      type: "OPEN_SEARCH",
      url: searchUrl,
    });

    // Hide command hints
    hideCommandHint();

    // Reset button after showing search feedback
    setTimeout(() => {
      btn.textContent = "🎤 Voice Nav (off)";
    }, 2000);
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;       // keep listening for multiple phrases
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      // Use only the latest final result
      const res = event.results[event.results.length - 1];
      if (!res || !res.isFinal) return;

      const transcript = res[0].transcript;
      console.log("Heard:", transcript);

      // Try to parse a command anywhere in the sentence
      const handled = processVoiceCommand(transcript);

      // UI feedback (truncate if long)
      const displayText = transcript.length > 20 ? transcript.substring(0, 20) + "..." : transcript;
      btn.textContent = handled ? btn.textContent : `🎤 ${displayText}`;
    };

    recognition.onend = () => {
      hideCommandHint();
      if (listening) {
        try { recognition.start(); } catch (_) { /* ignore 'already started' races */ }
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
