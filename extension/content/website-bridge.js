/**
 * Content script that bridges the website with the extension
 * Injected on ifaka.github.io/extension-pack-hub
 */

// Signal to the website that the extension is installed
window.postMessage({ type: 'EXTENSION_PACK_HUB_INSTALLED', version: '1.0.0' }, '*');

// Listen for messages from the website
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;

  const { type, payload } = event.data;

  switch (type) {
    case 'EPH_GET_INSTALLED_EXTENSIONS':
      const extensions = await chrome.runtime.sendMessage({ type: 'get-extensions' });
      window.postMessage({
        type: 'EPH_INSTALLED_EXTENSIONS',
        payload: extensions
      }, '*');
      break;

    case 'EPH_INSTALL_STORE_EXTENSION':
      chrome.runtime.sendMessage({
        type: 'install-store-extension',
        id: payload.id,
        name: payload.name
      });
      break;

    case 'EPH_INSTALL_GITHUB_EXTENSION':
      chrome.runtime.sendMessage({
        type: 'install-github-extension',
        repo: payload.repo,
        name: payload.name,
        releaseTag: payload.releaseTag
      });
      break;

    case 'EPH_INSTALL_PACK':
      chrome.runtime.sendMessage({
        type: 'install-pack',
        pack: payload.pack
      });
      break;
  }
});

// Listen for extension events and relay to website
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'extension-installed' ||
      message.type === 'extension-uninstalled' ||
      message.type === 'install-progress') {
    window.postMessage({ type: 'EPH_' + message.type.toUpperCase().replace(/-/g, '_'), payload: message }, '*');
  }
});
