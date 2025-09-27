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
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request?.type === "OPEN_SEARCH" && request.url) {
        await chrome.tabs.create({ url: request.url });
        sendResponse({ success: true });
        return;
      }
      // Unknown message
      sendResponse({ success: false, error: "Unknown message type" });
    } catch (e) {
      sendResponse({ success: false, error: String(e) });
    }
  })();
  // Keep sendResponse alive for the async IIFE above
  return true;
});
