/**
 * Pack URL encoding/decoding utilities
 */

const PackCodec = {
  /**
   * Encode a pack object to a URL-safe string
   */
  encode(pack) {
    const json = JSON.stringify(pack);
    // Use base64 encoding
    const encoded = btoa(unescape(encodeURIComponent(json)));
    return encoded;
  },

  /**
   * Decode a URL-safe string to a pack object
   */
  decode(encoded) {
    try {
      const json = decodeURIComponent(escape(atob(encoded)));
      return JSON.parse(json);
    } catch (e) {
      console.error('Failed to decode pack:', e);
      return null;
    }
  },

  /**
   * Generate a full shareable URL for a pack
   */
  generateUrl(pack, baseUrl = 'https://extension-packs.github.io') {
    const encoded = this.encode(pack);
    return `${baseUrl}/#${encoded}`;
  },

  /**
   * Extract pack data from a URL
   */
  parseUrl(url) {
    try {
      const urlObj = new URL(url);
      const hash = urlObj.hash.slice(1); // Remove the # prefix
      if (!hash) return null;
      return this.decode(hash);
    } catch (e) {
      console.error('Failed to parse URL:', e);
      return null;
    }
  },

  /**
   * Create a new pack manifest
   */
  createPack(name, description, author, extensions) {
    return {
      v: 2,
      name,
      description,
      author,
      extensions,
      created: new Date().toISOString().split('T')[0]
    };
  },

  /**
   * Validate a pack object
   */
  validate(pack) {
    const errors = [];

    if (!pack.v || pack.v !== 2) {
      errors.push('Invalid or missing version');
    }
    if (!pack.name || typeof pack.name !== 'string') {
      errors.push('Pack name is required');
    }
    if (!pack.extensions || !Array.isArray(pack.extensions)) {
      errors.push('Extensions array is required');
    } else {
      pack.extensions.forEach((ext, i) => {
        if (!ext.type || !['store', 'github'].includes(ext.type)) {
          errors.push(`Extension ${i}: invalid type`);
        }
        if (!ext.name) {
          errors.push(`Extension ${i}: name is required`);
        }
        if (ext.type === 'store' && !ext.id) {
          errors.push(`Extension ${i}: store ID is required`);
        }
        if (ext.type === 'github' && !ext.repo) {
          errors.push(`Extension ${i}: GitHub repo is required`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined') {
  module.exports = PackCodec;
}
