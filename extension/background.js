/**
 * Extension Pack Hub - Background Service Worker
 */

// Track active pack installations
let activePackInstall = null;

// Listen for extension install/uninstall events
chrome.management.onInstalled.addListener((info) => {
  console.log('Extension installed:', info.name);
  // Notify all tabs and popup
  broadcastMessage({ type: 'extension-installed', extension: info });

  // Update active pack install progress
  if (activePackInstall) {
    updatePackInstallProgress(info.id);
  }
});

chrome.management.onUninstalled.addListener((id) => {
  console.log('Extension uninstalled:', id);
  broadcastMessage({ type: 'extension-uninstalled', id });
});

// Broadcast message to popup and all extension-pack-hub tabs
async function broadcastMessage(message) {
  // Try to send to popup
  try {
    chrome.runtime.sendMessage(message);
  } catch (e) {}

  // Send to all extension-pack-hub tabs
  const tabs = await chrome.tabs.query({ url: 'https://ifaka.github.io/extension-pack-hub/*' });
  for (const tab of tabs) {
    try {
      chrome.tabs.sendMessage(tab.id, message);
    } catch (e) {}
  }
}

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get-extensions') {
    chrome.management.getAll().then(extensions => {
      sendResponse({ extensions });
    });
    return true;
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

  if (message.type === 'install-store-extension') {
    installStoreExtension(message.id, message.name);
    sendResponse({ success: true });
  }

  if (message.type === 'install-github-extension') {
    installGitHubExtension(message.repo, message.name, message.releaseTag);
    sendResponse({ success: true });
  }

  if (message.type === 'install-pack') {
    installPack(message.pack, sender.tab?.id);
    sendResponse({ success: true });
  }

  if (message.type === 'get-pack-install-status') {
    sendResponse({ activePackInstall });
    return false;
  }
});

// Install a Chrome Web Store extension
async function installStoreExtension(id, name) {
  broadcastMessage({
    type: 'install-progress',
    extensionId: id,
    status: 'opening-store',
    name
  });

  const storeUrl = `https://chromewebstore.google.com/detail/${id}`;
  await chrome.tabs.create({ url: storeUrl, active: true });
}

// Install a GitHub extension
async function installGitHubExtension(repo, name, releaseTag) {
  broadcastMessage({
    type: 'install-progress',
    repo,
    status: 'opening-wizard',
    name
  });

  const wizardUrl = chrome.runtime.getURL(
    `install-wizard/wizard.html?repo=${encodeURIComponent(repo)}&name=${encodeURIComponent(name)}${releaseTag ? `&tag=${encodeURIComponent(releaseTag)}` : ''}`
  );
  await chrome.tabs.create({ url: wizardUrl, active: true });
}

// Install an entire pack
async function installPack(pack, sourceTabId) {
  const installedExtensions = await chrome.management.getAll();
  const installedIds = new Set(installedExtensions.map(e => e.id));

  // Filter to only missing extensions
  const toInstall = pack.extensions.filter(ext => {
    if (ext.type === 'store') {
      return !installedIds.has(ext.id);
    }
    return true; // GitHub extensions always need checking
  });

  if (toInstall.length === 0) {
    broadcastMessage({
      type: 'install-progress',
      status: 'complete',
      message: 'All extensions already installed!'
    });
    return;
  }

  // Track active installation
  activePackInstall = {
    pack,
    toInstall,
    installed: [],
    currentIndex: 0,
    startTime: Date.now()
  };

  broadcastMessage({
    type: 'install-progress',
    status: 'started',
    total: toInstall.length,
    packName: pack.name
  });

  // Start installing - store extensions first, then GitHub
  const storeExts = toInstall.filter(e => e.type === 'store');
  const githubExts = toInstall.filter(e => e.type === 'github');

  // Install store extensions with delay between each
  for (let i = 0; i < storeExts.length; i++) {
    const ext = storeExts[i];
    activePackInstall.currentIndex = i;

    broadcastMessage({
      type: 'install-progress',
      status: 'installing',
      current: i + 1,
      total: toInstall.length,
      extension: ext.name,
      extensionType: 'store'
    });

    await installStoreExtension(ext.id, ext.name);

    // Wait between opening tabs
    if (i < storeExts.length - 1) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  // Then install GitHub extensions
  for (let i = 0; i < githubExts.length; i++) {
    const ext = githubExts[i];

    broadcastMessage({
      type: 'install-progress',
      status: 'installing',
      current: storeExts.length + i + 1,
      total: toInstall.length,
      extension: ext.name,
      extensionType: 'github'
    });

    await installGitHubExtension(ext.repo, ext.name, ext.releaseTag);

    if (i < githubExts.length - 1) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  broadcastMessage({
    type: 'install-progress',
    status: 'tabs-opened',
    total: toInstall.length,
    message: `Opened ${toInstall.length} installation tab(s). Complete each installation to finish.`
  });
}

// Update pack install progress when an extension is installed
function updatePackInstallProgress(extensionId) {
  if (!activePackInstall) return;

  const ext = activePackInstall.toInstall.find(e =>
    e.type === 'store' && e.id === extensionId
  );

  if (ext) {
    activePackInstall.installed.push(ext);

    broadcastMessage({
      type: 'install-progress',
      status: 'extension-complete',
      extension: ext.name,
      installed: activePackInstall.installed.length,
      total: activePackInstall.toInstall.length
    });

    // Check if all done
    if (activePackInstall.installed.length === activePackInstall.toInstall.filter(e => e.type === 'store').length) {
      const hasGitHub = activePackInstall.toInstall.some(e => e.type === 'github');
      if (!hasGitHub) {
        broadcastMessage({
          type: 'install-progress',
          status: 'complete',
          message: 'All extensions installed!'
        });
        activePackInstall = null;
      }
    }
  }
}

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
    broadcastMessage({
      type: 'download-complete',
      downloadId: delta.id
    });
  }
});
