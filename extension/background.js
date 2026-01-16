/**
 * Extension Pack Hub - Background Service Worker
 */

// Track active pack installations
let activePackInstall = null;

// Track pending GitHub extension installations (repo -> expected name)
let pendingGitHubInstalls = new Map();

// Initialize: load pending installs from storage
chrome.storage.local.get('pendingGitHubInstalls', (result) => {
  if (result.pendingGitHubInstalls) {
    pendingGitHubInstalls = new Map(Object.entries(result.pendingGitHubInstalls));
  }
});

// Listen for extension install/uninstall events
chrome.management.onInstalled.addListener(async (info) => {
  console.log('Extension installed:', info.name);
  // Notify all tabs and popup
  broadcastMessage({ type: 'extension-installed', extension: info });

  // Update active pack install progress
  if (activePackInstall) {
    updatePackInstallProgress(info.id);
  }

  // Check if this is a GitHub extension we were waiting for
  if (info.installType === 'development' && pendingGitHubInstalls.size > 0) {
    await matchAndStoreGitHubExtension(info);
  }
});

// Match newly installed extension with pending GitHub installs
async function matchAndStoreGitHubExtension(extensionInfo) {
  const normalizedName = extensionInfo.name.toLowerCase().trim();

  // Find matching pending install by name similarity
  for (const [repo, expectedName] of pendingGitHubInstalls.entries()) {
    const normalizedExpected = expectedName.toLowerCase().trim();

    // Check for exact match or if one contains the other
    if (normalizedName === normalizedExpected ||
        normalizedName.includes(normalizedExpected) ||
        normalizedExpected.includes(normalizedName)) {

      console.log(`Matched GitHub extension: ${repo} -> ${extensionInfo.id}`);

      // Store the mapping
      const { githubExtensionMap = {} } = await chrome.storage.local.get('githubExtensionMap');
      githubExtensionMap[repo] = {
        id: extensionInfo.id,
        name: extensionInfo.name,
        installedAt: Date.now()
      };
      await chrome.storage.local.set({ githubExtensionMap });

      // Remove from pending
      pendingGitHubInstalls.delete(repo);
      await savePendingInstalls();

      // Broadcast the match
      broadcastMessage({
        type: 'github-extension-matched',
        repo,
        extensionId: extensionInfo.id,
        name: extensionInfo.name
      });

      break;
    }
  }
}

// Save pending installs to storage
async function savePendingInstalls() {
  const obj = Object.fromEntries(pendingGitHubInstalls);
  await chrome.storage.local.set({ pendingGitHubInstalls: obj });
}

chrome.management.onUninstalled.addListener(async (id) => {
  console.log('Extension uninstalled:', id);
  broadcastMessage({ type: 'extension-uninstalled', id });

  // Clean up GitHub extension map if this was a tracked extension
  const { githubExtensionMap = {} } = await chrome.storage.local.get('githubExtensionMap');
  for (const [repo, data] of Object.entries(githubExtensionMap)) {
    if (data.id === id) {
      delete githubExtensionMap[repo];
      await chrome.storage.local.set({ githubExtensionMap });
      console.log(`Removed GitHub extension mapping: ${repo}`);
      break;
    }
  }
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

  // Register a pending GitHub extension install (called by wizard)
  if (message.type === 'register-pending-github-install') {
    pendingGitHubInstalls.set(message.repo, message.name);
    savePendingInstalls();
    console.log(`Registered pending GitHub install: ${message.repo} (${message.name})`);
    sendResponse({ success: true });
  }

  // Get the GitHub extension map (called by popup to check installed status)
  if (message.type === 'get-github-extension-map') {
    chrome.storage.local.get('githubExtensionMap', (result) => {
      sendResponse({ map: result.githubExtensionMap || {} });
    });
    return true;
  }

  // Check if a specific GitHub extension is installed
  if (message.type === 'is-github-extension-installed') {
    (async () => {
      const { githubExtensionMap = {} } = await chrome.storage.local.get('githubExtensionMap');
      const mapping = githubExtensionMap[message.repo];

      if (mapping) {
        // Verify the extension is still installed
        try {
          const ext = await chrome.management.get(mapping.id);
          sendResponse({ installed: true, extensionId: mapping.id, name: ext.name });
        } catch (e) {
          // Extension was uninstalled, clean up
          delete githubExtensionMap[message.repo];
          await chrome.storage.local.set({ githubExtensionMap });
          sendResponse({ installed: false });
        }
      } else {
        sendResponse({ installed: false });
      }
    })();
    return true;
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

  // Get GitHub extension map to check for installed GitHub extensions
  const { githubExtensionMap = {} } = await chrome.storage.local.get('githubExtensionMap');

  // Filter to only missing extensions
  const toInstall = pack.extensions.filter(ext => {
    if (ext.type === 'store') {
      return !installedIds.has(ext.id);
    }
    if (ext.type === 'github' && ext.repo) {
      // Check if this GitHub extension is tracked as installed
      const mapping = githubExtensionMap[ext.repo];
      if (mapping && installedIds.has(mapping.id)) {
        return false; // Already installed, skip
      }
    }
    return true; // Not installed, needs action
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
