/**
 * Extension Pack Hub - Background Service Worker
 */

// Listen for extension install/uninstall events
chrome.management.onInstalled.addListener((info) => {
  console.log('Extension installed:', info.name);
  // Notify popup if open
  chrome.runtime.sendMessage({ type: 'extension-installed', extension: info });
});

chrome.management.onUninstalled.addListener((id) => {
  console.log('Extension uninstalled:', id);
  chrome.runtime.sendMessage({ type: 'extension-uninstalled', id });
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get-extensions') {
    chrome.management.getAll().then(extensions => {
      sendResponse({ extensions });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'open-store-page') {
    chrome.tabs.create({ url: message.url });
    sendResponse({ success: true });
  }

  if (message.type === 'download-extension') {
    handleDownload(message.url, message.filename).then(result => {
      sendResponse(result);
    });
    return true;
  }
});

// Handle extension downloads
async function handleDownload(url, filename) {
  try {
    const downloadId = await chrome.downloads.download({
      url,
      filename: `ExtensionPacks/${filename}`,
      saveAs: false
    });

    return { success: true, downloadId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Listen for download completion
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    chrome.runtime.sendMessage({
      type: 'download-complete',
      downloadId: delta.id
    });
  }
});
