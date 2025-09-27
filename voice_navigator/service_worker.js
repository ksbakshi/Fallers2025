// Hotkey: inject content script, then immediately toggle overlay
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-mic") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;

  // Avoid restricted pages (chrome://, Web Store, etc.)
  const allowed = /^(https?|file|ftp):/i.test(tab.url);
  const targetTabId = allowed
    ? tab.id
    : (await chrome.tabs.create({ url: "https://www.google.com" })).id;

  // Inject the content script (idempotent), then invoke its global toggle
  await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    files: ["content/content.js"],
  });
  await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    func: () => window.__voice_nav_toggle && window.__voice_nav_toggle(),
  });
});

// Handle messages from content script (e.g., OPEN_SEARCH)
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "OPEN_SEARCH") {
    const url = msg.url;
    const target = msg.target || "current";

    if (target === "new") {
      chrome.tabs.create({ url });
    } else {
      // Prefer updating the sender's tab; fallback to new tab if missing
      const tabId = sender?.tab?.id;
      if (tabId) {
        chrome.tabs.update(tabId, { url });
      } else {
        chrome.tabs.create({ url });
      }
    }
  }
});
