const listeningTabs = new Set();

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-music-panel") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.sidePanel.open({ tabId: tab.id });
    return;
  }
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
      if (msg?.type === "OPEN_MUSIC_PANEL") {
        const q = msg.query ? `?q=${encodeURIComponent(msg.query)}` : "";
        const tabId = sender?.tab?.id;
        if (tabId) {
          await chrome.sidePanel.open({ tabId });
          sendResponse?.({ success: true });
          return;
        }
        sendResponse?.({ success: false, error: "No sender tab" });
        return;
      }
      if (msg?.type === "OPEN_SEARCH" && msg.url) {
        const target = msg.target || "current";

        try {
          if (target === "new") {
            // If this is a YouTube search results URL, try to fetch the page
            // from the service worker (host_permissions include youtube) and
            // extract the first video id so we can open the watch?v= link directly.
            try {
              const u = new URL(msg.url);
              if (/youtube\.com/.test(u.hostname) && u.pathname.startsWith('/results')) {
                try {
                  const resp = await fetch(msg.url, { credentials: 'omit' });
                  const text = await resp.text();
                  // Find the first watch?v=VIDEOID occurrence (VIDEOID ~11 chars)
                  const m = text.match(/watch\?v=([A-Za-z0-9_-]{11})/);
                  if (m && m[1]) {
                    const videoId = m[1];
                    const watchUrl = `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}&start_radio=1`;
                    await chrome.tabs.create({ url: watchUrl, active: true });
                    sendResponse?.({ success: true });
                    return;
                  }
                  // fallback below if we couldn't parse an id
                } catch (e) {
                  // fetch/parse failed; fall back to opening the search page
                }
              }
            } catch (e) {
              // URL parse failed; fall through to generic tab creation
            }

            // Default: open the provided URL (search results) in a new tab
            await chrome.tabs.create({ url: msg.url, active: true });
          } else if (target === "current" && sender?.tab?.id) {
            await chrome.tabs.update(sender.tab.id, { url: msg.url });
          } else if (sender?.tab?.id) {
            await chrome.tabs.update(sender.tab.id, { url: msg.url });
          } else {
            await chrome.tabs.create({ url: msg.url });
          }

          sendResponse?.({ success: true });
          return;
        } catch (e) {
          sendResponse?.({ success: false, error: String(e) });
          return;
        }
      }
      if (msg?.type === "LISTENING_STATE" && sender?.tab?.id) {
        if (msg.state === "ON") listeningTabs.add(sender.tab.id);
        else listeningTabs.delete(sender.tab.id);
        sendResponse?.({ success: true });
        return;
      }
      if (msg?.type === "NAVIGATE_TO" && msg.url) {
        const target = msg.target || "current";
        if (target === "new") {
          await chrome.tabs.create({ url: msg.url, active: false });
        } else if (sender?.tab?.id) {
          await chrome.tabs.update(sender.tab.id, { url: msg.url });
        } else {
          await chrome.tabs.create({ url: msg.url });
        }
        sendResponse?.({ success: true });
        return;
      }

      // ADD: history navigation (back/forward), used by "move back"/"move forward"
      if (msg?.type === "HISTORY" && sender?.tab?.id) {
        const tabId = sender.tab.id;

        // Prefer native APIs if present
        if (msg.direction === "back" && chrome.tabs.goBack) {
          try { await chrome.tabs.goBack(tabId); } catch {}
          sendResponse?.({ success: true });
          return;
        }
        if (msg.direction === "forward" && chrome.tabs.goForward) {
          try { await chrome.tabs.goForward(tabId); } catch {}
          sendResponse?.({ success: true });
          return;
        }

        // Fallback: execute history.back()/forward() in the page
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: (dir) => { dir === "back" ? history.back() : history.forward(); },
            args: [msg.direction],
          });
          sendResponse?.({ success: true });
        } catch (e) {
          sendResponse?.({ success: false, error: String(e) });
        }
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
