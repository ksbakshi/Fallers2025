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
    zIndex: "999999"
  });

  btn.addEventListener("click", () => {
    btn.textContent = btn.textContent.includes("(off)")
      ? "🎤 Voice Nav (on)"
      : "🎤 Voice Nav (off)";
  });

  document.body.appendChild(btn);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TOGGLE_OVERLAY") {
      btn.style.display = btn.style.display === "none" ? "block" : "none";
    }
  });
}
