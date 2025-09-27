chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-mic") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content/content.js"]
  });
  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY" });
});
