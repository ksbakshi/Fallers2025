const listeningTabs = new Set();

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-mic") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;
  const allowed = /^(https?|file|ftp):/i.test(tab.url);
  if (!allowed) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content/content.js"],
  });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.__voice_nav_toggle?.(),
  });
});

// Messages: OPEN_SEARCH + LISTENING_STATE
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "OPEN_SEARCH" && msg.url) {
        const target = msg.target || "current";
        if (target === "new")
          await chrome.tabs.create({ url: msg.url, active: false });
        else if (sender?.tab?.id)
          await chrome.tabs.update(sender.tab.id, { url: msg.url });
        else await chrome.tabs.create({ url: msg.url });
        sendResponse?.({ success: true });
        return;
      }
      if (msg?.type === "LISTENING_STATE" && sender?.tab?.id) {
        if (msg.state === "ON") listeningTabs.add(sender.tab.id);
        else listeningTabs.delete(sender.tab.id);
        sendResponse?.({ success: true });
        return;
      }
      sendResponse?.({ success: false, error: "Unknown message" });
    } catch (e) {
      sendResponse?.({ success: false, error: String(e) });
    }
  })();
  return true;
});

// Re-inject & autostart after navigation in the same tab
function shouldAutoResume(url) {
  return !!url && /^(https?|file|ftp):/i.test(url);
}

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return; // only top frame
  if (!listeningTabs.has(details.tabId)) return;
  if (!shouldAutoResume(details.url)) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      files: ["content/content.js"],
    });
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      func: () => window.__voice_nav_autostart?.(),
    });
  } catch (e) {
    // ignore if page blocks injection
  }
});

// Also handle SPA route changes
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (!listeningTabs.has(details.tabId)) return;
  if (!shouldAutoResume(details.url)) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      files: ["content/content.js"],
    });
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      func: () => window.__voice_nav_autostart?.(),
    });
  } catch (e) {}
});
