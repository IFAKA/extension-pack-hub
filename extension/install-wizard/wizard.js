/**
 * Extension Pack Hub - Install Wizard
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
  document.getElementById('extension-name').textContent = extensionName || 'Unknown Extension';

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
  document.getElementById('open-extensions').addEventListener('click', openExtensionsPage);
  document.getElementById('continue-to-step-3').addEventListener('click', () => goToStep(3));
  document.getElementById('continue-to-step-4').addEventListener('click', () => goToStep(4));
  document.getElementById('copy-path').addEventListener('click', copyPath);
  document.getElementById('close-wizard').addEventListener('click', () => window.close());
}

async function startDownload() {
  const progressEl = document.getElementById('download-progress');
  const statusEl = document.getElementById('download-status');

  try {
    // Parse repo
    const { owner, repo: repoName } = GitHubAPI.parseRepo(repo);

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
    downloadPath = `~/Downloads/${filename}`;

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
          document.getElementById('extension-path').value = getExtractPath(downloadPath);
          document.getElementById('download-success').classList.remove('hidden');
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
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
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
  // Mark current step as completed
  document.getElementById(`step-${currentStep}`).classList.remove('active');
  document.getElementById(`step-${currentStep}`).classList.add('completed');

  // Activate new step
  currentStep = stepNum;
  document.getElementById(`step-${currentStep}`).classList.add('active');

  // If last step, show completion
  if (stepNum === 5) {
    document.getElementById('step-5').classList.add('active');
  }
}

function openExtensionsPage() {
  chrome.tabs.create({ url: 'chrome://extensions' });
}

function copyPath() {
  const pathInput = document.getElementById('extension-path');
  navigator.clipboard.writeText(pathInput.value).then(() => {
    const btn = document.getElementById('copy-path');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  });
}
