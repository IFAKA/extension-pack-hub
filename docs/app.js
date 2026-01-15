/**
 * Extension Pack Hub - Website Script
 */

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
  // Check for pack in URL hash
  const hash = window.location.hash.slice(1);

  if (hash) {
    loadPackFromHash(hash);
  } else {
    showLanding();
  }

  // Setup event listeners
  setupEventListeners();
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

  // Get extension buttons (placeholder for now)
  document.getElementById('get-extension')?.addEventListener('click', (e) => {
    e.preventDefault();
    alert('Extension coming soon! For now, install manually.');
  });

  document.getElementById('get-companion')?.addEventListener('click', (e) => {
    e.preventDefault();
    alert('Extension coming soon! For now, use the manual install buttons.');
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

  renderPack(pack);
  showPackView();
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
  const listEl = document.getElementById('extension-list');
  listEl.innerHTML = pack.extensions.map(ext => {
    const storeUrl = ext.type === 'store'
      ? `https://chrome.google.com/webstore/detail/${ext.id}`
      : ext.repo ? `https://github.com/${ext.repo}` : '#';

    return `
      <div class="extension-item">
        <div class="extension-info">
          <div class="extension-name">${escapeHtml(ext.name)}</div>
          <div class="extension-meta">
            <span class="extension-type ${ext.type}">${ext.type}</span>
            ${ext.type === 'github' && ext.repo ? `<span>${ext.repo}</span>` : ''}
          </div>
        </div>
        <div class="extension-action">
          <a href="${storeUrl}" target="_blank" class="btn secondary">
            ${ext.type === 'store' ? 'Install' : 'View on GitHub'}
          </a>
        </div>
      </div>
    `;
  }).join('');

  // Share URL
  document.getElementById('share-url').value = window.location.href;

  // Check for warnings (GitHub extensions)
  checkForWarnings(pack);
}

async function checkForWarnings(pack) {
  const warnings = [];

  for (const ext of pack.extensions) {
    if (ext.type === 'github' && ext.repo) {
      try {
        // Try to fetch manifest from GitHub
        const [owner, repo] = ext.repo.split('/');
        const manifestUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/manifest.json`;

        const response = await fetch(manifestUrl);
        if (response.ok) {
          const manifest = await response.json();
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
      ${warnings.map(w => `
        <div class="warning-item">
          <strong>${escapeHtml(w.extension)}</strong>: ${w.description}
        </div>
      `).join('')}
    `;
  }
}

function installAll() {
  const hash = window.location.hash.slice(1);
  const pack = PackCodec.decode(hash);

  if (!pack) return;

  // Open store pages for store extensions
  const storeExtensions = pack.extensions.filter(e => e.type === 'store');

  if (storeExtensions.length === 0) {
    alert('No store extensions to install. GitHub extensions require manual installation.');
    return;
  }

  const confirmMsg = `This will open ${storeExtensions.length} Chrome Web Store page(s). Continue?`;
  if (!confirm(confirmMsg)) return;

  storeExtensions.forEach((ext, index) => {
    setTimeout(() => {
      window.open(`https://chrome.google.com/webstore/detail/${ext.id}`, '_blank');
    }, index * 500);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
