/**
 * GitHub API utilities for fetching extension releases
 */

const GitHubAPI = {
  baseUrl: 'https://api.github.com',

  /**
   * Get the latest release for a repository
   */
  async getLatestRelease(owner, repo) {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/releases/latest`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Get a specific release by tag
   */
  async getReleaseByTag(owner, repo, tag) {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/releases/tags/${tag}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Get the download URL for an asset in a release
   */
  getAssetDownloadUrl(release, assetName) {
    const asset = release.assets.find(a =>
      a.name === assetName ||
      a.name.endsWith('.zip') ||
      a.name.endsWith('.crx')
    );

    if (!asset) {
      // Fall back to zipball if no specific asset
      return release.zipball_url;
    }

    return asset.browser_download_url;
  },

  /**
   * Parse a repo string (e.g., "owner/repo") into parts
   */
  parseRepo(repoString) {
    const parts = repoString.split('/');
    if (parts.length !== 2) {
      throw new Error('Invalid repo format. Expected: owner/repo');
    }
    return { owner: parts[0], repo: parts[1] };
  },

  /**
   * Check if a repository exists and is public
   */
  async checkRepoExists(owner, repo) {
    const url = `${this.baseUrl}/repos/${owner}/${repo}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    return response.ok;
  },

  /**
   * Get repository info including permissions from manifest
   */
  async getManifestPermissions(owner, repo, ref = 'main') {
    // Try to fetch manifest.json from the repo
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/manifest.json`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        // Try 'master' branch
        const masterUrl = `https://raw.githubusercontent.com/${owner}/${repo}/master/manifest.json`;
        const masterResponse = await fetch(masterUrl);
        if (!masterResponse.ok) return null;
        return masterResponse.json();
      }
      return response.json();
    } catch (e) {
      return null;
    }
  },

  /**
   * Analyze manifest permissions for security warnings
   */
  analyzePermissions(manifest) {
    const warnings = [];
    const dangerousPermissions = {
      '<all_urls>': 'Access to all websites',
      'http://*/*': 'Access to all HTTP websites',
      'https://*/*': 'Access to all HTTPS websites',
      '*://*/*': 'Access to all websites',
      'webRequest': 'Can intercept network traffic',
      'webRequestBlocking': 'Can block network requests',
      'nativeMessaging': 'Can run local programs',
      'management': 'Can control other extensions',
      'debugger': 'Can debug other pages',
      'cookies': 'Can access cookies',
      'history': 'Can access browsing history',
      'tabs': 'Can access tab information'
    };

    const allPermissions = [
      ...(manifest.permissions || []),
      ...(manifest.host_permissions || []),
      ...(manifest.optional_permissions || [])
    ];

    allPermissions.forEach(perm => {
      if (dangerousPermissions[perm]) {
        warnings.push({
          permission: perm,
          description: dangerousPermissions[perm],
          level: perm.includes('all') || perm === 'nativeMessaging' ? 'high' : 'medium'
        });
      }
    });

    return warnings;
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined') {
  module.exports = GitHubAPI;
}
