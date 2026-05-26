/**
 * MonkeysJS Live — Entry Point
 *
 * Bootstraps the live component runtime. Auto-discovers components
 * on page load and manages the global lifecycle.
 *
 * This is the purpose-built runtime for MonkeysLegion — not a wrapper
 * around Alpine.js or Stimulus. Every byte is designed against the
 * MonkeysLegion wire protocol.
 *
 * @module monkeysjs/live
 */

import { Wire } from './wire.js';
import { ComponentManager } from './component.js';
import { StreamClient, fetchStream } from './stream.js';
import { setupFileInputs } from './upload.js';

/**
 * The MonkeysLegion Live runtime namespace.
 */
const MLLive = {
  /** @type {Wire|null} */
  wire: null,

  /** @type {ComponentManager|null} */
  manager: null,

  /** @type {boolean} */
  booted: false,

  /**
   * Boot the live runtime with configuration.
   *
   * @param {object} config Configuration from @liveScripts.
   * @param {string} config.endpoint The server endpoint (default: '/_live').
   * @param {string} config.csrf The CSRF token.
   */
  boot(config = {}) {
    if (this.booted) return;

    const endpoint = config.endpoint || '/_live';

    this.wire = new Wire(endpoint);
    this.manager = new ComponentManager(this.wire);
    this.booted = true;

    // Auto-discover components on the page
    this._discover();

    // Watch for dynamically added components
    this._observe();

    // Set up offline detection
    this._setupOfflineDetection();

    // Dispatch ready event
    document.dispatchEvent(new CustomEvent('ml:live-ready', {
      detail: { endpoint },
    }));

    console.debug('[ML Live] Runtime booted', { endpoint });
  },

  /**
   * Manually initialize a component on a specific element.
   *
   * @param {Element} root The component root element.
   */
  mount(root) {
    if (!this.manager) {
      console.warn('[ML Live] Runtime not booted. Call MLLive.boot() first.');
      return;
    }
    this.manager.mount(root);
    setupFileInputs(root, this.manager);
  },

  /**
   * Destroy a component by ID.
   * @param {string} componentId
   */
  destroy(componentId) {
    this.manager?.destroy(componentId);
  },

  /**
   * Destroy all components and shut down the runtime.
   */
  shutdown() {
    this.manager?.destroyAll();
    this.wire?.cancel();
    this._disconnectObserver();
    this.booted = false;
  },

  /**
   * Create a stream client for SSE connections.
   *
   * @param {string} endpoint The SSE endpoint.
   * @param {object} [options] Stream options.
   * @returns {StreamClient}
   */
  createStream(endpoint, options = {}) {
    return new StreamClient(endpoint, options);
  },

  /**
   * Perform a fetch-based stream.
   *
   * @param {string} url The endpoint URL.
   * @param {object} body The request body.
   * @param {Function} onChunk Called with each text chunk.
   * @param {Function} [onDone] Called when stream completes.
   * @returns {Promise<void>}
   */
  async fetchStream(url, body, onChunk, onDone) {
    return fetchStream(url, body, onChunk, onDone);
  },

  // ── Private ─────────────────────────────────────────────

  /** @type {MutationObserver|null} */
  _observer: null,

  /**
   * Auto-discover all `[data-ml-id]` elements on the page.
   */
  _discover() {
    const roots = document.querySelectorAll('[data-ml-id]');
    for (const root of roots) {
      this.mount(root);
    }
  },

  /**
   * Watch for dynamically added components via MutationObserver.
   */
  _observe() {
    this._observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // Check the node itself
          if (node.hasAttribute('data-ml-id')) {
            this.mount(node);
          }

          // Check descendants
          const nested = node.querySelectorAll('[data-ml-id]');
          for (const el of nested) {
            this.mount(el);
          }
        }

        // Clean up removed components
        for (const node of mutation.removedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          const id = node.getAttribute?.('data-ml-id');
          if (id) this.destroy(id);

          const nested = node.querySelectorAll?.('[data-ml-id]');
          if (nested) {
            for (const el of nested) {
              const nestedId = el.getAttribute('data-ml-id');
              if (nestedId) this.destroy(nestedId);
            }
          }
        }
      }
    });

    this._observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  },

  /**
   * Disconnect the MutationObserver.
   */
  _disconnectObserver() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  },

  /**
   * Set up offline/online detection.
   */
  _setupOfflineDetection() {
    window.addEventListener('offline', () => {
      document.body.classList.add('ml-offline');
      document.dispatchEvent(new CustomEvent('ml:offline'));
    });

    window.addEventListener('online', () => {
      document.body.classList.remove('ml-offline');
      document.dispatchEvent(new CustomEvent('ml:online'));
    });

    // Set initial state
    if (!navigator.onLine) {
      document.body.classList.add('ml-offline');
    }
  },
};

// ── Auto-boot ─────────────────────────────────────────────────
// If config was injected by @liveScripts, boot automatically
if (typeof window !== 'undefined') {
  window.MLLive = MLLive;

  if (window.__ML_LIVE_CONFIG) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        MLLive.boot(window.__ML_LIVE_CONFIG);
      });
    } else {
      MLLive.boot(window.__ML_LIVE_CONFIG);
    }
  }
}

// ── Named exports ─────────────────────────────────────────────
export { MLLive };
export { Wire } from './wire.js';
export { ComponentManager } from './component.js';
export { morph } from './morph.js';
export { processDirectives } from './directives.js';
export { StreamClient, fetchStream } from './stream.js';
export { uploadFile, setupFileInputs } from './upload.js';

export function initLive(config) {
  MLLive.boot(config);
}

export function destroyLive() {
  MLLive.shutdown();
}
