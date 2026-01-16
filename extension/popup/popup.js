/**
 * Extension Pack Hub - Popup Script
 */

// State
let installedExtensions = [];
let selectedExtensions = new Set();
let currentPack = null;

// DOM Elements
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupTabs();
  await loadExtensions();
  setupEventListeners();
  loadSavedPacks();
}

// Tab Navigation
function setupTabs() {
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    });
  });
}

// Load installed extensions
async function loadExtensions() {
  const listEl = document.getElementById('extension-list');

  try {
    const extensions = await chrome.management.getAll();

    // Filter out this extension and system extensions
    installedExtensions = extensions.filter(ext =>
      ext.type === 'extension' &&
      ext.id !== chrome.runtime.id &&
      !ext.isApp
    ).sort((a, b) => a.name.localeCompare(b.name));

    renderExtensionList(installedExtensions);
  } catch (error) {
    listEl.innerHTML = `<div class="loading">Error loading extensions: ${error.message}</div>`;
  }
}

// Render extension list
function renderExtensionList(extensions) {
  const listEl = document.getElementById('extension-list');

  if (extensions.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No extensions found</div>';
    return;
  }

  listEl.innerHTML = extensions.map(ext => {
    const type = getExtensionType(ext);
    const icon = ext.icons && ext.icons.length > 0
      ? ext.icons[ext.icons.length - 1].url
      : 'icons/default.png';

    return `
      <div class="extension-item ${selectedExtensions.has(ext.id) ? 'selected' : ''}"
           data-id="${ext.id}">
        <input type="checkbox" ${selectedExtensions.has(ext.id) ? 'checked' : ''}>
        <img class="extension-icon" src="${icon}" alt="">
        <div class="extension-info">
          <div class="extension-name">${escapeHtml(ext.name)}</div>
          <div class="extension-meta">
            <span class="extension-type ${type}">${type}</span>
            ${ext.version ? `v${ext.version}` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers
  listEl.querySelectorAll('.extension-item').forEach(item => {
    item.addEventListener('click', () => toggleExtension(item.dataset.id));
  });
}

// Get extension type (store, local)
function getExtensionType(ext) {
  // Development/unpacked extensions
  if (ext.installType === 'development') {
    return 'local';
  }

  // Extensions installed from Chrome Web Store have updateUrl pointing to google.com
  if (ext.updateUrl && ext.updateUrl.includes('google.com')) {
    return 'store';
  }

  // Sideloaded or externally installed extensions (not from store, not dev)
  if (ext.installType === 'sideload' || ext.installType === 'admin') {
    return 'local';
  }

  // Normal install without google.com updateUrl = likely external/sideloaded
  if (ext.installType === 'normal' && !ext.updateUrl) {
    return 'local';
  }

  // Default to store for normal installs with updateUrl
  return 'store';
}

// Toggle extension selection
function toggleExtension(id) {
  if (selectedExtensions.has(id)) {
    selectedExtensions.delete(id);
  } else {
    selectedExtensions.add(id);
  }

  renderExtensionList(installedExtensions);
  updateSelectedCount();
}

// Update selected count
function updateSelectedCount() {
  const countEl = document.getElementById('selected-count');
  const createBtn = document.getElementById('create-pack');

  countEl.textContent = `${selectedExtensions.size} selected`;
  createBtn.disabled = selectedExtensions.size === 0;
}

// Setup event listeners
function setupEventListeners() {
  // Search
  document.getElementById('search-extensions').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = installedExtensions.filter(ext =>
      ext.name.toLowerCase().includes(query)
    );
    renderExtensionList(filtered);
  });

  // Create pack
  document.getElementById('create-pack').addEventListener('click', createPack);

  // Copy URL
  document.getElementById('copy-url').addEventListener('click', copyUrl);

  // Import pack
  document.getElementById('import-pack').addEventListener('click', importPack);

  // Install missing
  document.getElementById('install-missing').addEventListener('click', installMissing);
}

// Create pack
async function createPack() {
  const name = document.getElementById('pack-name').value.trim();
  const description = document.getElementById('pack-description').value.trim();
  const author = document.getElementById('pack-author').value.trim();

  if (!name) {
    alert('Please enter a pack name');
    return;
  }

  if (selectedExtensions.size === 0) {
    alert('Please select at least one extension');
    return;
  }

  // Build extensions array
  const extensions = [];
  for (const id of selectedExtensions) {
    const ext = installedExtensions.find(e => e.id === id);
    if (ext) {
      const type = getExtensionType(ext);

      if (type === 'store') {
        extensions.push({
          type: 'store',
          id: ext.id,
          name: ext.name
        });
      } else {
        // For local extensions, prompt for GitHub repo
        const repo = prompt(`Enter GitHub repo for "${ext.name}" (e.g., username/repo):`);
        if (repo) {
          extensions.push({
            type: 'github',
            repo: repo,
            name: ext.name,
            releaseTag: 'latest'
          });
        } else {
          // Skip if no repo provided
          extensions.push({
            type: 'github',
            repo: '',
            name: ext.name,
            note: 'No GitHub repo provided'
          });
        }
      }
    }
  }

  // Create pack
  const pack = PackCodec.createPack(name, description, author, extensions);

  // Validate
  const validation = PackCodec.validate(pack);
  if (!validation.valid) {
    alert('Pack validation failed:\n' + validation.errors.join('\n'));
    return;
  }

  // Generate URL
  const url = PackCodec.generateUrl(pack);

  // Show result
  document.getElementById('share-url').value = url;
  document.getElementById('share-result').classList.remove('hidden');

  // Save to storage
  savePack(pack, url);
}

// Copy URL to clipboard
async function copyUrl() {
  const urlInput = document.getElementById('share-url');

  try {
    await navigator.clipboard.writeText(urlInput.value);
    const btn = document.getElementById('copy-url');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  } catch (error) {
    urlInput.select();
    document.execCommand('copy');
  }
}

// Import pack from URL
async function importPack() {
  const url = document.getElementById('import-url').value.trim();

  if (!url) {
    alert('Please enter a pack URL');
    return;
  }

  // Try to decode
  let pack;
  if (url.includes('#')) {
    pack = PackCodec.parseUrl(url);
  } else {
    // Maybe it's just the encoded string
    pack = PackCodec.decode(url);
  }

  if (!pack) {
    alert('Invalid pack URL. Please check and try again.');
    return;
  }

  // Validate
  const validation = PackCodec.validate(pack);
  if (!validation.valid) {
    alert('Invalid pack format:\n' + validation.errors.join('\n'));
    return;
  }

  currentPack = pack;
  await renderImportedPack(pack);
}

// Render imported pack
async function renderImportedPack(pack) {
  document.getElementById('imported-pack-name').textContent = pack.name;
  document.getElementById('imported-pack-description').textContent = pack.description || '';
  document.getElementById('imported-pack-author').textContent = pack.author ? `by ${pack.author}` : '';

  const listEl = document.getElementById('imported-extension-list');
  const installedIds = new Set(installedExtensions.map(e => e.id));

  let html = '';
  let missingCount = 0;

  for (const ext of pack.extensions) {
    const isInstalled = ext.type === 'store' && installedIds.has(ext.id);
    if (!isInstalled) missingCount++;

    let warnings = [];
    if (ext.type === 'github' && ext.repo) {
      // Try to fetch permissions for GitHub extensions
      try {
        const { owner, repo } = GitHubAPI.parseRepo(ext.repo);
        const manifest = await GitHubAPI.getManifestPermissions(owner, repo);
        if (manifest) {
          warnings = GitHubAPI.analyzePermissions(manifest);
        }
      } catch (e) {
        // Ignore errors
      }
    }

    html += `
      <div class="extension-item">
        <div class="extension-info">
          <div class="extension-name">${escapeHtml(ext.name)}</div>
          <div class="extension-meta">
            <span class="extension-type ${ext.type}">${ext.type}</span>
            ${ext.type === 'github' ? `<span>${ext.repo || 'No repo'}</span>` : ''}
          </div>
        </div>
        <span class="status-badge ${isInstalled ? 'installed' : 'missing'}">
          ${isInstalled ? '✓ Installed' : 'Missing'}
        </span>
      </div>
      ${warnings.length > 0 ? `
        <div class="warning-list">
          ${warnings.map(w => `<div class="warning-item">${w.description}</div>`).join('')}
        </div>
      ` : ''}
    `;
  }

  listEl.innerHTML = html;

  // Update status
  const statusEl = document.getElementById('install-status');
  statusEl.textContent = missingCount > 0
    ? `${missingCount} extension${missingCount > 1 ? 's' : ''} to install`
    : 'All extensions installed!';

  document.getElementById('install-missing').disabled = missingCount === 0;
  document.getElementById('imported-pack').classList.remove('hidden');

  // Save to imported packs
  savePack(pack, document.getElementById('import-url').value);
}

// Install missing extensions
async function installMissing() {
  if (!currentPack) return;

  const installedIds = new Set(installedExtensions.map(e => e.id));
  const missing = currentPack.extensions.filter(ext => {
    if (ext.type === 'store') {
      return !installedIds.has(ext.id);
    }
    return true; // GitHub extensions always need action
  });

  if (missing.length === 0) {
    alert('All extensions are already installed!');
    return;
  }

  // Open store pages one by one
  for (const ext of missing) {
    if (ext.type === 'store') {
      const storeUrl = `https://chrome.google.com/webstore/detail/${ext.id}`;
      await chrome.tabs.create({ url: storeUrl });
    } else if (ext.type === 'github' && ext.repo) {
      // For GitHub extensions, open the install wizard
      const wizardUrl = chrome.runtime.getURL(`install-wizard/wizard.html?repo=${encodeURIComponent(ext.repo)}&name=${encodeURIComponent(ext.name)}`);
      await chrome.tabs.create({ url: wizardUrl });
    }

    // Small delay between opening tabs
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// Save pack to storage
async function savePack(pack, url) {
  const { savedPacks = [] } = await chrome.storage.local.get('savedPacks');

  // Check if already saved
  const existing = savedPacks.findIndex(p => p.name === pack.name);
  if (existing >= 0) {
    savedPacks[existing] = { ...pack, url };
  } else {
    savedPacks.push({ ...pack, url });
  }

  await chrome.storage.local.set({ savedPacks });
  loadSavedPacks();
}

// Load saved packs
async function loadSavedPacks() {
  const { savedPacks = [] } = await chrome.storage.local.get('savedPacks');
  const container = document.getElementById('saved-packs');

  if (savedPacks.length === 0) {
    container.innerHTML = '<p class="empty-state">No saved packs yet. Create or import a pack to get started.</p>';
    return;
  }

  container.innerHTML = savedPacks.map((pack, index) => `
    <div class="saved-pack-item" data-index="${index}">
      <div class="saved-pack-info">
        <h4>${escapeHtml(pack.name)}</h4>
        <span>${pack.extensions?.length || 0} extensions</span>
      </div>
      <div class="saved-pack-actions">
        <button class="secondary share-saved" data-url="${pack.url || ''}">Share</button>
        <button class="secondary delete-saved" data-index="${index}">Delete</button>
      </div>
    </div>
  `).join('');

  // Add event listeners
  container.querySelectorAll('.share-saved').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.dataset.url;
      if (url) {
        navigator.clipboard.writeText(url);
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Share', 2000);
      }
    });
  });

  container.querySelectorAll('.delete-saved').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      savedPacks.splice(index, 1);
      await chrome.storage.local.set({ savedPacks });
      loadSavedPacks();
    });
  });

  container.querySelectorAll('.saved-pack-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      const pack = savedPacks[index];
      if (pack) {
        currentPack = pack;
        renderImportedPack(pack);
        // Switch to import tab
        tabs[1].click();
      }
    });
  });
}

// Utility: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
