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
    const lowerTranscript = transcript.toLowerCase().trim();

    // Search command: "search [query]" or "search for [query]"
    if (lowerTranscript.startsWith("search ")) {
      const searchQuery = lowerTranscript.replace(/^search (for )?/, "").trim();
      if (searchQuery) {
        executeSearch(searchQuery);
        // Stop listening after executing command
        if (recognition && listening) {
          recognition.stop();
          listening = false;
        }
      }
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
    recognition.continuous = false; // Changed to false to stop after each command
    recognition.interimResults = false; // Changed to false to get final results only
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((res) => res[0].transcript)
        .join("");
      console.log("Heard:", transcript);

      // Process voice commands
      processVoiceCommand(transcript);

      // Show live feedback (truncated if too long)
      const displayText =
        transcript.length > 20
          ? transcript.substring(0, 20) + "..."
          : transcript;
      btn.textContent = `🎤 ${displayText}`;
    };

    recognition.onend = () => {
      listening = false;
      hideCommandHint();
      // Only reset button if it's not showing a search message
      if (!btn.textContent.includes("🔍 Searching:")) {
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
      recognition.start();
      listening = true;
      btn.textContent = "🎤 Listening...";
      showCommandHint();
    } else {
      recognition.stop();
      listening = false;
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
