// Persist listening state per tab so it survives worker restarts.
const STORAGE_KEY = "vn_listening_tabs"; // { [tabId: string]: true }

async function getListeningMap() {
  const { [STORAGE_KEY]: map } = await chrome.storage.session.get(STORAGE_KEY);
  return map || {};
}

async function setListeningMap(map) {
  try {
    await chrome.storage.session.set({ [STORAGE_KEY]: map });
  } catch (e) {
    console.error("Failed to set listening map:", e);
    throw e;
  }
}

async function addListeningTab(tabId) {
  const map = await getListeningMap();
  map[String(tabId)] = true;
  await setListeningMap(map);
}

async function removeListeningTab(tabId) {
  const map = await getListeningMap();
  delete map[String(tabId)];
  await setListeningMap(map);
}

async function isListeningTab(tabId) {
  const map = await getListeningMap();
  return !!map[String(tabId)];
}

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

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    await removeListeningTab(tabId);
  } catch {}
});

// Messages: OPEN_SEARCH + LISTENING_STATE
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "OPEN_SEARCH" && msg.url) {
        const target = msg.target || "current";
        if (target === "new") {
          await chrome.tabs.create({ url: msg.url, active: false });
          if (sender?.tab?.id && (await isListeningTab(sender.tab.id))) {
            await addListeningTab(newTab.id);
          }
        } else if (sender?.tab?.id)
          await chrome.tabs.update(sender.tab.id, { url: msg.url });
        else await chrome.tabs.create({ url: msg.url });
        sendResponse?.({ success: true });
        return;
      }
      // if (msg?.type === "LISTENING_STATE" && sender?.tab?.id) {
      //   if (msg.state === "ON") listeningTabs.add(sender.tab.id);
      //   else listeningTabs.delete(sender.tab.id);
      //   sendResponse?.({ success: true });
      //   return;
      // }
      if (msg?.type === "LISTENING_STATE" && sender?.tab?.id) {
        if (msg.state === "ON") await addListeningTab(sender.tab.id);
        else await removeListeningTab(sender.tab.id);
        sendResponse?.({ success: true });
        return;
      }
      if (msg?.type === "NAVIGATE_TO" && msg.url) {
        const target = msg.target || "current";
        if (target === "new") {
          const newTab = await chrome.tabs.create({
            url: msg.url,
            active: false,
          });
          if (sender?.tab?.id && (await isListeningTab(sender.tab.id))) {
            await addListeningTab(newTab.id);
          }
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
          try {
            await chrome.tabs.goBack(tabId);
          } catch {}
          sendResponse?.({ success: true });
          return;
        }
        if (msg.direction === "forward" && chrome.tabs.goForward) {
          try {
            await chrome.tabs.goForward(tabId);
          } catch {}
          sendResponse?.({ success: true });
          return;
        }

        // Fallback: execute history.back()/forward() in the page
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: (dir) => {
              dir === "back" ? history.back() : history.forward();
            },
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
  if (!(await isListeningTab(details.tabId))) return;
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
  if (!(await isListeningTab(details.tabId))) return;
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
