/**
 * Extension Pack Hub - Website Script
 * Handles pack viewing, extension detection, and seamless installation
 */

// State
let extensionInstalled = false;
let installedExtensions = [];
let currentPack = null;

// Pack codec (duplicated from extension for standalone use)
const PackCodec = {
  encode(pack) {
    const json = JSON.stringify(pack);
    return btoa(unescape(encodeURIComponent(json)));
  },

  decode(encoded) {
    try {
      const json = decodeURIComponent(escape(atob(encoded)));
      return JSON.parse(json);
    } catch (e) {
      console.error('Failed to decode pack:', e);
      return null;
    }
  },

  parseUrl(url) {
    try {
      const urlObj = new URL(url);
      const hash = urlObj.hash.slice(1);
      if (!hash) return null;
      return this.decode(hash);
    } catch (e) {
      console.error('Failed to parse URL:', e);
      return null;
    }
  },

  validate(pack) {
    const errors = [];
    if (!pack.v) errors.push('Missing version');
    if (!pack.name) errors.push('Missing name');
    if (!pack.extensions || !Array.isArray(pack.extensions)) {
      errors.push('Missing extensions');
    }
    return { valid: errors.length === 0, errors };
  }
};

// Dangerous permissions for warnings
const DANGEROUS_PERMISSIONS = {
  '<all_urls>': 'Access to all websites',
  'http://*/*': 'Access to all HTTP websites',
  'https://*/*': 'Access to all HTTPS websites',
  '*://*/*': 'Access to all websites',
  'webRequest': 'Can intercept network traffic',
  'webRequestBlocking': 'Can block network requests',
  'nativeMessaging': 'Can run local programs',
  'management': 'Can control other extensions',
  'cookies': 'Can access cookies',
  'history': 'Can access browsing history'
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
  setupExtensionDetection();
  setupEventListeners();

  // Check for pack in URL hash
  const hash = window.location.hash.slice(1);
  if (hash) {
    loadPackFromHash(hash);
  } else {
    showLanding();
  }
}

// Detect if the companion extension is installed
function setupExtensionDetection() {
  // Listen for extension signals
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    const { type, payload } = event.data;

    switch (type) {
      case 'EXTENSION_PACK_HUB_INSTALLED':
        extensionInstalled = true;
        onExtensionDetected();
        break;

      case 'EPH_INSTALLED_EXTENSIONS':
        if (payload && payload.extensions) {
          installedExtensions = payload.extensions.filter(e =>
            e.type === 'extension' && !e.isApp
          );
          updateInstallStatuses();
        }
        break;

      case 'EPH_INSTALL_PROGRESS':
        handleInstallProgress(payload);
        break;

      case 'EPH_EXTENSION_INSTALLED':
        onExtensionInstalled(payload);
        break;
    }
  });

  // Request extension info after a short delay
  setTimeout(() => {
    if (extensionInstalled) {
      window.postMessage({ type: 'EPH_GET_INSTALLED_EXTENSIONS' }, '*');
    }
  }, 100);
}

function onExtensionDetected() {
  document.body.classList.add('extension-installed');
  updateUIForExtension();

  // Request installed extensions list
  window.postMessage({ type: 'EPH_GET_INSTALLED_EXTENSIONS' }, '*');
}

function updateUIForExtension() {
  // Update CTA buttons
  const getExtBtn = document.getElementById('get-extension');
  const getCompanionBtn = document.getElementById('get-companion');

  if (getExtBtn) {
    getExtBtn.textContent = 'Extension Active';
    getExtBtn.classList.add('installed');
    getExtBtn.style.pointerEvents = 'none';
  }

  if (getCompanionBtn) {
    const parent = getCompanionBtn.closest('.companion-prompt');
    if (parent) {
      parent.innerHTML = `
        <div class="extension-active-badge">
          <span class="checkmark">&#10003;</span>
          Extension Pack Hub is active
        </div>
      `;
    }
  }

  // Show one-click install button
  const installAllBtn = document.getElementById('install-all');
  if (installAllBtn) {
    installAllBtn.textContent = 'Install All with One Click';
    installAllBtn.classList.remove('secondary');
    installAllBtn.classList.add('primary');
  }
}

function setupEventListeners() {
  // Load pack from input
  document.getElementById('load-pack').addEventListener('click', () => {
    const input = document.getElementById('import-url-input').value.trim();
    if (input) {
      let hash;
      if (input.includes('#')) {
        hash = input.split('#')[1];
      } else {
        hash = input;
      }
      window.location.hash = hash;
      loadPackFromHash(hash);
    }
  });

  // Enter key on input
  document.getElementById('import-url-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('load-pack').click();
    }
  });

  // Copy URL
  document.getElementById('copy-url')?.addEventListener('click', () => {
    const input = document.getElementById('share-url');
    navigator.clipboard.writeText(input.value).then(() => {
      const btn = document.getElementById('copy-url');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 2000);
    });
  });

  // Install all
  document.getElementById('install-all')?.addEventListener('click', installAll);

  // Get extension buttons
  document.getElementById('get-extension')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!extensionInstalled) {
      showExtensionModal();
    }
  });

  document.getElementById('get-companion')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!extensionInstalled) {
      showExtensionModal();
    }
  });
}

function showLanding() {
  document.getElementById('landing').classList.add('active');
  document.getElementById('pack-view').classList.remove('active');
  document.getElementById('error-view').classList.remove('active');
}

function showPackView() {
  document.getElementById('landing').classList.remove('active');
  document.getElementById('pack-view').classList.add('active');
  document.getElementById('error-view').classList.remove('active');
}

function showError(message) {
  document.getElementById('landing').classList.remove('active');
  document.getElementById('pack-view').classList.remove('active');
  document.getElementById('error-view').classList.add('active');
  document.getElementById('error-message').textContent = message;
}

function loadPackFromHash(hash) {
  const pack = PackCodec.decode(hash);

  if (!pack) {
    showError('Failed to decode pack. The URL may be corrupted.');
    return;
  }

  const validation = PackCodec.validate(pack);
  if (!validation.valid) {
    showError('Invalid pack format: ' + validation.errors.join(', '));
    return;
  }

  currentPack = pack;
  renderPack(pack);
  showPackView();

  // Request install status if extension available
  if (extensionInstalled) {
    window.postMessage({ type: 'EPH_GET_INSTALLED_EXTENSIONS' }, '*');
  }
}

function renderPack(pack) {
  // Header
  document.getElementById('pack-name').textContent = pack.name;
  document.getElementById('pack-description').textContent = pack.description || '';
  document.getElementById('pack-author').textContent = pack.author ? `by ${pack.author}` : '';

  // Stats
  document.getElementById('extension-count').textContent =
    `${pack.extensions.length} extension${pack.extensions.length !== 1 ? 's' : ''}`;
  document.getElementById('pack-created').textContent =
    pack.created ? `Created ${pack.created}` : '';

  // Extension list
  renderExtensionList(pack.extensions);

  // Share URL
  document.getElementById('share-url').value = window.location.href;

  // Check for warnings (GitHub extensions)
  checkForWarnings(pack);
}

function renderExtensionList(extensions) {
  const listEl = document.getElementById('extension-list');
  const installedIds = new Set(installedExtensions.map(e => e.id));

  listEl.innerHTML = extensions.map((ext, index) => {
    const isInstalled = ext.type === 'store' && installedIds.has(ext.id);
    const storeUrl = ext.type === 'store'
      ? `https://chromewebstore.google.com/detail/${ext.id}`
      : ext.repo ? `https://github.com/${ext.repo}` : '#';

    return `
      <div class="extension-item ${isInstalled ? 'installed' : ''}" data-index="${index}" data-type="${ext.type}" data-id="${ext.id || ''}" data-repo="${ext.repo || ''}">
        <div class="extension-status">
          ${isInstalled ? '<span class="status-icon installed">&#10003;</span>' : '<span class="status-icon pending">&#9675;</span>'}
        </div>
        <div class="extension-info">
          <div class="extension-name">${escapeHtml(ext.name)}</div>
          <div class="extension-meta">
            <span class="extension-type ${ext.type}">${ext.type === 'store' ? 'Chrome Web Store' : 'GitHub'}</span>
            ${ext.type === 'github' && ext.repo ? `<span class="repo-name">${ext.repo}</span>` : ''}
          </div>
        </div>
        <div class="extension-action">
          ${isInstalled ? `
            <span class="installed-badge">Installed</span>
          ` : `
            <button class="btn secondary install-single" data-index="${index}">
              ${ext.type === 'store' ? 'Install' : 'View'}
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers for individual install buttons
  listEl.querySelectorAll('.install-single').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      installSingleExtension(extensions[index]);
    });
  });

  // Update install all button text
  updateInstallAllButton(extensions);
}

function updateInstallAllButton(extensions) {
  const installedIds = new Set(installedExtensions.map(e => e.id));
  const missingCount = extensions.filter(ext =>
    ext.type !== 'store' || !installedIds.has(ext.id)
  ).length;

  const btn = document.getElementById('install-all');
  if (btn) {
    if (missingCount === 0) {
      btn.textContent = 'All Installed!';
      btn.disabled = true;
      btn.classList.add('all-installed');
    } else {
      btn.textContent = extensionInstalled
        ? `Install ${missingCount} Extension${missingCount > 1 ? 's' : ''}`
        : `Install ${missingCount} Extension${missingCount > 1 ? 's' : ''} (opens tabs)`;
      btn.disabled = false;
      btn.classList.remove('all-installed');
    }
  }
}

function updateInstallStatuses() {
  if (currentPack) {
    renderExtensionList(currentPack.extensions);
  }
}

function installSingleExtension(ext) {
  if (extensionInstalled) {
    if (ext.type === 'store') {
      window.postMessage({
        type: 'EPH_INSTALL_STORE_EXTENSION',
        payload: { id: ext.id, name: ext.name }
      }, '*');
    } else {
      window.postMessage({
        type: 'EPH_INSTALL_GITHUB_EXTENSION',
        payload: { repo: ext.repo, name: ext.name, releaseTag: ext.releaseTag }
      }, '*');
    }
  } else {
    // Fallback: open URL directly
    const url = ext.type === 'store'
      ? `https://chromewebstore.google.com/detail/${ext.id}`
      : `https://github.com/${ext.repo}`;
    window.open(url, '_blank');
  }
}

async function installAll() {
  if (!currentPack) return;

  const installedIds = new Set(installedExtensions.map(e => e.id));
  const missing = currentPack.extensions.filter(ext =>
    ext.type !== 'store' || !installedIds.has(ext.id)
  );

  if (missing.length === 0) {
    showToast('All extensions are already installed!', 'success');
    return;
  }

  if (extensionInstalled) {
    // Use extension for seamless install
    showInstallProgress(missing.length);
    window.postMessage({
      type: 'EPH_INSTALL_PACK',
      payload: { pack: currentPack }
    }, '*');
  } else {
    // Fallback: open tabs manually
    const storeExtensions = missing.filter(e => e.type === 'store');
    const githubExtensions = missing.filter(e => e.type === 'github');

    if (storeExtensions.length > 0) {
      const confirmMsg = `This will open ${storeExtensions.length} Chrome Web Store page${storeExtensions.length > 1 ? 's' : ''}. Continue?`;
      if (!confirm(confirmMsg)) return;

      for (let i = 0; i < storeExtensions.length; i++) {
        setTimeout(() => {
          window.open(`https://chromewebstore.google.com/detail/${storeExtensions[i].id}`, '_blank');
        }, i * 500);
      }
    }

    if (githubExtensions.length > 0) {
      showToast(`${githubExtensions.length} GitHub extension${githubExtensions.length > 1 ? 's' : ''} require the companion extension for easy installation.`, 'warning');
    }
  }
}

function showInstallProgress(total) {
  // Create or update progress overlay
  let overlay = document.getElementById('install-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'install-overlay';
    overlay.innerHTML = `
      <div class="install-modal">
        <div class="install-header">
          <h3>Installing Extensions</h3>
          <p class="install-subtitle">Opening installation pages...</p>
        </div>
        <div class="install-progress-bar">
          <div class="install-progress-fill"></div>
        </div>
        <p class="install-status">Preparing...</p>
        <p class="install-hint">Complete the installation on each tab that opens</p>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  overlay.classList.add('visible');
}

function handleInstallProgress(data) {
  const overlay = document.getElementById('install-overlay');
  if (!overlay) return;

  const statusEl = overlay.querySelector('.install-status');
  const progressEl = overlay.querySelector('.install-progress-fill');
  const subtitleEl = overlay.querySelector('.install-subtitle');

  switch (data.status) {
    case 'started':
      subtitleEl.textContent = `Installing ${data.total} extension${data.total > 1 ? 's' : ''}`;
      progressEl.style.width = '10%';
      statusEl.textContent = 'Starting...';
      break;

    case 'installing':
      const pct = Math.round((data.current / data.total) * 80) + 10;
      progressEl.style.width = pct + '%';
      statusEl.textContent = `Opening ${data.extension}...`;
      break;

    case 'tabs-opened':
      progressEl.style.width = '100%';
      statusEl.textContent = data.message;
      setTimeout(() => {
        overlay.classList.remove('visible');
      }, 3000);
      break;

    case 'complete':
      progressEl.style.width = '100%';
      statusEl.textContent = data.message;
      showToast(data.message, 'success');
      setTimeout(() => {
        overlay.classList.remove('visible');
      }, 2000);
      break;

    case 'extension-complete':
      statusEl.textContent = `Installed ${data.extension} (${data.installed}/${data.total})`;
      // Refresh the list
      window.postMessage({ type: 'EPH_GET_INSTALLED_EXTENSIONS' }, '*');
      break;
  }
}

function onExtensionInstalled(data) {
  // Refresh installed extensions list
  window.postMessage({ type: 'EPH_GET_INSTALLED_EXTENSIONS' }, '*');
  showToast(`${data.extension?.name || 'Extension'} installed!`, 'success');
}

async function checkForWarnings(pack) {
  const warnings = [];

  for (const ext of pack.extensions) {
    if (ext.type === 'github' && ext.repo) {
      try {
        const [owner, repo] = ext.repo.split('/');
        // Try main branch first, then master
        let manifest = await fetchManifest(owner, repo, 'main');
        if (!manifest) {
          manifest = await fetchManifest(owner, repo, 'master');
        }

        if (manifest) {
          const perms = [
            ...(manifest.permissions || []),
            ...(manifest.host_permissions || [])
          ];

          perms.forEach(perm => {
            if (DANGEROUS_PERMISSIONS[perm]) {
              warnings.push({
                extension: ext.name,
                permission: perm,
                description: DANGEROUS_PERMISSIONS[perm]
              });
            }
          });
        }
      } catch (e) {
        // Ignore errors
      }
    }
  }

  if (warnings.length > 0) {
    const warningsEl = document.getElementById('warnings');
    warningsEl.classList.remove('hidden');
    warningsEl.innerHTML = `
      <h3>Permission Warnings</h3>
      <p class="warnings-intro">These GitHub extensions request sensitive permissions:</p>
      ${warnings.map(w => `
        <div class="warning-item">
          <strong>${escapeHtml(w.extension)}</strong>: ${w.description}
        </div>
      `).join('')}
    `;
  }
}

async function fetchManifest(owner, repo, branch) {
  try {
    const response = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/manifest.json`);
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {}
  return null;
}

function showExtensionModal() {
  let modal = document.getElementById('extension-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'extension-modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <button class="modal-close">&times;</button>
        <h2>Get Extension Pack Hub</h2>
        <p>Install the companion extension for the best experience:</p>
        <ul class="benefits-list">
          <li>One-click installation of entire packs</li>
          <li>Real-time install progress tracking</li>
          <li>Easy GitHub extension installation</li>
          <li>Create packs from your installed extensions</li>
        </ul>
        <div class="modal-actions">
          <a href="https://github.com/ifaka/extension-pack-hub" target="_blank" class="btn primary">
            Get from GitHub
          </a>
          <button class="btn secondary modal-close-btn">Maybe Later</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => {
      modal.classList.remove('visible');
    });
    modal.querySelector('.modal-close').addEventListener('click', () => {
      modal.classList.remove('visible');
    });
    modal.querySelector('.modal-close-btn').addEventListener('click', () => {
      modal.classList.remove('visible');
    });
  }

  modal.classList.add('visible');
}

function showToast(message, type = 'info') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `toast ${type} visible`;

  setTimeout(() => {
    toast.classList.remove('visible');
  }, 4000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
