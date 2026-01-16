/**
 * Extension Pack Hub - Install Wizard
 * Guides users through installing GitHub extensions
 */

// Get URL parameters
const params = new URLSearchParams(window.location.search);
const repo = params.get('repo');
const extensionName = params.get('name');
const releaseTag = params.get('tag') || 'latest';

// State
let downloadPath = '';
let currentStep = 1;

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Display extension name
  document.getElementById('extension-name').textContent = extensionName || 'Extension';

  // Setup event listeners
  setupEventListeners();

  // Start download if repo is provided
  if (repo) {
    await startDownload();
  } else {
    showError('No GitHub repository specified.');
  }
}

function setupEventListeners() {
  document.getElementById('continue-to-step-2').addEventListener('click', () => goToStep(2));
  document.getElementById('continue-to-step-3').addEventListener('click', () => goToStep(3));
  document.getElementById('continue-to-step-4').addEventListener('click', () => goToStep(4));

  document.getElementById('open-extensions').addEventListener('click', openExtensionsPage);
  document.getElementById('copy-path').addEventListener('click', copyPath);
  document.getElementById('close-wizard').addEventListener('click', () => window.close());

  // Open downloads folder
  document.getElementById('open-downloads')?.addEventListener('click', () => {
    chrome.downloads.showDefaultFolder();
  });
}

async function startDownload() {
  const progressEl = document.getElementById('download-progress');
  const statusEl = document.getElementById('download-status');

  try {
    // Parse repo
    const { owner, repo: repoName } = GitHubAPI.parseRepo(repo);

    // Register this as a pending GitHub install so we can track when it's loaded
    chrome.runtime.sendMessage({
      type: 'register-pending-github-install',
      repo: repo,
      name: extensionName || repoName
    });

    // Update status
    statusEl.textContent = 'Fetching release info...';
    progressEl.style.width = '20%';

    // Get release info
    let release;
    if (releaseTag === 'latest') {
      release = await GitHubAPI.getLatestRelease(owner, repoName);
    } else {
      release = await GitHubAPI.getReleaseByTag(owner, repoName, releaseTag);
    }

    // Find download URL
    const downloadUrl = GitHubAPI.getAssetDownloadUrl(release);

    statusEl.textContent = 'Starting download...';
    progressEl.style.width = '40%';

    // Get permissions and show warnings
    const manifest = await GitHubAPI.getManifestPermissions(owner, repoName);
    if (manifest) {
      const warnings = GitHubAPI.analyzePermissions(manifest);
      if (warnings.length > 0) {
        showWarnings(warnings);
      }
    }

    // Trigger download
    const filename = `${repoName}-${release.tag_name}.zip`;

    chrome.runtime.sendMessage({
      type: 'download-extension',
      url: downloadUrl,
      filename: filename
    }, (response) => {
      if (response && response.success) {
        statusEl.textContent = 'Downloading...';
        progressEl.style.width = '60%';

        // Listen for download completion
        listenForDownloadComplete(response.downloadId);
      } else {
        showError(`Download failed: ${response?.error || 'Unknown error'}`);
      }
    });

  } catch (error) {
    showError(`Failed to fetch release: ${error.message}`);
  }
}

function listenForDownloadComplete(downloadId) {
  const progressEl = document.getElementById('download-progress');
  const statusEl = document.getElementById('download-status');

  // Poll for download status
  const checkStatus = setInterval(() => {
    chrome.downloads.search({ id: downloadId }, (downloads) => {
      if (downloads && downloads.length > 0) {
        const download = downloads[0];

        if (download.state === 'complete') {
          clearInterval(checkStatus);
          progressEl.style.width = '100%';
          statusEl.textContent = 'Download complete!';
          downloadPath = download.filename;

          // Set paths in UI
          document.getElementById('download-path').value = downloadPath;
          document.getElementById('extension-path').value = getExtractPath(downloadPath);

          document.getElementById('download-success').classList.remove('hidden');

          // Remove downloading animation
          document.querySelector('.step-icon.downloading')?.classList.remove('downloading');

        } else if (download.state === 'interrupted') {
          clearInterval(checkStatus);
          showError(`Download interrupted: ${download.error}`);
        } else if (download.bytesReceived && download.totalBytes) {
          const percent = Math.round((download.bytesReceived / download.totalBytes) * 100);
          progressEl.style.width = `${40 + (percent * 0.6)}%`;
          statusEl.textContent = `Downloading... ${percent}%`;
        }
      }
    });
  }, 500);
}

function getExtractPath(zipPath) {
  // Remove .zip extension and return as the expected extract location
  if (zipPath.endsWith('.zip')) {
    return zipPath.slice(0, -4);
  }
  return zipPath;
}

function showError(message) {
  const errorEl = document.getElementById('download-error');
  const errorTextEl = document.getElementById('error-text');

  if (errorTextEl) {
    errorTextEl.textContent = message;
  } else {
    errorEl.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
      <span>${message}</span>
    `;
  }
  errorEl.classList.remove('hidden');

  // Remove downloading animation
  document.querySelector('.step-icon.downloading')?.classList.remove('downloading');
}

function showWarnings(warnings) {
  const container = document.getElementById('warnings-container');

  const html = warnings.map(w => `
    <div class="warning-card">
      <h3>Permission Warning</h3>
      <p>${w.description}</p>
    </div>
  `).join('');

  container.innerHTML = html;
}

function goToStep(stepNum) {
  // Hide current step
  document.getElementById(`step-${currentStep}`).classList.remove('active');

  // Update progress indicator
  const progressSteps = document.querySelectorAll('.progress-step');
  const progressLines = document.querySelectorAll('.progress-line');

  // Mark completed steps
  for (let i = 1; i < stepNum; i++) {
    progressSteps[i - 1].classList.add('completed');
    progressSteps[i - 1].classList.remove('active');
    if (progressLines[i - 1]) {
      progressLines[i - 1].classList.add('active');
    }
  }

  // Mark current step as active
  progressSteps[stepNum - 1].classList.add('active');
  progressSteps[stepNum - 1].classList.remove('completed');

  // Show new step
  currentStep = stepNum;
  document.getElementById(`step-${currentStep}`).classList.add('active');
}

function openExtensionsPage() {
  chrome.tabs.create({ url: 'chrome://extensions' });
}

function copyPath() {
  const pathInput = document.getElementById('extension-path');
  navigator.clipboard.writeText(pathInput.value).then(() => {
    const btn = document.getElementById('copy-path');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
    btn.style.background = '#e8f5e9';
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
    }, 2000);
  });
}
