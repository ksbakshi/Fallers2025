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
    const show = current === "none";
    btn.style.display = show ? "block" : "none";
    if (!show) stopListening();
  };

  // ✅ called by SW after navigation to auto-resume
  window.__voice_nav_autostart = () => {
    btn.style.display = "block";
    if (!listening && recognition) {
      listening = true;
      try {
        recognition.start();
        isRunning = true;
      } catch {}
    }
    btn.textContent = "🎤 Listening...";
    showCommandHint();
  };

  let listening = false;
  let recognition;

  function processVoiceCommand(transcript) {
    const cleaned = transcript
      .toLowerCase()
      .replace(/[.,!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // --- helpers to parse "in a new tab/this tab"
    let target = "current";
    const stripTarget = (text) => {
      let t = text;
      if (/\b(in|on)\s+(a\s+)?new\s+tab\b/.test(t) || /\bnew\s+tab\b/.test(t)) {
        target = "new";
        t = t.replace(/\b(in|on)\s+(a\s+)?new\s+tab\b/g, "").replace(/\bnew\s+tab\b/g, "");
      } else if (/\b(here|this\s+tab|same\s+tab)\b/.test(t)) {
        target = "current";
        t = t.replace(/\b(here|this\s+tab|same\s+tab)\b/g, "");
      }
      return t.trim();
    };

    // 1) "go to / open / navigate to <site>"
    let m = cleaned.match(/\b(?:go to|open|navigate to)\s+(.+?)$/i);
    if (m && m[1]) {
      const raw = stripTarget(m[1]);
      if (raw) {
        executeGoto(raw, target);      // defined below
        stopListening();               // we’re navigating away
        return true;
      }
    }

    // 2) "search [for] <query>"  (keep your existing behavior)
    m = cleaned.match(/\bsearch(?: for)?\s+(.+?)$/i);
    if (m && m[1]) {
      const query = stripTarget(m[1]);
      if (query) {
        executeSearch(query, target);
        stopListening();
        return true;
      }
    }

    // 3) "move back" / "go back" / "back"
    if (/\b(move|go)?\s*back\b/.test(cleaned)) {
      chrome.runtime.sendMessage({ type: "HISTORY", direction: "back" });
      stopListening();
      return true;
    }

    // 4) "move forward" / "go forward" / "forward"
    if (/\b(move|go)?\s*forward\b/.test(cleaned)) {
      chrome.runtime.sendMessage({ type: "HISTORY", direction: "forward" });
      stopListening();
      return true;
    }

    // 5) "scroll [down|up|top|bottom]" (default: down a screen)
    m = cleaned.match(/\bscroll(?:\s+(down|up|top|bottom|to the top|to the bottom|page down|page up))?\b/);
    if (m) {
      const dir = (m[1] || "down").toLowerCase();
      performScroll(dir);              // defined below
      // don't stopListening() so user can keep saying "scroll down"
      return true;
    }

    // 6) "next page" / "next results"
    if (/\b(next page|next results|more results)\b/.test(cleaned)) {
      goToNextResultsPage();           // defined below
      stopListening();
      return true;
    }

    return false;
  }

  const SITE_ALIASES = {
    "youtube": "https://www.youtube.com",
    "gmail": "https://mail.google.com",
    "maps": "https://maps.google.com",
    "github": "https://github.com",
    "stackoverflow": "https://stackoverflow.com",
    "wikipedia": "https://wikipedia.org",
    "reddit": "https://www.reddit.com",
    "instagram": "https://www.instagram.com",
    "x": "https://x.com",
    "linkedin": "https://www.linkedin.com",
    "sfu": "https://www.sfu.ca",
    "canvas": "https://canvas.sfu.ca",
    "chatgpt": "https://chat.openai.com"
  };

  // Build a URL from a spoken target (tries alias → domain → search)
  function guessUrlFromTarget(raw) {
    const t = raw.replace(/\s+/g, " ").trim();

    // alias match
    if (SITE_ALIASES[t]) return SITE_ALIASES[t];

    // looks like a domain already
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) {
      return /^https?:\/\//i.test(t) ? t : `https://${t}`;
    }

    // "foo dot com" -> foo.com
    const dotted = t.replace(/\s+dot\s+/g, ".").replace(/\s+/g, "");
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dotted)) {
      return `https://${dotted}`;
    }

    // fallback: jump straight to first result via DuckDuckGo !ducky
    return `https://duckduckgo.com/?q=!ducky+${encodeURIComponent(t)}`;
  }

  function executeGoto(targetText, target = "current") {
    const url = guessUrlFromTarget(targetText);
    btn.textContent = `🧭 Going to: ${targetText}`;
    chrome.runtime.sendMessage({ type: "NAVIGATE_TO", url, target });
    hideCommandHint();
    setTimeout(() => { btn.textContent = "🎤 Voice Nav (off)"; }, 1200);
  }

  // Smooth scroll utility
  function performScroll(direction) {
    const page = window.innerHeight * 0.9;
    const bottom = document.documentElement.scrollHeight;
    const top = 0;

    const go = (y) => window.scrollTo({ top: y, behavior: "smooth" });

    if (/(bottom|to the bottom)/.test(direction)) {
      go(bottom);
      btn.textContent = "↧ Scrolling to bottom";
    } else if (/(top|to the top)/.test(direction)) {
      go(top);
      btn.textContent = "↥ Scrolling to top";
    } else if (/(up|page up)/.test(direction)) {
      go(Math.max(window.scrollY - page, 0));
      btn.textContent = "↥ Scrolling up";
    } else {
      go(Math.min(window.scrollY + page, bottom));
      btn.textContent = "↧ Scrolling down";
    }
  }

  // Google next-page support (defaults to Google)
  function goToNextResultsPage() {
    const host = location.hostname;
    const url = new URL(location.href);

    // Google
    if (/google\./.test(host) && url.pathname.startsWith("/search")) {
      const sp = url.searchParams;
      const current = parseInt(sp.get("start") || "0", 10);
      sp.set("start", String(current + 10));
      location.assign(url.toString());
      return;
    }

    // Fallback: try clicking a visible "Next" link
    const next =
      document.querySelector('a[aria-label="Next"]') ||
      document.querySelector('a[rel="next"]') ||
      Array.from(document.querySelectorAll("a")).find(a =>
        /^(next|more)$/i.test(a.textContent.trim())
      );

    if (next) next.click();
    else btn.textContent = "⚠️ Couldn't find next page";
  }

  function executeSearch(query, target = "current") {
    btn.textContent = `🔍 Searching: ${query}`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
      query
    )}`;

    chrome.runtime.sendMessage({
      type: "OPEN_SEARCH",
      url: searchUrl,
      target, // "current" or "new"
    });

    hideCommandHint();
    setTimeout(() => {
      btn.textContent = "🎤 Voice Nav (off)";
    }, 1200);
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
    recognition.continuous = false; // end after each phrase
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const res = event.results[event.results.length - 1];
      if (!res || !res.isFinal) return;

      const transcript = res[0].transcript;
      processVoiceCommand(transcript); // this calls executeSearch() immediately if it finds "search ..."
    };

    recognition.onend = () => {
      hideCommandHint();
      if (listening) {
        // auto-restart while toggle is ON
        try {
          recognition.start();
        } catch (_) {}
        btn.textContent = "🎤 Listening...";
      } else if (!btn.textContent.includes("🔍 Searching:")) {
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
      try {
        recognition.start();
        isRunning = true;
      } catch {}
      btn.textContent = "🎤 Listening...";
      showCommandHint();
      chrome.runtime.sendMessage({ type: "LISTENING_STATE", state: "ON" });
    } else {
      listening = false;
      try {
        recognition.stop();
      } catch {}
      btn.textContent = "🎤 Voice Nav (off)";
      hideCommandHint();
      chrome.runtime.sendMessage({ type: "LISTENING_STATE", state: "OFF" });
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
